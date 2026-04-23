import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useWalletBalances } from "../hooks/useWalletBalances";

/**
 * SolBalanceWarning — presentational overlay rendered inside the SwapCard.
 *
 * Per AC-5 (story 2-3), this component surfaces ONLY the fetch-failure state
 * of `useWalletBalances`. When both the Ultra API and the web3.js RPC fallback
 * fail (hook reports `isError === true` with a `SwapError(BalanceCheckFailed)`),
 * the user sees a warning with two recovery actions:
 *
 *   1. "Retry Check" — re-runs the query via `refetch()`. Shows a disabled
 *      "Checking…" label while `isFetching === true` to prevent double-firing.
 *
 *   2. "Proceed Without Verification" — dismisses the warning for the current
 *      session (component-local `useState`, no persistence). This does NOT
 *      set any flag that Story 3-1's preflight checks read; it only silences
 *      the proactive overlay. If the component unmounts (e.g. wallet change)
 *      or the page reloads, the warning re-appears on the next failed fetch.
 *
 * Low-SOL signaling is intentionally NOT handled here — see amendment A-5;
 * Story 3-1 owns that concern via a disabled Swap button + Tooltip.
 */
export function SolBalanceWarning() {
  const { publicKey } = useWallet();
  const { isError, refetch, isFetching } = useWalletBalances();
  const [dismissed, setDismissed] = useState(false);

  // Reset dismiss when the user reconnects a different wallet (AC-5, line 23
  // of story 2-3). Without this, dismissing with wallet A silences the warning
  // for wallet B on the same session — defeating the per-wallet safety intent.
  useEffect(() => {
    setDismissed(false);
  }, [publicKey?.toBase58()]);

  if (!isError) return null;
  if (dismissed) return null;

  return (
    <Alert variant="destructive">
      <AlertTitle>Unable to verify SOL balance</AlertTitle>
      <AlertDescription>Your connection may be unstable.</AlertDescription>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Retry SOL balance check"
          aria-busy={isFetching}
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          {isFetching ? "Checking…" : "Retry Check"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Proceed without verifying SOL balance"
          onClick={() => setDismissed(true)}
        >
          Proceed Without Verification
        </Button>
      </div>
    </Alert>
  );
}
