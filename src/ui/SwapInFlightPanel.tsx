import { Loader2 } from "lucide-react";

interface SwapInFlightPanelProps {
  mode: "signing" | "executing";
}

const COPY: Record<
  SwapInFlightPanelProps["mode"],
  { heading: string; subtext: string }
> = {
  signing: {
    heading: "Waiting for wallet…",
    subtext: "Approve the transaction in your wallet to continue.",
  },
  executing: {
    heading: "Confirming on Solana…",
    subtext: "Don't close this tab. This usually takes a few seconds.",
  },
};

/**
 * In-flight panel rendered in place of QuoteDisplay while the swap is mid-flow.
 * Two phases ("signing" and "executing") get distinct copy so the user can tell
 * "wallet hasn't responded yet" from "wallet signed, network is confirming".
 *
 * Pulled into Story 3-2 (per A-12) because button-text-only feedback during
 * the 1–3s in-flight window felt invisible in manual testing. The card-level
 * backdrop overlay, slide-in animation, and output-border flash-green still
 * belong to Story 4-1.
 */
export function SwapInFlightPanel({ mode }: SwapInFlightPanelProps) {
  const { heading, subtext } = COPY[mode];

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-lg border border-border bg-muted/30 p-6 flex flex-col items-center gap-3 text-center"
    >
      <Loader2
        aria-hidden="true"
        className="h-8 w-8 animate-spin text-foreground/70"
      />
      <p className="text-sm font-medium text-foreground">{heading}</p>
      <p className="text-xs text-muted-foreground">{subtext}</p>
    </div>
  );
}
