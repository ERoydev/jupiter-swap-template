import { ErrorType } from "../types/errors";

export interface ErrorMapping {
  type: ErrorType;
  message: string;
  retryable: boolean;
}

const ERROR_MAP: Record<number, ErrorMapping> = {
  [-1]: {
    type: ErrorType.OrderFailed,
    message: "Order expired, fetching new quote...",
    retryable: true,
  },
  [-2]: {
    type: ErrorType.ExecutionFailed,
    message: "Transaction error. Please try again.",
    retryable: false,
  },
  [-3]: {
    type: ErrorType.ExecutionFailed,
    message: "Transaction error. Please try again.",
    retryable: false,
  },
  [-1000]: {
    type: ErrorType.TransactionExpired,
    message: "Transaction didn't land. Retrying...",
    retryable: true,
  },
  [-1001]: {
    type: ErrorType.UnknownError,
    message: "Something went wrong. Please try again.",
    retryable: false,
  },
  [-1002]: {
    type: ErrorType.ExecutionFailed,
    message: "Invalid transaction. Please try again.",
    retryable: false,
  },
  [-1003]: {
    type: ErrorType.ExecutionFailed,
    message: "Signing error. Please try again.",
    retryable: false,
  },
  [-1004]: {
    type: ErrorType.TransactionExpired,
    message: "Block expired. Retrying with fresh quote...",
    retryable: true,
  },
  [-2000]: {
    type: ErrorType.TransactionExpired,
    message: "Transaction didn't land. Retrying...",
    retryable: true,
  },
  [-2001]: {
    type: ErrorType.UnknownError,
    message: "Something went wrong. Please try again.",
    retryable: false,
  },
  [-2002]: {
    type: ErrorType.ExecutionFailed,
    message: "Transaction error. Please try again.",
    retryable: false,
  },
  [-2003]: {
    type: ErrorType.TransactionExpired,
    message: "Quote expired. Fetching new quote...",
    retryable: true,
  },
  [-2004]: {
    type: ErrorType.ExecutionFailed,
    message: "Swap was rejected. Please try again.",
    retryable: false,
  },
};

/**
 * Returns the canonical mapping for a known Jupiter Ultra error code, or a
 * code-bearing fallback for unknown codes. The fallback embeds the numeric
 * code in the user-facing message so support can act on otherwise-silent
 * failures (vs. the previous opaque "Something went wrong"). A-13.
 */
export function mapErrorCode(code: number): ErrorMapping {
  const known = ERROR_MAP[code];
  if (known) return known;
  return {
    type: ErrorType.UnknownError,
    message: `Transaction failed (code: ${code}). Try increasing slippage tolerance and try again.`,
    retryable: false,
  };
}
