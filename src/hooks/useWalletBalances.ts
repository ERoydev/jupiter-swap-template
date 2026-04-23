import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { balanceService } from "../services/balanceService";
import type { BalanceMap } from "../types/tokens";

export function useWalletBalances(): {
  data: BalanceMap | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
  isFetching: boolean;
} {
  const { publicKey } = useWallet();

  const query = useQuery({
    queryKey: ["jupiter-balances", publicKey?.toBase58() ?? null],
    queryFn: ({ signal }) => balanceService.getAllBalances(publicKey!, signal),
    enabled: Boolean(publicKey),
    staleTime: 30_000,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    isFetching: query.isFetching,
  };
}
