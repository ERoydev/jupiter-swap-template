import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DetailList, DetailRow } from "@/components/ui/detail-row";
import type { SwapResult } from "../types/swap";

interface SuccessDisplayProps {
  result: SwapResult;
  inputSymbol: string;
  inputDecimals: number;
  outputSymbol: string;
  outputDecimals: number;
  onNewSwap: () => void;
}

function formatAmount(rawString: string, decimals: number): string {
  const value = Number(rawString) / 10 ** decimals;
  return value.toLocaleString(undefined, {
    maximumFractionDigits: decimals,
  });
}

export function SuccessDisplay({
  result,
  inputSymbol,
  inputDecimals,
  outputSymbol,
  outputDecimals,
  onNewSwap,
}: SuccessDisplayProps) {
  const sent = formatAmount(result.inputAmount, inputDecimals);
  const received = formatAmount(result.outputAmount, outputDecimals);
  const solscanUrl = `https://solscan.io/tx/${result.txId}`;

  return (
    <Alert className="border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20">
      <AlertTitle>Swap successful</AlertTitle>
      <AlertDescription>
        <DetailList className="mt-2">
          <DetailRow label="Sent" value={`${sent} ${inputSymbol}`} />
          <DetailRow label="Received" value={`${received} ${outputSymbol}`} />
          <DetailRow
            label="Transaction"
            value={
              <a
                href={solscanUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View transaction on Solscan"
              >
                View on Solscan
              </a>
            }
          />
        </DetailList>
        <div className="mt-3 flex">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onNewSwap}
            aria-label="Start a new swap"
          >
            New Swap
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
