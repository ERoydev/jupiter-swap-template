export interface TokenInfo {
  id: string;
  name: string;
  symbol: string;
  icon?: string;
  decimals: number;
  usdPrice?: number;
  liquidity?: number;
  isVerified?: boolean;
  tags?: string[];
  organicScore?: number;
  organicScoreLabel?: "high" | "medium" | "low";
  audit?: {
    mintAuthorityDisabled?: boolean;
    freezeAuthorityDisabled?: boolean;
    topHoldersPercentage?: number;
  };
}

export type BalanceMap = Record<
  string,
  { uiAmount: number; rawAmount: string; decimals: number }
>;
