import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { DetailRow, DetailList } from "@/components/ui/detail-row";
import { PriceImpactBadge } from "./PriceImpactBadge";
import { QuoteFreshnessIndicator } from "./QuoteFreshnessIndicator";
import { useIsMobile } from "../hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { OrderResponse } from "../types/swap";

interface QuoteDisplayProps {
  quote: OrderResponse;
  inputSymbol: string;
  outputSymbol: string;
  inputAmount: string;
  inputDecimals: number;
  outputDecimals: number;
  quoteFetchedAt: number | null;
  fallbackSlippageBps: number;
  /**
   * Force the details open state (test override). When omitted, mobile defaults
   * to collapsed (AC-5) and desktop defaults to expanded.
   */
  defaultExpanded?: boolean;
}

const DISPLAY_DECIMALS = 6;

function calculateRate(
  inputAmount: string,
  outAmount: string,
  inputDecimals: number,
  outputDecimals: number,
): string {
  const input = Number(inputAmount) / 10 ** inputDecimals;
  const output = Number(outAmount) / 10 ** outputDecimals;
  if (input === 0) return "0";
  return (output / input).toFixed(DISPLAY_DECIMALS);
}

function formatAmount(amount: string, decimals: number): string {
  const value = Number(amount) / 10 ** decimals;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: DISPLAY_DECIMALS,
  });
}

export function QuoteDisplay({
  quote,
  inputSymbol,
  outputSymbol,
  inputAmount,
  inputDecimals,
  outputDecimals,
  quoteFetchedAt,
  fallbackSlippageBps,
  defaultExpanded,
}: QuoteDisplayProps) {
  const isMobile = useIsMobile();
  // Mobile collapses non-essential rows behind a toggle (AC-5). Desktop renders
  // the full breakdown inline so power users see everything at a glance.
  // Explicit prop override wins (test-only seam).
  const initialOpen = defaultExpanded ?? !isMobile;
  const [open, setOpen] = useState(initialOpen);

  const rate = calculateRate(
    inputAmount,
    quote.outAmount,
    inputDecimals,
    outputDecimals,
  );
  const outputFormatted = formatAmount(quote.outAmount, outputDecimals);
  const effectiveSlippageBps = quote.slippageBps ?? fallbackSlippageBps;
  const slippagePercent = (effectiveSlippageBps / 100).toFixed(2);

  const detailRows = (
    <DetailList className="mt-2">
      <DetailRow
        label="Price Impact"
        value={
          quote.priceImpactPct === undefined ||
          quote.priceImpactPct === null ||
          quote.priceImpactPct === ""
            ? (
                <Badge
                  variant="outline"
                  aria-label="Price impact unavailable"
                >
                  N/A
                </Badge>
              )
            : (
                <PriceImpactBadge
                  impactBps={Math.abs(
                    Math.round(parseFloat(quote.priceImpactPct) * 100),
                  )}
                />
              )
        }
      />
      <DetailRow
        label="Router"
        value={<Badge variant="secondary">{quote.router}</Badge>}
      />
      <DetailRow
        label="Fee"
        value={`${(quote.feeBps / 100).toFixed(1)}%`}
      />
      <DetailRow
        label="Slippage"
        value={`${slippagePercent}%`}
      />
      <QuoteFreshnessIndicator fetchedAt={quoteFetchedAt} />
    </DetailList>
  );

  // Always-visible headline rows: rate + received amount. The user always sees
  // what they're getting; route, fee, slippage, freshness collapse on mobile.
  const headline = (
    <div className="space-y-2">
      <DetailRow
        label="Rate"
        value={`1 ${inputSymbol} = ${rate} ${outputSymbol}`}
      />
      <DetailRow
        label="You receive"
        value={`${outputFormatted} ${outputSymbol}`}
      />
    </div>
  );

  if (!isMobile) {
    // Desktop: details always expanded, no toggle rendered.
    return (
      <div data-testid="quote-display">
        {headline}
        {detailRows}
      </div>
    );
  }

  // Mobile: collapsed by default with a button-driven Collapsible.
  return (
    <Collapsible open={open} onOpenChange={setOpen} data-testid="quote-display">
      {headline}
      <div className="mt-2 flex justify-center">
        <CollapsibleTrigger
          className={cn(
            "inline-flex min-h-11 items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground",
            "hover:text-foreground hover:bg-accent transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
          aria-expanded={open}
        >
          {open ? "Hide details" : "Show details"}
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>{detailRows}</CollapsibleContent>
    </Collapsible>
  );
}
