import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
    ConnectionProvider,
    WalletProvider,
} from "@solana/wallet-adapter-react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
    WalletModalProvider,
    useWalletModal,
} from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { Button } from "@/components/ui/button";
import { WalletButton } from "./ui/WalletButton";
import { QuoteDisplay } from "./ui/QuoteDisplay";
import { TokenSelectorModal } from "./ui/TokenSelector";
import { useSwapState } from "./state/useSwapState";
import { getOrder } from "./services/jupiterService";
import { prefetchBlueChipTokens } from "./hooks/useTokenSearch";
import { SwapState } from "./state/swapState";
import { ErrorType, SwapError } from "./types/errors";
import { SOLANA_RPC_URL } from "./config/env";
import {
    DEFAULT_INPUT_TOKEN,
    DEFAULT_OUTPUT_TOKEN,
} from "./config/constants";
import type { TokenInfo } from "./types/tokens";

import "@solana/wallet-adapter-react-ui/styles.css";

const DEBOUNCE_MS = 300;

export function SwapCard() {
    const { publicKey, connected } = useWallet();
    const { setVisible: setWalletModalVisible } = useWalletModal();
    const { context, dispatch } = useSwapState();
    const [inputAmount, setInputAmount] = useState("");
    const abortControllerRef = useRef<AbortController | null>(null);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [inputToken, setInputToken] = useState<TokenInfo>(DEFAULT_INPUT_TOKEN);
    const [outputToken, setOutputToken] = useState<TokenInfo>(DEFAULT_OUTPUT_TOKEN);
    const [selectorSide, setSelectorSide] = useState<"input" | "output" | null>(null);
    const selectorOpen = selectorSide !== null;

    // Warm Jupiter's blue-chip token list into TanStack's cache on mount so the
    // first time the user opens the selector, tokens appear instantly instead
    // of briefly showing skeleton rows.
    const queryClient = useQueryClient();
    useEffect(() => {
        void prefetchBlueChipTokens(queryClient);
    }, [queryClient]);

    const fetchQuote = useCallback(
        async (amount: string) => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            const controller = new AbortController();
            abortControllerRef.current = controller;

            dispatch({ type: "FETCH_QUOTE" });

            try {
                const quote = await getOrder(
                    {
                        inputMint: inputToken.id,
                        outputMint: outputToken.id,
                        amount,
                        taker:
                            connected && publicKey
                                ? publicKey.toBase58()
                                : undefined,
                    },
                    controller.signal,
                );
                if (controller !== abortControllerRef.current) {
                    return; // Stale response (timeout aborted or superseded)
                }
                dispatch({
                    type: "QUOTE_RECEIVED",
                    quote,
                    fetchedAt: Date.now(),
                });
            } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") {
                    return; // Cancelled — ignore
                }
                if (controller !== abortControllerRef.current) {
                    return; // Stale error (another fetch has superseded)
                }
                if (err instanceof SwapError) {
                    dispatch({ type: "QUOTE_ERROR", error: err });
                } else {
                    dispatch({
                        type: "QUOTE_ERROR",
                        error: new SwapError(
                            ErrorType.NetworkError,
                            "Failed to fetch quote. Check your connection.",
                        ),
                    });
                }
            }
        },
        [connected, publicKey, dispatch, inputToken.id, outputToken.id],
    );

    // Abort in-flight fetch when a TIMEOUT (or any error) transitions us to Error state
    useEffect(() => {
        if (context.state === SwapState.Error && abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    }, [context.state]);

    // Refetch immediately when tokens change (if amount is already set).
    // Uses the CURRENT selected input token's decimals — not a hardcoded value —
    // so picking BONK (5 decimals) produces correct lamports, not SOL-scaled lamports.
    useEffect(() => {
        if (!inputAmount || parseFloat(inputAmount) <= 0) return;
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        const lamports = Math.floor(
            parseFloat(inputAmount) * 10 ** inputToken.decimals,
        ).toString();
        fetchQuote(lamports);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inputToken.id, outputToken.id, inputToken.decimals]); // intentionally omit inputAmount + fetchQuote to avoid loops

    const handleAmountChange = useCallback(
        (value: string) => {
            setInputAmount(value);

            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }

            const parsed = parseFloat(value);
            if (!value || isNaN(parsed) || parsed <= 0) {
                return;
            }

            // Convert to lamports (smallest unit) using the SELECTED input token's decimals
            const lamports = Math.floor(
                parsed * 10 ** inputToken.decimals,
            ).toString();

            debounceTimerRef.current = setTimeout(() => {
                fetchQuote(lamports);
            }, DEBOUNCE_MS);
        },
        [fetchQuote, inputToken.decimals],
    );

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, []);

    const isLoading = context.state === SwapState.LoadingQuote;
    const hasQuote =
        context.state === SwapState.QuoteReady && context.quote !== null;
    const hasError = context.state === SwapState.Error;

    return (
        <div className="w-full max-w-[420px] rounded-lg border border-border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-semibold text-foreground">Swap</h1>
                <WalletButton />
            </div>

            {/* Input amount */}
            <div className="border border-border rounded-lg p-3">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                        You pay
                    </span>
                    <Button
                        variant="outline"
                        aria-label="Select input token"
                        onClick={() => setSelectorSide("input")}
                        className="text-sm font-medium h-auto py-1 px-2"
                    >
                        From: {inputToken.symbol}
                    </Button>
                </div>
                <input
                    type="text"
                    inputMode="decimal"
                    value={inputAmount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-transparent text-xl font-medium text-foreground outline-none placeholder:text-muted-foreground mt-1"
                    aria-label={`Amount of ${inputToken.symbol} to swap`}
                />
            </div>

            {/* Output display */}
            <div className="border border-border rounded-lg p-3">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                        You receive
                    </span>
                    <Button
                        variant="outline"
                        aria-label="Select output token"
                        onClick={() => setSelectorSide("output")}
                        className="text-sm font-medium h-auto py-1 px-2"
                    >
                        To: {outputToken.symbol}
                    </Button>
                </div>
                <div className="text-xl font-medium text-muted-foreground mt-1">
                    {hasQuote && context.quote
                        ? (
                              Number(context.quote.outAmount) /
                              10 ** outputToken.decimals
                          ).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 4,
                          })
                        : "0.00"}
                </div>
            </div>

            {/* Loading state */}
            {isLoading && (
                <div
                    className="space-y-2"
                    role="status"
                    aria-label="Loading quote"
                >
                    <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
                    <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
                </div>
            )}

            {/* Quote details */}
            {hasQuote && context.quote && (
                <QuoteDisplay
                    quote={context.quote}
                    inputSymbol={inputToken.symbol}
                    outputSymbol={outputToken.symbol}
                    inputAmount={Math.floor(
                        parseFloat(inputAmount || "0") *
                            10 ** inputToken.decimals,
                    ).toString()}
                    inputDecimals={inputToken.decimals}
                    outputDecimals={outputToken.decimals}
                    quoteFetchedAt={context.quoteFetchedAt}
                />
            )}

            {/* Error state */}
            {hasError && context.error && (
                <div
                    className="rounded-lg border border-destructive bg-destructive/10 p-3"
                    role="alert"
                >
                    <p className="text-sm text-destructive font-medium">
                        {context.error.message}
                    </p>
                    <button
                        onClick={() => dispatch({ type: "DISMISS" })}
                        className="text-xs text-muted-foreground underline mt-1"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Swap / Connect button */}
            {!connected ? (
                <Button
                    type="button"
                    size="lg"
                    className="w-full py-3 text-sm font-medium"
                    onClick={() => setWalletModalVisible(true)}
                    aria-label="Connect Wallet"
                >
                    Connect Wallet
                </Button>
            ) : (
                <button
                    disabled={!hasQuote}
                    className="w-full rounded-md bg-primary text-primary-foreground py-3 text-sm font-medium disabled:opacity-50"
                    aria-label="Swap tokens"
                >
                    Swap
                </button>
            )}

            {/* Token selector modal — single instance, side switches via selectorSide state */}
            <TokenSelectorModal
                open={selectorOpen}
                onOpenChange={(open) => !open && setSelectorSide(null)}
                onSelect={(token) => {
                    if (selectorSide === "input") setInputToken(token);
                    else if (selectorSide === "output") setOutputToken(token);
                    setSelectorSide(null);
                }}
                excludeMint={selectorSide === "input" ? outputToken.id : inputToken.id}
            />
        </div>
    );
}

export function App() {
    const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

    return (
        <ConnectionProvider endpoint={SOLANA_RPC_URL}>
            <WalletProvider wallets={wallets} autoConnect={false}>
                <WalletModalProvider>
                    <div className="min-h-screen bg-background flex items-center justify-center p-4">
                        <SwapCard />
                    </div>
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
}
