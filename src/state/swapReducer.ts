import { SwapState } from "./swapState";
import { ErrorType, SwapError } from "../types/errors";
import type { OrderResponse } from "../types/swap";

export interface SwapStateContext {
  state: SwapState;
  quote: OrderResponse | null;
  error: SwapError | null;
  txSignature: string | null;
  retryCount: number;
  quoteFetchedAt: number | null;
}

export type SwapAction =
  | { type: "FETCH_QUOTE" }
  | { type: "QUOTE_RECEIVED"; quote: OrderResponse; fetchedAt: number }
  | { type: "QUOTE_ERROR"; error: SwapError }
  | { type: "INPUT_CHANGED" }
  | { type: "START_SIGNING" }
  | { type: "PREFLIGHT_FAILED"; error: SwapError }
  | { type: "TX_SIGNED" }
  | { type: "SIGNING_ERROR"; error: SwapError }
  | { type: "EXECUTE_SUCCESS"; signature: string }
  | { type: "EXECUTE_ERROR"; error: SwapError }
  | { type: "EXECUTE_RETRY" }
  | { type: "DISMISS" }
  | { type: "NEW_SWAP" }
  | { type: "TIMEOUT"; errorType: ErrorType }
  | { type: "WALLET_DISCONNECTED" };

export const initialState: SwapStateContext = {
  state: SwapState.Idle,
  quote: null,
  error: null,
  txSignature: null,
  retryCount: 0,
  quoteFetchedAt: null,
};

export function swapReducer(
  current: SwapStateContext,
  action: SwapAction,
): SwapStateContext {
  switch (current.state) {
    case SwapState.Idle:
      if (action.type === "FETCH_QUOTE") {
        return { ...current, state: SwapState.LoadingQuote, error: null };
      }
      if (action.type === "WALLET_DISCONNECTED") {
        return { ...initialState };
      }
      break;

    case SwapState.LoadingQuote:
      if (action.type === "QUOTE_RECEIVED") {
        return {
          ...current,
          state: SwapState.QuoteReady,
          quote: action.quote,
          quoteFetchedAt: action.fetchedAt,
          error: null,
        };
      }
      if (action.type === "QUOTE_ERROR") {
        return { ...current, state: SwapState.Error, error: action.error };
      }
      if (action.type === "TIMEOUT") {
        return {
          ...current,
          state: SwapState.Error,
          error: new SwapError(action.errorType, "Quote request timed out", undefined, false, { timeoutMs: 10000 }),
        };
      }
      if (action.type === "WALLET_DISCONNECTED") {
        return { ...initialState };
      }
      break;

    case SwapState.QuoteReady:
      if (action.type === "INPUT_CHANGED") {
        return { ...current, state: SwapState.LoadingQuote, quote: null, quoteFetchedAt: null };
      }
      if (action.type === "START_SIGNING") {
        return { ...current, state: SwapState.Signing };
      }
      if (action.type === "PREFLIGHT_FAILED") {
        return { ...current, state: SwapState.Error, error: action.error };
      }
      if (action.type === "FETCH_QUOTE") {
        return { ...current, state: SwapState.LoadingQuote };
      }
      if (action.type === "WALLET_DISCONNECTED") {
        return { ...initialState };
      }
      break;

    case SwapState.Signing:
      if (action.type === "TX_SIGNED") {
        return { ...current, state: SwapState.Executing };
      }
      if (action.type === "SIGNING_ERROR") {
        return { ...current, state: SwapState.Error, error: action.error };
      }
      if (action.type === "WALLET_DISCONNECTED") {
        return {
          ...current,
          state: SwapState.Error,
          error: new SwapError(ErrorType.WalletDisconnected, "Wallet disconnected during signing"),
        };
      }
      if (action.type === "TIMEOUT") {
        return {
          ...current,
          state: SwapState.Error,
          error: new SwapError(action.errorType, "Wallet signing timed out", undefined, false, { timeoutMs: 120000 }),
        };
      }
      break;

    case SwapState.Executing:
      if (action.type === "EXECUTE_SUCCESS") {
        return {
          ...current,
          state: SwapState.Success,
          txSignature: action.signature,
          retryCount: 0,
        };
      }
      if (action.type === "EXECUTE_ERROR") {
        return { ...current, state: SwapState.Error, error: action.error, retryCount: 0 };
      }
      if (action.type === "EXECUTE_RETRY") {
        return {
          ...current,
          state: SwapState.LoadingQuote,
          retryCount: current.retryCount + 1,
          quote: null,
          quoteFetchedAt: null,
        };
      }
      if (action.type === "TIMEOUT") {
        return {
          ...current,
          state: SwapState.Error,
          error: new SwapError(action.errorType, "Transaction confirmation timed out", undefined, false, { timeoutMs: 60000 }),
        };
      }
      // Wallet disconnect during Executing: stay in Executing (tx already submitted)
      if (action.type === "WALLET_DISCONNECTED") {
        return current;
      }
      break;

    case SwapState.Error:
      if (action.type === "DISMISS" || action.type === "INPUT_CHANGED" || action.type === "WALLET_DISCONNECTED") {
        return { ...initialState };
      }
      break;

    case SwapState.Success:
      if (action.type === "NEW_SWAP" || action.type === "WALLET_DISCONNECTED") {
        return { ...initialState };
      }
      break;
  }

  // Invalid transition — log and return unchanged
  console.warn(JSON.stringify({
    event: "invalid_transition",
    from: current.state,
    trigger: action.type,
    timestamp: new Date().toISOString(),
  }));

  return current;
}
