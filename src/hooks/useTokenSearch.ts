import {
  keepPreviousData,
  useQuery,
  type QueryClient,
} from "@tanstack/react-query";
import { tokenService } from "../services/tokenService";
import type { TokenInfo } from "../types/tokens";

/**
 * Prefetch Jupiter's blue-chip seed list. Call this on app mount so the first
 * time the user opens the token selector the data is already cached — no
 * skeleton flash on first open.
 */
export function prefetchBlueChipTokens(queryClient: QueryClient) {
  return queryClient.prefetchQuery({
    queryKey: ["jupiter-search", ""],
    queryFn: ({ signal }) => tokenService.search("", signal),
    staleTime: 5 * 60_000,
  });
}

// Minimum characters before firing a text search. Empty string (blue-chip seed)
// is always enabled; single-char queries (e.g., "U") match thousands of tokens —
// too noisy to be useful and wastes API calls. Tune to 1 to disable the gate.
const MIN_TEXT_QUERY_LENGTH = 2;

export function useTokenSearch(query: string): {
  data: TokenInfo[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
} {
  const staleTime = query === "" ? 5 * 60_000 : 30_000;
  const enabled = query === "" || query.length >= MIN_TEXT_QUERY_LENGTH;

  return useQuery({
    queryKey: ["jupiter-search", query],
    queryFn: ({ signal }) => tokenService.search(query, signal),
    staleTime,
    enabled,
    // Keep previous results visible while a new query is loading — eliminates
    // the skeleton flicker between "U" → "US" → "USD" → "USDC" keystrokes.
    placeholderData: keepPreviousData,
  });
}
