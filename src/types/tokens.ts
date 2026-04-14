export interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

export interface TokenCache {
  verifiedTokens: TokenInfo[];
  searchResults: Map<string, TokenInfo[]>;
  lastFetched: number;
  ttl: number;
  maxSearchCacheEntries: number;
}

export interface PersistedSwapPreferences {
  inputMint: string | null;
  outputMint: string | null;
}
