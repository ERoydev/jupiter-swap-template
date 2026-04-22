---
id: "2-2-token-service-token-selector"
status: ready
created: 2026-04-22
supersedes: 2026-04-20 draft (DD-9 hybrid-cache model)
---

# Story: Token Service + Token Selector UI

## User Story
As a swap end user, I want to search and pick tokens with live balances and trust signals, so that I can confidently choose what to swap and see what I already hold.

## Acceptance Criteria

- **AC-1 Boot defaults.** Given app mounts, Then `DEFAULT_INPUT_MINT` (SOL) and `DEFAULT_OUTPUT_MINT` (USDC) pre-select without any network call. Full `TokenInfo` for each is hydrated lazily from the first `/tokens/v2/search` call when the selector first opens.
- **AC-2 Blue-chip seed.** Given the selector mounts with empty search, Then exactly one `GET /tokens/v2/search?query=` call runs and its server-returned list is the default content (no hardcoded seed array). TanStack Query staleTime = 5 minutes for the empty-query key.
- **AC-3 Debounced search.** Given the user types, Then `lodash.debounce(setSearch, 200)` collapses rapid keystrokes; the debounced value flows into `queryKey: ['jupiter-search', debouncedQuery]`. TanStack staleTime = 30 seconds for text queries.
- **AC-4 One endpoint handles all input shapes.** Given a query of a symbol, name, or base58 mint, Then the same `/tokens/v2/search?query={input}` handles all three with no client-side branching.
- **AC-5 Request cancellation.** Given the debounced query changes while a request is in flight, Then TanStack Query's `signal` (piped through `jupiterClient.get`) aborts the previous fetch.
- **AC-6 Balance merge + sort.** Given a connected wallet, Then `GET /ultra/v1/balances/{publicKey}` fetches balances (staleTime 30s) and merges client-side. Rows with `uiAmount > 0` float to the top, sorted by `_usdValue = uiAmount * usdPrice` descending (falling back to `_balance` desc when `usdPrice` missing). Un-held tokens preserve Jupiter's server order.
- **AC-7 Token row composition.** Given a row renders, Then it shows: icon via 3-tier fallback (`wsrv.nl?url={icon}` → raw `icon` URL → inline SVG), symbol, name, optional balance + USD value, optional trust badges (Verified / LST with APY / Token2022 / Frozen), and a warning overlay on the icon when `isVerified === false` AND `tags` contains neither `"strict"` nor `"community"`.
- **AC-8 Virtualized list.** Given N results, Then the list renders inside `react-window` `FixedSizeList` (itemSize 72) wrapped in `react-virtualized-auto-sizer`. No `.slice(0, N)` truncation — full result set is scrollable.
- **AC-9 Five UI states.** The modal handles: loading (8 skeleton rows), error (inline message + Retry button calling `refetch`), empty ("No tokens found" echoing the search term), success (merged list), disabled (trigger button disabled when the caller passes `disabled={true}`).
- **AC-10 Same-token guard.** Given the caller passes `excludeMint`, Then rows where `token.id === excludeMint` render with reduced opacity + `aria-disabled="true"` + tooltip "Already selected as {input|output}"; `onClick` is a no-op.
- **AC-11 Selection flow.** Given the user clicks a valid row, Then `onSelect(token: TokenInfo)` fires exactly once and `onOpenChange(false)` closes the modal. If the parent now has both tokens + amount set, Story 2-1's existing debounced quote fetch triggers automatically.
- **AC-12 Key-optional fallback.** Given `VITE_JUPITER_API_KEY` is absent, Then `/tokens/v2/*` and `/ultra/v1/*` transparently target `https://lite-api.jup.ag` with no `x-api-key` header, and calls succeed. Given the key is absent AND `/swap/v2/*` is called, Then `jupiterClient` throws `SwapError(ErrorType.ConfigError, "Jupiter API key required for swap execution. Get one at https://portal.jup.ag")` before the fetch.

## Architecture Guardrails

**Endpoints (Jupiter v2, browser-direct):**
- `GET /tokens/v2/search?query={symbol|name|mint}` — single endpoint for search; empty query returns server-curated blue-chip list
- `GET /ultra/v1/balances/{publicKey}` — all balances for a wallet in one call
- `GET /swap/v2/order` and `POST /swap/v2/execute` — existing, key-required

**Base-URL + key policy (LOCKED):**
- `VITE_JUPITER_API_URL` is now the root `https://api.jup.ag` (paths like `/swap/v2/...` are prefixed in code). Existing Story 2-1 constant updated.
- `VITE_JUPITER_API_KEY` is now **optional**. Policy handled entirely inside `jupiterClient`:
  - `/tokens/v2/*` and `/ultra/v1/*` — key present → `api.jup.ag` + `x-api-key`; key absent → `lite-api.jup.ag`, no header
  - `/swap/v2/*` — key required; absent → `SwapError(ConfigError)` at call time

**TokenInfo shape (LOCKED — Jupiter-native naming):**
```ts
type TokenInfo = {
  id: string;              // base58 mint
  name: string;
  symbol: string;
  icon?: string;
  decimals: number;
  usdPrice?: number;
  liquidity?: number;
  isVerified?: boolean;
  tags?: string[];         // "verified" | "lst" | "community" | "strict" | …
  organicScore?: number;
  organicScoreLabel?: "high" | "medium" | "low";
  audit?: {
    mintAuthorityDisabled?: boolean;
    freezeAuthorityDisabled?: boolean;
    topHoldersPercentage?: number;
  };
};

type BalanceMap = Record<
  string,                                       // mint id; "SOL" key for native SOL
  { uiAmount: number; rawAmount: string; decimals: number }
>;
```
**No** `TokenCache`. **No** `PersistedSwapPreferences`. Both removed from `src/types/tokens.ts`.

**balanceService (Ultra-primary, RPC fallback for SOL only):**
- Primary: one `GET /ultra/v1/balances/{pubkey}` call populates a local `BalanceMap`
- Fallback: if Ultra errors or times out, `getSolBalance()` only falls back to `connection.getBalance(pk)` (web3.js RPC). Token balances remain Ultra-only (RPC fallback would be N+1 calls)
- Public API preserved for Story 3-1's preflight: `getSolBalance(pk)` and `getTokenBalance(pk, mint)` remain synchronous-looking promise methods; the hook variant `useWalletBalances()` serves selector display

**Debounce + TanStack query key shape:**
- `useMemo(() => lodash.debounce(setSearch, 200), [])` — debounce the setState, never the queryFn
- Keys: `['jupiter-search', debouncedQuery]` and `['jupiter-balances', pubkey]`
- Empty `debouncedQuery` is a valid cache key (distinct from any text query)

**List virtualization (LOCKED):**
- `react-window` `FixedSizeList` inside `react-virtualized-auto-sizer`
- `itemSize = 72` (px); overscanCount default
- No result truncation

**Icon 3-tier fallback (LOCKED):**
- Tier 1: `https://wsrv.nl/?url={encodeURIComponent(icon)}&w=72&h=72&fit=cover&output=webp`
- Tier 2: raw `token.icon` URL on `<img onError>` from tier 1
- Tier 3: inline `"unknown token"` SVG on `<img onError>` from tier 2

**Same-token guard (client-side, visual):**
- Rows matching `excludeMint` render disabled (opacity + `aria-disabled` + tooltip), not filtered out
- `onClick` short-circuits; `onSelect` never fires for a disabled row

**Dependency direction (LOCKED):** UI → Hooks → Services → jupiterClient → env/config

## Verified Interfaces

### `useWallet()` (existing)
- **Source:** `@solana/wallet-adapter-react` — already wired in `src/App.tsx:34`
- **Shape:** `{ publicKey: PublicKey | null, connected: boolean, ... }`
- **Used by:** `useWalletBalances` (internally, not a prop)

### `SwapError` + `ErrorType` (existing, extended)
- **Source:** `src/types/errors.ts`
- **Extension required:** add `ErrorType.ConfigError` for missing API key on swap endpoints
- **Used by:** `jupiterClient` (all error paths)

### `JUPITER_API_URL`, `JUPITER_API_KEY` (existing, semantics changed)
- **Source:** `src/config/env.ts`
- **Change:** URL is now root (no `/swap/v2` suffix). KEY is now optional — `env.ts` no longer calls `requireEnv` on it; it returns `""` when absent
- **Used by:** `jupiterClient` only; Story 2-1's `jupiterService.ts` gets refactored to call through `jupiterClient`

### shadcn components required
- Existing: `Dialog`, `Drawer`, `Input`, `Button`, `Skeleton`, `Empty`, `Badge`, `Tooltip`
- Install if missing: `npx shadcn add dialog drawer input skeleton empty badge tooltip avatar`
- `useIsMobile` hook ships with shadcn Drawer

## Tasks

- [ ] **Task 1: `jupiterClient` + env refactor + QueryClientProvider**
  - Maps to: AC-12 (lite-api fallback), transitively enables AC-2, AC-5, AC-6
  - Files: `src/services/jupiterClient.ts`, `src/services/jupiterClient.test.ts`, `src/config/env.ts` (modify), `src/main.tsx` (wrap in QueryClientProvider), `src/types/errors.ts` (add `ConfigError`), `src/services/jupiterService.ts` (modify — route through jupiterClient)
  - Deps to install: `@tanstack/react-query@^5`
  - Notes: `jupiterClient.get<T>(path, params?, signal?)` and `.post<T>(path, body, signal?)`. Base URL + auth header resolved per-call based on path prefix and key presence. Tests: key present → `api.jup.ag` + header; key absent + `/tokens/*` → `lite-api.jup.ag` no header; key absent + `/swap/*` → `ConfigError` thrown synchronously before fetch

- [ ] **Task 2: types refresh + `tokenService` + `useTokenSearch`**
  - Maps to: AC-2, AC-3, AC-4, AC-5
  - Files: `src/types/tokens.ts` (rewrite — new `TokenInfo` + `BalanceMap`; remove `TokenCache`, `PersistedSwapPreferences`), `src/services/tokenService.ts`, `src/services/tokenService.test.ts`, `src/hooks/useTokenSearch.ts`, `src/hooks/useTokenSearch.test.ts`
  - Deps to install: `lodash.debounce` + `@types/lodash.debounce`
  - Notes: `tokenService.search(query, signal?)` → `Promise<TokenInfo[]>`, thin wrapper over `jupiterClient.get`. Hook uses `{ data, isLoading, isError, error, refetch }` shape. staleTime 5min for `query === ''`, 30s otherwise. Tests: empty-query blue-chip call; text query; cancellation on key change; staleTime assertions via `queryClient.getQueryState`

- [ ] **Task 3: `balanceService` (Ultra + RPC fallback) + `useWalletBalances`**
  - Maps to: AC-6 (balance merge enables this)
  - Files: `src/services/balanceService.ts`, `src/services/balanceService.test.ts`, `src/hooks/useWalletBalances.ts`, `src/hooks/useWalletBalances.test.ts`
  - Notes: `balanceService.getAllBalances(pubkey, signal?)` → Ultra call returning `BalanceMap`. `balanceService.getSolBalance(pk)` → calls `getAllBalances` first; on Ultra failure, falls back to `connection.getBalance(pk)`. `balanceService.getTokenBalance(pk, mint)` → Ultra only (no fallback). Hook is `enabled: Boolean(publicKey)`. Tests: Ultra success; Ultra fail + RPC fallback for SOL; Ultra fail with no fallback for token mint; hook disabled when disconnected

- [ ] **Task 4: `TokenSelectorModal` + row composition + icon fallback**
  - Maps to: AC-7, AC-8, AC-9, AC-10, AC-11
  - Files: `src/ui/TokenSelector/TokenSelectorModal.tsx`, `src/ui/TokenSelector/TokenRow.tsx`, `src/ui/TokenSelector/TokenIcon.tsx`, `src/ui/TokenSelector/TokenBadges.tsx`, `src/ui/TokenSelector/index.ts`, `src/lib/tokenIcon.ts` (wsrv.nl URL builder), `src/ui/TokenSelector/*.test.tsx`
  - Deps to install: `react-window@^1`, `@types/react-window`, `react-virtualized-auto-sizer@^1`
  - Notes: Modal props `{ open, onOpenChange, onSelect, excludeMint?, disabled? }`. `useIsMobile()` switches Dialog ↔ Drawer. Balance merge + sort runs in `useMemo` consuming both query hooks. Tests: per-state render (loading/error/empty/success); same-token guard disables row + blocks onClick; onSelect fires exactly once; wsrv→raw→SVG fallback chain triggers on sequential `onError`

- [ ] **Task 5: App integration + default mints + Story 2-1 adapter**
  - Maps to: AC-1, AC-11 (selection triggers Story 2-1 quote flow)
  - Files: `src/config/constants.ts` (add `DEFAULT_INPUT_MINT`, `DEFAULT_OUTPUT_MINT`), `src/App.tsx` (modify — render `TokenSelectorModal` trigger buttons, pass `excludeMint`, wire `onSelect` into existing swap state dispatch), `src/App.test.tsx` (extend)
  - Notes: On mount, parent initializes `inputMint = DEFAULT_INPUT_MINT`, `outputMint = DEFAULT_OUTPUT_MINT` without any fetch. Full `TokenInfo` objects for those two hydrate from the first `/search` call when the selector opens. If Story 2-1's reducer lacks `SET_INPUT_MINT` / `SET_OUTPUT_MINT` actions, add them with transition tests

## must_haves

truths:
  - "jupiterClient routes /tokens/v2/* and /ultra/v1/* to lite-api.jup.ag when VITE_JUPITER_API_KEY is absent, with no x-api-key header"
  - "jupiterClient throws SwapError(ConfigError) synchronously for /swap/v2/* when VITE_JUPITER_API_KEY is absent"
  - "Empty-query /tokens/v2/search?query= is the source of the blue-chip list — no hardcoded seed array"
  - "Debounce is lodash.debounce(setSearch, 200) wrapped in useMemo — NOT debounced at the queryFn layer"
  - "Debounced value flows into TanStack queryKey ['jupiter-search', debouncedQuery]"
  - "Empty-query staleTime = 5 * 60_000; text-query staleTime = 30_000"
  - "Balance merge sorts rows with uiAmount > 0 above others by (usdPrice * uiAmount) desc, fallback uiAmount desc"
  - "List renders via react-window FixedSizeList (itemSize 72) inside react-virtualized-auto-sizer — no .slice(0, N) cap"
  - "Icon fallback chain: wsrv.nl?url=... → raw icon URL → inline SVG"
  - "Warning overlay renders when isVerified === false AND tags contains neither 'strict' nor 'community'"
  - "Rows where token.id === excludeMint render aria-disabled='true' and onClick is a no-op"
  - "balanceService.getSolBalance falls back to connection.getBalance only on Ultra error; getTokenBalance has no RPC fallback"
  - "DEFAULT_INPUT_MINT and DEFAULT_OUTPUT_MINT in constants.ts pre-select SOL/USDC at mount with no network call"
  - "TokenInfo fields are Jupiter-native: id (mint), icon (logo URL); no internal rename"

artifacts:
  - path: "src/services/jupiterClient.ts"
    contains: ["jupiterClient", "lite-api.jup.ag", "x-api-key", "ConfigError"]
  - path: "src/services/jupiterClient.test.ts"
    contains: ["describe", "lite-api", "ConfigError", "x-api-key"]
  - path: "src/services/tokenService.ts"
    contains: ["search", "jupiterClient", "/tokens/v2/search"]
  - path: "src/services/balanceService.ts"
    contains: ["getAllBalances", "getSolBalance", "getTokenBalance", "/ultra/v1/balances", "connection.getBalance"]
  - path: "src/hooks/useTokenSearch.ts"
    contains: ["useQuery", "jupiter-search", "staleTime"]
  - path: "src/hooks/useWalletBalances.ts"
    contains: ["useQuery", "jupiter-balances", "useWallet", "enabled"]
  - path: "src/ui/TokenSelector/TokenSelectorModal.tsx"
    contains: ["FixedSizeList", "AutoSizer", "debounce", "excludeMint", "onSelect"]
  - path: "src/ui/TokenSelector/TokenIcon.tsx"
    contains: ["wsrv.nl", "onError"]
  - path: "src/ui/TokenSelector/TokenBadges.tsx"
    contains: ["isVerified", "lst", "Token2022", "Frozen"]
  - path: "src/lib/tokenIcon.ts"
    contains: ["wsrv.nl", "encodeURIComponent"]
  - path: "src/config/constants.ts"
    contains: ["DEFAULT_INPUT_MINT", "DEFAULT_OUTPUT_MINT"]
  - path: "src/types/tokens.ts"
    contains: ["TokenInfo", "BalanceMap", "usdPrice", "organicScore", "audit"]
  - path: "src/main.tsx"
    contains: ["QueryClientProvider"]

key_links:
  - pattern: "import { jupiterClient }"
    in: ["src/services/tokenService.ts", "src/services/balanceService.ts", "src/services/jupiterService.ts"]
  - pattern: "import { useQuery }"
    in: ["src/hooks/useTokenSearch.ts", "src/hooks/useWalletBalances.ts"]
  - pattern: "import debounce from 'lodash.debounce'"
    in: ["src/ui/TokenSelector/TokenSelectorModal.tsx"]
  - pattern: "import { FixedSizeList"
    in: ["src/ui/TokenSelector/TokenSelectorModal.tsx"]
  - pattern: "import AutoSizer"
    in: ["src/ui/TokenSelector/TokenSelectorModal.tsx"]
  - pattern: "import { TokenSelectorModal }"
    in: ["src/App.tsx"]

## Dev Notes (advisory)

**Grounding:** This design is modeled on [`jup-ag/plugin`](https://github.com/jup-ag/plugin) (Jupiter's own open-source swap widget). Core patterns copied: TanStack Query for all fetching, `signal` piped into `queryFn`, `lodash.debounce` on setState not queryFn, `react-window` virtualization, `wsrv.nl` image transformer, 3-tier icon fallback.

**Why lite-api fallback matters:** Template consumers running `npm run dev` without a key still see a working token picker (tokens + balances route to `lite-api.jup.ag`). Swap endpoints loud-fail with an actionable message, forcing production deployers to configure a key before users can transact. This is a safety gate, not a dev-experience bug.

**lodash.debounce idiom (memoize it):**
```tsx
const debouncedSetSearch = useMemo(() => debounce(setSearch, 200), []);
useEffect(() => () => debouncedSetSearch.cancel(), [debouncedSetSearch]);
```
Never call `debounce(setSearch, 200)` inside the render body — it creates a new debouncer per render, defeating the point.

**TanStack Query `signal` pipe:**
```ts
queryFn: ({ signal }) => tokenService.search(debouncedQuery, signal)
```
`tokenService.search` forwards `signal` to `jupiterClient.get`, which passes it into `fetch`. Abort propagates automatically when `queryKey` changes — no manual `AbortController` needed in the component.

**react-window + AutoSizer pattern:**
```tsx
<AutoSizer>
  {({ height, width }) => (
    <FixedSizeList height={height} width={width} itemCount={rows.length} itemSize={72}>
      {({ index, style }) => <div style={style}><TokenRow {...rows[index]} /></div>}
    </FixedSizeList>
  )}
</AutoSizer>
```
Row container must apply the `style` prop — react-window uses it for absolute positioning.

**wsrv.nl URL builder:**
```ts
export function getTokenIconUrl(icon: string | undefined, size = 72): string | undefined {
  if (!icon) return undefined;
  return `https://wsrv.nl/?url=${encodeURIComponent(icon)}&w=${size}&h=${size}&fit=cover&output=webp`;
}
```
Swap this one function to use a different CDN (Cloudinary, Imgix, your own).

**Same-token guard UX rationale:** Filtering the row out hides the context of *why* it's not selectable. Disabling preserves the mental model — "that's my current pick, of course I can't re-pick it."

**Balance sort composite key (stable):**
```
primary:   Number(Boolean(row._balance > 0))                desc  // 1 > 0
secondary: row._usdValue                                     desc
tertiary:  row._balance                                      desc  // fallback when usdPrice absent
quaternary: server order (preserved by Array.sort stability)
```

**`@solana/web3.js` connection reuse:** `balanceService.getSolBalance`'s RPC fallback should import the same `connection` singleton that wallet-adapter uses (likely from `src/lib/connection.ts` — confirm during implementation; create if absent). No new RPC URLs.

**ConfigError user flow:** When `SwapError(ConfigError)` surfaces to the UI, show the message (containing the portal.jup.ag link) in an actionable banner, not a toast — it's a setup problem, not a transient error. Story 3-3's error recovery handlers should treat it as non-retryable and non-dismissible (user must fix `.env`).

## Wave Structure (internal to this story)

- **Wave 1:** Task 1 — foundation. Everything else depends on `jupiterClient` + QueryClientProvider.
- **Wave 2:** Task 2 ∥ Task 3 — both services + their hooks are independent (no shared file).
- **Wave 3:** Task 4 — the modal consumes both hooks.
- **Wave 4:** Task 5 — app integration.

## Story Size: M

Same size bracket as the original draft, different scope shape: less cache plumbing, more UI composition + HTTP client generality.
