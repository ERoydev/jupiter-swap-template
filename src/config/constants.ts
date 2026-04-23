import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { TokenInfo } from "../types/tokens";

export const DEFAULT_SLIPPAGE_BPS = 50;
export const MIN_SOL_BALANCE = 0.01 * LAMPORTS_PER_SOL;
export const MAX_RETRIES = 3;
export const CONFIRMATION_TIMEOUT_MS = 60_000;
export const QUOTE_TIMEOUT_MS = 10_000;
export const SIGNING_TIMEOUT_MS = 120_000;
export const EXECUTING_TIMEOUT_MS = 60_000;
export const STALE_THRESHOLD_MS = 30_000;

/**
 * Default token mints used on app boot before the user opens the selector.
 * Per AC-1 of Story 2-2: pre-selected without any network call.
 */
export const DEFAULT_INPUT_MINT = "So11111111111111111111111111111111111111112";   // SOL
export const DEFAULT_OUTPUT_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";  // USDC

/**
 * Full TokenInfo shape for the default pair — used by the swap form on mount
 * so lamport math and display labels have correct decimals + symbol before the
 * user opens the selector. When the user picks a new token via the selector,
 * the modal's onSelect callback provides a full TokenInfo which replaces these.
 */
export const DEFAULT_INPUT_TOKEN: TokenInfo = {
  id: DEFAULT_INPUT_MINT,
  name: "Solana",
  symbol: "SOL",
  decimals: 9,
};

export const DEFAULT_OUTPUT_TOKEN: TokenInfo = {
  id: DEFAULT_OUTPUT_MINT,
  name: "USD Coin",
  symbol: "USDC",
  decimals: 6,
};
