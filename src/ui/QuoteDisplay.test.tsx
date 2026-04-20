/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { QuoteDisplay } from "./QuoteDisplay";
import type { OrderResponse } from "../types/swap";

afterEach(cleanup);

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
};

describe("QuoteDisplay — AC-3 quote rendering", () => {
  it("renders the exchange rate from outAmount/inputAmount", () => {
    const { container } = render(
      <QuoteDisplay quote={makeQuote()} {...DEFAULTS} />,
    );
    // 1 SOL → 1.5 USDC (4-decimal display)
    expect(container.textContent).toContain("1 SOL = 1.5000 USDC");
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

  it("renders slippage as '0.5% (auto)'", () => {
    const { container } = render(
      <QuoteDisplay quote={makeQuote()} {...DEFAULTS} />,
    );
    expect(container.textContent).toContain("0.5% (auto)");
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
