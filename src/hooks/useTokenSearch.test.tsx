/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ErrorType, SwapError } from "../types/errors";
import type { TokenInfo } from "../types/tokens";

vi.mock("../services/tokenService", () => ({
  tokenService: {
    search: vi.fn(),
  },
}));

async function loadMockTokenService() {
  const mod = await import("../services/tokenService");
  return mod.tokenService;
}

async function loadHook() {
  const mod = await import("./useTokenSearch");
  return mod.useTokenSearch;
}

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const MOCK_TOKEN: TokenInfo = {
  id: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  name: "USD Coin",
  symbol: "USDC",
  decimals: 6,
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("useTokenSearch — successful fetch", () => {
  it("returns data when tokenService.search resolves", async () => {
    const svc = await loadMockTokenService();
    vi.mocked(svc.search).mockResolvedValue([MOCK_TOKEN]);

    const useTokenSearch = await loadHook();
    const { result } = renderHook(() => useTokenSearch("USDC"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual([MOCK_TOKEN]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
  });
});

describe("useTokenSearch — queryKey includes query argument", () => {
  it("calls the service again when the query changes", async () => {
    const svc = await loadMockTokenService();
    vi.mocked(svc.search).mockResolvedValue([MOCK_TOKEN]);

    const useTokenSearch = await loadHook();
    let query = "USDC";

    const { result, rerender } = renderHook(() => useTokenSearch(query), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(svc.search).toHaveBeenCalledWith("USDC", expect.anything());

    vi.mocked(svc.search).mockResolvedValue([
      { ...MOCK_TOKEN, symbol: "SOL", name: "Wrapped SOL" },
    ]);
    query = "SOL";
    rerender();

    await waitFor(() =>
      expect(result.current.data?.[0]?.symbol).toBe("SOL"),
    );
    expect(svc.search).toHaveBeenCalledWith("SOL", expect.anything());
  });
});

describe("useTokenSearch — empty query is enabled", () => {
  it("fetches blue-chip list immediately on mount with empty string query", async () => {
    const svc = await loadMockTokenService();
    vi.mocked(svc.search).mockResolvedValue([MOCK_TOKEN]);

    const useTokenSearch = await loadHook();
    const { result } = renderHook(() => useTokenSearch(""), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(svc.search).toHaveBeenCalledWith("", expect.anything());
    expect(svc.search).toHaveBeenCalledTimes(1);
  });
});

describe("useTokenSearch — staleTime prevents redundant fetches", () => {
  it("does not call the service a second time within staleTime for the same query", async () => {
    const svc = await loadMockTokenService();
    vi.mocked(svc.search).mockResolvedValue([MOCK_TOKEN]);

    const sharedClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const SharedWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={sharedClient}>{children}</QueryClientProvider>
    );

    const useTokenSearch = await loadHook();

    // First render — populates the cache
    const { result: result1 } = renderHook(() => useTokenSearch("SOL"), {
      wrapper: SharedWrapper,
    });
    await waitFor(() => expect(result1.current.data).toBeDefined());
    expect(svc.search).toHaveBeenCalledTimes(1);

    // Second render with same query — should read from cache, not call service again
    const { result: result2 } = renderHook(() => useTokenSearch("SOL"), {
      wrapper: SharedWrapper,
    });
    await waitFor(() => expect(result2.current.data).toBeDefined());

    // Service should still have been called exactly once total (cache hit)
    expect(svc.search).toHaveBeenCalledTimes(1);
  });
});

describe("useTokenSearch — minimum text query length gate", () => {
  it("does NOT fetch when query is exactly 1 character", async () => {
    const svc = await loadMockTokenService();
    vi.mocked(svc.search).mockResolvedValue([MOCK_TOKEN]);

    const useTokenSearch = await loadHook();
    const { result } = renderHook(() => useTokenSearch("U"), {
      wrapper: createWrapper(),
    });

    // Give React a microtask to settle — query should be disabled
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(svc.search).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it("fetches when query reaches 2 characters", async () => {
    const svc = await loadMockTokenService();
    vi.mocked(svc.search).mockResolvedValue([MOCK_TOKEN]);

    const useTokenSearch = await loadHook();
    const { result } = renderHook(() => useTokenSearch("US"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(svc.search).toHaveBeenCalledWith("US", expect.anything());
  });
});

describe("useTokenSearch — error surfaces correctly", () => {
  it("returns isError: true and error set to the SwapError when service rejects", async () => {
    const svc = await loadMockTokenService();
    const swapError = new SwapError(
      ErrorType.NetworkError,
      "Network error",
      500,
      true,
    );
    vi.mocked(svc.search).mockRejectedValue(swapError);

    const useTokenSearch = await loadHook();
    const { result } = renderHook(() => useTokenSearch("USDC"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBe(swapError);
    expect(result.current.isLoading).toBe(false);
  });
});
