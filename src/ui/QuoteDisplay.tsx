import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { DetailRow, DetailList } from "@/components/ui/detail-row";
import { PriceImpactBadge } from "./PriceImpactBadge";
import { QuoteFreshnessIndicator } from "./QuoteFreshnessIndicator";
import type { OrderResponse } from "../types/swap";
import { DEFAULT_SLIPPAGE_BPS } from "../config/constants";

interface QuoteDisplayProps {
  quote: OrderResponse;
  inputSymbol: string;
  outputSymbol: string;
  inputAmount: string;
  inputDecimals: number;
  outputDecimals: number;
  quoteFetchedAt: number | null;
  defaultExpanded?: boolean;
}

function calculateRate(
  inputAmount: string,
  outAmount: string,
  inputDecimals: number,
  outputDecimals: number,
): string {
  const input = Number(inputAmount) / 10 ** inputDecimals;
  const output = Number(outAmount) / 10 ** outputDecimals;
  if (input === 0) return "0";
  return (output / input).toFixed(outputDecimals > 2 ? 4 : 2);
}

function formatAmount(amount: string, decimals: number): string {
  const value = Number(amount) / 10 ** decimals;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.min(decimals, 6),
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
  defaultExpanded = true,
}: QuoteDisplayProps) {
  const rate = calculateRate(
    inputAmount,
    quote.outAmount,
    inputDecimals,
    outputDecimals,
  );
  const outputFormatted = formatAmount(quote.outAmount, outputDecimals);
  const slippagePercent = (DEFAULT_SLIPPAGE_BPS / 100).toFixed(1);

  return (
    <Collapsible defaultOpen={defaultExpanded}>
      <CollapsibleTrigger
        className="w-full"
        aria-label="Toggle quote details"
      >
        <DetailRow
          label="Rate"
          value={`1 ${inputSymbol} = ${rate} ${outputSymbol}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <DetailList className="mt-2">
          <DetailRow
            label="You receive"
            value={`${outputFormatted} ${outputSymbol}`}
          />
          <DetailRow
            label="Price Impact"
            value={
              <PriceImpactBadge
                impactBps={Math.abs(
                  Math.round(parseFloat(quote.priceImpactPct ?? "0") * 100),
                )}
              />
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
            value={`${slippagePercent}% (auto)`}
          />
          <QuoteFreshnessIndicator fetchedAt={quoteFetchedAt} />
        </DetailList>
      </CollapsibleContent>
    </Collapsible>
  );
}
