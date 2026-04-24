/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QuoteRefreshIndicator } from "./QuoteRefreshIndicator";
import { SwapState } from "../state/swapState";

afterEach(() => {
    cleanup();
});

describe("QuoteRefreshIndicator", () => {
    it("renders nothing when state is Idle", () => {
        const { container } = render(
            <QuoteRefreshIndicator state={SwapState.Idle} onRefresh={vi.fn()} />,
        );
        expect(container.firstChild).toBeNull();
    });

    it("renders an enabled refresh button when state is QuoteReady", () => {
        render(
            <QuoteRefreshIndicator
                state={SwapState.QuoteReady}
                onRefresh={vi.fn()}
            />,
        );
        const button = screen.getByRole("button", { name: /refresh quote/i });
        expect((button as HTMLButtonElement).disabled).toBe(false);
        expect(button.getAttribute("aria-busy")).toBe("false");
    });

    it("renders an enabled button when state is Error (allows retry)", () => {
        render(
            <QuoteRefreshIndicator state={SwapState.Error} onRefresh={vi.fn()} />,
        );
        const button = screen.getByRole("button", { name: /refresh quote/i });
        expect((button as HTMLButtonElement).disabled).toBe(false);
    });

    it("marks aria-busy and disables click when state is LoadingQuote", () => {
        const onRefresh = vi.fn();
        render(
            <QuoteRefreshIndicator
                state={SwapState.LoadingQuote}
                onRefresh={onRefresh}
            />,
        );
        const button = screen.getByRole("button", { name: /refresh quote/i });
        expect((button as HTMLButtonElement).disabled).toBe(true);
        expect(button.getAttribute("aria-busy")).toBe("true");
        fireEvent.click(button);
        expect(onRefresh).not.toHaveBeenCalled();
    });

    it("disables the button during Signing and Executing", () => {
        const { rerender } = render(
            <QuoteRefreshIndicator
                state={SwapState.Signing}
                onRefresh={vi.fn()}
            />,
        );
        expect(
            (
                screen.getByRole("button", {
                    name: /refresh quote/i,
                }) as HTMLButtonElement
            ).disabled,
        ).toBe(true);

        rerender(
            <QuoteRefreshIndicator
                state={SwapState.Executing}
                onRefresh={vi.fn()}
            />,
        );
        expect(
            (
                screen.getByRole("button", {
                    name: /refresh quote/i,
                }) as HTMLButtonElement
            ).disabled,
        ).toBe(true);
    });

    it("calls onRefresh when clicked in QuoteReady state", () => {
        const onRefresh = vi.fn();
        render(
            <QuoteRefreshIndicator
                state={SwapState.QuoteReady}
                onRefresh={onRefresh}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: /refresh quote/i }));
        expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it("applies the spin animation class only while loading", () => {
        const { rerender } = render(
            <QuoteRefreshIndicator
                state={SwapState.QuoteReady}
                onRefresh={vi.fn()}
            />,
        );
        const button = screen.getByRole("button", { name: /refresh quote/i });
        expect(button.querySelector("svg")?.getAttribute("class") ?? "").not.toMatch(
            /animate-spin/,
        );

        rerender(
            <QuoteRefreshIndicator
                state={SwapState.LoadingQuote}
                onRefresh={vi.fn()}
            />,
        );
        const busyButton = screen.getByRole("button", { name: /refresh quote/i });
        expect(busyButton.querySelector("svg")?.getAttribute("class") ?? "").toMatch(
            /animate-spin/,
        );
    });
});
