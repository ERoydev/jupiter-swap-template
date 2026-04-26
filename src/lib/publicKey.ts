import { PublicKey } from "@solana/web3.js";

/**
 * Returns `true` if `value` is a valid base58-encoded Solana public key.
 * Delegates to `@solana/web3.js`'s `PublicKey` constructor — the canonical check.
 * Returns `false` on any parser failure (invalid base58, wrong length, etc.).
 */
export function isValidBase58PublicKey(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}
