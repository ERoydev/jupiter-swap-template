/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { TokenRow } from "./TokenRow";
import type { MergedToken } from "./TokenRow";

afterEach(cleanup);

const BASE_TOKEN: MergedToken = {
  id: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  name: "USD Coin",
  symbol: "USDC",
  decimals: 6,
  isVerified: true,
};

const STYLE = { position: "absolute" as const, top: 0, left: 0, width: "100%", height: 72 };

describe("TokenRow — normal render without balance", () => {
  it("shows symbol and name when no balance is set", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <TokenRow token={BASE_TOKEN} disabled={false} onSelect={onSelect} style={STYLE} />,
    );
    expect(container.textContent).toContain("USDC");
    expect(container.textContent).toContain("USD Coin");
  });

  it("does not show a balance block when _balance is 0", () => {
    const token: MergedToken = { ...BASE_TOKEN, _balance: 0 };
    const onSelect = vi.fn();
    const { container } = render(
      <TokenRow token={token} disabled={false} onSelect={onSelect} style={STYLE} />,
    );
    // Only the decimals value in "6d" should appear, no balance formatted number beyond symbol/name
    expect(container.querySelector(".text-right")).toBeNull();
  });
});

describe("TokenRow — with balance", () => {
  it("renders _balance and _usdValue when wallet is connected and has balance", () => {
    const token: MergedToken = {
      ...BASE_TOKEN,
      _balance: 150.5,
      _usdValue: 150.5,
    };
    const onSelect = vi.fn();
    const { container } = render(
      <TokenRow token={token} disabled={false} onSelect={onSelect} style={STYLE} />,
    );
    const rightBlock = container.querySelector(".text-right");
    expect(rightBlock).not.toBeNull();
    expect(rightBlock!.textContent).toContain("150.5");
    // USD formatted value
    expect(rightBlock!.textContent).toContain("$");
  });
});

describe("TokenRow — disabled state", () => {
  it("has aria-disabled='true' on the row element", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <TokenRow token={BASE_TOKEN} disabled={true} onSelect={onSelect} style={STYLE} />,
    );
    const row = container.querySelector('[aria-disabled="true"]');
    expect(row).not.toBeNull();
  });

  it("does not call onSelect when clicked while disabled", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <TokenRow token={BASE_TOKEN} disabled={true} onSelect={onSelect} style={STYLE} />,
    );
    const row = container.querySelector('[aria-disabled="true"]')!;
    fireEvent.click(row);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("TokenRow — click fires onSelect", () => {
  it("fires onSelect with the token object when clicked", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <TokenRow token={BASE_TOKEN} disabled={false} onSelect={onSelect} style={STYLE} />,
    );
    const row = container.querySelector('[role="option"]')!;
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(BASE_TOKEN);
  });
});
