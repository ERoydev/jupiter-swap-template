/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SwapInFlightPanel } from "./SwapInFlightPanel";

afterEach(() => {
  cleanup();
});

describe("SwapInFlightPanel", () => {
  it("renders 'Waiting for wallet…' heading + wallet-prompt subtext when mode is 'signing'", () => {
    const { getByRole } = render(<SwapInFlightPanel mode="signing" />);
    const status = getByRole("status");
    expect(status.textContent).toContain("Waiting for wallet");
    expect(status.textContent).toContain("Approve the transaction in your wallet");
  });

  it("renders 'Confirming on Solana…' heading + don't-close subtext when mode is 'executing'", () => {
    const { getByRole } = render(<SwapInFlightPanel mode="executing" />);
    const status = getByRole("status");
    expect(status.textContent).toContain("Confirming on Solana");
    expect(status.textContent).toContain("Don't close this tab");
  });

  it("renders an aria-hidden spinner with animate-spin class", () => {
    const { getByRole } = render(<SwapInFlightPanel mode="executing" />);
    const status = getByRole("status");
    const spinner = status.querySelector("svg[aria-hidden='true']");
    expect(spinner).not.toBeNull();
    expect(spinner!.classList.contains("animate-spin")).toBe(true);
  });

  it("uses role='status' + aria-live='polite' so screen readers announce the state change", () => {
    const { getByRole } = render(<SwapInFlightPanel mode="signing" />);
    const status = getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
  });
});
