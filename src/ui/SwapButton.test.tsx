/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { SwapButton } from "./SwapButton";
import { SwapState } from "../state/swapState";
import { ErrorType, SwapError } from "../types/errors";

afterEach(() => {
  cleanup();
});

function noQuoteDefaults() {
  return {
    state: SwapState.Idle,
    hasQuote: false,
    preflightError: null,
    connected: true,
    onClick: vi.fn(),
  };
}

function passingDefaults() {
  return {
    state: SwapState.QuoteReady,
    hasQuote: true,
    preflightError: null,
    connected: true,
    onClick: vi.fn(),
  };
}

describe("SwapButton — idle/no-quote", () => {
  it("renders 'Enter an amount' disabled when hasQuote is false", () => {
    render(<SwapButton {...noQuoteDefaults()} />);
    const btn = screen.getByRole("button", { name: /swap tokens/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.textContent).toBe("Enter an amount");
  });
});

describe("SwapButton — happy path (all preflight checks pass)", () => {
  it("renders 'Swap' enabled when hasQuote + no preflightError", () => {
    render(<SwapButton {...passingDefaults()} />);
    const btn = screen.getByRole("button", { name: /swap tokens/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    expect(btn.textContent).toBe("Swap");
  });

  it("fires onClick when user clicks the enabled button", () => {
    const props = passingDefaults();
    render(<SwapButton {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /swap tokens/i }));
    expect(props.onClick).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire onClick when disabled (hasQuote=false)", () => {
    const props = noQuoteDefaults();
    render(<SwapButton {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /swap tokens/i }));
    expect(props.onClick).not.toHaveBeenCalled();
  });
});

describe("SwapButton — preflight error labels", () => {
  it.each([
    [
      "WalletNotConnected",
      new SwapError(ErrorType.WalletNotConnected, "Connect a wallet to continue"),
      "Connect Wallet",
    ],
    [
      "InvalidInput — positive amount",
      new SwapError(ErrorType.InvalidInput, "Enter a positive amount"),
      "Enter an amount",
    ],
    [
      "InvalidInput — input token",
      new SwapError(ErrorType.InvalidInput, "Invalid input token address"),
      "Invalid input token",
    ],
    [
      "InvalidInput — output token",
      new SwapError(ErrorType.InvalidInput, "Invalid output token address"),
      "Invalid output token",
    ],
    [
      "InvalidInput — same token",
      new SwapError(ErrorType.InvalidInput, "Cannot swap a token to itself"),
      "Same input and output",
    ],
    [
      "InsufficientSOL",
      new SwapError(ErrorType.InsufficientSOL, "You need at least 0.01 SOL for transaction fees"),
      "Insufficient SOL",
    ],
    [
      "InsufficientBalance — SOL",
      new SwapError(ErrorType.InsufficientBalance, "Insufficient SOL balance"),
      "Insufficient SOL",
    ],
    [
      "InsufficientBalance — USDC (symbol interpolation)",
      new SwapError(ErrorType.InsufficientBalance, "Insufficient USDC balance"),
      "Insufficient USDC",
    ],
  ])("%s → label '%s' and disabled", (_name, preflightError, expectedLabel) => {
    render(
      <SwapButton
        state={SwapState.QuoteReady}
        hasQuote={true}
        preflightError={preflightError}
        connected={true}
        onClick={vi.fn()}
      />,
    );
    const btn = screen.getByRole("button", { name: /swap tokens/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.textContent).toBe(expectedLabel);
  });
});

describe("SwapButton — in-flight states", () => {
  it("renders 'Waiting for wallet…' disabled when state is Signing", () => {
    render(
      <SwapButton
        state={SwapState.Signing}
        hasQuote={true}
        preflightError={null}
        connected={true}
        onClick={vi.fn()}
      />,
    );
    const btn = screen.getByRole("button", { name: /swap tokens/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.textContent).toBe("Waiting for wallet…");
  });

  it("renders 'Executing swap…' disabled when state is Executing", () => {
    render(
      <SwapButton
        state={SwapState.Executing}
        hasQuote={true}
        preflightError={null}
        connected={true}
        onClick={vi.fn()}
      />,
    );
    const btn = screen.getByRole("button", { name: /swap tokens/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.textContent).toBe("Executing swap…");
  });
});

describe("SwapButton — accessibility", () => {
  it("always sets aria-label='Swap tokens' for screen readers (static, not dependent on state)", () => {
    const { rerender } = render(<SwapButton {...passingDefaults()} />);
    expect(screen.getByRole("button", { name: "Swap tokens" })).toBeTruthy();

    rerender(<SwapButton {...noQuoteDefaults()} />);
    expect(screen.getByRole("button", { name: "Swap tokens" })).toBeTruthy();

    rerender(
      <SwapButton
        state={SwapState.QuoteReady}
        hasQuote={true}
        preflightError={new SwapError(ErrorType.InsufficientSOL, "Low SOL")}
        connected={true}
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Swap tokens" })).toBeTruthy();
  });
});
