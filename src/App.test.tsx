/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, render, cleanup, fireEvent, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

// Task 4 orchestration: mock handlers so tests can assert dispatch wiring
// without needing real balance fetches or wallet signing infrastructure.
vi.mock("./handlers/preflightChecks", () => ({
  preflightChecks: { run: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("./handlers/transactionSigner", () => ({
  transactionSigner: { sign: vi.fn().mockResolvedValue("signed-base64") },
}));

vi.mock("./hooks/useTokenSearch", () => ({
  useTokenSearch: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  })),
  prefetchBlueChipTokens: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./hooks/useWalletBalances", () => ({
  useWalletBalances: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn().mockResolvedValue(undefined),
    isFetching: false,
  })),
}));

// Mock TokenSelectorModal for App-wiring tests — keeps tests focused on App behaviour
// Task 4 tests cover the modal's internals separately
vi.mock("./ui/TokenSelector", () => ({
  TokenSelectorModal: ({
    open,
    onSelect,
    onOpenChange,
  }: {
    open: boolean;
    onSelect: (token: { id: string; name: string; symbol: string; decimals: number }) => void;
    onOpenChange: (open: boolean) => void;
  }) => {
    if (!open) return null;
    return (
      <div data-testid="token-selector-modal">
        <button
          data-testid="mock-pick-bonk"
          onClick={() => {
            onSelect({
              id: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
              name: "Bonk",
              symbol: "BONK",
              decimals: 5,
            });
            onOpenChange(false);
          }}
        >
          pick bonk
        </button>
      </div>
    );
  },
}));

// Must import after mocks are set up
import { SwapCard } from "./App";
import { useWalletBalances } from "./hooks/useWalletBalances";
import { preflightChecks } from "./handlers/preflightChecks";
import { transactionSigner } from "./handlers/transactionSigner";
import { ErrorType, SwapError } from "./types/errors";

// SwapCard uses useQueryClient for blue-chip prefetch — wrap in a provider.
function renderSwap() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SwapCard />
    </QueryClientProvider>,
  );
}

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
    const { container } = renderSwap();
    const button = container.querySelector(
      "button[aria-label='Connect Wallet']",
    );
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain("Connect Wallet");
  });

  it("opens the wallet modal when the Connect Wallet button is clicked", () => {
    const { container } = renderSwap();
    const button = container.querySelector(
      "button[aria-label='Connect Wallet']",
    ) as HTMLButtonElement;
    fireEvent.click(button);
    expect(mockSetVisible).toHaveBeenCalledWith(true);
  });

  it("does NOT render a Swap button when disconnected", () => {
    const { container } = renderSwap();
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

    const { container } = renderSwap();
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

    const { container } = renderSwap();
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

    const { container } = renderSwap();
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

describe("SwapCard — AC-1 + AC-11 token selector integration", () => {
  it("renders From and To token trigger buttons with default token symbols", () => {
    renderSwap();

    const fromButton = screen.getByRole("button", { name: /Select input token/i });
    const toButton = screen.getByRole("button", { name: /Select output token/i });

    expect(fromButton).not.toBeNull();
    expect(toButton).not.toBeNull();

    // Buttons show token symbols (not mint slices) for human readability
    expect(fromButton.textContent).toContain("SOL");
    expect(toButton.textContent).toContain("USDC");
  });

  it("opens the token selector modal when the From button is clicked", async () => {
    renderSwap();

    const fromButton = screen.getByRole("button", { name: /Select input token/i });

    await act(async () => {
      fireEvent.click(fromButton);
    });

    expect(screen.getByTestId("token-selector-modal")).not.toBeNull();
  });

  it("opens the token selector modal when the To button is clicked", async () => {
    renderSwap();

    const toButton = screen.getByRole("button", { name: /Select output token/i });

    await act(async () => {
      fireEvent.click(toButton);
    });

    expect(screen.getByTestId("token-selector-modal")).not.toBeNull();
  });

  it("selecting a token from the modal updates the From mint and closes the modal", async () => {
    renderSwap();

    // Open input selector
    const fromButton = screen.getByRole("button", { name: /Select input token/i });
    await act(async () => {
      fireEvent.click(fromButton);
    });

    expect(screen.getByTestId("token-selector-modal")).not.toBeNull();

    // Select BONK via the mock modal
    const pickBonk = screen.getByTestId("mock-pick-bonk");
    await act(async () => {
      fireEvent.click(pickBonk);
    });

    // Modal should be closed
    expect(screen.queryByTestId("token-selector-modal")).toBeNull();

    // From button should now show the BONK symbol (not the mint address)
    const updatedFromButton = screen.getByRole("button", { name: /Select input token/i });
    expect(updatedFromButton.textContent).toContain("BONK");
  });

  it("selecting a token from the To selector updates the output mint", async () => {
    renderSwap();

    // Open output selector
    const toButton = screen.getByRole("button", { name: /Select output token/i });
    await act(async () => {
      fireEvent.click(toButton);
    });

    const pickBonk = screen.getByTestId("mock-pick-bonk");
    await act(async () => {
      fireEvent.click(pickBonk);
    });

    // Modal closed
    expect(screen.queryByTestId("token-selector-modal")).toBeNull();

    // To button now shows BONK symbol
    const updatedToButton = screen.getByRole("button", { name: /Select output token/i });
    expect(updatedToButton.textContent).toContain("BONK");
  });

  it("refetches quote when mints change if amount is already set", async () => {
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

    const { container } = renderSwap();

    // Set an amount and wait for the debounced fetch
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Open and change the input token
    const fromButton = screen.getByRole("button", { name: /Select input token/i });
    await act(async () => {
      fireEvent.click(fromButton);
    });
    const pickBonk = screen.getByTestId("mock-pick-bonk");
    await act(async () => {
      fireEvent.click(pickBonk);
    });

    // Mint change should trigger an immediate refetch (useEffect fires synchronously in test)
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  // Regression test for the critical decimals bug caught in code review.
  // Previous implementation hardcoded decimals to 9 (SOL). Picking BONK (5 decimals)
  // would cause a 10000× over-scaling of the swap amount — real fund loss risk.
  it("uses the SELECTED input token's decimals when converting amount to lamports", async () => {
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

    const { container } = renderSwap();

    // First: type amount with default SOL (9 decimals) → expect 1e9
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    const firstCallUrl = String(fetchSpy.mock.calls[0]?.[0]);
    expect(firstCallUrl).toContain("amount=1000000000"); // 1 * 10^9 lamports (SOL)

    // Now pick BONK (5 decimals) via mock modal. The existing mock uses decimals: 5.
    const fromButton = screen.getByRole("button", { name: /Select input token/i });
    await act(async () => {
      fireEvent.click(fromButton);
    });
    const pickBonk = screen.getByTestId("mock-pick-bonk");
    await act(async () => {
      fireEvent.click(pickBonk);
    });

    // The mint-change useEffect fires an immediate refetch with BONK's decimals.
    // Expect: 1 * 10^5 = 100000, NOT 1 * 10^9 (which would be the bug).
    const secondCallUrl = String(fetchSpy.mock.calls[1]?.[0]);
    expect(secondCallUrl).toContain("amount=100000");       // correct (BONK 5 decimals)
    expect(secondCallUrl).not.toContain("amount=1000000000"); // bug sentinel
  });
});

describe("SwapCard — AC-5 SolBalanceWarning integration", () => {
  // Restore the default useWalletBalances mock before each case so mocks set by
  // one test (e.g. isError:true) don't leak into siblings under test reordering.
  beforeEach(() => {
    vi.mocked(useWalletBalances).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn().mockResolvedValue(undefined),
      isFetching: false,
    });
  });

  it("mounts SolBalanceWarning with default empty balance state without surfacing a fetch-failure alert", () => {
    // Default useWalletBalances mock: no error, no data. SolBalanceWarning renders null.
    renderSwap();

    // No fetch-failure alert should be surfaced with "Unable to verify SOL balance"
    const alerts = screen.queryAllByRole("alert");
    const solWarningAlert = alerts.find((el) =>
      el.textContent?.includes("Unable to verify SOL balance"),
    );
    expect(solWarningAlert).toBeUndefined();
  });

  it("renders the SOL balance fetch-failure Alert inside SwapCard when useWalletBalances.isError is true", () => {
    vi.mocked(useWalletBalances).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new SwapError(
        ErrorType.BalanceCheckFailed,
        "Failed to fetch SOL balance from both Ultra and RPC",
        undefined,
        true,
      ),
      refetch: vi.fn().mockResolvedValue(undefined),
      isFetching: false,
    });

    renderSwap();

    // Scope to the fetch-failure surface via its distinctive text to avoid
    // matching the quote-error alert (App.tsx ~line 265) that also uses role="alert".
    // SolBalanceWarning renders synchronously when isError is true, so getByText is safe.
    const warning = screen.getByText(/Unable to verify SOL balance/i);
    const warningAlert = warning.closest('[role="alert"]');
    expect(warningAlert).not.toBeNull();
    expect(warningAlert?.textContent).toContain("Unable to verify SOL balance");
  });
});

// ─── Task 4: swap orchestration ──────────────────────────────────────────────

const validQuoteResponse = {
  transaction: "dummy-base64-tx",
  requestId: "req-1",
  outAmount: "1000000",
  router: "Metis",
  mode: "ExactIn",
  feeBps: 0,
  feeMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

async function setupConnectedWithQuote() {
  // Wallet connected with signTransaction available
  mockUseWallet.mockReturnValue({
    publicKey: {
      toBase58: () => "So11111111111111111111111111111111111111112",
    },
    connected: true,
    signTransaction: vi.fn(async (tx: unknown) => tx),
  });

  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => validQuoteResponse,
  }) as unknown as typeof fetch;

  const { container } = renderSwap();
  const input = container.querySelector("input") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "1" } });

  await act(async () => {
    vi.advanceTimersByTime(300); // quote fetch debounce
  });
  // Let the quote-fetch promise resolve and dispatch QUOTE_RECEIVED
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  return container;
}

describe("SwapCard — Task 4 swap orchestration (AC-3-1-1, 3-1-5)", () => {
  beforeEach(() => {
    vi.mocked(preflightChecks.run).mockClear().mockResolvedValue(undefined);
    vi.mocked(transactionSigner.sign).mockClear().mockResolvedValue("signed");
  });

  it("calls preflightChecks.run then transactionSigner.sign on Swap click (happy path)", async () => {
    const container = await setupConnectedWithQuote();

    // Swap button should be enabled after quote arrives + preflight debounce fires
    await act(async () => {
      vi.advanceTimersByTime(300); // preflight debounce
      await Promise.resolve();
    });

    const swapBtn = container.querySelector(
      "button[aria-label='Swap tokens']",
    ) as HTMLButtonElement;
    expect(swapBtn).not.toBeNull();

    await act(async () => {
      fireEvent.click(swapBtn);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // handleSwap runs: fresh preflight at click time + sign
    // The debounced preflight effect may also fire — accept either 1 or 2 invocations.
    expect(vi.mocked(preflightChecks.run).mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(vi.mocked(transactionSigner.sign)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(transactionSigner.sign).mock.calls[0]?.[0]).toBe(
      validQuoteResponse.transaction,
    );
  });

  it("dispatches PREFLIGHT_FAILED and skips signing when preflightChecks.run throws at click time", async () => {
    const container = await setupConnectedWithQuote();

    // Debounced preflight: pass (so button is enabled)
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    // Click-time preflight: throw
    vi.mocked(preflightChecks.run).mockRejectedValueOnce(
      new SwapError(ErrorType.InsufficientSOL, "You need at least 0.01 SOL for transaction fees"),
    );

    const swapBtn = container.querySelector(
      "button[aria-label='Swap tokens']",
    ) as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(swapBtn);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Signer must NOT be called when preflight throws
    expect(vi.mocked(transactionSigner.sign)).not.toHaveBeenCalled();

    // UI reflects Error state with the SwapError message
    const errorAlerts = screen.queryAllByRole("alert");
    const preflightErrAlert = errorAlerts.find((el) =>
      el.textContent?.includes("You need at least 0.01 SOL"),
    );
    expect(preflightErrAlert).toBeDefined();
  });
});
