import { JUPITER_API_URL, JUPITER_API_KEY } from "../config/env";
import { ErrorType, SwapError } from "../types/errors";
import type { OrderResponse } from "../types/swap";

interface GetOrderParams {
  inputMint: string;
  outputMint: string;
  amount: string;
  taker?: string;
}

export async function getOrder(
  params: GetOrderParams,
  signal?: AbortSignal,
): Promise<OrderResponse> {
  const searchParams = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount,
  });

  if (params.taker) {
    searchParams.set("taker", params.taker);
  }

  const url = `${JUPITER_API_URL}/order?${searchParams.toString()}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "x-api-key": JUPITER_API_KEY },
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    throw new SwapError(
      ErrorType.NetworkError,
      "Network error while fetching quote. Check your connection.",
      undefined,
      false,
      { url, fetchError: String(err) },
    );
  }

  if (!response.ok) {
    throw new SwapError(
      ErrorType.OrderFailed,
      "Failed to get quote from Jupiter. Please try again.",
      undefined,
      false,
      { url, httpStatus: response.status },
    );
  }

  return response.json() as Promise<OrderResponse>;
}
