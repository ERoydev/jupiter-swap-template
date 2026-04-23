/**
 * @vitest-environment jsdom
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { SwapError, ErrorType } from "../types/errors";

// ---------------------------------------------------------------------------
// Module mocks — declared before any production imports
// ---------------------------------------------------------------------------
vi.mock("../hooks/useWalletBalances", () => ({
  useWalletBalances: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Lazy loaders (re-import each test to pick up fresh mock state)
// ---------------------------------------------------------------------------
async function loadComponent() {
  const mod = await import("./SolBalanceWarning");
  return mod.SolBalanceWarning;
}

async function getMock_useWalletBalances() {
  return vi.mocked(
    (await import("../hooks/useWalletBalances")).useWalletBalances,
  );
}

type HookReturn = {
  data: ReturnType<
    Awaited<ReturnType<typeof getMock_useWalletBalances>>
  > extends never
    ? never
    : unknown;
};

function makeHookReturn(overrides?: {
  data?: unknown;
  isLoading?: boolean;
  isError?: boolean;
  error?: Error | null;
  refetch?: () => Promise<unknown>;
  isFetching?: boolean;
}) {
  return {
    data: overrides?.data ?? undefined,
    isLoading: overrides?.isLoading ?? false,
    isError: overrides?.isError ?? false,
    error: overrides?.error ?? null,
    refetch: overrides?.refetch ?? (vi.fn().mockResolvedValue(undefined)),
    isFetching: overrides?.isFetching ?? false,
  } as unknown as HookReturn;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// 1. Wallet disconnected → component renders nothing
// ---------------------------------------------------------------------------
describe("SolBalanceWarning — wallet disconnected", () => {
  it("renders nothing when wallet is disconnected (data undefined, isError false)", async () => {
    (await getMock_useWalletBalances()).mockReturnValue(
      makeHookReturn({
        data: undefined,
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        isFetching: false,
      }) as never,
    );

    const SolBalanceWarning = await loadComponent();
    const { queryByRole, container } = render(<SolBalanceWarning />);

    expect(queryByRole("alert")).toBeNull();
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. isLoading: true → component renders nothing
// ---------------------------------------------------------------------------
describe("SolBalanceWarning — loading state", () => {
  it("renders nothing while isLoading is true", async () => {
    (await getMock_useWalletBalances()).mockReturnValue(
      makeHookReturn({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
        isFetching: true,
      }) as never,
    );

    const SolBalanceWarning = await loadComponent();
    const { queryByRole, container } = render(<SolBalanceWarning />);

    expect(queryByRole("alert")).toBeNull();
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Data loaded successfully → component renders nothing
// ---------------------------------------------------------------------------
describe("SolBalanceWarning — success state", () => {
  it("renders nothing when isError is false regardless of balance", async () => {
    (await getMock_useWalletBalances()).mockReturnValue(
      makeHookReturn({
        data: {
          SOL: { uiAmount: 0.005, rawAmount: "5000000", decimals: 9 },
        },
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        isFetching: false,
      }) as never,
    );

    const SolBalanceWarning = await loadComponent();
    const { queryByRole, container } = render(<SolBalanceWarning />);

    expect(queryByRole("alert")).toBeNull();
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. isError: true → fetch-failure Alert renders with expected content
// ---------------------------------------------------------------------------
describe("SolBalanceWarning — fetch failure state", () => {
  it("renders the fetch-failure Alert with role='alert', title, and both buttons with aria-labels", async () => {
    (await getMock_useWalletBalances()).mockReturnValue(
      makeHookReturn({
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
      }) as never,
    );

    const SolBalanceWarning = await loadComponent();
    const { getByRole, getByLabelText } = render(<SolBalanceWarning />);

    const alert = getByRole("alert");
    expect(alert).not.toBeNull();
    expect(alert.textContent).toContain("Unable to verify SOL balance");
    expect(alert.textContent).toContain("Your connection may be unstable.");

    const retryBtn = getByLabelText("Retry SOL balance check");
    expect(retryBtn).not.toBeNull();
    expect(retryBtn.tagName.toLowerCase()).toBe("button");

    const proceedBtn = getByLabelText(
      "Proceed without verifying SOL balance",
    );
    expect(proceedBtn).not.toBeNull();
    expect(proceedBtn.tagName.toLowerCase()).toBe("button");
  });
});

// ---------------------------------------------------------------------------
// 5. Click "Retry Check" → refetch called once; disabled + "Checking…" while isFetching
// ---------------------------------------------------------------------------
describe("SolBalanceWarning — Retry Check behavior", () => {
  it("calls refetch exactly once on click and shows disabled 'Checking…' while isFetching is true", async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    const mockHook = await getMock_useWalletBalances();

    mockHook.mockReturnValue(
      makeHookReturn({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new SwapError(
          ErrorType.BalanceCheckFailed,
          "boom",
          undefined,
          true,
        ),
        refetch,
        isFetching: false,
      }) as never,
    );

    const SolBalanceWarning = await loadComponent();
    const { getByLabelText, rerender } = render(<SolBalanceWarning />);

    const retryBtn = getByLabelText(
      "Retry SOL balance check",
    ) as HTMLButtonElement;
    expect(retryBtn.disabled).toBe(false);
    expect(retryBtn.textContent).toContain("Retry Check");

    fireEvent.click(retryBtn);
    expect(refetch).toHaveBeenCalledTimes(1);

    // Re-render with isFetching true — button should disable and label swap
    mockHook.mockReturnValue(
      makeHookReturn({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new SwapError(
          ErrorType.BalanceCheckFailed,
          "boom",
          undefined,
          true,
        ),
        refetch,
        isFetching: true,
      }) as never,
    );
    rerender(<SolBalanceWarning />);

    const retryBtnFetching = getByLabelText(
      "Retry SOL balance check",
    ) as HTMLButtonElement;
    expect(retryBtnFetching.disabled).toBe(true);
    expect(retryBtnFetching.textContent).toContain("Checking");
  });
});

// ---------------------------------------------------------------------------
// 6. Click "Proceed Without Verification" → Alert unmounts and stays unmounted
// ---------------------------------------------------------------------------
describe("SolBalanceWarning — Proceed Without Verification dismiss", () => {
  it("unmounts the Alert when clicked and keeps it unmounted on re-render with isError still true", async () => {
    const mockHook = await getMock_useWalletBalances();
    mockHook.mockReturnValue(
      makeHookReturn({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new SwapError(
          ErrorType.BalanceCheckFailed,
          "boom",
          undefined,
          true,
        ),
        refetch: vi.fn().mockResolvedValue(undefined),
        isFetching: false,
      }) as never,
    );

    const SolBalanceWarning = await loadComponent();
    const { getByLabelText, queryByRole, rerender } = render(
      <SolBalanceWarning />,
    );

    // Sanity — Alert is visible initially
    expect(queryByRole("alert")).not.toBeNull();

    const proceedBtn = getByLabelText(
      "Proceed without verifying SOL balance",
    );
    fireEvent.click(proceedBtn);

    // Alert unmounts immediately
    expect(queryByRole("alert")).toBeNull();

    // Re-render with still-failing hook state — Alert must STAY dismissed
    mockHook.mockReturnValue(
      makeHookReturn({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new SwapError(
          ErrorType.BalanceCheckFailed,
          "still failing",
          undefined,
          true,
        ),
        refetch: vi.fn().mockResolvedValue(undefined),
        isFetching: false,
      }) as never,
    );
    rerender(<SolBalanceWarning />);

    expect(queryByRole("alert")).toBeNull();
  });
});
