import { useCallback, useEffect, useRef, useState } from "react";
import { SwapState } from "./swapState";
import { swapReducer, initialState, type SwapStateContext, type SwapAction } from "./swapReducer";
import { ErrorType } from "../types/errors";
import {
  QUOTE_TIMEOUT_MS,
  SIGNING_TIMEOUT_MS,
  EXECUTING_TIMEOUT_MS,
} from "../config/constants";

const TIMEOUT_MAP: Partial<Record<SwapState, { ms: number; errorType: ErrorType }>> = {
  [SwapState.LoadingQuote]: { ms: QUOTE_TIMEOUT_MS, errorType: ErrorType.QuoteTimeout },
  [SwapState.Signing]: { ms: SIGNING_TIMEOUT_MS, errorType: ErrorType.SigningTimeout },
  [SwapState.Executing]: { ms: EXECUTING_TIMEOUT_MS, errorType: ErrorType.ExecutionTimeout },
};

export function useSwapState() {
  const [context, setContext] = useState<SwapStateContext>(initialState);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dispatch = useCallback((action: SwapAction) => {
    setContext((prev) => swapReducer(prev, action));
  }, []);

  useEffect(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const config = TIMEOUT_MAP[context.state];
    if (config) {
      timeoutRef.current = setTimeout(() => {
        dispatch({ type: "TIMEOUT", errorType: config.errorType });
      }, config.ms);
    }

    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [context.state, dispatch]);

  return { context, dispatch };
}
