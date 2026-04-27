/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { ErrorDisplay } from "./ErrorDisplay";
import { ErrorType, SwapError } from "../types/errors";
import { MAX_RETRIES } from "../config/constants";

afterEach(() => {
    cleanup();
});

describe("ErrorDisplay", () => {
    it("renders the generic 'Swap failed' title when retriesAttempted is undefined", () => {
        const error = new SwapError(
            ErrorType.NetworkError,
            "Failed to fetch quote. Check your connection.",
        );
        render(<ErrorDisplay error={error} onDismiss={vi.fn()} />);
        expect(screen.getByText("Swap failed")).toBeTruthy();
        expect(screen.queryByText(/after 3 attempts/i)).toBeNull();
    });

    it("renders 'Swap failed after 3 attempts' when retriesAttempted equals MAX_RETRIES - 1", () => {
        const error = new SwapError(
            ErrorType.ExecutionFailed,
            "Transaction reverted",
            undefined,
            false,
            { retriesAttempted: MAX_RETRIES - 1 },
        );
        render(<ErrorDisplay error={error} onDismiss={vi.fn()} />);
        expect(
            screen.getByText(`Swap failed after ${MAX_RETRIES} attempts`),
        ).toBeTruthy();
    });

    it("renders 'Swap failed after 3 attempts' when retriesAttempted equals MAX_RETRIES (post-loop count tolerance)", () => {
        const error = new SwapError(
            ErrorType.ExecutionFailed,
            "Transaction reverted",
            undefined,
            false,
            { retriesAttempted: MAX_RETRIES },
        );
        render(<ErrorDisplay error={error} onDismiss={vi.fn()} />);
        expect(
            screen.getByText(`Swap failed after ${MAX_RETRIES} attempts`),
        ).toBeTruthy();
    });

    it("renders the error.message in the alert body", () => {
        const error = new SwapError(
            ErrorType.NetworkError,
            "Failed to fetch quote. Check your connection.",
        );
        render(<ErrorDisplay error={error} onDismiss={vi.fn()} />);
        expect(
            screen.getByText("Failed to fetch quote. Check your connection."),
        ).toBeTruthy();
    });

    it("invokes onDismiss when the Dismiss button is clicked", () => {
        const onDismiss = vi.fn();
        const error = new SwapError(
            ErrorType.NetworkError,
            "Boom",
        );
        render(<ErrorDisplay error={error} onDismiss={onDismiss} />);
        const btn = screen.getByRole("button", { name: /dismiss/i });
        fireEvent.click(btn);
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("uses role='alert' so screen readers announce the failure", () => {
        const error = new SwapError(ErrorType.NetworkError, "Boom");
        render(<ErrorDisplay error={error} onDismiss={vi.fn()} />);
        const alert = screen.getByRole("alert");
        expect(alert.textContent).toContain("Swap failed");
        expect(alert.textContent).toContain("Boom");
    });
});
