import { jupiterClient } from "./jupiterClient";
import { ErrorType, SwapError } from "../types/errors";
import type { OrderResponse } from "../types/swap";

interface GetOrderParams {
  inputMint: string;
  outputMint: string;
  amount: string;
  taker?: string;
  slippageBps?: number;
}

export async function getOrder(
  params: GetOrderParams,
  signal?: AbortSignal,
): Promise<OrderResponse> {
  const queryParams: Record<string, string> = {
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount,
  };

  if (params.taker) {
    queryParams["taker"] = params.taker;
  }

  if (typeof params.slippageBps === "number") {
    queryParams["slippageBps"] = String(params.slippageBps);
  }

  try {
    return await jupiterClient.get<OrderResponse>("/swap/v2/order", queryParams, signal);
  } catch (err) {
    // AbortError and NetworkError pass through unchanged.
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    if (err instanceof SwapError && err.type === ErrorType.NetworkError) {
      throw err;
    }
    // Any non-ok HTTP response from the order endpoint maps to OrderFailed for
    // Story 2-1 compatibility — callers that check for ErrorType.OrderFailed continue to work.
    if (err instanceof SwapError) {
      throw new SwapError(
        ErrorType.OrderFailed,
        "Failed to get quote from Jupiter. Please try again.",
        err.code,
        false,
        err.details,
      );
    }
    throw new SwapError(
      ErrorType.NetworkError,
      "Network error while fetching quote. Check your connection.",
      undefined,
      false,
      { fetchError: String(err) },
    );
  }
}

export async function executeOrder(
  signedTx: string,
  requestId: string,
  signal?: AbortSignal,
): Promise<unknown> {
  return jupiterClient.post("/swap/v2/execute", { signedTransaction: signedTx, requestId }, signal);
}

export { ErrorType, SwapError };
