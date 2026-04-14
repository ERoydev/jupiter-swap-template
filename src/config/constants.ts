import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export const DEFAULT_SLIPPAGE_BPS = 50;
export const MIN_SOL_BALANCE = 0.01 * LAMPORTS_PER_SOL;
export const MAX_RETRIES = 3;
export const CONFIRMATION_TIMEOUT_MS = 60_000;
export const QUOTE_TIMEOUT_MS = 10_000;
export const SIGNING_TIMEOUT_MS = 120_000;
export const EXECUTING_TIMEOUT_MS = 60_000;
export const STALE_THRESHOLD_MS = 30_000;
