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
