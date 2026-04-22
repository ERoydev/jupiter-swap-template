import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PublicKey } from "@solana/web3.js";
import { ErrorType, SwapError } from "../types/errors";

// Mock jupiterClient before any imports of the service under test.
vi.mock("./jupiterClient", () => ({
  jupiterClient: {
    get: vi.fn(),
  },
}));

// Mock the connection singleton so the RPC fallback is controllable.
vi.mock("../lib/connection", () => ({
  connection: {
    getBalance: vi.fn(),
  },
}));

async function loadService() {
  const mod = await import("./balanceService");
  return mod.balanceService;
}

async function loadMockClient() {
  const mod = await import("./jupiterClient");
  return mod.jupiterClient;
}

async function loadMockConnection() {
  const mod = await import("../lib/connection");
  return mod.connection;
}

/** Minimal stub PublicKey — only toBase58 needed by the service. */
function makePublicKey(base58 = "So11111111111111111111111111111111111111112"): PublicKey {
  return { toBase58: () => base58 } as unknown as PublicKey;
}

const MOCK_PUBLIC_KEY = makePublicKey();

// Form A flat response
const FORM_A_RESPONSE = {
  SOL: { amount: "5000000000", uiAmount: 5, decimals: 9 },
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
    amount: "100000000",
    uiAmount: 100,
    decimals: 6,
  },
};

// Form B nested response
const FORM_B_RESPONSE = {
  balances: {
    SOL: { amount: "5000000000", uiAmount: 5, decimals: 9 },
    EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
      amount: "100000000",
      uiAmount: 100,
      decimals: 6,
    },
  },
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

// ─── getAllBalances ────────────────────────────────────────────────────────────

describe("balanceService.getAllBalances — Form A (flat map)", () => {
  it("parses a flat Ultra response into a BalanceMap", async () => {
    const client = await loadMockClient();
    vi.mocked(client.get).mockResolvedValue(FORM_A_RESPONSE);

    const service = await loadService();
    const result = await service.getAllBalances(MOCK_PUBLIC_KEY);

    expect(result["SOL"]).toEqual({ uiAmount: 5, rawAmount: "5000000000", decimals: 9 });
    expect(result["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"]).toEqual({
      uiAmount: 100,
      rawAmount: "100000000",
      decimals: 6,
    });
  });
});

describe("balanceService.getAllBalances — Form B (nested balances field)", () => {
  it("parses a nested Ultra response into a BalanceMap", async () => {
    const client = await loadMockClient();
    vi.mocked(client.get).mockResolvedValue(FORM_B_RESPONSE);

    const service = await loadService();
    const result = await service.getAllBalances(MOCK_PUBLIC_KEY);

    expect(result["SOL"]).toEqual({ uiAmount: 5, rawAmount: "5000000000", decimals: 9 });
    expect(result["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"]).toEqual({
      uiAmount: 100,
      rawAmount: "100000000",
      decimals: 6,
    });
  });
});

describe("balanceService.getAllBalances — unparseable response", () => {
  it("throws SwapError(UnknownError) when response cannot be parsed", async () => {
    const client = await loadMockClient();
    vi.mocked(client.get).mockResolvedValue(null as unknown as Record<string, unknown>);

    const service = await loadService();

    await expect(service.getAllBalances(MOCK_PUBLIC_KEY)).rejects.toMatchObject({
      type: ErrorType.UnknownError,
      message: "Failed to parse Ultra balances response",
    });
  });
});

describe("balanceService.getAllBalances — signal forwarding", () => {
  it("passes the signal to jupiterClient.get", async () => {
    const client = await loadMockClient();
    vi.mocked(client.get).mockResolvedValue(FORM_A_RESPONSE);

    const service = await loadService();
    const ctrl = new AbortController();
    await service.getAllBalances(MOCK_PUBLIC_KEY, ctrl.signal);

    expect(client.get).toHaveBeenCalledWith(
      `/ultra/v1/balances/${MOCK_PUBLIC_KEY.toBase58()}`,
      undefined,
      ctrl.signal,
    );
  });
});

describe("balanceService.getAllBalances — error passthrough", () => {
  it("propagates SwapError from jupiterClient as-is", async () => {
    const client = await loadMockClient();
    const originalError = new SwapError(ErrorType.NetworkError, "Net fail", 503, true);
    vi.mocked(client.get).mockRejectedValue(originalError);

    const service = await loadService();

    await expect(service.getAllBalances(MOCK_PUBLIC_KEY)).rejects.toThrow(originalError);
  });
});

// ─── getSolBalance ─────────────────────────────────────────────────────────────

describe("balanceService.getSolBalance — happy path (Ultra)", () => {
  it("returns the SOL uiAmount when Ultra call succeeds", async () => {
    const client = await loadMockClient();
    vi.mocked(client.get).mockResolvedValue(FORM_A_RESPONSE);

    const service = await loadService();
    const result = await service.getSolBalance(MOCK_PUBLIC_KEY);

    expect(result).toBe(5);
  });
});

describe("balanceService.getSolBalance — Ultra fail + RPC fallback", () => {
  it("falls back to connection.getBalance and returns lamports/1e9 when Ultra fails", async () => {
    const client = await loadMockClient();
    vi.mocked(client.get).mockRejectedValue(
      new SwapError(ErrorType.NetworkError, "Ultra down", 503, true),
    );

    const conn = await loadMockConnection();
    vi.mocked(conn.getBalance).mockResolvedValue(2_500_000_000);

    const service = await loadService();
    const result = await service.getSolBalance(MOCK_PUBLIC_KEY);

    expect(conn.getBalance).toHaveBeenCalledWith(MOCK_PUBLIC_KEY);
    expect(result).toBeCloseTo(2.5);
  });
});

describe("balanceService.getSolBalance — both Ultra and RPC fail", () => {
  it("throws SwapError(BalanceCheckFailed) when both Ultra and RPC fail", async () => {
    const client = await loadMockClient();
    vi.mocked(client.get).mockRejectedValue(
      new SwapError(ErrorType.NetworkError, "Ultra down", 503, true),
    );

    const conn = await loadMockConnection();
    vi.mocked(conn.getBalance).mockRejectedValue(new Error("RPC down"));

    const service = await loadService();

    await expect(service.getSolBalance(MOCK_PUBLIC_KEY)).rejects.toMatchObject({
      type: ErrorType.BalanceCheckFailed,
    });
  });
});

// ─── getTokenBalance ───────────────────────────────────────────────────────────

describe("balanceService.getTokenBalance — happy path", () => {
  it("returns uiAmount for the requested mint", async () => {
    const client = await loadMockClient();
    vi.mocked(client.get).mockResolvedValue(FORM_A_RESPONSE);

    const service = await loadService();
    const result = await service.getTokenBalance(
      MOCK_PUBLIC_KEY,
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    );

    expect(result).toBe(100);
  });
});

describe("balanceService.getTokenBalance — mint not in map", () => {
  it("returns 0 when the wallet does not hold the requested mint", async () => {
    const client = await loadMockClient();
    vi.mocked(client.get).mockResolvedValue(FORM_A_RESPONSE);

    const service = await loadService();
    const result = await service.getTokenBalance(
      MOCK_PUBLIC_KEY,
      "UnknownMintXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    );

    expect(result).toBe(0);
  });
});

describe("balanceService.getTokenBalance — Ultra fails (no RPC fallback)", () => {
  it("rejects with the Ultra error — no fallback for token mints", async () => {
    const client = await loadMockClient();
    const ultraError = new SwapError(ErrorType.NetworkError, "Ultra down", 503, true);
    vi.mocked(client.get).mockRejectedValue(ultraError);

    const conn = await loadMockConnection();

    const service = await loadService();

    await expect(
      service.getTokenBalance(
        MOCK_PUBLIC_KEY,
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      ),
    ).rejects.toThrow(ultraError);

    // RPC must never be touched for token balance fallback
    expect(conn.getBalance).not.toHaveBeenCalled();
  });
});
