import { describe, it, expect, vi } from "vitest";
import { swapReducer, initialState, type SwapStateContext } from "./swapReducer";
import { SwapState } from "./swapState";
import { ErrorType, SwapError } from "../types/errors";
import type { OrderResponse } from "../types/swap";

const mockQuote: OrderResponse = {
  transaction: "base64tx",
  requestId: "req-1",
  outAmount: "1000000",
  router: "iris",
  mode: "ultra",
  feeBps: 0,
  feeMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

const mockError = new SwapError(ErrorType.NetworkError, "Network failed");

function stateAt(state: SwapState, overrides?: Partial<SwapStateContext>): SwapStateContext {
  return { ...initialState, state, ...overrides };
}

describe("swapReducer — valid transitions", () => {
  // SM-01: Idle → LoadingQuote
  it("transitions Idle → LoadingQuote on FETCH_QUOTE", () => {
    const result = swapReducer(stateAt(SwapState.Idle), { type: "FETCH_QUOTE" });
    expect(result.state).toBe(SwapState.LoadingQuote);
    expect(result.error).toBeNull();
  });

  // SM-02: LoadingQuote → QuoteReady
  it("transitions LoadingQuote → QuoteReady on QUOTE_RECEIVED", () => {
    const result = swapReducer(stateAt(SwapState.LoadingQuote), {
      type: "QUOTE_RECEIVED",
      quote: mockQuote,
      fetchedAt: 1000,
    });
    expect(result.state).toBe(SwapState.QuoteReady);
    expect(result.quote).toBe(mockQuote);
    expect(result.quoteFetchedAt).toBe(1000);
  });

  // SM-03: LoadingQuote → Error
  it("transitions LoadingQuote → Error on QUOTE_ERROR", () => {
    const result = swapReducer(stateAt(SwapState.LoadingQuote), {
      type: "QUOTE_ERROR",
      error: mockError,
    });
    expect(result.state).toBe(SwapState.Error);
    expect(result.error).toBe(mockError);
  });

  // SM-04: QuoteReady → LoadingQuote
  it("transitions QuoteReady → LoadingQuote on INPUT_CHANGED", () => {
    const result = swapReducer(
      stateAt(SwapState.QuoteReady, { quote: mockQuote }),
      { type: "INPUT_CHANGED" },
    );
    expect(result.state).toBe(SwapState.LoadingQuote);
    expect(result.quote).toBeNull();
  });

  // SM-05: QuoteReady → Signing
  it("transitions QuoteReady → Signing on START_SIGNING", () => {
    const result = swapReducer(stateAt(SwapState.QuoteReady), { type: "START_SIGNING" });
    expect(result.state).toBe(SwapState.Signing);
  });

  // SM-06: QuoteReady → Error on preflight fail
  it("transitions QuoteReady → Error on PREFLIGHT_FAILED", () => {
    const preflightError = new SwapError(ErrorType.InsufficientSOL, "Not enough SOL");
    const result = swapReducer(stateAt(SwapState.QuoteReady), {
      type: "PREFLIGHT_FAILED",
      error: preflightError,
    });
    expect(result.state).toBe(SwapState.Error);
    expect(result.error?.type).toBe(ErrorType.InsufficientSOL);
  });

  // SM-07: Signing → Executing
  it("transitions Signing → Executing on TX_SIGNED", () => {
    const result = swapReducer(stateAt(SwapState.Signing), { type: "TX_SIGNED" });
    expect(result.state).toBe(SwapState.Executing);
  });

  // SM-08: Signing → Error
  it("transitions Signing → Error on SIGNING_ERROR", () => {
    const walletError = new SwapError(ErrorType.WalletRejected, "User rejected");
    const result = swapReducer(stateAt(SwapState.Signing), {
      type: "SIGNING_ERROR",
      error: walletError,
    });
    expect(result.state).toBe(SwapState.Error);
    expect(result.error?.type).toBe(ErrorType.WalletRejected);
  });

  // SM-09: Executing → Success
  it("transitions Executing → Success on EXECUTE_SUCCESS", () => {
    const result = swapReducer(stateAt(SwapState.Executing), {
      type: "EXECUTE_SUCCESS",
      signature: "5abc123",
    });
    expect(result.state).toBe(SwapState.Success);
    expect(result.txSignature).toBe("5abc123");
  });

  // SM-10: Executing → Error
  it("transitions Executing → Error on EXECUTE_ERROR", () => {
    const execError = new SwapError(ErrorType.ExecutionFailed, "Failed", -2, false);
    const result = swapReducer(stateAt(SwapState.Executing), {
      type: "EXECUTE_ERROR",
      error: execError,
    });
    expect(result.state).toBe(SwapState.Error);
  });

  // SM-11: Executing → LoadingQuote (retry)
  it("transitions Executing → LoadingQuote on EXECUTE_RETRY and increments retryCount", () => {
    const result = swapReducer(
      stateAt(SwapState.Executing, { retryCount: 1 }),
      { type: "EXECUTE_RETRY" },
    );
    expect(result.state).toBe(SwapState.LoadingQuote);
    expect(result.retryCount).toBe(2);
    expect(result.quote).toBeNull();
  });

  // SM-12: Error → Idle
  it("transitions Error → Idle on DISMISS", () => {
    const result = swapReducer(
      stateAt(SwapState.Error, { error: mockError }),
      { type: "DISMISS" },
    );
    expect(result.state).toBe(SwapState.Idle);
    expect(result.error).toBeNull();
    expect(result.retryCount).toBe(0);
  });

  // SM-13: Success → Idle
  it("transitions Success → Idle on NEW_SWAP", () => {
    const result = swapReducer(
      stateAt(SwapState.Success, { txSignature: "sig123" }),
      { type: "NEW_SWAP" },
    );
    expect(result.state).toBe(SwapState.Idle);
    expect(result.txSignature).toBeNull();
  });
});

describe("swapReducer — invalid transitions", () => {
  // SM-14: Idle → Executing rejected
  it("rejects Idle + EXECUTE_SUCCESS and logs invalid_transition", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = swapReducer(stateAt(SwapState.Idle), {
      type: "EXECUTE_SUCCESS",
      signature: "sig",
    });
    expect(result.state).toBe(SwapState.Idle);
    expect(warnSpy).toHaveBeenCalledOnce();
    const logged = JSON.parse(warnSpy.mock.calls[0]![0] as string);
    expect(logged.event).toBe("invalid_transition");
    expect(logged.from).toBe("idle");
    warnSpy.mockRestore();
  });

  // SM-15: Idle → Success rejected
  it("rejects Idle + NEW_SWAP", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = swapReducer(stateAt(SwapState.Idle), { type: "NEW_SWAP" });
    expect(result.state).toBe(SwapState.Idle);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  // SM-16: QuoteReady → Success rejected
  it("rejects QuoteReady + EXECUTE_SUCCESS", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = swapReducer(stateAt(SwapState.QuoteReady), {
      type: "EXECUTE_SUCCESS",
      signature: "sig",
    });
    expect(result.state).toBe(SwapState.QuoteReady);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  // SM-17: Signing → Idle rejected
  it("rejects Signing + DISMISS", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = swapReducer(stateAt(SwapState.Signing), { type: "DISMISS" });
    expect(result.state).toBe(SwapState.Signing);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  // SM-18: Executing → Signing rejected
  it("rejects Executing + START_SIGNING", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = swapReducer(stateAt(SwapState.Executing), { type: "START_SIGNING" });
    expect(result.state).toBe(SwapState.Executing);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("swapReducer — timeouts", () => {
  // SM-19: LoadingQuote timeout
  it("transitions LoadingQuote → Error on TIMEOUT with QuoteTimeout", () => {
    const result = swapReducer(stateAt(SwapState.LoadingQuote), {
      type: "TIMEOUT",
      errorType: ErrorType.QuoteTimeout,
    });
    expect(result.state).toBe(SwapState.Error);
    expect(result.error?.type).toBe(ErrorType.QuoteTimeout);
  });

  // SM-20: Signing timeout
  it("transitions Signing → Error on TIMEOUT with SigningTimeout", () => {
    const result = swapReducer(stateAt(SwapState.Signing), {
      type: "TIMEOUT",
      errorType: ErrorType.SigningTimeout,
    });
    expect(result.state).toBe(SwapState.Error);
    expect(result.error?.type).toBe(ErrorType.SigningTimeout);
  });

  // SM-21: Executing timeout
  it("transitions Executing → Error on TIMEOUT with ExecutionTimeout", () => {
    const result = swapReducer(stateAt(SwapState.Executing), {
      type: "TIMEOUT",
      errorType: ErrorType.ExecutionTimeout,
    });
    expect(result.state).toBe(SwapState.Error);
    expect(result.error?.type).toBe(ErrorType.ExecutionTimeout);
  });
});

describe("swapReducer — wallet disconnect", () => {
  // WD-01: Disconnect during Signing
  it("transitions Signing → Error(WalletDisconnected) on WALLET_DISCONNECTED", () => {
    const result = swapReducer(stateAt(SwapState.Signing), { type: "WALLET_DISCONNECTED" });
    expect(result.state).toBe(SwapState.Error);
    expect(result.error?.type).toBe(ErrorType.WalletDisconnected);
  });

  // WD-02: Disconnect during Executing — stay
  it("stays in Executing on WALLET_DISCONNECTED (tx already submitted)", () => {
    const result = swapReducer(stateAt(SwapState.Executing), { type: "WALLET_DISCONNECTED" });
    expect(result.state).toBe(SwapState.Executing);
  });

  // WD-03: Disconnect during Idle
  it("stays in Idle on WALLET_DISCONNECTED", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = swapReducer(stateAt(SwapState.Idle), { type: "WALLET_DISCONNECTED" });
    expect(result.state).toBe(SwapState.Idle);
    warnSpy.mockRestore();
  });

  // WD-04: Disconnect during Error → Idle
  it("transitions Error → Idle on WALLET_DISCONNECTED", () => {
    const result = swapReducer(
      stateAt(SwapState.Error, { error: mockError }),
      { type: "WALLET_DISCONNECTED" },
    );
    expect(result.state).toBe(SwapState.Idle);
  });
});

describe("swapReducer — boundary", () => {
  // SM-22: retryCount at max (handled by caller, but reducer still increments)
  it("increments retryCount on EXECUTE_RETRY regardless of current count", () => {
    const result = swapReducer(
      stateAt(SwapState.Executing, { retryCount: 3 }),
      { type: "EXECUTE_RETRY" },
    );
    expect(result.state).toBe(SwapState.LoadingQuote);
    expect(result.retryCount).toBe(4);
  });
});
