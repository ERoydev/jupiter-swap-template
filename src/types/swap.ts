import type { SwapError } from "./errors";

export interface SwapParams {
  inputMint: string;
  outputMint: string;
  amount: string;
  userPublicKey: string;
}

export interface OrderResponse {
  transaction: string | null;
  requestId: string;
  outAmount: string;
  router: string;
  mode: string;
  feeBps: number;
  feeMint: string;
  priceImpactPct?: string;
}

export interface ExecuteResponse {
  status: "Success" | "Failed";
  signature: string;
  code: number;
  inputAmountResult: string;
  outputAmountResult: string;
  error?: string;
}

export interface SwapResult {
  txId: string;
  status: "confirmed" | "failed";
  inputAmount: string;
  outputAmount: string;
  retriesAttempted: number;
  swapCorrelationId: string;
  error?: SwapError;
}
