/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { PublicKey } from "@solana/web3.js";
import type { BalanceMap } from "../types/tokens";

vi.mock("../services/balanceService", () => ({
  balanceService: {
    getAllBalances: vi.fn(),
  },
}));

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: vi.fn(),
}));

async function loadMockBalanceService() {
  const mod = await import("../services/balanceService");
  return mod.balanceService;
}

async function loadMockUseWallet() {
  const mod = await import("@solana/wallet-adapter-react");
  return mod.useWallet as ReturnType<typeof vi.fn>;
}

async function loadHook() {
  const mod = await import("./useWalletBalances");
  return mod.useWalletBalances;
}

function makePublicKey(base58 = "So11111111111111111111111111111111111111112"): PublicKey {
  return { toBase58: () => base58 } as unknown as PublicKey;
}

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const MOCK_BALANCE_MAP: BalanceMap = {
  SOL: { uiAmount: 3.5, rawAmount: "3500000000", decimals: 9 },
};

const MOCK_PUBLIC_KEY = makePublicKey();

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("useWalletBalances — disabled when wallet not connected", () => {
  it("does not call balanceService and returns undefined data when publicKey is null", async () => {
    const useWallet = await loadMockUseWallet();
    useWallet.mockReturnValue({ publicKey: null });

    const svc = await loadMockBalanceService();

    const useWalletBalances = await loadHook();
    const { result } = renderHook(() => useWalletBalances(), {
      wrapper: createWrapper(),
    });

    // Allow a tick for any potential (erroneous) async resolution
    await new Promise((r) => setTimeout(r, 50));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(svc.getAllBalances).not.toHaveBeenCalled();
  });
});

describe("useWalletBalances — enabled when wallet connected", () => {
  it("calls balanceService.getAllBalances with the publicKey and populates data", async () => {
    const useWallet = await loadMockUseWallet();
    useWallet.mockReturnValue({ publicKey: MOCK_PUBLIC_KEY });

    const svc = await loadMockBalanceService();
    vi.mocked(svc.getAllBalances).mockResolvedValue(MOCK_BALANCE_MAP);

    const useWalletBalances = await loadHook();
    const { result } = renderHook(() => useWalletBalances(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(svc.getAllBalances).toHaveBeenCalledWith(MOCK_PUBLIC_KEY, expect.anything());
    expect(result.current.data).toEqual(MOCK_BALANCE_MAP);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });
});

describe("useWalletBalances — queryKey changes when publicKey changes", () => {
  it("fires a new fetch when the wallet public key changes", async () => {
    const useWallet = await loadMockUseWallet();

    const pk1 = makePublicKey("So11111111111111111111111111111111111111112");
    const pk2 = makePublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

    useWallet.mockReturnValue({ publicKey: pk1 });

    const svc = await loadMockBalanceService();
    vi.mocked(svc.getAllBalances).mockResolvedValue(MOCK_BALANCE_MAP);

    const useWalletBalances = await loadHook();
    const wrapper = createWrapper();

    const { result, rerender } = renderHook(() => useWalletBalances(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(svc.getAllBalances).toHaveBeenCalledTimes(1);
    expect(svc.getAllBalances).toHaveBeenNthCalledWith(1, pk1, expect.anything());

    // Switch to a different wallet
    useWallet.mockReturnValue({ publicKey: pk2 });
    const newBalances: BalanceMap = {
      SOL: { uiAmount: 1.0, rawAmount: "1000000000", decimals: 9 },
    };
    vi.mocked(svc.getAllBalances).mockResolvedValue(newBalances);
    rerender();

    await waitFor(() =>
      expect(result.current.data?.["SOL"]?.uiAmount).toBe(1.0),
    );

    expect(svc.getAllBalances).toHaveBeenCalledTimes(2);
    expect(svc.getAllBalances).toHaveBeenNthCalledWith(2, pk2, expect.anything());
  });
});

describe("useWalletBalances — cache sharing within staleTime", () => {
  it("does not call the service a second time when a second hook instance mounts with the same publicKey", async () => {
    const useWallet = await loadMockUseWallet();
    useWallet.mockReturnValue({ publicKey: MOCK_PUBLIC_KEY });

    const svc = await loadMockBalanceService();
    vi.mocked(svc.getAllBalances).mockResolvedValue(MOCK_BALANCE_MAP);

    const useWalletBalances = await loadHook();

    // Both hooks share the same QueryClient instance
    const sharedClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const SharedWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={sharedClient}>{children}</QueryClientProvider>
    );

    // First hook — populates cache
    const { result: result1 } = renderHook(() => useWalletBalances(), {
      wrapper: SharedWrapper,
    });
    await waitFor(() => expect(result1.current.data).toBeDefined());
    expect(svc.getAllBalances).toHaveBeenCalledTimes(1);

    // Second hook — same publicKey, same client — should hit cache
    const { result: result2 } = renderHook(() => useWalletBalances(), {
      wrapper: SharedWrapper,
    });
    await waitFor(() => expect(result2.current.data).toBeDefined());

    expect(svc.getAllBalances).toHaveBeenCalledTimes(1);
    expect(result2.current.data).toEqual(MOCK_BALANCE_MAP);
  });
});
