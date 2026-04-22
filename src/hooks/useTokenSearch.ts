import { useQuery } from "@tanstack/react-query";
import { tokenService } from "../services/tokenService";
import type { TokenInfo } from "../types/tokens";

export function useTokenSearch(query: string): {
  data: TokenInfo[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
} {
  const staleTime = query === "" ? 5 * 60_000 : 30_000;

  return useQuery({
    queryKey: ["jupiter-search", query],
    queryFn: ({ signal }) => tokenService.search(query, signal),
    staleTime,
  });
}
