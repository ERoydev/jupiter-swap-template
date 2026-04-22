import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ErrorType, SwapError } from "../types/errors";

// Each test group resets modules so env stubs take effect on fresh imports.
async function loadClient() {
  const mod = await import("./jupiterClient");
  return mod.jupiterClient;
}

function makeOkResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makeErrorResponse(status: number): Response {
  return new Response(JSON.stringify({ error: "error" }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.stubEnv("VITE_SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com");
  vi.stubEnv("VITE_JUPITER_API_URL", "https://api.jup.ag");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ─── Base-URL selection ───────────────────────────────────────────────────────

describe("jupiterClient — base-URL selection (key present)", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_JUPITER_API_KEY", "test-key");
  });

  it("/tokens/v2/search uses api.jup.ag and sets x-api-key", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(makeOkResponse([]));

    const client = await loadClient();
    await client.get("/tokens/v2/search", { query: "SOL" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("https://api.jup.ag/tokens/v2/search");
    expect(String(url)).toContain("query=SOL");
    expect((opts?.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
  });

  it("/ultra/v1/balances/PK uses api.jup.ag and sets x-api-key", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(makeOkResponse({}));

    const client = await loadClient();
    await client.get("/ultra/v1/balances/MyWalletPK");

    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("https://api.jup.ag/ultra/v1/balances/MyWalletPK");
    expect((opts?.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
  });

  it("/swap/v2/order uses api.jup.ag and sets x-api-key", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(makeOkResponse({ requestId: "r1" }));

    const client = await loadClient();
    await client.get("/swap/v2/order", { inputMint: "A", outputMint: "B", amount: "100" });

    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("https://api.jup.ag/swap/v2/order");
    expect((opts?.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
  });
});

describe("jupiterClient — base-URL selection (key absent)", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_JUPITER_API_KEY", "");
  });

  it("/tokens/v2/search uses lite-api.jup.ag with no x-api-key", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(makeOkResponse([]));

    const client = await loadClient();
    await client.get("/tokens/v2/search", { query: "SOL" });

    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("https://lite-api.jup.ag/tokens/v2/search");
    expect((opts?.headers as Record<string, string>)["x-api-key"]).toBeUndefined();
  });

  it("/ultra/v1/balances/PK uses lite-api.jup.ag with no x-api-key", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(makeOkResponse({}));

    const client = await loadClient();
    await client.get("/ultra/v1/balances/MyWalletPK");

    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("https://lite-api.jup.ag/ultra/v1/balances/MyWalletPK");
    expect((opts?.headers as Record<string, string>)["x-api-key"]).toBeUndefined();
  });

  it("/swap/v2/order throws ConfigError synchronously BEFORE fetch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const client = await loadClient();
    await expect(
      client.get("/swap/v2/order", { inputMint: "A", outputMint: "B", amount: "100" }),
    ).rejects.toMatchObject({
      type: ErrorType.ConfigError,
      message: expect.stringContaining("https://portal.jup.ag"),
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("/swap/v2/execute (POST) throws ConfigError synchronously BEFORE fetch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const client = await loadClient();
    await expect(
      client.post("/swap/v2/execute", { signedTransaction: "tx", requestId: "r" }),
    ).rejects.toMatchObject({ type: ErrorType.ConfigError });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("jupiterClient — unknown path prefix", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_JUPITER_API_KEY", "test-key");
  });

  it("throws a dev-time error for unrecognized path prefix", async () => {
    const client = await loadClient();
    await expect(client.get("/unknown/foo")).rejects.toThrow();
  });
});

// ─── Error mapping ────────────────────────────────────────────────────────────

describe("jupiterClient — error mapping", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_JUPITER_API_KEY", "test-key");
  });

  it("500 response → SwapError(NetworkError, retryable: true)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(makeErrorResponse(500));

    const client = await loadClient();
    try {
      await client.get("/tokens/v2/search");
      expect.fail("should have thrown");
    } catch (err) {
      const swapErr = err as SwapError;
      expect(swapErr.type).toBe(ErrorType.NetworkError);
      expect(swapErr.retryable).toBe(true);
      expect(swapErr.name).toBe("SwapError");
    }
  });

  it("429 response → SwapError(NetworkError, retryable: true)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(makeErrorResponse(429));

    const client = await loadClient();
    try {
      await client.get("/tokens/v2/search");
      expect.fail("should have thrown");
    } catch (err) {
      const swapErr = err as SwapError;
      expect(swapErr.type).toBe(ErrorType.NetworkError);
      expect(swapErr.retryable).toBe(true);
    }
  });

  it("400 response → SwapError(UnknownError, retryable: false)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(makeErrorResponse(400));

    const client = await loadClient();
    try {
      await client.get("/tokens/v2/search");
      expect.fail("should have thrown");
    } catch (err) {
      const swapErr = err as SwapError;
      expect(swapErr.type).toBe(ErrorType.UnknownError);
      expect(swapErr.retryable).toBe(false);
    }
  });

  it("network failure (TypeError) → SwapError(NetworkError, retryable: true)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    const client = await loadClient();
    try {
      await client.get("/tokens/v2/search");
      expect.fail("should have thrown");
    } catch (err) {
      const swapErr = err as SwapError;
      expect(swapErr.type).toBe(ErrorType.NetworkError);
      expect(swapErr.retryable).toBe(true);
    }
  });

  it("AbortError → rethrown as-is (not wrapped)", async () => {
    const abortErr = new DOMException("Aborted", "AbortError");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(abortErr);

    const client = await loadClient();
    try {
      await client.get("/tokens/v2/search");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBe(abortErr);
      expect((err as DOMException).name).toBe("AbortError");
    }
  });

  it("JSON parse failure → SwapError(UnknownError) mentioning parse failure", async () => {
    // Return response with invalid JSON body but ok: true status
    const badResponse = new Response("not-json{{", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(badResponse);

    const client = await loadClient();
    try {
      await client.get("/tokens/v2/search");
      expect.fail("should have thrown");
    } catch (err) {
      const swapErr = err as SwapError;
      expect(swapErr.type).toBe(ErrorType.UnknownError);
      expect(swapErr.message.toLowerCase()).toMatch(/parse/);
    }
  });
});

// ─── Header behaviour ─────────────────────────────────────────────────────────

describe("jupiterClient — header behaviour", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_JUPITER_API_KEY", "test-key");
  });

  it("POST sets Content-Type: application/json", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(makeOkResponse({ ok: true }));

    const client = await loadClient();
    await client.post("/swap/v2/execute", { signedTransaction: "tx", requestId: "r" });

    const [, opts] = fetchMock.mock.calls[0]!;
    expect((opts?.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  it("GET does not set Content-Type", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(makeOkResponse([]));

    const client = await loadClient();
    await client.get("/tokens/v2/search", { query: "X" });

    const [, opts] = fetchMock.mock.calls[0]!;
    expect((opts?.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("x-api-key header absent when key is empty and base is lite-api", async () => {
    vi.stubEnv("VITE_JUPITER_API_KEY", "");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(makeOkResponse([]));

    const client = await loadClient();
    await client.get("/tokens/v2/search", { query: "X" });

    const [, opts] = fetchMock.mock.calls[0]!;
    expect((opts?.headers as Record<string, string>)["x-api-key"]).toBeUndefined();
  });
});

// ─── Params + signal ─────────────────────────────────────────────────────────

describe("jupiterClient — params and signal", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_JUPITER_API_KEY", "test-key");
  });

  it("encodes params as URLSearchParams query string", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(makeOkResponse([]));

    const client = await loadClient();
    await client.get("/tokens/v2/search", { query: "hello world", limit: 10 });

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("query=hello+world");
    expect(String(url)).toContain("limit=10");
  });

  it("passes AbortSignal through to fetch", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(makeOkResponse([]));

    const client = await loadClient();
    const ctrl = new AbortController();
    await client.get("/tokens/v2/search", undefined, ctrl.signal);

    const [, opts] = fetchMock.mock.calls[0]!;
    expect(opts?.signal).toBe(ctrl.signal);
  });
});
