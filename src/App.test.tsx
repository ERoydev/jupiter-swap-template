/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, render, cleanup, fireEvent } from "@testing-library/react";

// Mocks must be hoisted before the SwapCard import
const mockUseWallet = vi.fn();
const mockSetVisible = vi.fn();

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => mockUseWallet(),
  ConnectionProvider: ({ children }: { children: React.ReactNode }) => children,
  WalletProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@solana/wallet-adapter-react-ui", () => ({
  useWalletModal: () => ({ setVisible: mockSetVisible }),
  WalletModalProvider: ({ children }: { children: React.ReactNode }) => children,
  WalletMultiButton: () => null,
}));

vi.mock("@solana/wallet-adapter-wallets", () => ({
  PhantomWalletAdapter: class {},
}));

vi.mock("./ui/WalletButton", () => ({
  WalletButton: () => null,
}));

vi.mock("@solana/wallet-adapter-react-ui/styles.css", () => ({}));

// Must import after mocks are set up
import { SwapCard } from "./App";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  mockUseWallet.mockReturnValue({ publicKey: null, connected: false });
  mockSetVisible.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("SwapCard — AC-7 quote-only (no wallet) mode", () => {
  it("renders a 'Connect Wallet' button when disconnected", () => {
    const { container } = render(<SwapCard />);
    const button = container.querySelector(
      "button[aria-label='Connect Wallet']",
    );
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain("Connect Wallet");
  });

  it("opens the wallet modal when the Connect Wallet button is clicked", () => {
    const { container } = render(<SwapCard />);
    const button = container.querySelector(
      "button[aria-label='Connect Wallet']",
    ) as HTMLButtonElement;
    fireEvent.click(button);
    expect(mockSetVisible).toHaveBeenCalledWith(true);
  });

  it("does NOT render a Swap button when disconnected", () => {
    const { container } = render(<SwapCard />);
    expect(
      container.querySelector("button[aria-label='Swap tokens']"),
    ).toBeNull();
  });
});

describe("SwapCard — AC-2 debounce + AbortController", () => {
  it("does NOT fire a fetch immediately on input change", () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        transaction: null,
        requestId: "r",
        outAmount: "1000000",
        router: "Metis",
        mode: "ExactIn",
        feeBps: 0,
        feeMint: "x",
      }),
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { container } = render(<SwapCard />);
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1" } });
    // Before debounce elapses, no fetch
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fires a fetch exactly once after 300ms of quiet", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        transaction: null,
        requestId: "r",
        outAmount: "1000000",
        router: "Metis",
        mode: "ExactIn",
        feeBps: 0,
        feeMint: "x",
      }),
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { container } = render(<SwapCard />);
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1" } });

    await act(async () => {
      vi.advanceTimersByTime(299);
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("aborts the prior in-flight request when input changes again", async () => {
    // First fetch never resolves so we can observe abort
    const abortedSignals: AbortSignal[] = [];
    const fetchSpy = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.signal) abortedSignals.push(init.signal);
      return new Promise(() => {
        /* never resolves */
      });
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const { container } = render(<SwapCard />);
    const input = container.querySelector("input") as HTMLInputElement;

    // First input → wait for debounce to fire fetch
    fireEvent.change(input, { target: { value: "1" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(abortedSignals[0]?.aborted).toBe(false);

    // Second input → should abort first controller and start new fetch
    fireEvent.change(input, { target: { value: "2" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(abortedSignals[0]?.aborted).toBe(true);
    expect(abortedSignals[1]?.aborted).toBe(false);
  });
});
