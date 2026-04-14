import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorType } from "../types/errors";

const mockOrderResponse = {
  transaction: null,
  requestId: "req-123",
  outAmount: "17057460",
  router: "iris",
  mode: "ultra",
  feeBps: 0,
  feeMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

async function loadGetOrder() {
  const mod = await import("./jupiterService");
  return mod.getOrder;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.stubEnv("VITE_JUPITER_API_URL", "https://api.jup.ag/swap/v2");
  vi.stubEnv("VITE_JUPITER_API_KEY", "test-key");
  vi.stubEnv("VITE_SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com");
});

describe("jupiterService.getOrder", () => {
  it("sends GET to /order with correct query params and x-api-key header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockOrderResponse),
    });
    vi.stubGlobal("fetch", fetchMock);

    const getOrder = await loadGetOrder();
    await getOrder({ inputMint: "So11111111111111111111111111111111", outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", amount: "1000000000" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/order?");
    expect(url).toContain("inputMint=So11111111111111111111111111111111");
    expect(url).toContain("outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    expect(url).toContain("amount=1000000000");
    expect(opts.headers["x-api-key"]).toBe("test-key");
  });

  it("includes taker param when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ...mockOrderResponse, transaction: "base64tx" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const getOrder = await loadGetOrder();
    await getOrder({
      inputMint: "mint1",
      outputMint: "mint2",
      amount: "100",
      taker: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain("taker=7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU");
  });

  it("returns OrderResponse with transaction: null for quote-only (no taker)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockOrderResponse),
    }));

    const getOrder = await loadGetOrder();
    const result = await getOrder({ inputMint: "m1", outputMint: "m2", amount: "100" });
    expect(result.transaction).toBeNull();
    expect(result.outAmount).toBe("17057460");
    expect(result.router).toBe("iris");
    expect(result.requestId).toBe("req-123");
  });

  it("passes AbortSignal to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockOrderResponse),
    });
    vi.stubGlobal("fetch", fetchMock);

    const getOrder = await loadGetOrder();
    const controller = new AbortController();
    await getOrder({ inputMint: "m1", outputMint: "m2", amount: "100" }, controller.signal);

    const [, opts] = fetchMock.mock.calls[0]!;
    expect(opts.signal).toBe(controller.signal);
  });

  it("throws SwapError(OrderFailed) on non-ok HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
    }));

    const getOrder = await loadGetOrder();
    try {
      await getOrder({ inputMint: "m1", outputMint: "m2", amount: "100" });
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      const swapErr = err as { type: string; retryable: boolean };
      expect(swapErr.type).toBe(ErrorType.OrderFailed);
      expect(swapErr.retryable).toBe(false);
    }
  });

  it("throws SwapError(NetworkError) on fetch network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const getOrder = await loadGetOrder();
    try {
      await getOrder({ inputMint: "m1", outputMint: "m2", amount: "100" });
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      const swapErr = err as { type: string };
      expect(swapErr.type).toBe(ErrorType.NetworkError);
    }
  });

  // AB-03: AbortError is rethrown (not wrapped in SwapError)
  it("rethrows AbortError without wrapping", async () => {
    const abortError = new DOMException("The operation was aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    const getOrder = await loadGetOrder();
    try {
      await getOrder({ inputMint: "m1", outputMint: "m2", amount: "100" });
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      expect(err).toBe(abortError);
      expect((err as DOMException).name).toBe("AbortError");
    }
  });
});
