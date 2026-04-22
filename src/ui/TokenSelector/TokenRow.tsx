import type React from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { TokenIcon } from "./TokenIcon";
import { TokenBadges } from "./TokenBadges";
import type { TokenInfo } from "../../types/tokens";

export type MergedToken = TokenInfo & { _balance?: number; _usdValue?: number };

export interface TokenRowProps {
  token: MergedToken;
  disabled: boolean;
  onSelect: (token: TokenInfo) => void;
  style: React.CSSProperties;
}

function formatBalance(amount: number): string {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

function formatUsd(amount: number): string {
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function RowContent({ token, disabled }: { token: MergedToken; disabled: boolean }) {
  const hasBalance =
    token._balance !== undefined && token._balance > 0;

  return (
    <div
      className={`flex items-center gap-3 w-full px-3 h-[72px] ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-muted/50"
      }`}
    >
      <TokenIcon token={token} size={44} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-foreground truncate">
            {token.symbol}
          </span>
          <TokenBadges token={token} />
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {token.name}
          <span className="ml-1 opacity-60">· {token.decimals}d</span>
        </div>
      </div>

      {hasBalance && (
        <div className="text-right shrink-0">
          <div className="text-sm font-medium text-foreground">
            {formatBalance(token._balance!)}
          </div>
          {token._usdValue !== undefined && token._usdValue > 0 && (
            <div className="text-xs text-muted-foreground">
              {formatUsd(token._usdValue)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TokenRow({ token, disabled, onSelect, style }: TokenRowProps) {
  const handleClick = () => {
    if (disabled) return;
    onSelect(token);
  };

  if (disabled) {
    return (
      <div style={style}>
        <Tooltip.Provider>
          <Tooltip.Root>
            <Tooltip.Trigger
              render={
                <div
                  role="option"
                  aria-disabled="true"
                  aria-selected={false}
                  tabIndex={0}
                  onClick={handleClick}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") handleClick();
                  }}
                />
              }
            >
              <RowContent token={token} disabled={disabled} />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner>
                <Tooltip.Popup className="rounded bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md">
                  Already selected as {token._balance !== undefined ? "output" : "input"}
                </Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
      </div>
    );
  }

  return (
    <div style={style}>
      <div
        role="option"
        aria-selected={false}
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleClick();
        }}
      >
        <RowContent token={token} disabled={disabled} />
      </div>
    </div>
  );
}
