# Decisions — Story 2-2 Token Service + Token Selector UI

Key design decisions made while building the token picker. Formal amendment records live in `docs/amendments.md` (A-2 through A-5); this file captures the plain-language **why** for future maintainers and template forkers.

---

## 1. Use TanStack Query, not a custom cache

**Decision:** All Jupiter token + balance fetching goes through TanStack Query. No custom in-memory `TokenCache`, no manual TTL, no LRU, no `visibilitychange` refresh.

**Why:** Grounded in [`jup-ag/plugin`](https://github.com/jup-ag/plugin), Jupiter's own open-source swap widget. Their production pattern is TanStack Query — not a custom cache layer. Reinventing caching that the data layer already provides obscures the actually-interesting code (quote flow, preflight, sign) that template forkers come to learn.

Supersedes the original DD-9 "hybrid fetch/cache" design. See `amendments.md` A-2.

---

## 2. Server-curated blue-chip list (no hardcoded token array)

**Decision:** When the selector opens with an empty search box, we hit `GET /tokens/v2/search?query=` and render whatever Jupiter returns. No `POPULAR_TOKENS = [...]` constant in the code.

**Why:** Jupiter maintains the blue-chip list server-side and updates it based on their ranking. A hardcoded list would rot. Template consumers will replace the default set with their own tokens anyway — starting from Jupiter's default is the sensible baseline, not a committee-curated one we ship.

---

## 3. Lite-api fallback for reads; API key required for swaps

**Decision:**
- `/tokens/v2/*` and `/ultra/v1/*` transparently fall back to `https://lite-api.jup.ag` (keyless free tier) when `VITE_JUPITER_API_KEY` is absent.
- `/swap/v2/order` and `/swap/v2/execute` throw `SwapError(ConfigError)` synchronously if the key is missing.

**Why:** Template should run out of the box (`git clone && npm run dev`) without forcing users to sign up for a key just to browse tokens. Swap execution, however, is the "real money" path — a production deployer should explicitly configure a key, and the loud failure at call time forces that. Safety gate, not a dev-experience bug.

Supersedes the earlier non-negotiable "API key required on every Jupiter request." See `amendments.md` A-5.

---

## 4. No localStorage persistence of the selected token pair

**Decision:** App boots with hardcoded defaults (SOL → USDC). Selected tokens do NOT survive page reloads.

**Why:** Template consumers will customize the defaults anyway. Persistence adds schema-migration risk and localStorage-quota concerns for no real benefit in a demo/template context. The feature was already marked "deferred" in the spec; architecture was inconsistent.

Supersedes DD-10. See `amendments.md` A-3.

---

## 5. Jupiter-native field names in `TokenInfo`

**Decision:** `TokenInfo` uses `id` (for mint) and `icon` (for logo URL) — Jupiter's own naming — not `mint` / `logoURI`.

**Why:** Consistency with the API means less mapping code and fewer places for rename-drift. Template forkers can look at Jupiter's docs and the code side by side without mental translation.

---

## 6. Verified-only by default + explicit escape hatches

**Decision:** The picker shows only verified tokens by default. Three bypasses:
- "Show unverified tokens" toggle in the modal (explicit opt-in)
- Any token the user already holds (`uiAmount > 0`) is always visible
- Pasted mint addresses (base58, 32–44 chars) auto-bypass the filter

**Why:** Scam copycat tokens are the #1 UX risk in a token picker — a user searching "USDC" who picks an imposter loses funds. Verified-only is the safer default. The three bypasses cover the legitimate reasons a user would need to see unverified tokens: power-user mode, their own holdings, and pasting an exact known mint (e.g., a fresh launch).

---

## 7. Ultra balances endpoint, with narrow RPC fallback for SOL

**Decision:** `balanceService` primary path hits `GET /ultra/v1/balances/{pubkey}` — one HTTP call returns all balances. If Ultra fails, `getSolBalance()` falls back to `connection.getBalance(pubkey)` via web3.js. `getTokenBalance()` has NO RPC fallback.

**Why:** One call for all balances is faster than N+1 RPC calls. The narrow SOL-only RPC fallback preserves the single most critical preflight check (insufficient SOL for fees) during a partial Jupiter outage. Full fallback parity for every SPL mint would re-introduce N+1 RPC cost and is not worth it — if Ultra is down, Jupiter's swap endpoints are usually impaired too.

Supersedes the original DD-13 "balanceService via RPC-only" design. See `amendments.md` A-4.

---

## 8. Store full `TokenInfo` in App state, not just the mint

**Decision:** The swap form tracks `inputToken: TokenInfo` and `outputToken: TokenInfo` (not `inputMint: string`). Lamport math, symbol display, and the QuoteDisplay all read from the selected token's own fields.

**Why:** The earlier mint-only design hardcoded decimals = 9 (SOL) and decimals = 6 (USDC) everywhere — which produced catastrophic scaling errors on any non-default token. For BONK (5 decimals), "1 BONK" would be sent to Jupiter as 10,000 BONK. Real fund loss risk. Storing the full TokenInfo makes decimals/symbol dynamic.

Caught by adversarial code review; regression test locks the fix in.

---

## 9. Debounce (200ms) + min-query-length (2) + placeholderData (keepPreviousData)

**Decision:** Search input goes through `lodash.debounce(setSearch, 200)`. Queries of 1 char are gated off. Previous results stay visible while a new query loads.

**Why:**
- 200ms collapses rapid keystrokes ("USDC") into one request.
- Length-gate skips "U" (matches thousands, no signal), starts at "US" (meaningful).
- `placeholderData: keepPreviousData` eliminates skeleton-flicker between keystrokes.

Matches jup-ag/plugin exactly.

---

## 10. Prefetch the blue-chip list on app mount

**Decision:** `App.tsx` calls `queryClient.prefetchQuery` for the empty-query token search in a `useEffect` on mount. The data is warm in TanStack's cache before the user ever clicks the selector.

**Why:** First-time selector open should be instant. Without prefetch, the first click shows ~300–500ms of skeleton while Jupiter responds. For a production-intent template, that's noticeable. The prefetch fires during the app's natural idle time and costs ~one HTTP request per page load (which would have happened on first selector open anyway).

---

## 11. `@base-ui/react`, not shadcn Dialog/Drawer

**Decision:** The modal uses `@base-ui/react` primitives (already in the project from Story 1-1) instead of shadcn Dialog/Drawer that the story guardrails assumed.

**Why:** The codebase already ships `@base-ui/react`. Introducing a second UI-primitives library would bloat the bundle and confuse forkers about which pattern to follow. The story's guardrail was written generically as "shadcn Dialog/Drawer" but the underlying primitive choice was always a Rule-1 style decision.

Logged as a Rule 1 deviation in the Task 4 commit message.

---

## 12. `wsrv.nl` 3-tier icon fallback + HTTPS validation

**Decision:** Token icons render via `<img src>` with this fallback chain:
1. `https://wsrv.nl/?url=<icon>&w=72&h=72&fit=cover&output=webp` (resized/WebP CDN)
2. Raw `token.icon` URL, only if it starts with `https://`
3. Inline SVG with the token symbol's first letter

**Why:** `wsrv.nl` is the same image proxy `jup-ag/plugin` uses — it's production-proven and cuts icon payload ~10×. The 3-tier chain handles every failure mode (wsrv down, icon URL broken, icon missing). HTTPS validation on tier 2 prevents mixed-content warnings in production SPAs (and blocks any exotic URL scheme the API might emit).

---

## 13. Virtualize the list with `react-window` (no truncation)

**Decision:** The token list uses `FixedSizeList` (itemSize=72) inside `react-virtualized-auto-sizer`. We do NOT `.slice(0, N)` the results.

**Why:** Rendering 50+ token rows as plain divs hurts performance on low-end devices. Virtualization renders only the ~10 rows actually visible, keeping the modal snappy regardless of result count. Truncation would hide results the user needs; virtualization shows all of them.

---

## Cross-references

- Formal amendment records: `docs/amendments.md` (A-2, A-3, A-4, A-5)
- Story file: `docs/stories/2-2-token-service-token-selector.md`
- Architecture impacts: `docs/architecture.md` — DD-9, DD-10, DD-13 (amended)
- Spec impact: `docs/spec.md` — AC-FR-3 (amended to include name search)
