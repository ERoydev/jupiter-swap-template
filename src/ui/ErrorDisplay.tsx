import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { MAX_RETRIES } from "../config/constants";
import type { SwapError } from "../types/errors";

export interface ErrorDisplayProps {
    error: SwapError;
    onDismiss: () => void;
}

/**
 * Surfaces a failed swap as an accessible destructive Alert with a Dismiss
 * action. When the underlying SwapError records a retry budget exhaustion
 * (retriesAttempted === MAX_RETRIES - 1, i.e. the 0-indexed last attempt),
 * the title escalates to "Swap failed after N attempts" so the user
 * understands the engine already exhausted its automatic retries.
 *
 * Extracted from the inline error block previously living in App.tsx
 * (Story 4-1, Task 1; addresses concern C-10).
 */
export function ErrorDisplay({ error, onDismiss }: ErrorDisplayProps) {
    const retriesAttempted = readRetriesAttempted(error.details);
    const exhausted =
        typeof retriesAttempted === "number" &&
        retriesAttempted === MAX_RETRIES - 1;
    const title = exhausted
        ? `Swap failed after ${MAX_RETRIES} attempts`
        : "Swap failed";

    return (
        <Alert variant="destructive" className={cn("relative")}>
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
            <button
                type="button"
                onClick={onDismiss}
                className={cn(
                    "mt-2 text-xs text-muted-foreground underline",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm",
                )}
            >
                Dismiss
            </button>
        </Alert>
    );
}

function readRetriesAttempted(
    details: Record<string, unknown> | undefined,
): number | undefined {
    if (!details) return undefined;
    const raw = details.retriesAttempted;
    return typeof raw === "number" ? raw : undefined;
}
