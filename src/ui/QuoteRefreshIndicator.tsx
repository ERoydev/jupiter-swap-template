import { RefreshCw } from "lucide-react";
import { SwapState } from "../state/swapState";

interface QuoteRefreshIndicatorProps {
    state: SwapState;
    onRefresh: () => void;
}

export function QuoteRefreshIndicator({
    state,
    onRefresh,
}: QuoteRefreshIndicatorProps) {
    if (state === SwapState.Idle) return null;

    const isLoading = state === SwapState.LoadingQuote;
    const canRefresh =
        state === SwapState.QuoteReady || state === SwapState.Error;

    return (
        <button
            type="button"
            onClick={canRefresh ? onRefresh : undefined}
            disabled={!canRefresh}
            aria-label="Refresh quote"
            aria-busy={isLoading}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
            <RefreshCw
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                aria-hidden="true"
            />
        </button>
    );
}
