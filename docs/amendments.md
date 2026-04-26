# Amendments

Implementation-time corrections to LOCKED architecture decisions. Each entry
records a contract drift that could not be avoided in the original story, the
reason it was necessary, and the code review finding that caught it.

---

## A-1 — 2026-04-20 — `OrderResponse.priceImpactPct` added

**Story:** 2-1 Jupiter Order Service + Quote Display
**Finding that caught it:** Code review #4 — priceImpactPct not in LOCKED contract
**Rule:** 3 (Significant — interface change)

**Original LOCKED contract (DD-2, story 2-1):**
```ts
OrderResponse {
  transaction: string | null;
  requestId: string;
  outAmount: string;
  router: string;
  mode: string;
  feeBps: number;
  feeMint: string;
}
```

**Amended contract:**
```ts
OrderResponse {
  transaction: string | null;
  requestId: string;
  outAmount: string;
  router: string;
  mode: string;
  feeBps: number;
  feeMint: string;
  priceImpactPct?: string;  // Optional — present on most Jupiter responses
}
```

**Why:**
AC-5 requires the `PriceImpactBadge` to color-code price impact against the
thresholds 100/500/1500 bps. `feeBps` measures protocol fee, not price impact —
the two quantities are unrelated. Jupiter's `/order` response returns
`priceImpactPct` as a percentage string (e.g. `"0.23"` for 0.23%); the UI must
consume that field to satisfy AC-5. The LOCKED contract omitted it.

**Defensive handling:**
The field is optional. When absent, `QuoteDisplay` renders an outline "N/A"
badge with `aria-label="Price impact unavailable"` — the UI must not silently
default a missing field to 0, which would imply a measured negligible impact.

**Files touched by this amendment:**
- `src/types/swap.ts:18` — field added
- `src/ui/QuoteDisplay.tsx:80-101` — explicit N/A fallback
- `src/ui/PriceImpactBadge.tsx` — consumes the parsed bps value

**Downstream impact:**
Any story that constructs an `OrderResponse` fixture must include
`priceImpactPct` if it wants the badge to render a bucket other than "N/A".

---

## A-2 — 2026-04-22 — DD-9 rewritten (hybrid fetch/cache → TanStack Query live search)

**Story:** 2-2 Token Service + Token Selector UI (pre-implementation)
**Finding that caught it:** User review of planned tokenService before starting Task 1 — original design over-engineered for a template
**Rule:** 3 (Significant — interface/contract change)

**Superseded LOCKED decision (DD-9):**
- Fetch ~100–200 verified tokens from Jupiter Token API on `initialize()`
- In-memory `TokenCache` with `verifiedTokens`, `searchResults` Map, `lastFetched`, `ttl`, `maxSearchCacheEntries` (500 LRU)
- Silent refresh on `visibilitychange` when TTL expires
- API fallback for unknown tokens

**Amended decision:**
- No `initialize()` call, no custom cache module. TanStack Query owns caching and request lifecycle.
- One endpoint: `GET /tokens/v2/search?query={input}`. Empty query returns the server-curated blue-chip list — no hardcoded seed array.
- `useTokenSearch(query)` hook wraps a single TanStack query with `queryKey: ['jupiter-search', query]`. staleTime: 5 min for `query === ''`, 30 s otherwise.
- Cancellation via TanStack's `signal`, plumbed into `jupiterClient.get` → `fetch`.
- No LRU, no TTL, no visibilitychange listener, no cross-session list persistence.

**Why:**
Grounding in [`jup-ag/plugin`](https://github.com/jup-ag/plugin) showed that a production Jupiter widget uses exactly this shape — one endpoint, TanStack Query, server-as-source-of-truth. The original LOCKED design reinvented caching that the data layer already provides. For a production-intent template, copying the real production pattern matters more than matching the initial assumption of "~100–200 verified tokens."

**Files affected (by new Story 2-2 implementation):**
- `src/services/jupiterClient.ts` (new)
- `src/services/tokenService.ts` (new, replaces planned `tokenService.initialize/searchLocal/search/refresh`)
- `src/hooks/useTokenSearch.ts` (new)
- `src/types/tokens.ts` (rewrite — remove `TokenCache`, slim/expand `TokenInfo`, add `BalanceMap`)
- `src/main.tsx` (add `QueryClientProvider`)

**Downstream impact:**
Story 4-2's `tokenService.test.ts` AC (currently "cache init, search, LRU eviction, refresh, persistence") must be replaced with ("empty-query blue-chip, text search, debounce collapse, request cancellation, key-based URL selection").

---

## A-3 — 2026-04-22 — DD-10 retired (localStorage persistence dropped)

**Story:** 2-2 Token Service + Token Selector UI (pre-implementation)
**Finding that caught it:** User review — conflict between `spec.md` (Out of Scope: "localStorage persistence — DD-10, DEFERRED") and `architecture.md` (DD-10 LOCKED). Resolved in favor of spec.
**Rule:** 3 (Significant — scope reduction)

**Superseded LOCKED decision (DD-10):**
- `PersistedSwapPreferences { inputMint, outputMint }` type
- localStorage key `jupiter-swap:preferences`
- Persist on every token selection; load on app mount before first render

**Amended decision:**
- No localStorage persistence of selected tokens. On every session start, defaults load from `DEFAULT_INPUT_MINT` (SOL) and `DEFAULT_OUTPUT_MINT` (USDC) constants in `src/config/constants.ts`.
- `PersistedSwapPreferences` type removed from `src/types/tokens.ts`.
- No `preferencesService` module is created.

**Why:**
Template consumers will fork and customize defaults anyway. Persisting across sessions adds schema-migration risk and localStorage-quota concerns for no material UX benefit in a template demo context. `spec.md` already marked this deferred; architecture had not caught up.

**Downstream impact:**
Old Story 2-2 AC-8 ("persisted tokens from localStorage pre-loaded") is removed by the Story 2-2 rewrite. No other story referenced this type.

---

## A-4 — 2026-04-22 — DD-13 rewritten (balanceService: RPC-primary → Ultra-primary with RPC fallback on SOL)

**Story:** 2-2 Token Service + Token Selector UI + Story 2-3 Balance Service (both pre-implementation)
**Finding that caught it:** User review — new Token Selector needs full balance map for display; duplicating RPC calls made no sense when Jupiter's Ultra endpoint returns everything in one call
**Rule:** 3 (Significant — interface change; one balance path across the app)

**Superseded LOCKED decision (DD-13):**
- `balanceService` uses `@solana/web3.js` `Connection` directly:
  - `getSolBalance(publicKey)` → `connection.getBalance(publicKey)`
  - `getTokenBalance(publicKey, mint)` → `connection.getTokenAccountBalance(...)`
- Used by Story 3-1 `preflightChecks` only.

**Amended decision:**
- Primary: `balanceService.getAllBalances(publicKey, signal?)` → `GET /ultra/v1/balances/{publicKey}` → `BalanceMap`
- Public API preserved for Story 3-1 consumers:
  - `getSolBalance(publicKey)` → calls `getAllBalances`; on Ultra error or timeout, falls back to `connection.getBalance(publicKey)` (RPC)
  - `getTokenBalance(publicKey, mint)` → calls `getAllBalances`; Ultra-only (RPC fallback for SPL would be N+1 calls)
- New hook `useWalletBalances()` (TanStack Query, staleTime 30 s) shares cache with the service for selector display.

**Why:**
Production templates benefit from a single balance path (Ultra) that's fast, batched, and Token2022-aware. The RPC fallback is deliberately narrow — only SOL, the most critical preflight check — so a Jupiter Ultra outage doesn't block users with sufficient SOL from preparing a swap. If Ultra is down, `/order` is probably impaired too, so full fallback parity gains little.

**Downstream impact:**
- Story 2-3 narrows — "SOL preflight warning" remains its domain; it no longer owns a separate RPC-only balance layer. Token-balance display for the selector lives in Story 2-2 via `useWalletBalances`.
- Story 3-1 `preflightChecks` calls remain unchanged (same public API); implementation now hits Ultra internally.

---

## A-5 — 2026-04-22 — "API key required on every Jupiter request" non-negotiable softened

**Story:** 2-2 Token Service + Token Selector UI (pre-implementation)
**Finding that caught it:** User plan adopted `jup-ag/plugin`'s lite-api fallback pattern for template dev UX
**Rule:** 3 (Significant — non-negotiable boundary amendment)

**Superseded Non-Negotiable Boundary (architecture.md §Goals & Constraints):**
- "API key required on every Jupiter request (x-api-key header)"

**Amended boundary:**
- API key required for **swap endpoints only** (`/swap/v2/order`, `/swap/v2/execute`).
- Read-only endpoints (`/tokens/v2/*`, `/ultra/v1/balances/*`) transparently fall back to `https://lite-api.jup.ag` (keyless free tier) when `VITE_JUPITER_API_KEY` is absent.
- `VITE_JUPITER_API_KEY` is now optional at dev/build time.
- `jupiterClient` enforces the gate: calls to `/swap/*` without a key throw `SwapError(ErrorType.ConfigError, "Jupiter API key required for swap execution. Get one at https://portal.jup.ag")` synchronously before any fetch.

**Why:**
Enables `git clone && npm run dev` to run out of the box for token browsing and balance display without forcing template consumers to sign up for a key before exploring. Swap execution still hard-requires a key — a production safety gate that forces explicit configuration before real money flows. This matches `jup-ag/plugin`'s production-tested model.

**Files affected:**
- `src/types/errors.ts` — add `ErrorType.ConfigError`
- `src/services/jupiterClient.ts` (new) — owns the per-path routing and key gate
- `src/config/env.ts` — `VITE_JUPITER_API_URL` changes to root (`https://api.jup.ag`); `VITE_JUPITER_API_KEY` no longer calls `requireEnv`, returns `""` when absent
- `.env.example` + README — document the lite-api fallback behavior and the key requirement for swap execution

**Downstream impact:**
- Story 2-1's `jupiterService.ts` is refactored to route through `jupiterClient` — previously made raw `fetch` calls with `requireEnv`-backed constants; now relies on `jupiterClient`'s gate for the `ConfigError` flow.
- Story 3-3's error recovery must treat `ConfigError` as non-retryable and non-dismissible (setup problem, not transient).

---

## A-5 — 2026-04-23 — Story 2-3 AC-3 dropped (proactive low-SOL Alert → Story 3-1 button state)

**Story:** 2-3 Balance Service + Proactive Warnings (pre-implementation)
**Finding that caught it:** User review — industry norm (Raydium, Uniswap, PancakeSwap, jup-ag/plugin) is a disabled Swap button with contextual text ("Insufficient SOL"), not a separate banner Alert. Dual surfaces are noisy and redundant.
**Rule:** 3 (Significant — scope narrowing; spec AC removed in favor of downstream story ownership)

**Superseded LOCKED decision (spec AC-U-4 + plan AC-3 of Story 2-3):**
- `SwapCard` renders a proactive warning Alert whenever `useWalletBalances` returns SOL `< 0.01` UI units: "You need at least 0.01 SOL for transaction fees."
- Appears as soon as balances load, independent of user interaction (amount entered, tokens picked, Swap clicked).

**Amended decision:**
- AC-3 (proactive low-SOL Alert) is REMOVED from Story 2-3.
- The insufficient-SOL signal is handled entirely by Story 3-1's pre-flight check: the Swap button becomes disabled with the label text "Insufficient SOL" (or equivalent) + Tooltip, per plan.md Story 3-1 AC-3.
- Story 2-3 retains only AC-5 — the fetch-failure overlay when both Ultra and RPC fail. That surface has no button-text equivalent (Retry + Proceed-Without-Verification are distinct actions needing their own UI).
- `MIN_SOL_BALANCE_UI = 0.01` (the new UI-units constant proposed in the story file) is NO LONGER added in 2-3. Story 3-1 decides its own unit convention when it implements the preflight check (may reuse existing `MIN_SOL_BALANCE` in lamports, or introduce a UI-units sibling — its choice).
- `useWalletBalances` return-type extension (`refetch` + `isFetching`) STAYS — still required for AC-5's Retry button.

**Why:**
Raydium/Uniswap/PancakeSwap/jup-ag/plugin all use a single disabled-button surface for insufficient-balance states. A separate Alert duplicates information the user will see at swap time anyway and adds noise to the pre-swap flow. The fetch-failure case (both Ultra+RPC unavailable) is genuinely different — it's an infra/connectivity signal with its own action affordances (retry, proceed without verification), which cannot be collapsed into a button label. Keeping AC-5 preserves that distinction.

**Files affected (vs. original story plan):**
- `src/ui/SolBalanceWarning.tsx` — scoped down to the fetch-failure overlay only (no low-balance branch).
- `src/config/constants.ts` — NO change (don't add `MIN_SOL_BALANCE_UI` in this story; Story 3-1 owns that decision).
- `src/hooks/useWalletBalances.ts` — still extended with `refetch` + `isFetching` passthrough.
- `src/App.tsx` — still mounts `<SolBalanceWarning />` (now a single-surface component).

**Downstream impact:**
- Story 3-1 must own the "Insufficient SOL" Swap-button state end to end. The existing plan AC (Story 3-1 AC-2 check #6 + AC-3) already covers this — no new 3-1 ACs needed.
- Feature-inventory coverage for FR-11 check 6 (SOL preflight) now maps entirely to Story 3-1, not 2-3. The Feature Completeness Audit at the end of the feature should still pass because 3-1 covers it.
- Renaming the story to "Balance Service Preflight Fetch-Failure Overlay" would be more accurate, but keeping the existing slug (`balance-service-proactive-warnings`) to avoid churning sprint-status.yaml / tags / commits. Story size S is preserved.

---

## A-6 — 2026-04-24 — Quote auto-refresh + manual refresh indicator (deferred from Story 4-1)

**Story:** Scope addition applied during Story 3-1 implementation — logically owned by Story 4-1 (UI polish). Implemented early at user request because the deferred-scope cost (users staring at stale prices) was more visible than expected.
**Finding that caught it:** User reported "Raydium constantly refreshes the price while I stay in the app — mine doesn't" mid-3-1. Feature was not in any story's scope.
**Rule:** 4 (Architectural — new behavior, new component, new config constant).

**What is added:**
1. **Auto-refresh interval** in `src/App.tsx` — refetches the Jupiter quote every `QUOTE_REFRESH_INTERVAL_MS` (10 s) while `state === QuoteReady` AND `document.visibilityState === "visible"`. Pauses on tab hide; refetches immediately on tab refocus via `visibilitychange` listener. Interval cleared on state transition, token change, amount clear, or unmount.
2. **Manual refresh control** — new `QuoteRefreshIndicator` component mounted in `SwapCard` header. Renders a refresh icon; click triggers immediate refetch. Disabled when no refetch is possible (`state !== QuoteReady && state !== LoadingQuote`). Subtle spin animation while `state === LoadingQuote`. Hidden entirely when `state === Idle` (no quote ever fetched).
3. **New constant** in `src/config/constants.ts`: `export const QUOTE_REFRESH_INTERVAL_MS = 10_000;`.

**Why necessary:**
- Jupiter quotes include a recent blockhash and a price snapshot; both drift quickly. Without auto-refresh the user can stare at a 2-minute-old quote and be surprised when execution fails or the effective rate shifts.
- The pre-existing stale-quote gate in `handleSwap` (`>30s`) catches this at click time but provides no visual signal during the wait. Industry standard (Raydium, Jupiter, Orca) is 10 s auto-refresh + manual-refresh affordance.
- Originally in scope for Story 4-1 ("responsive-layout polish, full Tooltip a11y spec, tap-target ≥44px sweep") — quote-refresh UI was assumed to fold into the polish sweep but was not explicitly listed. Making it explicit here.

**Downstream impact:**
- **Story 4-1 scope note:** Quote refresh indicator is considered implemented via this amendment; Story 4-1 remains responsible only for the visual polish pass (e.g., countdown ring animation if desired, hover states, focus-visible ring parity with other controls).
- **Preflight timing:** The debounced preflight effect (Story 3-1 Task 4) remains unchanged. Auto-refresh triggers `fetchQuote`, which flips state to `LoadingQuote → QuoteReady`; the preflight effect is keyed on amount/token/wallet, not on `quoteFetchedAt`, so it does not spuriously re-run on quote refresh. Verified: the dependency array is `[connected, publicKey, inputAmount, inputToken.id, inputToken.decimals, inputToken.symbol, outputToken.id]`.
- **Stale-quote gate preserved:** Click-time `>30s` check in `handleSwap` remains as a last-resort guard in case auto-refresh is starved (network errors, prolonged tab-hidden sleep, etc.).
- **Testing:** Component unit tests cover click behavior + disabled states + icon animation class. Interval behavior is not unit-tested (timer-based effects are fragile to mock); covered by manual verification.

**Files affected:**
- `src/config/constants.ts` — add `QUOTE_REFRESH_INTERVAL_MS`.
- `src/App.tsx` — import the new constant, add the auto-refresh `useEffect`, mount `<QuoteRefreshIndicator>` in the SwapCard header.
- `src/ui/QuoteRefreshIndicator.tsx` — new component.
- `src/ui/QuoteRefreshIndicator.test.tsx` — new test file.

**Not included (deferred to Story 4-1 if wanted):**
- Animated SVG countdown ring surrounding the refresh icon (cosmetic; adds ~40 lines of SVG + CSS-animation logic).
- Keyboard shortcut (e.g., `Cmd+R` intercept) to trigger manual refresh.
- Configurable refresh interval per-user or per-token-pair.

**Follow-on — stale-while-revalidate display gate (applied 2026-04-24, same amendment):**
During an auto-refresh (or any `FETCH_QUOTE` from `QuoteReady`), the reducer transitions `state: QuoteReady → LoadingQuote` but preserves `context.quote` in memory (`swapReducer.ts:89-91`, verified). The original `hasQuote` gate in `src/App.tsx` was:
```ts
const hasQuote =
    context.state === SwapState.QuoteReady && context.quote !== null;
```
This caused a visible "0.00 / skeleton" flash during every 10 s auto-refresh because `hasQuote` flipped false while the old quote was still valid in state. Widened the gate to preserve the display while a refetch is in flight:
```ts
const hasQuote =
    context.quote !== null &&
    (context.state === SwapState.QuoteReady ||
     context.state === SwapState.LoadingQuote);
```
**Behavioral side effect:** when the user types a new amount (triggering `FETCH_QUOTE` from `QuoteReady`), the previously-displayed quote now remains visible for ~500 ms until the new one arrives, instead of blanking to `"0.00"`. This matches Jupiter / Raydium / Orca stale-while-revalidate UX. First-ever quote load (state is `LoadingQuote` but `context.quote === null`) is unchanged — gate still evaluates false, empty state still shows.
**No reducer change** — the fix lives entirely in the consuming component's render gate. `swapReducer.ts` remains a closed contract.

**Sub-fix (same day):** With the `hasQuote` gate widened, the separate skeleton block at `src/App.tsx` (`{isLoading && (...)}`) began rendering *alongside* the preserved QuoteDisplay during refresh — producing two grey pulse bars above the real metadata. Tightened the skeleton condition to only show on first-ever load: `{isLoading && context.quote === null && (...)}`. Skeleton still appears when no quote is cached yet; suppressed on all subsequent refreshes because `context.quote` now holds the last good value.

---

## A-7 — 2026-04-24 — User-controlled slippage tolerance (Story 4-3)

**Story:** 4-3 User-Controlled Slippage Tolerance (new, added to wave 4 alongside 4-1 UI polish).
**Finding that caught it:** User review of `QuoteDisplay.tsx` — the displayed "0.5% (auto)" slippage was a hardcoded value from `DEFAULT_SLIPPAGE_BPS`, not the value Jupiter actually used. Jupiter's `/swap/v2/order` response returns `slippageBps` that the current `OrderResponse` type does not model.
**Rule:** 3 (Significant — contract changes to `OrderResponse` and `getOrder` signature).

**Original LOCKED contracts (story 2-1, DD-2):**
```ts
// src/types/swap.ts
export interface OrderResponse {
  transaction: string | null;
  requestId: string;
  outAmount: string;
  router: string;
  mode: string;
  feeBps: number;
  feeMint: string;
  priceImpactPct?: string;   // added in A-1
}

// src/services/jupiterService.ts
export async function getOrder(
  params: { inputMint: string; outputMint: string; amount: string; taker?: string },
  signal?: AbortSignal,
): Promise<OrderResponse>
```

**Amended contracts (this amendment):**
```ts
// src/types/swap.ts
export interface OrderResponse {
  transaction: string | null;
  requestId: string;
  outAmount: string;
  router: string;
  mode: string;
  feeBps: number;
  feeMint: string;
  priceImpactPct?: string;
  slippageBps?: number;      // ← NEW. Echoed from Jupiter's /order response.
}

// src/services/jupiterService.ts
export async function getOrder(
  params: {
    inputMint: string;
    outputMint: string;
    amount: string;
    taker?: string;
    slippageBps?: number;    // ← NEW. When provided, sent as a query param.
  },
  signal?: AbortSignal,
): Promise<OrderResponse>
```

**Why necessary:**
1. **Display accuracy.** `QuoteDisplay` currently shows `DEFAULT_SLIPPAGE_BPS / 100 = 0.5%` with an `(auto)` suffix. This is misleading — Jupiter omits `slippageBps` in the request today, triggering its dynamic-slippage path, which may pick 0.3% / 1% / 2% based on market conditions. The UI always says 0.5% regardless of reality.
2. **User agency.** Every major Solana swap UI (Jupiter, Raydium, Orca, Phoenix, Drift) exposes slippage as a user control. Swapping volatile / low-liquidity tokens at a hardcoded 0.5% produces reverts that the user cannot remediate without editing code.
3. **Contract addition only, no breaking change.** Both new fields are optional. All existing call sites continue to work without modification.

**Decisions (locked per user selection 2026-04-24):**
- Default slippage on first mount: **0.5%** (50 bps). Industry default.
- No "Auto" option in v1 — all preset buttons and Custom send explicit `slippageBps`. Simplifies UX; users who want dynamic slippage need a story-follow-on.
- No `localStorage` persistence in v1 — each page load starts at the default.

**Downstream impact:**
- **`QuoteDisplay` accuracy fix (this story, not a later polish):** read `quote.slippageBps` from the API response, drop the hardcoded `DEFAULT_SLIPPAGE_BPS / 100` path, drop the `(auto)` suffix. Falls back to the user-selected value if the response field is missing (defensive — Jupiter always returns it, but the type marks it optional).
- **Re-fetch on slippage change:** adding `slippageBps` to the `fetchQuote` dep array (and to the auto-refresh effect from A-6) so any user-initiated slippage change triggers an immediate new `/order` request. No debounce — slippage changes are deliberate single clicks.
- **Auto-refresh interaction (A-6):** when `slippageBps` changes, the auto-refresh effect's dependency changes, tearing down and re-establishing the 10-s interval with the new value. Confirmed safe.
- **Story 4-1 (UI polish) scope adjustment:** the original 4-1 scope included a11y and responsive sweep; with slippage added to the card, 4-1 must now include slippage-control a11y (preset active state, `aria-pressed`, keyboard navigation across the four buttons, custom-input validation announcement). No rewrite needed, just extended coverage.
- **Testing:** unit tests for `SlippageSelector` (preset click, active state, custom input validation), integration tests in `App.test.tsx` (re-fetch on change), type-level assertion on the new `slippageBps?` field in `getOrder`.

**Files affected:**
- `src/types/swap.ts` — extend `OrderResponse`.
- `src/services/jupiterService.ts` — extend `getOrder` params + query construction.
- `src/services/jupiterService.test.ts` — add case asserting `slippageBps` is sent as query param when provided; omitted when undefined.
- `src/ui/SlippageSelector.tsx` — new component.
- `src/ui/SlippageSelector.test.tsx` — new test file.
- `src/ui/QuoteDisplay.tsx` — read from `quote.slippageBps`, drop hardcoded constant, drop `(auto)` suffix.
- `src/ui/QuoteDisplay.test.tsx` — update assertions for the new display source.
- `src/App.tsx` — local `slippageBps` state, mount `<SlippageSelector>` between amount rows and Swap button, pass through `fetchQuote`, add to effect deps.
- `src/App.test.tsx` — integration case: changing slippage triggers re-fetch.
- `src/config/constants.ts` — retain `DEFAULT_SLIPPAGE_BPS = 50` for initial state; no renames.

**Not included (deferred):**
- `[Auto]` fifth button that omits `slippageBps` from the request (falls back to Jupiter dynamic). Story-follow-on if a user asks for it.
- `localStorage` persistence of last-used slippage. Story-follow-on.
- Warning banner when user picks slippage >5% ("You're accepting unusually high slippage — are you sure?"). Story-follow-on.
- Contextual default (e.g., auto-switch to 1% for low-liquidity output tokens). Story-follow-on, would need a token-metadata signal.

---

## A-8 — 2026-04-24 — Preflight check 7 wSOL-mint aliasing (Story 3-1 bug fix)

**Story:** 3-1 Pre-flight Checks + Transaction Signing.
**Finding that caught it:** Manual verification by the user — funded wallet with 0.11598 SOL and attempted SOL → USDC swap, received "Insufficient SOL balance" despite ample balance. Diagnosed live: check 7 returns 0 when `inputMint` is the wrapped-SOL mint because `balanceService` keys native SOL as `"SOL"` (string) while `getTokenBalance` does a mint-address key lookup.
**Rule:** 2 (Moderate — wrong pattern for the SOL special case).

**Root cause:**
- `BalanceMap` (set by `src/services/balanceService.ts:88` — "native SOL is `\"SOL\"`") stores native SOL under the literal key `"SOL"` and all SPL tokens under their mint address.
- `balanceService.getSolBalance()` knows this — reads `balances["SOL"]`.
- `balanceService.getTokenBalance(publicKey, mint)` is generic — reads `balances[mint]`. Passing the wrapped-SOL mint (`So11111111111111111111111111111111111111112`) misses the native-SOL entry → returns 0.
- Preflight check 7 (`src/handlers/preflightChecks.ts`) calls `getTokenBalance` with whatever `params.inputMint` is. For any SOL → X swap, `params.inputMint` is the wSOL mint → check 7 falsely fails with `InsufficientBalance`.

**Why the tests missed it:** `preflightChecks.test.ts` mocks `balanceService.getTokenBalance` with `vi.mocked(...).mockResolvedValueOnce(value)` — never exercises the real Ultra-response-driven balance map. Integration against live Jupiter Ultra was the first time the mismatch surfaced.

**Fix (this amendment):**

Special-case the wrapped-SOL mint inside preflight check 7. When `params.inputMint === WRAPPED_SOL_MINT`, call `balanceService.getSolBalance(wallet.publicKey)` instead of `balanceService.getTokenBalance(...)`:

```ts
// src/handlers/preflightChecks.ts — inside check 7 (sketch)
const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";

const inputBalanceUi = params.inputMint === WRAPPED_SOL_MINT
    ? await balanceService.getSolBalance(wallet.publicKey)
    : await balanceService.getTokenBalance(wallet.publicKey, params.inputMint);

if (inputBalanceUi < amountUi) {
    throw new SwapError(
        ErrorType.InsufficientBalance,
        `Insufficient ${params.inputSymbol} balance`,
        undefined,
        false,
        { walletAddress: wallet.publicKey.toBase58(), mint: params.inputMint },
    );
}
```

**Why in the handler, not in `balanceService`:**
- `src/services/balanceService.ts` is on Story 3-1's `DO NOT modify` list (closed contract from 2-3). Promoting the alias there requires a Rule 4 amendment and a broader change.
- The handler-layer fix is localized to Story 3-1's own file and does not touch closed contracts.
- A follow-on story (likely 4-x polish or a dedicated services cleanup) should promote the alias into `balanceService.getTokenBalance` itself so every caller benefits. Logged as follow-up below.

**Constant choice:** use a file-local `WRAPPED_SOL_MINT` constant. The value matches `DEFAULT_INPUT_MINT` in `src/config/constants.ts`; a future refactor can consolidate the two. Avoided importing `DEFAULT_INPUT_MINT` here to keep the semantic crystal-clear — this is the *wrapped-SOL mint* (an immutable Solana facts), not "the default input token" (a UX choice).

**Test additions:**
- `src/handlers/preflightChecks.test.ts` — new regression case: inputMint = wSOL mint, wallet holds sufficient SOL, `getSolBalance` is mocked, `getTokenBalance` is NOT called (assert via `vi.mocked(balanceService.getTokenBalance).not.toHaveBeenCalled()`). Check 7 passes.
- Companion case: inputMint = wSOL mint, wallet's SOL < amount → check 7 throws InsufficientBalance with the expected message. Asserts `getSolBalance` was called, `getTokenBalance` was not.

**Downstream impact:**
- **AC-3-1-2 check 7 semantics preserved** — still throws `InsufficientBalance` when the wallet can't afford the swap amount. Only the resolution path for native SOL changed.
- **No reducer change, no component change, no contract change.** Handler-local fix only.
- **Story 3-1 manual verification steps 1-10 can now be run end-to-end** — specifically step 4 (SOL → USDC swap attempt with funded wallet) which was blocked by this bug.

**Files affected:**
- `src/handlers/preflightChecks.ts` — add `WRAPPED_SOL_MINT` constant, alias check 7's balance lookup.
- `src/handlers/preflightChecks.test.ts` — add two regression cases.

**Follow-up (separate story, NOT this amendment):**
- Promote the wSOL alias into `balanceService.getTokenBalance` so it returns native SOL for the wSOL mint automatically. Would let every consumer (preflight, fee estimator, any future handler) benefit without each one duplicating the special case. File this as a concerns.md item or a short CS story after 3-1 closes.

> **Resolved by A-9 (2026-04-24).** The follow-up above is now closed — the alias lives at the service layer.

---

## A-9 — 2026-04-24 — wSOL alias moved to `balanceService.getTokenBalance` (post-3-1 review)

**Story:** 3-1 Pre-flight Checks + Transaction Signing (post-merge review).
**Finding that caught it:** Code review of PR #1 — "Value-key invariant belongs in balanceService, not preflight. A-8's wSOL alias is a caller-side patch for an invariant that balanceService owns. Every future caller will have to repeat this special case. Would also have caught the bug at the service layer's test."
**Rule:** 3 (Significant — interface/contract change on a closed contract).

**Original (A-8) LOCKED behavior:**
- `balanceService.getTokenBalance(publicKey, wSOL_mint)` → returns `0` (the wSOL mint is not a key in Ultra's `BalanceMap`; native SOL sits under the literal key `"SOL"`).
- Preflight check 7 works around this with a caller-side branch on `params.inputMint === WRAPPED_SOL_MINT`.

**Amended behavior:**
- `balanceService.getTokenBalance(publicKey, wSOL_mint)` → transparently delegates to `balanceService.getSolBalance(publicKey)`.
- Preflight check 7 drops the special case; the handler now calls `getTokenBalance` uniformly for every input mint.

```ts
// src/services/balanceService.ts — getTokenBalance
async getTokenBalance(publicKey, mint, signal?) {
    // A-9: the wSOL mint doesn't appear in Ultra's BalanceMap — native SOL
    // lives under the literal "SOL" key. Alias at the service layer so no
    // caller has to know about this invariant.
    if (mint === WRAPPED_SOL_MINT) {
        return balanceService.getSolBalance(publicKey, signal);
    }
    const balances = await balanceService.getAllBalances(publicKey, signal);
    const entry = balances[mint];
    return entry !== undefined ? entry.uiAmount : 0;
}
```

**Why now (not a later polish):**
1. **The invariant belongs to the service.** A-8 lived in the handler because the service was on 3-1's "do not modify" list. Now that 3-1 is closed and PR #1 is open, promoting the alias is the right structural fix — future callers (fee estimator in 3-2, retry logic in 3-3) inherit correctness for free.
2. **Test coverage moves with the code.** A-8's regression tests lived in `preflightChecks.test.ts` and mocked `balanceService` entirely — they asserted preflight's branching logic, not the service's actual behavior. A-9 adds tests at the service layer that would have caught the original bug directly (happy path + RPC fallback for wSOL mint).
3. **Removes duplication risk.** Any handler that reads a user-supplied mint (preflight, fee estimator, slippage sanity-check, balance-warning banner) would otherwise need to re-implement the alias. A-9 eliminates the pattern at the source.

**Downstream impact:**
- **`src/handlers/preflightChecks.ts`:** remove the `WRAPPED_SOL_MINT` constant and the ternary branch in check 7. Check 7 becomes a single uniform `getTokenBalance` call.
- **`src/handlers/preflightChecks.test.ts`:** remove the 3 A-8-specific tests (they tested handler-level aliasing that no longer exists). Update the happy-path test and the check-6 boundary test to reflect uniform `getTokenBalance` usage.
- **`src/services/balanceService.test.ts`:** add wSOL-alias tests — happy path (Ultra) and RPC fallback (Ultra down).
- **No UI, state, or contract change.** The `BalanceMap` shape, `getSolBalance` contract, and preflight semantics are unchanged.

**Why safe to change a closed contract:**
`getTokenBalance` is called in exactly one place today (`preflightChecks.ts` check 7). Passing the wSOL mint previously returned `0` (buggy); now it returns the correct balance. No caller that relied on the old broken behavior exists — A-8 documented the bug, and the current preflight branch was the workaround being unwound.

**Files affected:**
- `src/services/balanceService.ts` — alias wSOL mint in `getTokenBalance`.
- `src/services/balanceService.test.ts` — 2 new cases.
- `src/handlers/preflightChecks.ts` — drop `WRAPPED_SOL_MINT` constant, drop check-7 ternary.
- `src/handlers/preflightChecks.test.ts` — remove 3 handler-level aliasing tests, update 2 existing tests to match simplified flow.
- `docs/amendments.md` — this entry (closes the A-8 follow-up).

## A-10 — 2026-04-26 — `executeOrder` return type tightened (`Promise<unknown>` → `Promise<ExecuteResponse>`) (Story 3-2)

**Original contract** (Story 2-1, `src/services/jupiterService.ts:62-68`):

```ts
export async function executeOrder(
  signedTx: string,
  requestId: string,
  signal?: AbortSignal,
): Promise<unknown> {
  return jupiterClient.post("/swap/v2/execute", { signedTransaction: signedTx, requestId }, signal);
}
```

**Amended contract** (Story 3-2, Task 1):

```ts
export async function executeOrder(
  signedTx: string,
  requestId: string,
  signal?: AbortSignal,
): Promise<ExecuteResponse> {
  return jupiterClient.post<ExecuteResponse>(
    "/swap/v2/execute",
    { signedTransaction: signedTx, requestId },
    signal,
  );
}
```

**Why now:** Story 3-2 wires the `/execute` response into `SwapCard.handleSwap` and needs to read `status`, `code`, `signature`, `inputAmountResult`, and `outputAmountResult` to dispatch `EXECUTE_SUCCESS` / `EXECUTE_ERROR`. The `unknown` return type was a placeholder from 2-1 (when no consumer existed) and would force every caller to assert/cast at the call site. Tightening at the service layer is a one-line change with zero behavioral impact.

**Why safe (Rule 3 per code-standards):**
- The runtime payload was already an `ExecuteResponse` — the amendment is type-only.
- `executeOrder` had **zero call sites** before 3-2 (verified: no imports of `executeOrder` in `src/`). No caller that asserted/narrowed `unknown` exists to break.
- `jupiterClient.post<T>` already supports the generic; this just applies the `T` the caller would have asserted anyway.

**Architecture alignment:** matches `docs/architecture.md` §Data Models and §API Contracts where `/execute` is documented to return `ExecuteResponse`.

**Files affected:**
- `src/services/jupiterService.ts` — return type tightened, `ExecuteResponse` import added.
- `src/services/jupiterService.test.ts` — 3 new cases under `describe("jupiterService.executeOrder", ...)` covering POST contract, success-path return shape, and synchronous `ConfigError` when `VITE_JUPITER_API_KEY` is empty.
- No downstream consumers exist yet — this amendment lands the type at the same time as Story 3-2 introduces the first call site (Task 4).
