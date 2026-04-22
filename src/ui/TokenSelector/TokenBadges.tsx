import { Badge } from "@/components/ui/badge";
import type { TokenInfo } from "../../types/tokens";

export interface TokenBadgesProps {
  token: TokenInfo;
}

export function TokenBadges({ token }: TokenBadgesProps) {
  const isVerified =
    token.isVerified === true || token.tags?.includes("verified");
  const isLst = token.tags?.includes("lst");
  const isToken2022 = token.tags?.includes("token2022");
  // freezeAuthorityDisabled: false means the authority exists → token CAN be frozen
  const isFrozen = token.audit?.freezeAuthorityDisabled === false;

  if (!isVerified && !isLst && !isToken2022 && !isFrozen) {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {isVerified && (
        <Badge variant="secondary" aria-label="Verified token">
          ✓ Verified
        </Badge>
      )}
      {isLst && (
        <Badge variant="secondary" aria-label="Liquid staking token">
          LST
        </Badge>
      )}
      {isToken2022 && (
        <Badge variant="secondary" aria-label="Token 2022">
          Token2022
        </Badge>
      )}
      {isFrozen && (
        <Badge variant="destructive" aria-label="Token has freeze authority">
          Frozen
        </Badge>
      )}
    </span>
  );
}
