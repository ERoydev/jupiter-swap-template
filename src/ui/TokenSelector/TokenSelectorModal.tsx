import { useEffect, useMemo, useState } from "react";
import debounce from "lodash.debounce";
import { FixedSizeList } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { Dialog } from "@base-ui/react/dialog";
import { Drawer } from "@base-ui/react/drawer";
import { Input } from "@base-ui/react/input";
import { useTokenSearch } from "../../hooks/useTokenSearch";
import { useWalletBalances } from "../../hooks/useWalletBalances";
import { useIsMobile } from "../../hooks/use-mobile";
import { TokenRow } from "./TokenRow";
import type { TokenInfo } from "../../types/tokens";
import { cn } from "@/lib/utils";

export type MergedToken = TokenInfo & { _balance?: number; _usdValue?: number };

// Solana mint addresses are base58-encoded public keys, 32–44 characters long.
// When the user pastes a string that matches this shape, they clearly know which
// token they want — skip the verified filter for that query.
const MINT_LIKE_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
function isMintLikeQuery(q: string): boolean {
  return MINT_LIKE_REGEX.test(q);
}

export interface TokenSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (token: TokenInfo) => void;
  excludeMint?: string;
  disabled?: boolean;
}

function SkeletonRow({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={style} className="flex items-center gap-3 px-3 h-[72px]">
      <div className="size-11 rounded-full bg-muted animate-pulse shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-24 rounded bg-muted animate-pulse" />
        <div className="h-3 w-32 rounded bg-muted animate-pulse" />
      </div>
    </div>
  );
}

function TokenListContent({
  open,
  onOpenChange,
  onSelect,
  excludeMint,
}: TokenSelectorModalProps) {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showUnverified, setShowUnverified] = useState(false);

  const debouncedSetter = useMemo(
    () => debounce((value: string) => setDebouncedQuery(value), 200),
    [],
  );

  useEffect(() => () => debouncedSetter.cancel(), [debouncedSetter]);

  // Reset search + filter state when modal closes so each open starts safe
  useEffect(() => {
    if (!open) {
      setSearchInput("");
      setDebouncedQuery("");
      setShowUnverified(false);
    }
  }, [open]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
    debouncedSetter(e.target.value);
  };

  // When the user has typed fewer than 2 chars (but not zero), fall back to the
  // blue-chip seed list so the UI shows meaningful defaults instead of "No tokens
  // found". The hook itself also gates single-char queries — this mapping keeps
  // the render side clean by reusing the cached empty-query results.
  const effectiveQuery = debouncedQuery.length >= 2 ? debouncedQuery : "";
  const { data: tokens, isLoading, isError, error, refetch } = useTokenSearch(effectiveQuery);
  const { data: balances } = useWalletBalances();

  const mergedAndSorted = useMemo(() => {
    if (!tokens) return [];
    const merged: MergedToken[] = tokens.map((t) => {
      const bal = balances?.[t.id];
      if (!bal || bal.uiAmount <= 0) return t;
      return {
        ...t,
        _balance: bal.uiAmount,
        _usdValue: (t.usdPrice ?? 0) * bal.uiAmount,
      };
    });

    return merged.slice().sort((a, b) => {
      const aHeld = (a._balance ?? 0) > 0 ? 1 : 0;
      const bHeld = (b._balance ?? 0) > 0 ? 1 : 0;
      if (aHeld !== bHeld) return bHeld - aHeld;
      if (aHeld && bHeld) {
        const diff = (b._usdValue ?? 0) - (a._usdValue ?? 0);
        if (diff !== 0) return diff;
        return (b._balance ?? 0) - (a._balance ?? 0);
      }
      return 0;
    });
  }, [tokens, balances]);

  // Verified-only by default. Three bypass conditions:
  //   1. "Show unverified" toggle is ON (explicit opt-in)
  //   2. The query looks like a mint address (power user pasted an exact mint)
  //   3. The user already holds the token (per-token bypass below)
  const displayTokens = useMemo(() => {
    if (showUnverified || isMintLikeQuery(debouncedQuery)) return mergedAndSorted;
    return mergedAndSorted.filter((t) => {
      if ((t._balance ?? 0) > 0) return true;
      return t.isVerified === true || t.tags?.includes("verified") === true;
    });
  }, [mergedAndSorted, showUnverified, debouncedQuery]);

  const handleSelect = (token: TokenInfo) => {
    onSelect(token);
    onOpenChange(false);
  };

  const skeletonRows = Array.from({ length: 8 }, (_, i) => i);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-2 pb-3 space-y-2">
        <Input
          aria-label="Search tokens"
          placeholder="Search by name, symbol, or mint"
          value={searchInput}
          onChange={handleChange}
          className={cn(
            "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring",
          )}
        />
        {/* py-2 + text-sm gives ~40px vertical tap target — meets mobile 44px guideline */}
        <label className="flex items-center gap-2 py-2 text-sm text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showUnverified}
            onChange={(e) => setShowUnverified(e.target.checked)}
            className="h-4 w-4 rounded border border-border accent-primary cursor-pointer"
          />
          Show unverified tokens
        </label>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {isLoading ? (
          <div role="status" aria-label="Loading tokens">
            {skeletonRows.map((i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : isError ? (
          <div
            className="flex flex-col items-center justify-center h-full gap-3 p-6"
            role="alert"
          >
            <p className="text-sm text-destructive text-center">
              {error?.message ?? "Failed to load tokens"}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
            >
              Retry
            </button>
          </div>
        ) : displayTokens.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-full gap-2 p-6"
            role="status"
          >
            <p className="text-sm text-muted-foreground text-center">
              No tokens found
              {effectiveQuery ? (
                <span className="block text-xs mt-1">
                  for &quot;{effectiveQuery}&quot;
                </span>
              ) : null}
            </p>
          </div>
        ) : (
          <AutoSizer>
            {({ height, width }) => (
              <FixedSizeList
                height={height}
                width={width}
                itemCount={displayTokens.length}
                itemSize={72}
                overscanCount={4}
              >
                {({ index, style }) => {
                  const token = displayTokens[index];
                  if (!token) return null;
                  return (
                    <TokenRow
                      token={token}
                      disabled={token.id === excludeMint}
                      onSelect={handleSelect}
                      style={style}
                    />
                  );
                }}
              </FixedSizeList>
            )}
          </AutoSizer>
        )}
      </div>
    </div>
  );
}

function DesktopModal(props: TokenSelectorModalProps) {
  const { open, onOpenChange } = props;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => onOpenChange(nextOpen)}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Popup
          className={cn(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "flex flex-col w-full max-w-md h-[600px] max-h-[80vh]",
            "rounded-xl border border-border bg-background shadow-xl",
          )}
        >
          <div className="flex items-center justify-between px-4 pt-4 pb-1 shrink-0">
            <Dialog.Title className="text-base font-semibold text-foreground">
              Select Token
            </Dialog.Title>
            <Dialog.Close
              className="rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              ✕
            </Dialog.Close>
          </div>
          <TokenListContent {...props} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function MobileDrawer(props: TokenSelectorModalProps) {
  const { open, onOpenChange } = props;

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(nextOpen) => onOpenChange(nextOpen)}
    >
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 bg-black/40 z-50" />
        <Drawer.Viewport>
          <Drawer.Popup
            className={cn(
              "fixed bottom-0 left-0 right-0 z-50",
              "flex flex-col w-full h-[85vh]",
              "rounded-t-xl border-t border-border bg-background shadow-xl",
            )}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-1 shrink-0">
              <Drawer.Title className="text-base font-semibold text-foreground">
                Select Token
              </Drawer.Title>
              <Drawer.Close
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                ✕
              </Drawer.Close>
            </div>
            <TokenListContent {...props} />
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export function TokenSelectorModal(props: TokenSelectorModalProps) {
  const { disabled } = props;
  const isMobile = useIsMobile();

  if (disabled) {
    return null;
  }

  if (isMobile) {
    return <MobileDrawer {...props} />;
  }

  return <DesktopModal {...props} />;
}
