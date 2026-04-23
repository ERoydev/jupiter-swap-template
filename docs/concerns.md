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

---

## C-3 — 2026-04-23 — Swap button does not react to `useWalletBalances.isError`

**Story:** 3-1 (Pre-flight Checks + Transaction Signing) — flagged during 2-3 manual QA
**Severity:** Medium
**Files:** `src/App.tsx` (Swap button at ~line 291), `src/ui/SolBalanceWarning.tsx`

After Story 2-3 shipped the fetch-failure overlay (AC-5), manual QA confirmed
that when `useWalletBalances.isError === true` the `SolBalanceWarning` Alert
appears correctly — but the Swap button remains enabled as long as a quote is
present (current gate: `disabled={!hasQuote}`). The user can still click Swap
through an unresolved balance warning, which contradicts the "verify before
signing" intent of the overlay.

**Why deferred:** Story 3-1's scope explicitly owns the Swap button state. Plan
Story 3-1 AC-2 enumerates 7 pre-flight checks with corresponding button-disable
semantics (AC-3). Pre-empting that wiring inside Story 2-3 would duplicate
logic 3-1 must refactor anyway, and would require lifting the
`SolBalanceWarning` `dismissed` state up to `SwapCard` — a prop drill that 3-1
can absorb cleanly when it takes ownership of the button.

**What Story 3-1 must decide (not 2-3):**
1. **Balance-unknown handling.** Checks 6 (InsufficientSOL) and 7 (InsufficientBalance) both
   assume a KNOWN balance. When `useWalletBalances.isError === true`, the
   preflight must either:
   (a) treat "unknown" as failing check 6/7 (conservative, matches Alert intent), OR
   (b) add an 8th check `BalanceUnknown` with its own button label ("Unable to verify balance"), OR
   (c) skip 6/7 when unknown and rely on signing to fail.
   Recommendation: (a) or (b). (c) sidesteps the Alert entirely.
2. **"Proceed Without Verification" integration.** The dismiss button on the
   fetch-failure overlay is currently component-local state. Story 3-1 should
   lift it (context, SwapCard state, or Zustand) so preflight can read it and
   treat "dismissed" as "user accepts unknown balance" — bypassing checks
   6/7 when dismissed, still failing 1-5 and running signing.
3. **Button label precedence.** If multiple checks fail simultaneously (e.g.
   wallet connected + amount set + balance unknown), which label wins?
   Story 3-1 should codify the priority order explicitly.

**Revisit:** Story 3-1 must address all three decisions above before closing
its Gate 5. Add a task to Story 3-1 specifically titled "Wire Swap button to
preflight state (including balance-unknown + dismiss integration)".

---

## C-4 — 2026-04-23 — SolBalanceWarning tests 1-3 are functionally redundant

**Story:** 2-3 (code review finding #2)
**Severity:** Low
**File:** `src/ui/SolBalanceWarning.test.tsx` (cases "wallet disconnected", "loading state", "success state")

All three cases assert the same null-branch behavior (`isError: false → null`) by
toggling `isLoading` / `data`. No test would fail if the component only rendered
on `isError && data === undefined`, for example. The trio is copy-paste padding.

**Why deferred:** Test integrity is preserved (all have real assertions, no
anti-patterns); fixing requires either `it.each` consolidation or adding a
branch-coverage test that asserts the component does NOT early-return under
specific edge combinations (e.g., `isError: true && isLoading: true`). Scope
too small to justify amending story 2-3 post-Gate 5; bundle with the next
hygiene pass on this file.

**Revisit:** Story 4-2 (Comprehensive Test Suite) — consolidate via `it.each`
and add a branch-coverage case.

---

## C-5 — 2026-04-23 — useWalletBalances.refetch type narrowed to `Promise<unknown>`

**Story:** 2-3 (code review finding #4)
**Severity:** Low
**File:** `src/hooks/useWalletBalances.ts`

The hook's public return type declares `refetch: () => Promise<unknown>`.
TanStack Query's actual `refetch` returns
`Promise<QueryObserverResult<BalanceMap, Error>>`. Collapsing to `unknown`
prevents future callers from inspecting the refetch result (e.g.
`const r = await refetch(); if (r.isError) {...}`). `SolBalanceWarning`
doesn't care — it fires `void refetch()` — but shared-hook callers deserve
the richer type.

**Why deferred:** Zero runtime impact; callers today (`SolBalanceWarning`,
`TokenSelectorModal`) don't read the refetch result. Strictly a type-precision
improvement.

**Revisit:** Story 3-1 or 3-2 — when the Swap button's preflight starts reading
refetch results, upgrade the return type to
`refetch: typeof query.refetch` or
`QueryObserverResult<BalanceMap, Error>`.

---

## C-6 — 2026-04-23 — SolBalanceWarning action buttons bypass shadcn AlertAction slot

**Story:** 2-3 (code review finding #5)
**Severity:** Low
**File:** `src/ui/SolBalanceWarning.tsx`

Shadcn's `Alert` variant CSS has a `has-data-[slot=alert-action]` selector
that reserves right-side padding when an `AlertAction` slot is present
(see `src/components/ui/alert.tsx:59, 76`). Current implementation wraps the
two buttons in a raw `<div className="mt-2 flex flex-wrap gap-2">`, which
works visually but defeats the component-library's organism recipe and may
produce inconsistent padding across the four themes.

**Why deferred:** No functional bug; the buttons render and respond correctly.
All four themes were manually verified during story 2-3 QA. Fix is a small
structural refactor (wrap in `<AlertAction>`) that also benefits a11y
grouping (related to C-3's Swap-button-state work).

**Revisit:** During design-system polish pass OR when story 3-1 restructures
the Alert to integrate with Swap-button state (C-3).

---

## C-7 — 2026-04-23 — Retry Button `variant="outline"` inside destructive Alert

**Story:** 2-3 (code review finding #8)
**Severity:** Low
**File:** `src/ui/SolBalanceWarning.tsx`

The Alert uses `variant="destructive"` (red-tinted palette), but the Retry
button uses `variant="outline"` which inherits the page's foreground palette,
not the Alert's destructive palette. Visual hierarchy on the warning reads
as slightly disconnected — acceptable per manual QA, but not ideal per
shadcn's organism-variant conventions.

**Why deferred:** Purely visual; all four themes verified legible during
story 2-3 QA. Design input recommended before picking between
`variant="destructive"`, `variant="default"`, or `variant="secondary"`.

**Revisit:** Design-system polish pass OR bundle with C-6 AlertAction fix.
