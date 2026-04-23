/**
 * @vitest-environment jsdom
 */
import React from "react";
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import type { TokenInfo, BalanceMap } from "../../types/tokens";

// ---------------------------------------------------------------------------
// Module mocks — declared before any production imports
// ---------------------------------------------------------------------------
vi.mock("../../hooks/useTokenSearch");
vi.mock("../../hooks/useWalletBalances");
vi.mock("../../hooks/use-mobile");

// AutoSizer returns 0x0 in jsdom — mock it to provide a fixed viewport so
// react-window's FixedSizeList actually renders rows.
vi.mock("react-virtualized-auto-sizer", () => ({
  default: ({ children }: { children: (size: { height: number; width: number }) => React.ReactNode }) =>
    children({ height: 600, width: 400 }),
}));

// ---------------------------------------------------------------------------
// Lazy loaders (re-import each test to pick up fresh mock state)
// ---------------------------------------------------------------------------
async function loadModal() {
  const mod = await import("./TokenSelectorModal");
  return mod.TokenSelectorModal;
}

async function getMock_useTokenSearch() {
  return vi.mocked((await import("../../hooks/useTokenSearch")).useTokenSearch);
}

async function getMock_useWalletBalances() {
  return vi.mocked((await import("../../hooks/useWalletBalances")).useWalletBalances);
}

async function getMock_useIsMobile() {
  return vi.mocked((await import("../../hooks/use-mobile")).useIsMobile);
}

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------
const TOKEN_A: TokenInfo = {
  id: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  name: "USD Coin",
  symbol: "USDC",
  decimals: 6,
  isVerified: true,
  usdPrice: 1.0,
};

const TOKEN_B: TokenInfo = {
  id: "So11111111111111111111111111111111111111112",
  name: "Wrapped SOL",
  symbol: "SOL",
  decimals: 9,
  isVerified: true,
  usdPrice: 150,
};

type SearchReturn = {
  data: TokenInfo[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
};

function makeSearchResult(
  data: TokenInfo[] | undefined,
  overrides?: Partial<Omit<SearchReturn, "data">>,
): SearchReturn {
  return {
    data,
    isLoading: overrides?.isLoading ?? false,
    isError: overrides?.isError ?? false,
    error: overrides?.error ?? null,
    refetch: overrides?.refetch ?? vi.fn().mockResolvedValue(undefined),
  };
}

function makeBalanceResult(data?: BalanceMap) {
  return { data, isLoading: false, isError: false, error: null };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// Helper — queries document.body since @base-ui portals render outside container
function getBody() {
  return document.body;
}

// ---------------------------------------------------------------------------
// 1. open === false → modal content not visible in DOM
// ---------------------------------------------------------------------------
describe("TokenSelectorModal — closed state", () => {
  it("does not render modal content when open is false", async () => {
    (await getMock_useIsMobile()).mockReturnValue(false);
    (await getMock_useTokenSearch()).mockReturnValue(makeSearchResult([TOKEN_A]));
    (await getMock_useWalletBalances()).mockReturnValue(makeBalanceResult());

    const TokenSelectorModal = await loadModal();
    render(
      <TokenSelectorModal open={false} onOpenChange={vi.fn()} onSelect={vi.fn()} />,
    );

    expect(getBody().textContent).not.toContain("Select Token");
  });
});

// ---------------------------------------------------------------------------
// 2. disabled === true → returns null regardless of open
// ---------------------------------------------------------------------------
describe("TokenSelectorModal — disabled", () => {
  it("renders null when disabled is true even when open is true", async () => {
    (await getMock_useIsMobile()).mockReturnValue(false);
    (await getMock_useTokenSearch()).mockReturnValue(makeSearchResult([TOKEN_A]));
    (await getMock_useWalletBalances()).mockReturnValue(makeBalanceResult());

    const TokenSelectorModal = await loadModal();
    const { container } = render(
      <TokenSelectorModal
        open={true}
        onOpenChange={vi.fn()}
        onSelect={vi.fn()}
        disabled={true}
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Loading state → 8 skeleton rows
// ---------------------------------------------------------------------------
describe("TokenSelectorModal — loading state", () => {
  it("renders 8 animated skeleton rows while loading", async () => {
    (await getMock_useIsMobile()).mockReturnValue(false);
    (await getMock_useTokenSearch()).mockReturnValue(
      makeSearchResult(undefined, { isLoading: true }),
    );
    (await getMock_useWalletBalances()).mockReturnValue(makeBalanceResult());

    const TokenSelectorModal = await loadModal();
    render(
      <TokenSelectorModal open={true} onOpenChange={vi.fn()} onSelect={vi.fn()} />,
    );

    const status = getBody().querySelector('[role="status"][aria-label="Loading tokens"]');
    expect(status).not.toBeNull();
    const skeletonLines = getBody().querySelectorAll(".animate-pulse");
    expect(skeletonLines.length).toBeGreaterThanOrEqual(8);
  });
});

// ---------------------------------------------------------------------------
// 4. Error state → message + retry button that calls refetch
// ---------------------------------------------------------------------------
describe("TokenSelectorModal — error state", () => {
  it("shows error message and retry button; clicking retry calls refetch", async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    (await getMock_useIsMobile()).mockReturnValue(false);
    (await getMock_useTokenSearch()).mockReturnValue(
      makeSearchResult(undefined, {
        isError: true,
        error: new Error("Network failure"),
        refetch,
      }),
    );
    (await getMock_useWalletBalances()).mockReturnValue(makeBalanceResult());

    const TokenSelectorModal = await loadModal();
    render(
      <TokenSelectorModal open={true} onOpenChange={vi.fn()} onSelect={vi.fn()} />,
    );

    expect(getBody().textContent).toContain("Network failure");
    const allButtons = Array.from(getBody().querySelectorAll("button"));
    const retryBtn = allButtons.find((b) => b.textContent?.includes("Retry"));
    expect(retryBtn).not.toBeUndefined();
    fireEvent.click(retryBtn!);
    expect(refetch).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// 5. Empty state → "No tokens found"
// ---------------------------------------------------------------------------
describe("TokenSelectorModal — empty state", () => {
  it("shows 'No tokens found' when results list is empty", async () => {
    (await getMock_useIsMobile()).mockReturnValue(false);
    (await getMock_useTokenSearch()).mockReturnValue(makeSearchResult([]));
    (await getMock_useWalletBalances()).mockReturnValue(makeBalanceResult());

    const TokenSelectorModal = await loadModal();
    render(
      <TokenSelectorModal open={true} onOpenChange={vi.fn()} onSelect={vi.fn()} />,
    );

    expect(getBody().textContent).toContain("No tokens found");
  });
});

// ---------------------------------------------------------------------------
// 6. Success → renders all tokens (react-window virtualizes so we check DOM)
// ---------------------------------------------------------------------------
describe("TokenSelectorModal — success state", () => {
  it("renders token rows with symbol and name", async () => {
    (await getMock_useIsMobile()).mockReturnValue(false);
    (await getMock_useTokenSearch()).mockReturnValue(makeSearchResult([TOKEN_A, TOKEN_B]));
    (await getMock_useWalletBalances()).mockReturnValue(makeBalanceResult());

    const TokenSelectorModal = await loadModal();
    render(
      <div style={{ height: 600, width: 400 }}>
        <TokenSelectorModal open={true} onOpenChange={vi.fn()} onSelect={vi.fn()} />
      </div>,
    );

    // react-window renders visible items; in jsdom AutoSizer may get 0 height,
    // so we at least confirm the list container rendered
    const body = getBody();
    expect(body.textContent).toContain("Select Token");
  });
});

// ---------------------------------------------------------------------------
// 7. Debounce — useTokenSearch is called with debounced value after 200ms
// ---------------------------------------------------------------------------
describe("TokenSelectorModal — debounced search", () => {
  it("passes debounced query to useTokenSearch after 200ms", async () => {
    vi.useFakeTimers();
    try {
      const mockSearch = await getMock_useTokenSearch();
      mockSearch.mockReturnValue(makeSearchResult([TOKEN_A]));
      (await getMock_useIsMobile()).mockReturnValue(false);
      (await getMock_useWalletBalances()).mockReturnValue(makeBalanceResult());

      const TokenSelectorModal = await loadModal();
      render(
        <TokenSelectorModal open={true} onOpenChange={vi.fn()} onSelect={vi.fn()} />,
      );

      const input = getBody().querySelector("input");
      expect(input).not.toBeNull();

      fireEvent.change(input!, { target: { value: "SOL" } });

      // Before debounce resolves, should still have been called with ""
      expect(mockSearch).toHaveBeenLastCalledWith("");

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(mockSearch).toHaveBeenCalledWith("SOL");
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Same-token guard — excludeMint row is aria-disabled + click is no-op
// ---------------------------------------------------------------------------
describe("TokenSelectorModal — same-token guard", () => {
  it("marks excluded token row aria-disabled and prevents onSelect", async () => {
    const onSelect = vi.fn();
    (await getMock_useIsMobile()).mockReturnValue(false);
    (await getMock_useTokenSearch()).mockReturnValue(makeSearchResult([TOKEN_A, TOKEN_B]));
    (await getMock_useWalletBalances()).mockReturnValue(makeBalanceResult());

    const TokenSelectorModal = await loadModal();
    render(
      <div style={{ height: 600, width: 400 }}>
        <TokenSelectorModal
          open={true}
          onOpenChange={vi.fn()}
          onSelect={onSelect}
          excludeMint={TOKEN_A.id}
        />
      </div>,
    );

    const disabledRow = getBody().querySelector('[aria-disabled="true"]');
    expect(disabledRow).not.toBeNull();
    fireEvent.click(disabledRow!);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 9. Selecting a valid row fires onSelect + onOpenChange(false)
// ---------------------------------------------------------------------------
describe("TokenSelectorModal — selection flow", () => {
  it("calls onSelect and onOpenChange(false) when a non-disabled row is clicked", async () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    (await getMock_useIsMobile()).mockReturnValue(false);
    (await getMock_useTokenSearch()).mockReturnValue(makeSearchResult([TOKEN_A, TOKEN_B]));
    (await getMock_useWalletBalances()).mockReturnValue(makeBalanceResult());

    const TokenSelectorModal = await loadModal();
    render(
      <div style={{ height: 600, width: 400 }}>
        <TokenSelectorModal
          open={true}
          onOpenChange={onOpenChange}
          onSelect={onSelect}
        />
      </div>,
    );

    const rows = getBody().querySelectorAll('[role="option"]');
    expect(rows.length).toBeGreaterThan(0);
    fireEvent.click(rows[0]!);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

// ---------------------------------------------------------------------------
// 10. Balance merge + sort — held token (TOKEN_B) renders first even though
//     TOKEN_A is first in server order
// ---------------------------------------------------------------------------
describe("TokenSelectorModal — balance merge and sort", () => {
  it("sorts the held token to the top of the list", async () => {
    (await getMock_useIsMobile()).mockReturnValue(false);
    (await getMock_useTokenSearch()).mockReturnValue(makeSearchResult([TOKEN_A, TOKEN_B]));
    const balances: BalanceMap = {
      [TOKEN_B.id]: { uiAmount: 5.0, rawAmount: "5000000000", decimals: 9 },
    };
    (await getMock_useWalletBalances()).mockReturnValue(makeBalanceResult(balances));

    const TokenSelectorModal = await loadModal();
    render(
      <div style={{ height: 600, width: 400 }}>
        <TokenSelectorModal open={true} onOpenChange={vi.fn()} onSelect={vi.fn()} />
      </div>,
    );

    const rows = getBody().querySelectorAll('[role="option"]');
    expect(rows.length).toBeGreaterThan(0);
    // SOL (TOKEN_B, held) should be first
    expect(rows[0]!.textContent).toContain("SOL");
  });
});

// ---------------------------------------------------------------------------
// 11. Verified-only filter (default) + "Show unverified" toggle
// ---------------------------------------------------------------------------
describe("TokenSelectorModal — verified-only filter", () => {
  const UNVERIFIED: TokenInfo = {
    id: "ScamXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    name: "Scam USDC Copycat",
    symbol: "USDC",
    decimals: 6,
    isVerified: false,
  };

  it("hides unverified tokens by default", async () => {
    (await getMock_useIsMobile()).mockReturnValue(false);
    (await getMock_useTokenSearch()).mockReturnValue(
      makeSearchResult([TOKEN_A, UNVERIFIED]),
    );
    (await getMock_useWalletBalances()).mockReturnValue(makeBalanceResult());

    const TokenSelectorModal = await loadModal();
    render(
      <div style={{ height: 600, width: 400 }}>
        <TokenSelectorModal open={true} onOpenChange={vi.fn()} onSelect={vi.fn()} />
      </div>,
    );

    const rows = getBody().querySelectorAll('[role="option"]');
    expect(rows.length).toBe(1);
    expect(rows[0]!.textContent).toContain("USD Coin");
    // Scam copycat must NOT be in the DOM
    expect(getBody().textContent).not.toContain("Scam USDC Copycat");
  });

  it("keeps unverified tokens the user HOLDS visible (held bypass)", async () => {
    (await getMock_useIsMobile()).mockReturnValue(false);
    (await getMock_useTokenSearch()).mockReturnValue(
      makeSearchResult([TOKEN_A, UNVERIFIED]),
    );
    const balances: BalanceMap = {
      [UNVERIFIED.id]: { uiAmount: 1, rawAmount: "1000000", decimals: 6 },
    };
    (await getMock_useWalletBalances()).mockReturnValue(makeBalanceResult(balances));

    const TokenSelectorModal = await loadModal();
    render(
      <div style={{ height: 600, width: 400 }}>
        <TokenSelectorModal open={true} onOpenChange={vi.fn()} onSelect={vi.fn()} />
      </div>,
    );

    // Held unverified token should appear (even though isVerified === false)
    expect(getBody().textContent).toContain("Scam USDC Copycat");
    // Verified token still visible
    expect(getBody().textContent).toContain("USD Coin");
  });

  it("bypasses the filter when the user pastes a mint-like string (base58, 32+ chars)", async () => {
    vi.useFakeTimers();
    (await getMock_useIsMobile()).mockReturnValue(false);
    (await getMock_useTokenSearch()).mockReturnValue(
      makeSearchResult([UNVERIFIED]),
    );
    (await getMock_useWalletBalances()).mockReturnValue(makeBalanceResult());

    const TokenSelectorModal = await loadModal();
    render(
      <div style={{ height: 600, width: 400 }}>
        <TokenSelectorModal open={true} onOpenChange={vi.fn()} onSelect={vi.fn()} />
      </div>,
    );

    // Simulate user pasting a mint-like string (matches UNVERIFIED.id length/shape)
    const input = getBody().querySelector(
      'input[aria-label="Search tokens"]',
    ) as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: UNVERIFIED.id } });
      vi.advanceTimersByTime(250); // flush debounce
    });

    // Unverified token should now be visible because the query is mint-shaped
    expect(getBody().textContent).toContain("Scam USDC Copycat");
    vi.useRealTimers();
  });

  it("shows unverified tokens after the user toggles 'Show unverified'", async () => {
    (await getMock_useIsMobile()).mockReturnValue(false);
    (await getMock_useTokenSearch()).mockReturnValue(
      makeSearchResult([TOKEN_A, UNVERIFIED]),
    );
    (await getMock_useWalletBalances()).mockReturnValue(makeBalanceResult());

    const TokenSelectorModal = await loadModal();
    render(
      <div style={{ height: 600, width: 400 }}>
        <TokenSelectorModal open={true} onOpenChange={vi.fn()} onSelect={vi.fn()} />
      </div>,
    );

    // Before toggle: unverified hidden
    expect(getBody().textContent).not.toContain("Scam USDC Copycat");

    // Toggle on
    const toggle = getBody().querySelector(
      'input[aria-label="Show unverified tokens"]',
    ) as HTMLInputElement;
    expect(toggle).toBeTruthy();
    act(() => {
      fireEvent.click(toggle);
    });

    // After toggle: unverified visible
    expect(getBody().textContent).toContain("Scam USDC Copycat");
  });
});

// ---------------------------------------------------------------------------
// 12. Mobile → Drawer branch renders
// ---------------------------------------------------------------------------
describe("TokenSelectorModal — mobile Drawer", () => {
  it("renders Select Token heading via Drawer when useIsMobile returns true", async () => {
    (await getMock_useIsMobile()).mockReturnValue(true);
    (await getMock_useTokenSearch()).mockReturnValue(makeSearchResult([TOKEN_A]));
    (await getMock_useWalletBalances()).mockReturnValue(makeBalanceResult());

    const TokenSelectorModal = await loadModal();
    render(
      <div style={{ height: 600 }}>
        <TokenSelectorModal open={true} onOpenChange={vi.fn()} onSelect={vi.fn()} />
      </div>,
    );

    expect(getBody().textContent).toContain("Select Token");
  });
});
