/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSwapState } from "./useSwapState";
import { SwapState } from "./swapState";
import { ErrorType } from "../types/errors";

// Need @testing-library/react for renderHook
// Install: npm install --save-dev @testing-library/react

describe("useSwapState — timeouts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in Idle state", () => {
    const { result } = renderHook(() => useSwapState());
    expect(result.current.context.state).toBe(SwapState.Idle);
  });

  it("transitions to Error(QuoteTimeout) after QUOTE_TIMEOUT_MS in LoadingQuote", () => {
    const { result } = renderHook(() => useSwapState());

    act(() => {
      result.current.dispatch({ type: "FETCH_QUOTE" });
    });
    expect(result.current.context.state).toBe(SwapState.LoadingQuote);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.context.state).toBe(SwapState.Error);
    expect(result.current.context.error?.type).toBe(ErrorType.QuoteTimeout);
  });

  it("transitions to Error(SigningTimeout) after SIGNING_TIMEOUT_MS in Signing", () => {
    const { result } = renderHook(() => useSwapState());

    // Get to Signing: Idle → LoadingQuote → QuoteReady → Signing
    act(() => {
      result.current.dispatch({ type: "FETCH_QUOTE" });
    });
    act(() => {
      result.current.dispatch({
        type: "QUOTE_RECEIVED",
        quote: {
          transaction: "tx",
          requestId: "r1",
          outAmount: "100",
          router: "iris",
          mode: "ultra",
          feeBps: 0,
          feeMint: "mint",
        },
        fetchedAt: Date.now(),
      });
    });
    act(() => {
      result.current.dispatch({ type: "START_SIGNING" });
    });
    expect(result.current.context.state).toBe(SwapState.Signing);

    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(result.current.context.state).toBe(SwapState.Error);
    expect(result.current.context.error?.type).toBe(ErrorType.SigningTimeout);
  });

  it("transitions to Error(ExecutionTimeout) after EXECUTING_TIMEOUT_MS in Executing", () => {
    const { result } = renderHook(() => useSwapState());

    // Get to Executing: Idle → LoadingQuote → QuoteReady → Signing → Executing
    act(() => {
      result.current.dispatch({ type: "FETCH_QUOTE" });
    });
    act(() => {
      result.current.dispatch({
        type: "QUOTE_RECEIVED",
        quote: {
          transaction: "tx",
          requestId: "r1",
          outAmount: "100",
          router: "iris",
          mode: "ultra",
          feeBps: 0,
          feeMint: "mint",
        },
        fetchedAt: Date.now(),
      });
    });
    act(() => {
      result.current.dispatch({ type: "START_SIGNING" });
    });
    act(() => {
      result.current.dispatch({ type: "TX_SIGNED" });
    });
    expect(result.current.context.state).toBe(SwapState.Executing);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.context.state).toBe(SwapState.Error);
    expect(result.current.context.error?.type).toBe(ErrorType.ExecutionTimeout);
  });

  it("clears timeout when leaving a timed state before timeout fires", () => {
    const { result } = renderHook(() => useSwapState());

    act(() => {
      result.current.dispatch({ type: "FETCH_QUOTE" });
    });
    expect(result.current.context.state).toBe(SwapState.LoadingQuote);

    // Transition out before timeout
    act(() => {
      result.current.dispatch({
        type: "QUOTE_RECEIVED",
        quote: {
          transaction: "tx",
          requestId: "r1",
          outAmount: "100",
          router: "iris",
          mode: "ultra",
          feeBps: 0,
          feeMint: "mint",
        },
        fetchedAt: Date.now(),
      });
    });
    expect(result.current.context.state).toBe(SwapState.QuoteReady);

    // Advance past the original timeout — should NOT transition to Error
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(result.current.context.state).toBe(SwapState.QuoteReady);
  });
});
