import type { PublicKey } from "@solana/web3.js";
import { balanceService } from "../services/balanceService";
import { isValidBase58PublicKey } from "../lib/publicKey";
import { MIN_SOL_BALANCE_UI } from "../config/constants";
import { ErrorType, SwapError } from "../types/errors";

// A-8: native SOL lives under the literal "SOL" key in BalanceMap; the
// wSOL mint address does not appear there. Check 7 aliases to
// getSolBalance when the input is native SOL.
const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";

export interface PreflightParams {
  inputMint: string;
  outputMint: string;
  /** Smallest-unit string (lamports for SOL-like tokens). */
  amount: string;
  inputDecimals: number;
  inputSymbol: string;
}

export interface PreflightWallet {
  connected: boolean;
  publicKey: PublicKey | null;
}

/**
 * Runs the 7 pre-flight checks in declared order, fail-fast. Resolves `void` on
 * all-pass; throws a typed `SwapError` on the first failing check.
 *
 * Order matches spec FR-11 + story 3-1 architecture guardrail:
 *   1. Wallet connected
 *   2. Positive amount
 *   3. Input mint valid base58
 *   4. Output mint valid base58
 *   5. Input !== output
 *   6. Wallet SOL >= MIN_SOL_BALANCE_UI
 *   7. Wallet input-token balance >= amount (UI units)
 */
export const preflightChecks = {
  async run(params: PreflightParams, wallet: PreflightWallet): Promise<void> {
    // 1. Wallet connection
    if (!wallet.connected || wallet.publicKey === null) {
      throw new SwapError(
        ErrorType.WalletNotConnected,
        "Connect a wallet to continue",
        undefined,
        false,
      );
    }

    // 2. Positive amount
    const amountNum = parseFloat(params.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      throw new SwapError(
        ErrorType.InvalidInput,
        "Enter a positive amount",
        undefined,
        false,
      );
    }

    // 3. Input mint valid
    if (!isValidBase58PublicKey(params.inputMint)) {
      throw new SwapError(
        ErrorType.InvalidInput,
        "Invalid input token address",
        undefined,
        false,
      );
    }

    // 4. Output mint valid
    if (!isValidBase58PublicKey(params.outputMint)) {
      throw new SwapError(
        ErrorType.InvalidInput,
        "Invalid output token address",
        undefined,
        false,
      );
    }

    // 5. Not same-token
    if (params.inputMint === params.outputMint) {
      throw new SwapError(
        ErrorType.InvalidInput,
        "Cannot swap a token to itself",
        undefined,
        false,
      );
    }

    const walletAddress = wallet.publicKey.toBase58();

    // 6. Enough SOL for fees
    const solBalance = await balanceService.getSolBalance(wallet.publicKey);
    if (solBalance < MIN_SOL_BALANCE_UI) {
      throw new SwapError(
        ErrorType.InsufficientSOL,
        "You need at least 0.01 SOL for transaction fees",
        undefined,
        false,
        { walletAddress },
      );
    }

    // 7. Enough input-token balance (A-8: wSOL aliases to native SOL)
    const inputBalanceUi =
      params.inputMint === WRAPPED_SOL_MINT
        ? await balanceService.getSolBalance(wallet.publicKey)
        : await balanceService.getTokenBalance(
            wallet.publicKey,
            params.inputMint,
          );
    const amountUi = amountNum / 10 ** params.inputDecimals;
    if (inputBalanceUi < amountUi) {
      throw new SwapError(
        ErrorType.InsufficientBalance,
        `Insufficient ${params.inputSymbol} balance`,
        undefined,
        false,
        { walletAddress, mint: params.inputMint },
      );
    }
  },
};
