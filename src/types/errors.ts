export enum ErrorType {
  InsufficientSOL = "InsufficientSOL",
  InsufficientBalance = "InsufficientBalance",
  SlippageExceeded = "SlippageExceeded",
  TransactionExpired = "TransactionExpired",
  NetworkError = "NetworkError",
  WalletRejected = "WalletRejected",
  WalletNotConnected = "WalletNotConnected",
  WalletDisconnected = "WalletDisconnected",
  InvalidInput = "InvalidInput",
  OrderFailed = "OrderFailed",
  ExecutionFailed = "ExecutionFailed",
  QuoteTimeout = "QuoteTimeout",
  SigningTimeout = "SigningTimeout",
  ExecutionTimeout = "ExecutionTimeout",
  TokenListError = "TokenListError",
  BalanceCheckFailed = "BalanceCheckFailed",
  UnknownError = "UnknownError",
}

export class SwapError extends Error {
  constructor(
    public readonly type: ErrorType,
    message: string,
    public readonly code?: number,
    public readonly retryable: boolean = false,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SwapError";
  }
}
