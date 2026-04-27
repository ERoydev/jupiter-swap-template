/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, render, cleanup, fireEvent, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useIsMobile } from "./hooks/use-mobile";

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

// jsdom doesn't implement window.matchMedia. QuoteDisplay (Story 4-1, Task 2)
// reads useIsMobile() to decide between the desktop inline layout and the
// mobile collapsed layout; mocking the hook to a stable `false` lets every App
// test exercise the desktop branch (which mirrors the legacy always-expanded
// behaviour assumed by these tests) without touching jsdom internals.
// useIsMobile is a `vi.fn()` (not a fixed arrow) so individual tests can flip
// it to `true` via `vi.mocked(useIsMobile).mockReturnValueOnce(true)` to
// exercise the mobile QuoteDisplay branch (Story 4-1, Task 2 — AC-5).
vi.mock("./hooks/use-mobile", () => ({
  useIsMobile: vi.fn(() => false),
}));

// Task 4 orchestration: mock handlers so tests can assert dispatch wiring
// without needing real balance fetches or wallet signing infrastructure.
vi.mock("./handlers/preflightChecks", () => ({
  preflightChecks: { run: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("./handlers/transactionSigner", () => ({
  transactionSigner: { sign: vi.fn().mockResolvedValue("signed-base64") },
}));

// Story 3-2 Task 4: partial-mock jupiterService so executeOrder is mockable
// per-test while getOrder remains its real implementation (it goes through
// the global fetch mock used by AC-2 and AC-7 cases above).
vi.mock("./services/jupiterService", async () => {
  const actual = await vi.importActual<
    typeof import("./services/jupiterService")
  >("./services/jupiterService");
  return {
    ...actual,
    executeOrder: vi.fn(),
  };
});

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
import { executeOrder } from "./services/jupiterService";
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

  // Regression test for the HIGH finding from PR #1 second-pass review.
  // preflightChecks.run is async and unabortable, so without a stale-invocation
  // guard a slow earlier call can resolve AFTER a fast later call and overwrite
  // preflightError with a stale result. Scenario: user changes input token
  // while an earlier preflight is still in flight; the earlier promise must
  // NOT clobber state written by the later one.
  it("ignores a stale preflight result that resolves after a newer invocation (race guard)", async () => {
    // Connect wallet so the debounced preflight effect is actually exercised.
    mockUseWallet.mockReturnValue({
      publicKey: {
        toBase58: () => "So11111111111111111111111111111111111111112",
      },
      connected: true,
      signTransaction: vi.fn(async (tx: unknown) => tx),
    });

    // Keep fetch from dispatching real quote state — we don't care about the
    // quote path here, only the preflight race.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => validQuoteResponse,
    }) as unknown as typeof fetch;

    // Two manually-resolvable promises. First call (on initial amount) gets
    // the SLOW deferred; second call (after token change) gets the FAST one.
    let resolveFirst: (() => void) | null = null;
    let rejectFirst: ((err: unknown) => void) | null = null;
    let resolveSecond: (() => void) | null = null;

    vi.mocked(preflightChecks.run)
      .mockReset()
      .mockImplementationOnce(
        () =>
          new Promise<void>((res, rej) => {
            resolveFirst = res;
            rejectFirst = rej;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<void>((res) => {
            resolveSecond = res;
          }),
      );

    const { container } = renderSwap();

    // Type amount — kicks off first debounced preflight.
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(vi.mocked(preflightChecks.run)).toHaveBeenCalledTimes(1);
    expect(resolveFirst).not.toBeNull();

    // Change input token to BONK → effect re-runs, schedules second preflight.
    const fromButton = screen.getByRole("button", {
      name: /Select input token/i,
    });
    await act(async () => {
      fireEvent.click(fromButton);
    });
    const pickBonk = screen.getByTestId("mock-pick-bonk");
    await act(async () => {
      fireEvent.click(pickBonk);
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(vi.mocked(preflightChecks.run)).toHaveBeenCalledTimes(2);

    // Resolve SECOND preflight first (the "current" invocation) — success.
    await act(async () => {
      resolveSecond?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Now resolve FIRST preflight LAST, with a failure that — without the
    // race guard — would overwrite the success state to InsufficientSOL.
    await act(async () => {
      rejectFirst?.(
        new SwapError(
          ErrorType.InsufficientSOL,
          "You need at least 0.01 SOL for transaction fees",
        ),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    // Touch the unused resolveFirst to keep TS happy about the declared binding.
    void resolveFirst;

    // Assert: no stale "Insufficient SOL" tooltip surfaced. The current
    // invocation succeeded, so the swap button carries the enabled "Swap" label.
    const swapBtn = container.querySelector(
      "button[aria-label='Swap tokens']",
    ) as HTMLButtonElement | null;
    expect(swapBtn).not.toBeNull();
    expect(swapBtn?.textContent).toBe("Swap");
    expect(swapBtn?.disabled).toBe(false);
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

// ─── Story 3-2 / Task 4: execute flow + success display ──────────────────────

const SUCCESSFUL_EXECUTE_RESPONSE = {
  status: "Success" as const,
  signature: "5VfYSFjV9bbmU3pH8sFv2J5sYNxYi3DGhVSdH5LpHF6m4q1xTk8wZqLzQyJtR7nWcK3vBpA9eXfHsGdNuMrTbY1z",
  code: 0,
  inputAmountResult: "1000000000",
  outputAmountResult: "17057460",
};

async function clickSwapAndDrain(container: HTMLElement) {
  await act(async () => {
    vi.advanceTimersByTime(300); // drain debounced preflight so button enables
    await Promise.resolve();
  });

  const swapBtn = container.querySelector(
    "button[aria-label='Swap tokens']",
  ) as HTMLButtonElement;
  expect(swapBtn).not.toBeNull();

  await act(async () => {
    fireEvent.click(swapBtn);
    // Drain microtasks for: click-preflight, sign, executeOrder, dispatches
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
    }
  });
}

describe("SwapCard — Story 3-2 execute flow (AC-3-2-1, 3-2-2, 3-2-3, 3-2-4)", () => {
  beforeEach(() => {
    vi.mocked(preflightChecks.run).mockClear().mockResolvedValue(undefined);
    vi.mocked(transactionSigner.sign).mockClear().mockResolvedValue("signed-base64");
    vi.mocked(executeOrder).mockReset();
  });

  it("happy path: dispatches EXECUTE_SUCCESS and renders SuccessDisplay with Solscan link (AC-3-2-1, AC-3-2-2)", async () => {
    vi.mocked(executeOrder).mockResolvedValueOnce(SUCCESSFUL_EXECUTE_RESPONSE);

    const container = await setupConnectedWithQuote();
    await clickSwapAndDrain(container);

    // executeOrder called with signed tx + requestId from the quote
    expect(vi.mocked(executeOrder)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(executeOrder).mock.calls[0]?.[0]).toBe("signed-base64");
    expect(vi.mocked(executeOrder).mock.calls[0]?.[1]).toBe(
      validQuoteResponse.requestId,
    );

    // SuccessDisplay rendered: alert with "Swap successful" + Solscan anchor
    const alerts = screen.queryAllByRole("alert");
    const successAlert = alerts.find((el) =>
      el.textContent?.includes("Swap successful"),
    );
    expect(successAlert).toBeDefined();

    const solscan = container.querySelector("a[href*='solscan.io/tx/']") as HTMLAnchorElement;
    expect(solscan).not.toBeNull();
    expect(solscan.href).toContain(SUCCESSFUL_EXECUTE_RESPONSE.signature);
  });

  it("retryable -1000 first attempt → EXECUTE_RETRY, no error visible (3-3 supersedes 3-2)", async () => {
    // 3-3: retryable codes on the first attempt no longer fall through to
    // EXECUTE_ERROR — useSwapExecution dispatches EXECUTE_RETRY and the error
    // UI stays hidden between attempts. Pre-3-3 this test asserted the
    // opposite (error visible immediately); the assertion is flipped here.
    vi.mocked(executeOrder).mockResolvedValueOnce({
      status: "Failed",
      signature: "",
      code: -1000,
      inputAmountResult: "0",
      outputAmountResult: "0",
    });

    const container = await setupConnectedWithQuote();
    await clickSwapAndDrain(container);

    // Error alert must NOT be visible — retry path suppressed it
    const alerts = screen.queryAllByRole("alert");
    const errorAlert = alerts.find((el) =>
      el.textContent?.includes("Transaction didn't land"),
    );
    expect(errorAlert).toBeUndefined();

    // SuccessDisplay must NOT render either
    const successAlert = alerts.find((el) =>
      el.textContent?.includes("Swap successful"),
    );
    expect(successAlert).toBeUndefined();

    // executeOrder fired exactly once for the first attempt
    expect(vi.mocked(executeOrder)).toHaveBeenCalledTimes(1);
  });

  it("surfaces Jupiter's response.error verbatim instead of the generic mapped message (A-13)", async () => {
    vi.mocked(executeOrder).mockResolvedValueOnce({
      status: "Failed",
      signature: "",
      code: -2002,
      inputAmountResult: "0",
      outputAmountResult: "0",
      error: "Slippage tolerance exceeded",
    });

    const container = await setupConnectedWithQuote();
    await clickSwapAndDrain(container);

    const alerts = screen.queryAllByRole("alert");
    // A-13: response.error wins over mapping.message ("Transaction error. Please try again.")
    const slippageAlert = alerts.find((el) =>
      el.textContent?.includes("Slippage tolerance exceeded"),
    );
    expect(slippageAlert).toBeDefined();
    // Sanity: the generic mapped fallback should NOT appear when response.error is set
    const genericAlert = alerts.find(
      (el) =>
        el.textContent?.includes("Transaction error. Please try again.") &&
        !el.textContent?.includes("Slippage"),
    );
    expect(genericAlert).toBeUndefined();
  });

  it("uses mapping.message when response.error is absent or empty (A-13 fallback)", async () => {
    vi.mocked(executeOrder).mockResolvedValueOnce({
      status: "Failed",
      signature: "",
      code: -2002,
      inputAmountResult: "0",
      outputAmountResult: "0",
      // no `error` field
    });

    const container = await setupConnectedWithQuote();
    await clickSwapAndDrain(container);

    const alerts = screen.queryAllByRole("alert");
    const fallbackAlert = alerts.find((el) =>
      el.textContent?.includes("Transaction error. Please try again."),
    );
    expect(fallbackAlert).toBeDefined();
  });

  it("includes the numeric code in the fallback message for unknown codes (A-13)", async () => {
    vi.mocked(executeOrder).mockResolvedValueOnce({
      status: "Failed",
      signature: "",
      code: -9999, // not in ERROR_MAP
      inputAmountResult: "0",
      outputAmountResult: "0",
    });

    const container = await setupConnectedWithQuote();
    await clickSwapAndDrain(container);

    const alerts = screen.queryAllByRole("alert");
    const codedAlert = alerts.find((el) =>
      el.textContent?.includes("code: -9999"),
    );
    expect(codedAlert).toBeDefined();
  });

  it("non-retryable failure: dispatches EXECUTE_ERROR on code -2 (AC-3-2-1)", async () => {
    vi.mocked(executeOrder).mockResolvedValueOnce({
      status: "Failed",
      signature: "",
      code: -2,
      inputAmountResult: "0",
      outputAmountResult: "0",
    });

    const container = await setupConnectedWithQuote();
    await clickSwapAndDrain(container);

    const alerts = screen.queryAllByRole("alert");
    const errorAlert = alerts.find((el) =>
      el.textContent?.includes("Transaction error"),
    );
    expect(errorAlert).toBeDefined();
  });

  it("network throw retryable=true first attempt → EXECUTE_RETRY, no error visible (3-3)", async () => {
    // 3-3: retryable thrown errors (NetworkError) follow the same budget gate
    // as response.code retryable failures. The error UI stays hidden until
    // the budget exhausts. Pre-3-3 this test asserted error visible.
    vi.mocked(executeOrder).mockRejectedValueOnce(
      new SwapError(
        ErrorType.NetworkError,
        "Network error. Check your connection.",
        undefined,
        true,
      ),
    );

    const container = await setupConnectedWithQuote();
    await clickSwapAndDrain(container);

    const alerts = screen.queryAllByRole("alert");
    const errorAlert = alerts.find((el) =>
      el.textContent?.includes("Network error"),
    );
    expect(errorAlert).toBeUndefined();
  });

  it("renders SwapInFlightPanel ('Confirming on Solana…') during Executing and unmounts on Success (A-12)", async () => {
    let resolveExec: (
      v: typeof SUCCESSFUL_EXECUTE_RESPONSE,
    ) => void = () => {};
    vi.mocked(executeOrder).mockImplementationOnce(
      () =>
        new Promise<typeof SUCCESSFUL_EXECUTE_RESPONSE>((res) => {
          resolveExec = res;
        }),
    );

    const container = await setupConnectedWithQuote();
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    const swapBtn = container.querySelector(
      "button[aria-label='Swap tokens']",
    ) as HTMLButtonElement;

    await act(async () => {
      fireEvent.click(swapBtn);
      for (let i = 0; i < 4; i++) await Promise.resolve();
    });

    // Code review #9 (Medium): assert the dimmed input wrappers carry the
    // `inert` attribute (post round-1 fix). Without this, a regression that
    // re-introduces `aria-hidden` (or drops the attribute entirely) would
    // ship green even though the a11y bug is back.
    const inertWrappers = container.querySelectorAll("[inert]");
    expect(inertWrappers.length).toBeGreaterThanOrEqual(1);

    // executeOrder is held in flight — panel should be visible with the
    // Executing-phase copy, NOT the Signing-phase copy.
    const inFlightStatus = screen.queryAllByRole("status").find((el) =>
      el.textContent?.includes("Confirming on Solana"),
    );
    expect(inFlightStatus).toBeDefined();

    // Resolve the deferred /execute call
    await act(async () => {
      resolveExec(SUCCESSFUL_EXECUTE_RESPONSE);
      for (let i = 0; i < 4; i++) await Promise.resolve();
    });

    // Panel unmounted; SuccessDisplay rendered
    const stillInFlight = screen.queryAllByRole("status").find((el) =>
      el.textContent?.includes("Confirming on Solana"),
    );
    expect(stillInFlight).toBeUndefined();

    const successAlert = screen.queryAllByRole("alert").find((el) =>
      el.textContent?.includes("Swap successful"),
    );
    expect(successAlert).toBeDefined();
  });

  it("NEW_SWAP from Success unmounts SuccessDisplay and clears lastSwapResult (AC-3-2-3)", async () => {
    vi.mocked(executeOrder).mockResolvedValueOnce(SUCCESSFUL_EXECUTE_RESPONSE);

    const container = await setupConnectedWithQuote();
    await clickSwapAndDrain(container);

    // Sanity: SuccessDisplay is mounted
    let successAlert = screen.queryAllByRole("alert").find((el) =>
      el.textContent?.includes("Swap successful"),
    );
    expect(successAlert).toBeDefined();

    // Click "Start a new swap"
    const newSwapBtn = container.querySelector(
      "button[aria-label='Start a new swap']",
    ) as HTMLButtonElement;
    expect(newSwapBtn).not.toBeNull();

    await act(async () => {
      fireEvent.click(newSwapBtn);
      await Promise.resolve();
      await Promise.resolve();
    });

    // SuccessDisplay unmounted
    successAlert = screen.queryAllByRole("alert").find((el) =>
      el.textContent?.includes("Swap successful"),
    );
    expect(successAlert).toBeUndefined();
  });
});

// ─── Story 3-3: retry logic + error recovery ─────────────────────────────────

const FAILED_RETRYABLE_RESPONSE = {
  status: "Failed" as const,
  signature: "",
  code: -1000,
  inputAmountResult: "0",
  outputAmountResult: "0",
};

describe("SwapCard — Story 3-3 retry logic (AC-3-3-1, 3-3-2, 3-3-3, 3-3-4, 3-3-6)", () => {
  beforeEach(() => {
    vi.mocked(preflightChecks.run).mockClear().mockResolvedValue(undefined);
    vi.mocked(transactionSigner.sign)
      .mockClear()
      .mockResolvedValue("signed-base64");
    vi.mocked(executeOrder).mockReset();
  });

  it("retryable -1000 then SUCCESS: succeeds on attempt 2 with retry_scheduled log (AC-3-3-1)", async () => {
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    vi.mocked(executeOrder)
      .mockResolvedValueOnce(FAILED_RETRYABLE_RESPONSE)
      .mockResolvedValueOnce(SUCCESSFUL_EXECUTE_RESPONSE);

    const container = await setupConnectedWithQuote();
    // Attempt 1 → fails -1000 → EXECUTE_RETRY → fetchQuote refetches
    await clickSwapAndDrain(container);

    // Drain the auto-fetched fresh quote so state lands at QuoteReady
    await act(async () => {
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });

    // Confirm no error visible after attempt 1 (retry suppressed it)
    let alerts = screen.queryAllByRole("alert");
    let errAlertAfter1 = alerts.find((el) =>
      el.textContent?.includes("Transaction didn't land"),
    );
    expect(errAlertAfter1).toBeUndefined();

    // Attempt 2 → succeeds
    await clickSwapAndDrain(container);

    expect(vi.mocked(executeOrder)).toHaveBeenCalledTimes(2);

    alerts = screen.queryAllByRole("alert");
    const successAlert = alerts.find((el) =>
      el.textContent?.includes("Swap successful"),
    );
    expect(successAlert).toBeDefined();

    // retry_scheduled log fired. `attempt` in the log = which 1-indexed
    // attempt just failed (retryCount + 1 pre-dispatch). After the first
    // failure that's attempt:1.
    const logCalls = logSpy.mock.calls.map((args) => String(args[0] ?? ""));
    const retrySchedLog = logCalls.find((s) =>
      s.includes('"retry_scheduled"'),
    );
    expect(retrySchedLog).toBeDefined();
    expect(retrySchedLog).toContain('"attempt":1');
    expect(retrySchedLog).toContain('"code":-1000');

    logSpy.mockRestore();
  });

  it("3 consecutive retryable failures → EXECUTE_ERROR with retriesAttempted=2 + retry_exhausted log (AC-3-3-3)", async () => {
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    vi.mocked(executeOrder)
      .mockResolvedValueOnce(FAILED_RETRYABLE_RESPONSE)
      .mockResolvedValueOnce(FAILED_RETRYABLE_RESPONSE)
      .mockResolvedValueOnce(FAILED_RETRYABLE_RESPONSE);

    const container = await setupConnectedWithQuote();

    // Attempt 1 → EXECUTE_RETRY → refetch
    await clickSwapAndDrain(container);
    await act(async () => {
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });

    // Attempt 2 → EXECUTE_RETRY → refetch
    await clickSwapAndDrain(container);
    await act(async () => {
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });

    // Attempt 3 → final, EXECUTE_ERROR
    await clickSwapAndDrain(container);

    expect(vi.mocked(executeOrder)).toHaveBeenCalledTimes(3);

    // Error visible after attempt 3
    const alerts = screen.queryAllByRole("alert");
    const errorAlert = alerts.find((el) =>
      el.textContent?.includes("Transaction didn't land"),
    );
    expect(errorAlert).toBeDefined();

    // Logs: 2× retry_scheduled, 1× retry_exhausted with totalAttempts:3
    const logCalls = logSpy.mock.calls.map((args) => String(args[0] ?? ""));
    const retryScheds = logCalls.filter((s) =>
      s.includes('"retry_scheduled"'),
    );
    expect(retryScheds.length).toBe(2);
    const exhaustedLog = logCalls.find((s) =>
      s.includes('"retry_exhausted"'),
    );
    expect(exhaustedLog).toBeDefined();
    expect(exhaustedLog).toContain('"totalAttempts":3');

    logSpy.mockRestore();
  });

  it("non-retryable code -2 → EXECUTE_ERROR immediately + non_retryable_error log, NO retry (AC-3-3-4)", async () => {
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    vi.mocked(executeOrder).mockResolvedValueOnce({
      status: "Failed",
      signature: "",
      code: -2,
      inputAmountResult: "0",
      outputAmountResult: "0",
    });

    const container = await setupConnectedWithQuote();
    await clickSwapAndDrain(container);

    // Error visible after the single attempt
    const alerts = screen.queryAllByRole("alert");
    const errorAlert = alerts.find((el) =>
      el.textContent?.includes("Transaction error"),
    );
    expect(errorAlert).toBeDefined();

    // Logs assert presence of non_retryable_error and ABSENCE of retry_scheduled
    const logCalls = logSpy.mock.calls.map((args) => String(args[0] ?? ""));
    const retryLog = logCalls.find((s) => s.includes('"retry_scheduled"'));
    expect(retryLog).toBeUndefined();
    const nonRetryLog = logCalls.find((s) =>
      s.includes('"non_retryable_error"'),
    );
    expect(nonRetryLog).toBeDefined();

    expect(vi.mocked(executeOrder)).toHaveBeenCalledTimes(1);

    logSpy.mockRestore();
  });

  it("renders 'Retrying… attempt 2 of 3' during the in-between LoadingQuote phase (AC-3-3-2)", async () => {
    let resolveQuote: () => void = () => {};

    vi.mocked(executeOrder).mockResolvedValueOnce(FAILED_RETRYABLE_RESPONSE);

    const container = await setupConnectedWithQuote();

    // Replace fetch with a deferred mock so the retry's /order request hangs.
    // The setup quote already resolved; the next fetch is the retry-triggered one.
    globalThis.fetch = vi.fn().mockImplementation(
      () =>
        new Promise<{
          ok: true;
          json: () => Promise<typeof validQuoteResponse>;
        }>((res) => {
          resolveQuote = () =>
            res({ ok: true, json: async () => validQuoteResponse });
        }),
    ) as unknown as typeof fetch;

    await clickSwapAndDrain(container);

    // After clickSwapAndDrain, executeOrder failed -1000 → EXECUTE_RETRY → fetchQuote
    // is in flight (deferred). State is LoadingQuote, retryCount=1 → retry copy renders.
    await act(async () => {
      for (let i = 0; i < 4; i++) await Promise.resolve();
    });

    const retryStatus = screen.queryAllByRole("status").find((el) =>
      el.textContent?.includes("Retrying"),
    );
    expect(retryStatus).toBeDefined();
    expect(retryStatus?.textContent).toContain("attempt 2 of 3");

    // Resolve the deferred quote so the test cleans up properly
    await act(async () => {
      resolveQuote();
      for (let i = 0; i < 4; i++) await Promise.resolve();
    });

    // Retry copy unmounts once state lands on QuoteReady
    const retryStatusAfter = screen.queryAllByRole("status").find((el) =>
      el.textContent?.includes("Retrying"),
    );
    expect(retryStatusAfter).toBeUndefined();
  });

  it("3 consecutive thrown SwapError(NetworkError, retryable=true) → exhaust budget via catch branch (M-1 parity)", async () => {
    // Code review M-1: the catch branch must mirror the response branch's
    // budget-exhaustion behavior. Three consecutive thrown retryable errors
    // should fire 2× retry_scheduled + 1× retry_exhausted (totalAttempts:3),
    // then dispatch EXECUTE_ERROR with the user-facing message visible.
    // Without the M-1 fix, the catch branch would drop retriesAttempted
    // from error.details (only the response branch attached it).
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const networkError = () =>
      new SwapError(
        ErrorType.NetworkError,
        "Network error. Check your connection.",
        undefined,
        true,
      );

    vi.mocked(executeOrder)
      .mockRejectedValueOnce(networkError())
      .mockRejectedValueOnce(networkError())
      .mockRejectedValueOnce(networkError());

    const container = await setupConnectedWithQuote();

    // Attempt 1 → catch → EXECUTE_RETRY → refetch
    await clickSwapAndDrain(container);
    await act(async () => {
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });

    // Attempt 2 → catch → EXECUTE_RETRY → refetch
    await clickSwapAndDrain(container);
    await act(async () => {
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });

    // Attempt 3 → catch → final EXECUTE_ERROR (budget exhausted)
    await clickSwapAndDrain(container);

    expect(vi.mocked(executeOrder)).toHaveBeenCalledTimes(3);

    // Error visible after attempt 3 — NetworkError message surfaces verbatim
    const alerts = screen.queryAllByRole("alert");
    const errorAlert = alerts.find((el) =>
      el.textContent?.includes("Network error"),
    );
    expect(errorAlert).toBeDefined();

    // Log assertions: the catch branch fires the same observability events
    // as the response branch (2× retry_scheduled, 1× retry_exhausted).
    const logCalls = logSpy.mock.calls.map((args) => String(args[0] ?? ""));
    const retryScheds = logCalls.filter((s) =>
      s.includes('"retry_scheduled"'),
    );
    expect(retryScheds.length).toBe(2);
    const exhaustedLog = logCalls.find((s) =>
      s.includes('"retry_exhausted"'),
    );
    expect(exhaustedLog).toBeDefined();
    expect(exhaustedLog).toContain('"totalAttempts":3');
    // The catch-branch retry_exhausted log carries errorType (not code)
    // since thrown SwapError doesn't always have a numeric code.
    expect(exhaustedLog).toContain('"errorType":"NetworkError"');

    logSpy.mockRestore();
  });
});

// ─── Story 4-1 Task 2: AC-5 mobile QuoteDisplay integration ──────────────────
// Unit-level coverage of the collapse behaviour lives in QuoteDisplay.test.tsx.
// This integration check ensures App.tsx actually wires QuoteDisplay through
// to the mobile branch when useIsMobile() flips — guards the wiring, not the
// component (per code review #3).
describe("SwapCard — Story 4-1 mobile QuoteDisplay (AC-5)", () => {
  it("renders the 'Show details' toggle when useIsMobile() is true and a quote is loaded", async () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    await setupConnectedWithQuote();
    const toggle = screen.queryByRole("button", { name: /show details/i });
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    // Reset for any subsequent test in this run that expects the desktop default.
    vi.mocked(useIsMobile).mockReturnValue(false);
  });
});
