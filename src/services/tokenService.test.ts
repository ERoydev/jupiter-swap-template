import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorType, SwapError } from "../types/errors";

vi.mock("./jupiterClient", () => ({
  jupiterClient: {
    get: vi.fn(),
  },
}));

async function loadService() {
  const mod = await import("./tokenService");
  return mod.tokenService;
}

async function loadMockClient() {
  const mod = await import("./jupiterClient");
  return mod.jupiterClient;
}

const MINIMAL_RAW = {
  id: "So11111111111111111111111111111111111111112",
  name: "Wrapped SOL",
  symbol: "SOL",
  decimals: 9,
};

const FULL_RAW = {
  ...MINIMAL_RAW,
  icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11/logo.png",
  usdPrice: 150.5,
  liquidity: 1000000,
  isVerified: true,
  tags: ["strict", "verified"],
  organicScore: 95,
  organicScoreLabel: "high" as const,
  audit: {
    mintAuthorityDisabled: true,
    freezeAuthorityDisabled: false,
    topHoldersPercentage: 12.5,
  },
};

const EXTRA_FIELDS_RAW = {
  ...FULL_RAW,
  mint: "So11111111111111111111111111111111111111112",
  logoURI: "https://example.com/logo.png",
  priceHistory24h: [100, 110, 120],
  twitter: "@solana",
  coingeckoId: "solana",
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("tokenService.search — empty query (blue-chip seed)", () => {
  it("calls jupiterClient.get with path, empty query, and undefined signal", async () => {
    const client = await loadMockClient();
    vi.mocked(client.get).mockResolvedValue([MINIMAL_RAW]);

    const service = await loadService();
    const result = await service.search("");

    expect(client.get).toHaveBeenCalledOnce();
    expect(client.get).toHaveBeenCalledWith(
      "/tokens/v2/search",
      { query: "", limit: 50 },
      undefined,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(MINIMAL_RAW.id);
  });
});

describe("tokenService.search — text query with signal", () => {
  it("calls jupiterClient.get with the query string and forwards the signal", async () => {
    const client = await loadMockClient();
    vi.mocked(client.get).mockResolvedValue([MINIMAL_RAW]);

    const service = await loadService();
    const ctrl = new AbortController();
    const result = await service.search("USDC", ctrl.signal);

    expect(client.get).toHaveBeenCalledOnce();
    expect(client.get).toHaveBeenCalledWith(
      "/tokens/v2/search",
      { query: "USDC", limit: 50 },
      ctrl.signal,
    );
    expect(result[0]!.symbol).toBe("SOL");
  });
});

describe("tokenService.search — ingestion hygiene", () => {
  it("strips extra Jupiter fields and returns only TokenInfo-known fields", async () => {
    const client = await loadMockClient();
    vi.mocked(client.get).mockResolvedValue([EXTRA_FIELDS_RAW]);

    const service = await loadService();
    const result = await service.search("SOL");
    const token = result[0]!;

    // Known fields present
    expect(token.id).toBe(EXTRA_FIELDS_RAW.id);
    expect(token.name).toBe(EXTRA_FIELDS_RAW.name);
    expect(token.symbol).toBe(EXTRA_FIELDS_RAW.symbol);
    expect(token.decimals).toBe(EXTRA_FIELDS_RAW.decimals);
    expect(token.icon).toBe(EXTRA_FIELDS_RAW.icon);
    expect(token.usdPrice).toBe(EXTRA_FIELDS_RAW.usdPrice);
    expect(token.liquidity).toBe(EXTRA_FIELDS_RAW.liquidity);
    expect(token.isVerified).toBe(EXTRA_FIELDS_RAW.isVerified);
    expect(token.tags).toEqual(EXTRA_FIELDS_RAW.tags);
    expect(token.organicScore).toBe(EXTRA_FIELDS_RAW.organicScore);
    expect(token.organicScoreLabel).toBe(EXTRA_FIELDS_RAW.organicScoreLabel);
    expect(token.audit).toBeDefined();

    // Extra fields absent
    const tokenAsUnknown = token as unknown as Record<string, unknown>;
    expect(tokenAsUnknown["mint"]).toBeUndefined();
    expect(tokenAsUnknown["logoURI"]).toBeUndefined();
    expect(tokenAsUnknown["priceHistory24h"]).toBeUndefined();
    expect(tokenAsUnknown["twitter"]).toBeUndefined();
    expect(tokenAsUnknown["coingeckoId"]).toBeUndefined();
  });
});

describe("tokenService.search — audit passthrough", () => {
  it("preserves all three audit sub-fields when present in raw response", async () => {
    const client = await loadMockClient();
    vi.mocked(client.get).mockResolvedValue([FULL_RAW]);

    const service = await loadService();
    const result = await service.search("SOL");
    const token = result[0]!;

    expect(token.audit).toEqual({
      mintAuthorityDisabled: true,
      freezeAuthorityDisabled: false,
      topHoldersPercentage: 12.5,
    });
  });
});

describe("tokenService.search — missing optional fields", () => {
  it("omits optional keys when absent from raw response", async () => {
    const client = await loadMockClient();
    vi.mocked(client.get).mockResolvedValue([MINIMAL_RAW]);

    const service = await loadService();
    const result = await service.search("SOL");
    const token = result[0]!;

    expect("usdPrice" in token).toBe(false);
    expect("liquidity" in token).toBe(false);
    expect("isVerified" in token).toBe(false);
    expect("tags" in token).toBe(false);
    expect("organicScore" in token).toBe(false);
    expect("organicScoreLabel" in token).toBe(false);
    expect("audit" in token).toBe(false);
    expect("icon" in token).toBe(false);
  });
});

describe("tokenService.search — error propagation", () => {
  it("rejects with the same SwapError when jupiterClient.get rejects", async () => {
    const client = await loadMockClient();
    const originalError = new SwapError(
      ErrorType.NetworkError,
      "Network error",
      500,
      true,
    );
    vi.mocked(client.get).mockRejectedValue(originalError);

    const service = await loadService();

    await expect(service.search("SOL")).rejects.toThrow(originalError);
  });
});
