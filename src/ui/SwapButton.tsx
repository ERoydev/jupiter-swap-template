import { useId } from "react";
import { Loader2 } from "lucide-react";
import { Tooltip } from "@base-ui/react/tooltip";
import { Button } from "@/components/ui/button";
import { SwapState } from "../state/swapState";
import type { SwapError } from "../types/errors";
import { ErrorType } from "../types/errors";

export interface SwapButtonProps {
  state: SwapState;
  hasQuote: boolean;
  preflightError: SwapError | null;
  onClick: () => void;
}

interface ButtonSurface {
  label: string;
  disabled: boolean;
  tooltip: string | null;
}

function deriveSurface(
  state: SwapState,
  hasQuote: boolean,
  preflightError: SwapError | null,
): ButtonSurface {
  // In-flight signing/executing states take precedence — they mean the user
  // already clicked and is mid-transaction.
  if (state === SwapState.Signing) {
    return { label: "Waiting for wallet…", disabled: true, tooltip: null };
  }
  if (state === SwapState.Executing) {
    return { label: "Executing swap…", disabled: true, tooltip: null };
  }

  // No quote yet — likely empty amount.
  if (!hasQuote) {
    return { label: "Enter an amount", disabled: true, tooltip: null };
  }

  // Quote exists — consult preflight result.
  if (preflightError === null) {
    return { label: "Swap", disabled: false, tooltip: null };
  }

  switch (preflightError.type) {
    case ErrorType.WalletNotConnected:
      return {
        label: "Connect Wallet",
        disabled: true,
        tooltip: preflightError.message,
      };
    case ErrorType.InvalidInput: {
      // Four InvalidInput variants — discriminate by message
      if (preflightError.message === "Enter a positive amount") {
        return { label: "Enter an amount", disabled: true, tooltip: preflightError.message };
      }
      if (preflightError.message === "Invalid input token address") {
        return { label: "Invalid input token", disabled: true, tooltip: preflightError.message };
      }
      if (preflightError.message === "Invalid output token address") {
        return { label: "Invalid output token", disabled: true, tooltip: preflightError.message };
      }
      if (preflightError.message === "Cannot swap a token to itself") {
        return { label: "Same input and output", disabled: true, tooltip: preflightError.message };
      }
      return { label: "Invalid input", disabled: true, tooltip: preflightError.message };
    }
    case ErrorType.InsufficientSOL:
      return {
        label: "Insufficient SOL",
        disabled: true,
        tooltip: preflightError.message,
      };
    case ErrorType.InsufficientBalance:
      // Message format: "Insufficient {symbol} balance" — strip " balance" for label
      return {
        label: preflightError.message.replace(/ balance$/, ""),
        disabled: true,
        tooltip: preflightError.message,
      };
    default:
      return {
        label: "Cannot swap",
        disabled: true,
        tooltip: preflightError.message,
      };
  }
}

/**
 * Primary swap CTA. Consumes preflight result + swap state and renders a
 * context-aware button with a matching tooltip when disabled.
 *
 * Mapping table lives in docs/stories/3-1-preflight-checks-transaction-signing.md.
 */
export function SwapButton({
  state,
  hasQuote,
  preflightError,
  onClick,
}: SwapButtonProps) {
  const surface = deriveSurface(state, hasQuote, preflightError);
  const inFlight = state === SwapState.Signing || state === SwapState.Executing;
  // Stable id linking the disabled button to its tooltip popup so screen
  // readers announce *why* the swap is blocked. The tooltip popup renders in
  // a portal, so a plain DOM-relative description would be lost; an id-based
  // aria-describedby survives the portal hop.
  const tooltipId = useId();
  const describedBy = surface.tooltip !== null ? tooltipId : undefined;

  // Use aria-disabled (not the HTML disabled attribute) so the button stays
  // focusable. A focusable disabled button lets keyboard + screen-reader users
  // tab to it, which opens the base-ui Tooltip on focus, mounts the popup in
  // the DOM, and lets aria-describedby actually resolve to the tooltip text.
  // The HTML disabled attribute would skip the button in tab order entirely,
  // breaking the announcement chain. Click activation is already guarded by
  // the surface.disabled check below.
  const button = (
    <Button
      className="w-full min-h-11 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:pointer-events-auto"
      size="lg"
      aria-disabled={surface.disabled}
      aria-label="Swap tokens"
      aria-describedby={describedBy}
      onClick={surface.disabled ? undefined : onClick}
    >
      {inFlight && (
        <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
      )}
      {surface.label}
    </Button>
  );

  // No tooltip when enabled or when label is self-explanatory (no tooltip string)
  if (surface.tooltip === null) {
    return button;
  }

  return (
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger render={<div className="w-full" />}>
          {button}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner>
            <Tooltip.Popup
              id={tooltipId}
              role="tooltip"
              className="rounded bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
            >
              {surface.tooltip}
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
