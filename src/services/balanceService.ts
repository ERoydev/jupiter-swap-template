import type { PublicKey } from "@solana/web3.js";
import { jupiterClient } from "./jupiterClient";
import { connection } from "../lib/connection";
import type { BalanceMap } from "../types/tokens";
import { ErrorType, SwapError } from "../types/errors";

// A-9: native SOL sits under the literal key "SOL" in Ultra's BalanceMap,
// never under the wSOL mint address. Aliased here so every consumer of
// getTokenBalance (preflight, fee estimator, future handlers) gets the
// right number without re-implementing the special case.
const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";

/** Raw per-token entry returned by the Ultra balances endpoint. */
interface UltraBalanceEntry {
  amount?: string;
  rawAmount?: string;
  uiAmount?: number;
  decimals?: number;
  slot?: number;
}

/** The Ultra endpoint may return Form A (flat map) or Form B (nested under `balances`). */
type UltraBalancesResponse =
  | Record<string, UltraBalanceEntry>
  | { balances: Record<string, UltraBalanceEntry> };

/**
 * Defensively parse the Ultra `/balances/{publicKey}` response into a `BalanceMap`.
 *
 * Handles two response forms Jupiter has used:
 *   - Form A (flat): `Record<string, { amount, uiAmount, ... }>`
 *   - Form B (nested): `{ balances: Record<string, { amount, uiAmount, ... }> }`
 */
function parseUltraResponse(raw: UltraBalancesResponse): BalanceMap {
  let source: Record<string, unknown>;

  if (
    raw !== null &&
    typeof raw === "object" &&
    "balances" in raw &&
    typeof (raw as { balances: unknown }).balances === "object" &&
    (raw as { balances: unknown }).balances !== null
  ) {
    // Form B
    source = (raw as { balances: Record<string, unknown> }).balances;
  } else if (raw !== null && typeof raw === "object") {
    // Form A
    source = raw as Record<string, unknown>;
  } else {
    throw new SwapError(
      ErrorType.UnknownError,
      "Failed to parse Ultra balances response",
      undefined,
      false,
      { raw },
    );
  }

  const result: BalanceMap = {};

  for (const [key, value] of Object.entries(source)) {
    if (value === null || typeof value !== "object") {
      continue;
    }

    const entry = value as Record<string, unknown>;

    const uiAmount =
      typeof entry["uiAmount"] === "number" ? entry["uiAmount"] : undefined;

    if (uiAmount === undefined) {
      continue;
    }

    const rawAmount =
      typeof entry["rawAmount"] === "string"
        ? entry["rawAmount"]
        : typeof entry["amount"] === "string"
          ? entry["amount"]
          : "0";

    const decimals =
      typeof entry["decimals"] === "number" ? entry["decimals"] : 0;

    result[key] = { uiAmount, rawAmount, decimals };
  }

  return result;
}

export const balanceService = {
  /**
   * Fetches all balances for a wallet from the Ultra endpoint.
   * Returns a `BalanceMap` keyed by mint (native SOL is `"SOL"`).
   */
  async getAllBalances(
    publicKey: PublicKey,
    signal?: AbortSignal,
  ): Promise<BalanceMap> {
    const raw = await jupiterClient.get<UltraBalancesResponse>(
      `/ultra/v1/balances/${publicKey.toBase58()}`,
      undefined,
      signal,
    );
    return parseUltraResponse(raw);
  },

  /**
   * Returns the native SOL balance in UI units (not lamports).
   * Primary: Ultra `/balances/{publicKey}`.
   * Fallback (on any Ultra error): `connection.getBalance(publicKey)` via RPC.
   * Both failing: throws `SwapError(BalanceCheckFailed)`.
   */
  async getSolBalance(
    publicKey: PublicKey,
    signal?: AbortSignal,
  ): Promise<number> {
    try {
      const balances = await balanceService.getAllBalances(publicKey, signal);
      const sol = balances["SOL"];
      return sol !== undefined ? sol.uiAmount : 0;
    } catch (ultraErr) {
      // Ultra failed — attempt RPC fallback for SOL only.
      try {
        const lamports = await connection.getBalance(publicKey);
        return lamports / 1e9;
      } catch (rpcErr) {
        throw new SwapError(
          ErrorType.BalanceCheckFailed,
          "Failed to fetch SOL balance from both Ultra and RPC",
          undefined,
          true,
          {
            ultraError: String(ultraErr),
            rpcError: String(rpcErr),
          },
        );
      }
    }
  },

  /**
   * Returns the SPL token balance in UI units for the given mint.
   * Ultra-only — no RPC fallback for SPL tokens.
   *
   * A-9: the wSOL mint (`So111...11112`) is aliased to native SOL via
   * `getSolBalance` (which does have an RPC fallback). This preserves the
   * invariant "caller asks for a mint, gets the number of tokens held for
   * that mint" even when Jupiter's BalanceMap stores native SOL under
   * the key `"SOL"` instead of the wSOL mint address.
   *
   * Returns `0` when the wallet doesn't hold the token.
   */
  async getTokenBalance(
    publicKey: PublicKey,
    mint: string,
    signal?: AbortSignal,
  ): Promise<number> {
    if (mint === WRAPPED_SOL_MINT) {
      return balanceService.getSolBalance(publicKey, signal);
    }
    const balances = await balanceService.getAllBalances(publicKey, signal);
    const entry = balances[mint];
    return entry !== undefined ? entry.uiAmount : 0;
  },
};
