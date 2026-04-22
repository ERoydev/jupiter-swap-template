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

  const debouncedSetter = useMemo(
    () => debounce((value: string) => setDebouncedQuery(value), 200),
    [],
  );

  useEffect(() => () => debouncedSetter.cancel(), [debouncedSetter]);

  // Reset search when modal closes
  useEffect(() => {
    if (!open) {
      setSearchInput("");
      setDebouncedQuery("");
    }
  }, [open]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
    debouncedSetter(e.target.value);
  };

  const { data: tokens, isLoading, isError, error, refetch } = useTokenSearch(debouncedQuery);
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

  const handleSelect = (token: TokenInfo) => {
    onSelect(token);
    onOpenChange(false);
  };

  const skeletonRows = Array.from({ length: 8 }, (_, i) => i);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-2 pb-3">
        <Input
          aria-label="Search tokens"
          placeholder="Search by name, symbol, or mint"
          value={searchInput}
          onChange={handleChange}
          className={cn(
            "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring",
          )}
        />
      </div>

      <div className="flex-1 min-h-0">
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
        ) : mergedAndSorted.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-full gap-2 p-6"
            role="status"
          >
            <p className="text-sm text-muted-foreground text-center">
              No tokens found
              {debouncedQuery ? (
                <span className="block text-xs mt-1">
                  for &quot;{debouncedQuery}&quot;
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
                itemCount={mergedAndSorted.length}
                itemSize={72}
                overscanCount={4}
              >
                {({ index, style }) => {
                  const token = mergedAndSorted[index];
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
