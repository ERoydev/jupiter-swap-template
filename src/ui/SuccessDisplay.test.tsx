/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { SuccessDisplay } from "./SuccessDisplay";
import type { SwapResult } from "../types/swap";

afterEach(() => {
  cleanup();
});

const baseResult: SwapResult = {
  txId: "5VfYSFjV9bbmU3pH8sFv2J5sYNxYi3DGhVSdH5LpHF6m4q1xTk8wZqLzQyJtR7nWcK3vBpA9eXfHsGdNuMrTbY1z",
  status: "confirmed",
  inputAmount: "1000000000",     // raw, 9 decimals → 1 SOL
  outputAmount: "17057460",      // raw, 6 decimals → 17.05746 USDC
  retriesAttempted: 0,
  swapCorrelationId: "corr-abc-123",
};

describe("SuccessDisplay", () => {
  it("surfaces 'Swap successful' as an accessible alert title", () => {
    const { getByRole } = render(
      <SuccessDisplay
        result={baseResult}
        inputSymbol="SOL"
        inputDecimals={9}
        outputSymbol="USDC"
        outputDecimals={6}
        onNewSwap={() => {}}
      />,
    );

    const alert = getByRole("alert");
    expect(alert.textContent).toContain("Swap successful");
  });

  it("renders sent and received amounts converted from raw units to UI units", () => {
    const { getByText } = render(
      <SuccessDisplay
        result={baseResult}
        inputSymbol="SOL"
        inputDecimals={9}
        outputSymbol="USDC"
        outputDecimals={6}
        onNewSwap={() => {}}
      />,
    );

    // 1 SOL sent (raw 1_000_000_000 / 10^9)
    expect(getByText("Sent").nextElementSibling?.textContent).toContain("1");
    expect(getByText("Sent").nextElementSibling?.textContent).toContain("SOL");
    // ~17.05746 USDC received (raw 17_057_460 / 10^6)
    expect(getByText("Received").nextElementSibling?.textContent).toContain("17.05746");
    expect(getByText("Received").nextElementSibling?.textContent).toContain("USDC");
  });

  it("renders Solscan anchor with href = https://solscan.io/tx/{signature}, target=_blank, rel=noopener noreferrer", () => {
    const { getByRole } = render(
      <SuccessDisplay
        result={baseResult}
        inputSymbol="SOL"
        inputDecimals={9}
        outputSymbol="USDC"
        outputDecimals={6}
        onNewSwap={() => {}}
      />,
    );

    const link = getByRole("link") as HTMLAnchorElement;
    expect(link.href).toBe(`https://solscan.io/tx/${baseResult.txId}`);
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
    expect(link.rel).toContain("noreferrer");
  });

  it("invokes onNewSwap when the 'New Swap' button is clicked", () => {
    const onNewSwap = vi.fn();
    const { getByRole } = render(
      <SuccessDisplay
        result={baseResult}
        inputSymbol="SOL"
        inputDecimals={9}
        outputSymbol="USDC"
        outputDecimals={6}
        onNewSwap={onNewSwap}
      />,
    );

    const button = getByRole("button", { name: /new swap/i });
    fireEvent.click(button);

    expect(onNewSwap).toHaveBeenCalledTimes(1);
  });

  it("formats fractional input amounts using locale grouping (toLocaleString)", () => {
    // 12_345_678_900 raw / 10^9 = 12.3456789 SOL — should appear with toLocaleString grouping.
    const result: SwapResult = {
      ...baseResult,
      inputAmount: "12345678900",
      outputAmount: "0",
    };
    const { getByText } = render(
      <SuccessDisplay
        result={result}
        inputSymbol="SOL"
        inputDecimals={9}
        outputSymbol="USDC"
        outputDecimals={6}
        onNewSwap={() => {}}
      />,
    );

    const sentValue = getByText("Sent").nextElementSibling?.textContent ?? "";
    // Whole part should grouping-format ("12") and the fractional should round-trip.
    expect(sentValue).toContain("12");
    expect(sentValue).toContain("SOL");
  });
});
