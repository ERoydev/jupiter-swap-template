import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { executeOrder } from "../services/jupiterService";
import { preflightChecks } from "../handlers/preflightChecks";
import { transactionSigner } from "../handlers/transactionSigner";
import { mapErrorCode } from "../utils/jupiterErrorMapper";
import { parsePositiveAmount } from "../utils/parseAmount";
import { SwapState } from "../state/swapState";
import type { SwapAction, SwapStateContext } from "../state/swapReducer";
import { ErrorType, SwapError } from "../types/errors";
import type { SwapResult } from "../types/swap";
import type { TokenInfo } from "../types/tokens";
import { STALE_THRESHOLD_MS } from "../config/constants";

interface UseSwapExecutionParams {
  context: SwapStateContext;
  dispatch: (action: SwapAction) => void;
  inputToken: TokenInfo;
  outputToken: TokenInfo;
  inputAmount: string;
  fetchQuote: (amount: string) => Promise<void>;
}

interface UseSwapExecutionReturn {
  handleSwap: () => Promise<void>;
  lastSwapResult: SwapResult | null;
}

/**
 * Owns the click-time swap orchestration: stale-quote gate → click-time
 * preflight → sign → post-sign stale recheck → /execute → success/error
 * dispatches. Generates a per-attempt swapCorrelationId at the top and
 * threads it through every structured log line so an investigator can
 * reconstruct one swap attempt from interleaved console output.
 *
 * Lives in a hook (not a handler module) because the orchestration reaches
 * into the reducer dispatch + component-local lastSwapResult state. A-11
 * defers the standalone `swapHandler` module to Story 3-3, when the retry
 * loop forces a clear "what does the handler return" contract.
 */
export function useSwapExecution({
  context,
  dispatch,
  inputToken,
  outputToken,
  inputAmount,
  fetchQuote,
}: UseSwapExecutionParams): UseSwapExecutionReturn {
  const { publicKey, connected, signTransaction } = useWallet();

  // Display-only result captured during the success branch. Lives outside the
  // reducer because it carries inputAmountResult / outputAmountResult —
  // render-only fields the closed reducer contract (Story 1-2) does not track.
  // Cleared whenever state leaves Success.
  const [lastSwapResult, setLastSwapResult] = useState<SwapResult | null>(null);

  useEffect(() => {
    if (context.state !== SwapState.Success) {
      setLastSwapResult(null);
    }
  }, [context.state]);

  const handleSwap = useCallback(async () => {
    const swapCorrelationId = crypto.randomUUID();
    const logSwap = (event: string, payload: Record<string, unknown> = {}) => {
      console.info(
        JSON.stringify({
          event,
          swapCorrelationId,
          ...payload,
          timestamp: new Date().toISOString(),
        }),
      );
    };

    // 1. Stale-quote gate — refresh and bail if the quote is past threshold.
    if (
      context.quoteFetchedAt !== null &&
      Date.now() - context.quoteFetchedAt > STALE_THRESHOLD_MS
    ) {
      logSwap("swap_aborted_stale_quote", {
        quoteAgeMs: Date.now() - context.quoteFetchedAt,
      });
      dispatch({ type: "FETCH_QUOTE" });
      const staleParsed = parsePositiveAmount(inputAmount);
      if (staleParsed !== null) {
        const lamports = Math.floor(
          staleParsed * 10 ** inputToken.decimals,
        ).toString();
        void fetchQuote(lamports);
      }
      return;
    }

    if (!publicKey || !context.quote || !context.quote.transaction) {
      // Code review #2 (Medium): every other path in this orchestration emits
      // a structured log line; this invariant guard was the only silent exit.
      // A user reporting "I clicked Swap and nothing happened" left no trace
      // in the console. The dispatch flag stays no-op (the state is already
      // inconsistent — surfacing a SwapError would imply a fixable failure)
      // but the log gives an investigator a grep target.
      logSwap("swap_aborted_invariant_violated", {
        hasPublicKey: !!publicKey,
        hasQuote: !!context.quote,
        hasTransaction: !!context.quote?.transaction,
      });
      return;
    }

    logSwap("swap_started", {
      inputMint: inputToken.id,
      outputMint: outputToken.id,
      requestId: context.quote.requestId,
    });

    // 2. Click-time preflight (authoritative; debounced result may be stale).
    const parsedAmount = parsePositiveAmount(inputAmount) ?? 0;
    const amountLamports = Math.floor(
      parsedAmount * 10 ** inputToken.decimals,
    ).toString();
    try {
      await preflightChecks.run(
        {
          inputMint: inputToken.id,
          outputMint: outputToken.id,
          amount: amountLamports,
          inputDecimals: inputToken.decimals,
          inputSymbol: inputToken.symbol,
        },
        { connected, publicKey },
      );
      logSwap("preflight_passed");
    } catch (err: unknown) {
      const swapErr =
        err instanceof SwapError
          ? err
          : new SwapError(ErrorType.UnknownError, "Preflight failed");
      logSwap("preflight_failed", {
        errorType: swapErr.type,
        message: swapErr.message,
      });
      dispatch({ type: "PREFLIGHT_FAILED", error: swapErr });
      return;
    }

    // 3. Sign — capture the signed base64 tx for /execute.
    logSwap("signing_started");
    dispatch({ type: "START_SIGNING" });
    let signedTx: string;
    try {
      signedTx = await transactionSigner.sign(context.quote.transaction, {
        signTransaction,
      });
    } catch (err: unknown) {
      const swapErr =
        err instanceof SwapError
          ? err
          : new SwapError(
              ErrorType.WalletRejected,
              "Signature request failed",
            );
      logSwap("signing_failed", {
        errorType: swapErr.type,
        message: swapErr.message,
      });
      dispatch({ type: "SIGNING_ERROR", error: swapErr });
      return;
    }

    // 3a. Post-signing stale recheck — signing may have taken longer than
    // STALE_THRESHOLD_MS (slow wallet UX). Without this, slow-signers always
    // burn a -1004 ("invalid block height") response on /execute.
    if (
      context.quoteFetchedAt !== null &&
      Date.now() - context.quoteFetchedAt > STALE_THRESHOLD_MS
    ) {
      const staleErr = new SwapError(
        ErrorType.TransactionExpired,
        "Quote expired during signing — please try again",
      );
      logSwap("signing_failed", {
        errorType: staleErr.type,
        message: staleErr.message,
        reason: "post_sign_stale_recheck",
      });
      dispatch({ type: "SIGNING_ERROR", error: staleErr });
      return;
    }

    // 4. Execute via Jupiter.
    logSwap("execute_started", { requestId: context.quote.requestId });
    dispatch({ type: "TX_SIGNED" });

    const requestId = context.quote.requestId;
    try {
      const response = await executeOrder(signedTx, requestId);
      const isSuccess =
        response.status === "Success" && response.code === 0;

      if (isSuccess) {
        const result: SwapResult = {
          txId: response.signature,
          status: "confirmed",
          inputAmount: response.inputAmountResult,
          outputAmount: response.outputAmountResult,
          retriesAttempted: context.retryCount,
          swapCorrelationId,
        };
        setLastSwapResult(result);
        logSwap("execute_succeeded", {
          signature: response.signature,
          inputAmount: response.inputAmountResult,
          outputAmount: response.outputAmountResult,
        });
        dispatch({
          type: "EXECUTE_SUCCESS",
          signature: response.signature,
        });
        return;
      }

      // Non-success response: build SwapError via mapErrorCode and dispatch
      // EXECUTE_ERROR. NOTE: do NOT dispatch EXECUTE_RETRY on retryable codes
      // — Story 3-3 owns the retry loop.
      //
      // A-13: prefer Jupiter's own `response.error` (e.g. "Slippage tolerance
      // exceeded", "InsufficientFundsForRent") over our generic mapping.message.
      // Falling back to mapping.message when the field is missing/empty so
      // unknown codes still surface the canonical mapper output.
      const mapping = mapErrorCode(response.code);
      const userMessage =
        response.error && response.error.trim().length > 0
          ? response.error.trim()
          : mapping.message;
      const swapErr = new SwapError(
        mapping.type,
        userMessage,
        response.code,
        mapping.retryable,
        {
          requestId,
          httpStatus: 200,
          responseBody: response,
        },
      );
      logSwap("execute_failed", {
        code: response.code,
        errorType: mapping.type,
        retryable: mapping.retryable,
      });
      dispatch({ type: "EXECUTE_ERROR", error: swapErr });
    } catch (err: unknown) {
      const swapErr =
        err instanceof SwapError
          ? err
          : new SwapError(
              ErrorType.UnknownError,
              "Unexpected error executing swap",
              undefined,
              false,
              { thrown: String(err) },
            );
      logSwap("execute_failed", {
        errorType: swapErr.type,
        message: swapErr.message,
        thrown: !(err instanceof SwapError),
      });
      dispatch({ type: "EXECUTE_ERROR", error: swapErr });
    }
  }, [
    context.quoteFetchedAt,
    context.quote,
    context.retryCount,
    inputAmount,
    inputToken.id,
    inputToken.decimals,
    inputToken.symbol,
    outputToken.id,
    publicKey,
    connected,
    signTransaction,
    dispatch,
    fetchQuote,
  ]);

  return { handleSwap, lastSwapResult };
}
