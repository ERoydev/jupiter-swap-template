import { VersionedTransaction } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { ErrorType, SwapError } from "../types/errors";

/** Minimal slice of WalletContextState that transactionSigner requires. */
export type SigningWallet = Pick<WalletContextState, "signTransaction">;

/**
 * Signs a base64-encoded VersionedTransaction from Jupiter's `/order` response.
 *
 * Two distinct error paths:
 *   - `signTransaction` is `undefined` → `WalletNotConnected` (wallet capability missing)
 *   - wallet's `signTransaction` rejects   → `WalletRejected` (user cancelled)
 *
 * The distinction matters for UX: the first is an unusable wallet (rare), the
 * second is the expected user-cancellation path targeted by AC-3-1-5.
 *
 * No network calls. Pure (de)serialization + wallet invocation.
 */
export const transactionSigner = {
  async sign(base64Tx: string, wallet: SigningWallet): Promise<string> {
    if (typeof wallet.signTransaction !== "function") {
      throw new SwapError(
        ErrorType.WalletNotConnected,
        "Wallet does not support signing",
        undefined,
        false,
      );
    }

    // base64 → Uint8Array → VersionedTransaction
    const bytes = Uint8Array.from(atob(base64Tx), (c) => c.charCodeAt(0));
    const tx = VersionedTransaction.deserialize(bytes);

    let signed: VersionedTransaction;
    try {
      signed = await wallet.signTransaction(tx);
    } catch {
      // User rejected, wallet threw, wallet lost connection mid-prompt, etc.
      // Collapse to WalletRejected — the state machine target for AC-3-1-5.
      throw new SwapError(
        ErrorType.WalletRejected,
        "You rejected the signature request",
        undefined,
        false,
      );
    }

    // VersionedTransaction → bytes → base64.
    //
    // Spreading a Uint8Array through `String.fromCharCode(...bytes)` works
    // today (VT payloads are well below the ~64K arg-count cap some engines
    // enforce), but a chunked loop is safer-by-construction and keeps this
    // code future-proof for larger serialized payloads.
    const signedBytes = signed.serialize();
    let binary = "";
    for (const byte of signedBytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  },
};
