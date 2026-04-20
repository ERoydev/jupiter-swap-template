# Concerns

Deferred issues logged during implementation. Each entry captures the issue,
why it was deferred, and the story it should be revisited in.

---

## C-1 — 2026-04-20 — tsconfig strictness baseline not yet adopted

**Story:** 2-1 (review finding #8)
**Severity:** Low
**File:** `tsconfig.json`

Per the user's `~/.claude/rules/config-deviation.md`, the baseline expects
`noUncheckedIndexedAccess: true` and `exactOptionalPropertyTypes: true`. Neither
is enabled in this project. Additionally, `"ignoreDeprecations": "6.0"` was
added silently without an amendment.

**Why deferred:** Enabling either flag requires a sweep across all existing
source files (likely several type narrowings in `swapReducer.ts`,
`jupiterService.test.ts` index access, etc.). Scope belongs to a dedicated
config hardening task, not inline in story 2-1.

**Revisit:** Consider bundling with story 4-2 (Comprehensive Test Suite) or
creating a CS-* (change story) after wave 2 completes.

---

## C-2 — 2026-04-20 — Token amount formatting loses precision at u64 scale

**Story:** 2-1 (review finding #9)
**Severity:** Low
**Files:** `src/App.tsx:92-100, 195-198`, `src/ui/QuoteDisplay.tsx:30-42`

UI converts lamport strings via `parseFloat` / `Number`, which loses precision
above `Number.MAX_SAFE_INTEGER` (~9.007e15). Current token pairs
(SOL 9-dec, USDC 6-dec) are safe for realistic user amounts. Risk surfaces when
token decimals are higher or whale-sized swaps occur.

**Why deferred:** Fix requires a shared `formatTokenAmount(rawString, decimals)`
utility using `BigInt`. Natural home is alongside the token list story.

**Revisit:** Story 2-2 (Token Service + Token Selector UI) — introduce the
utility and migrate all consumers.
