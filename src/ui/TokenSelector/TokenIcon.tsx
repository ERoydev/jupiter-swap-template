import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { getTokenIconUrl } from "../../lib/tokenIcon";
import type { TokenInfo } from "../../types/tokens";

export interface TokenIconProps {
  token: TokenInfo;
  size?: number;
}

// Only accept HTTPS icon URLs. Mixed-content (http://) would break in production
// SPAs served over HTTPS, and javascript:/data: URIs — while harmless as <img src>
// in browsers — have no business in a token registry. Skip straight to the SVG
// fallback for anything else.
function isSafeIconUrl(url: string | undefined): url is string {
  return typeof url === "string" && url.startsWith("https://");
}

export function TokenIcon({ token, size = 56 }: TokenIconProps) {
  const hasSafeIcon = isSafeIconUrl(token.icon);
  const [tier, setTier] = useState<0 | 1 | 2>(hasSafeIcon ? 0 : 2);

  const showUnverifiedWarning =
    token.isVerified === false &&
    !token.tags?.includes("strict") &&
    !token.tags?.includes("community");

  const letter = token.symbol.charAt(0).toUpperCase();

  const svgFallback = (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label={`${token.symbol} icon`}
      role="img"
    >
      <circle cx={size / 2} cy={size / 2} r={size / 2} fill="currentColor" className="text-muted" />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size * 0.4}
        fill="currentColor"
        className="text-muted-foreground"
      >
        {letter}
      </text>
    </svg>
  );

  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {tier < 2 ? (
        <img
          src={
            tier === 0
              ? (getTokenIconUrl(token.icon, size) ?? token.icon)
              : token.icon
          }
          alt={`${token.symbol} icon`}
          width={size}
          height={size}
          className="rounded-full object-cover"
          style={{ width: size, height: size }}
          onError={() => {
            if (tier === 0) {
              setTier(1);
            } else {
              setTier(2);
            }
          }}
        />
      ) : (
        svgFallback
      )}
      {showUnverifiedWarning && (
        <span
          className="absolute bottom-0 right-0 flex items-center justify-center rounded-full bg-background"
          style={{ width: size * 0.35, height: size * 0.35 }}
          aria-label="Unverified token — caution"
        >
          <AlertTriangle
            className="text-yellow-500"
            style={{ width: size * 0.25, height: size * 0.25 }}
            aria-hidden="true"
          />
        </span>
      )}
    </span>
  );
}
