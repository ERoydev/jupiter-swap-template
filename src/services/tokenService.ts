import { jupiterClient } from "./jupiterClient";
import type { TokenInfo } from "../types/tokens";

// Max tokens to request from Jupiter's search endpoint.
// Jupiter's empty-query form returns its curated blue-chip list; the `limit`
// param requests up to N entries. Text searches rarely exceed 50 matches.
// Template consumers can tune this single constant to control picker density.
const SEARCH_LIMIT = 50;

function parseAudit(
  raw: Record<string, unknown>,
): TokenInfo["audit"] | undefined {
  const audit = raw["audit"];
  if (audit === null || typeof audit !== "object") {
    return undefined;
  }
  const a = audit as Record<string, unknown>;
  const result: NonNullable<TokenInfo["audit"]> = {};
  if (typeof a["mintAuthorityDisabled"] === "boolean") {
    result.mintAuthorityDisabled = a["mintAuthorityDisabled"];
  }
  if (typeof a["freezeAuthorityDisabled"] === "boolean") {
    result.freezeAuthorityDisabled = a["freezeAuthorityDisabled"];
  }
  if (typeof a["topHoldersPercentage"] === "number") {
    result.topHoldersPercentage = a["topHoldersPercentage"];
  }
  if (Object.keys(result).length === 0) {
    return undefined;
  }
  return result;
}

function parseTokenInfo(raw: Record<string, unknown>): TokenInfo {
  const token: TokenInfo = {
    id: raw["id"] as string,
    name: raw["name"] as string,
    symbol: raw["symbol"] as string,
    decimals: raw["decimals"] as number,
  };

  if (typeof raw["icon"] === "string") {
    token.icon = raw["icon"];
  }
  if (typeof raw["usdPrice"] === "number") {
    token.usdPrice = raw["usdPrice"];
  }
  if (typeof raw["liquidity"] === "number") {
    token.liquidity = raw["liquidity"];
  }
  if (typeof raw["isVerified"] === "boolean") {
    token.isVerified = raw["isVerified"];
  }
  if (Array.isArray(raw["tags"])) {
    token.tags = raw["tags"] as string[];
  }
  if (typeof raw["organicScore"] === "number") {
    token.organicScore = raw["organicScore"];
  }
  if (
    raw["organicScoreLabel"] === "high" ||
    raw["organicScoreLabel"] === "medium" ||
    raw["organicScoreLabel"] === "low"
  ) {
    token.organicScoreLabel = raw["organicScoreLabel"];
  }

  const audit = parseAudit(raw);
  if (audit !== undefined) {
    token.audit = audit;
  }

  return token;
}

export const tokenService = {
  async search(query: string, signal?: AbortSignal): Promise<TokenInfo[]> {
    const raw = await jupiterClient.get<Record<string, unknown>[]>(
      "/tokens/v2/search",
      { query, limit: SEARCH_LIMIT },
      signal,
    );
    return raw.map(parseTokenInfo);
  },
};
