/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { QuoteDisplay } from "./QuoteDisplay";
import { useIsMobile } from "../hooks/use-mobile";
import type { OrderResponse } from "../types/swap";

vi.mock("../hooks/use-mobile", () => ({
  useIsMobile: vi.fn(() => false),
}));

afterEach(() => {
  cleanup();
  vi.mocked(useIsMobile).mockReturnValue(false);
});

function makeQuote(overrides: Partial<OrderResponse> = {}): OrderResponse {
  return {
    transaction: null,
    requestId: "req-123",
    outAmount: "1500000", // 1.5 USDC (6 decimals)
    router: "Metis",
    mode: "ExactIn",
    feeBps: 25,
    feeMint: "So11111111111111111111111111111111111111112",
    priceImpactPct: "0.23",
    ...overrides,
  };
}

const DEFAULTS = {
  inputSymbol: "SOL",
  outputSymbol: "USDC",
  inputAmount: "1000000000", // 1 SOL (9 decimals)
  inputDecimals: 9,
  outputDecimals: 6,
  quoteFetchedAt: null,
  fallbackSlippageBps: 50,
};

describe("QuoteDisplay — AC-3 quote rendering", () => {
  it("renders the exchange rate from outAmount/inputAmount", () => {
    const { container } = render(
      <QuoteDisplay quote={makeQuote()} {...DEFAULTS} />,
    );
    // 1 SOL → 1.5 USDC (6-decimal display — A-6)
    expect(container.textContent).toContain("1 SOL = 1.500000 USDC");
  });

  it("renders the output amount with output symbol", () => {
    const { container } = render(
      <QuoteDisplay quote={makeQuote()} {...DEFAULTS} />,
    );
    expect(container.textContent).toContain("USDC");
    expect(container.textContent).toContain("1.5");
  });

  it("renders the router as a badge", () => {
    const { container } = render(
      <QuoteDisplay quote={makeQuote({ router: "Jupiter" })} {...DEFAULTS} />,
    );
    expect(container.textContent).toContain("Jupiter");
  });

  it("renders the fee percentage", () => {
    const { container } = render(
      <QuoteDisplay quote={makeQuote({ feeBps: 25 })} {...DEFAULTS} />,
    );
    expect(container.textContent).toContain("0.3%"); // 25 bps = 0.25 → 0.3 with toFixed(1)
  });

  it("renders slippage from fallback when quote.slippageBps is missing (A-7)", () => {
    const { container } = render(
      <QuoteDisplay quote={makeQuote()} {...DEFAULTS} />,
    );
    expect(container.textContent).toContain("0.50%");
    expect(container.textContent).not.toContain("(auto)");
  });

  it("renders slippage from quote.slippageBps when present (A-7)", () => {
    const { container } = render(
      <QuoteDisplay
        quote={makeQuote({ slippageBps: 73 })}
        {...DEFAULTS}
      />,
    );
    expect(container.textContent).toContain("0.73%");
  });

  it("prefers quote.slippageBps over fallbackSlippageBps (A-7)", () => {
    const { container } = render(
      <QuoteDisplay
        quote={makeQuote({ slippageBps: 100 })}
        {...DEFAULTS}
        fallbackSlippageBps={50}
      />,
    );
    expect(container.textContent).toContain("1.00%");
    expect(container.textContent).not.toContain("0.50%");
  });

  it("renders freshness indicator when quoteFetchedAt is set", () => {
    const { container } = render(
      <QuoteDisplay
        quote={makeQuote()}
        {...DEFAULTS}
        quoteFetchedAt={Date.now()}
      />,
    );
    expect(container.textContent).toContain("Just updated");
  });
});

describe("QuoteDisplay — priceImpactPct fallback (amendment A-1)", () => {
  it("renders PriceImpactBadge when priceImpactPct is present", () => {
    const { container } = render(
      <QuoteDisplay
        quote={makeQuote({ priceImpactPct: "0.5" })}
        {...DEFAULTS}
      />,
    );
    // 0.5% = 50 bps → falls in 'low' bucket (< 100)
    const badge = container.querySelector("[data-tone='low']");
    expect(badge).not.toBeNull();
  });

  it("renders 'N/A' outline badge when priceImpactPct is undefined", () => {
    const quote = makeQuote();
    delete (quote as unknown as Record<string, unknown>).priceImpactPct;
    const { container } = render(
      <QuoteDisplay quote={quote} {...DEFAULTS} />,
    );
    expect(container.textContent).toContain("N/A");
    // Should NOT render a PriceImpactBadge with a data-tone
    expect(container.querySelector("[data-tone]")).toBeNull();
  });

  it("renders 'N/A' when priceImpactPct is empty string", () => {
    const { container } = render(
      <QuoteDisplay
        quote={makeQuote({ priceImpactPct: "" })}
        {...DEFAULTS}
      />,
    );
    expect(container.textContent).toContain("N/A");
  });

  it("routes high impact (2% → 200 bps) to elevated bucket", () => {
    const { container } = render(
      <QuoteDisplay
        quote={makeQuote({ priceImpactPct: "2" })}
        {...DEFAULTS}
      />,
    );
    const badge = container.querySelector("[data-tone='elevated']");
    expect(badge).not.toBeNull();
  });
});

describe("QuoteDisplay — AC-5 mobile collapse behaviour", () => {
  it("renders details inline (no toggle) on desktop", () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    const { container, queryByRole } = render(
      <QuoteDisplay quote={makeQuote()} {...DEFAULTS} />,
    );
    // Details visible without any user interaction
    expect(container.textContent).toContain("Router");
    expect(container.textContent).toContain("Fee");
    expect(container.textContent).toContain("Slippage");
    // No "Show details" toggle on desktop
    expect(queryByRole("button", { name: /show details|hide details/i })).toBeNull();
  });

  it("collapses details and renders 'Show details' toggle by default on mobile", () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    const { container, getByRole } = render(
      <QuoteDisplay quote={makeQuote()} {...DEFAULTS} />,
    );
    // Headline rows are always visible
    expect(container.textContent).toContain("Rate");
    expect(container.textContent).toContain("You receive");
    // Toggle present + reflects collapsed state via aria-expanded
    const toggle = getByRole("button", { name: /show details/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("expands details when the toggle is clicked on mobile", () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    const { getByRole } = render(
      <QuoteDisplay quote={makeQuote()} {...DEFAULTS} />,
    );
    const toggle = getByRole("button", { name: /show details/i });
    fireEvent.click(toggle);
    // After click the label flips to "Hide details" and aria-expanded reflects open
    const hide = getByRole("button", { name: /hide details/i });
    expect(hide.getAttribute("aria-expanded")).toBe("true");
  });

  it("respects defaultExpanded prop override on mobile", () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    const { getByRole } = render(
      <QuoteDisplay quote={makeQuote()} {...DEFAULTS} defaultExpanded={true} />,
    );
    const toggle = getByRole("button", { name: /hide details/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });
});
