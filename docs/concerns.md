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

---

## C-8 — 2026-04-26 — `--success` design token absent; SuccessDisplay uses hardcoded Tailwind palette

**Story:** 3-2 (Task 2 — SuccessDisplay component)
**Severity:** Low
**Files:** `src/ui/SuccessDisplay.tsx`, `src/components/ui/alert.tsx`, `src/globals.css`

Design-system §14 Organism 3 specifies "Success: Alert (green border)" and
§15 Alert variants list `success (green)` alongside `destructive` and
`warning`. `globals.css` defines `--destructive` and `--warning` tokens but
no `--success` token, and `alert.tsx` exposes only `default` and
`destructive` variants — no `success` variant exists.

To ship SuccessDisplay without a Rule-4 architectural amendment to the
design system, the component uses Tailwind's `border-emerald-500/40` plus
`bg-emerald-50/50 dark:bg-emerald-950/20` utilities directly. This works
across all four themes (verified at build time), but it bypasses the
project's "use design tokens, never hardcode colors" convention from
react.md and CLAUDE.md.

**Why deferred:** Adding a `--success` token requires a four-theme audit
(wireframe-light, wireframe-dark, brand-light, brand-dark) and a follow-up
to wire a `success` variant through `alert.tsx`'s `cva` config. That is a
design-system change, not a feature change — out of 3-2 scope.

**Revisit:** Story 4-1 (UX polish) OR a dedicated design-system polish pass.
At that point, replace the inline emerald utilities in `SuccessDisplay`
with `<Alert variant="success" />` and verify all four themes.

---

## C-9 — 2026-04-27 — Toast notification on success deferred to Story 4-1

**Story:** 3-2 (code review round-1 finding #4 — Dev Note #2 commitment)
**Severity:** Low
**File:** `src/ui/SuccessDisplay.tsx` (TODO breadcrumb), `src/App.tsx`

Plan AC-3-2-2 wording references "Toast also fires" alongside the success
Alert. `package.json` carried no toast library at story-3-2 implementation
time (no `sonner`, `react-hot-toast`, or `@base-ui/react/toast` — verified
during story creation). Adding a toast library mid-story (Rule 4 —
architectural dependency change) was rejected; the success Alert
satisfies the user-facing intent ("user knows the swap succeeded") on
its own.

The `// TODO(4-1): fire toast` breadcrumb in `SuccessDisplay.tsx`
(near `<AlertTitle>`) is the code-side handle. This entry is the
docs-side handle.

**Why deferred:**
- Toast is a redundant signal next to a green Alert with the same
  information; not load-bearing for the AC.
- 4-1 ("Pre-flight UX + Responsive Layout") is the right owner — it's
  the polish sweep where toast library selection (sonner vs.
  base-ui vs. radix) gets evaluated against the four-theme constraint.

**Revisit:** Story 4-1.
- Pick a toast library that respects the four design-system themes
  (wireframe-light/dark + brand-light/dark).
- Wire in `SuccessDisplay.tsx` next to the existing Alert title.
- Verify the toast doesn't double-announce for screen readers (the
  Alert already has `role="alert"` aria-live=assertive default).

**Won't fix** (2026-04-27, Story 4-1 Task 3): sonner was installed and `toast.success(...)` wired in `SuccessDisplay.useEffect`, but during manual testing the user confirmed the result was bad UX — two prominent "Swap successful" announcements on the same screen (the existing destructive `<Alert>` in SwapCard plus the toast in the bottom-right corner). The toast wiring was reverted: sonner uninstalled, `<Toaster />` mount removed, `useEffect` removed from `SuccessDisplay.tsx`, three sonner-mock tests removed. The original spec line "Toast also fires" alongside the existing Alert was rejected as duplicative. If a non-blocking notification is wanted in the future, the right path is to slim the SwapCard Alert to a small receipt strip (drop the AlertTitle "Swap successful") and let a future toast carry the celebration — that change was out of scope for 4-1's polish remit and would re-open SuccessDisplay's information architecture.

---

## C-10 — 2026-04-27 — ErrorDisplay component refactor + standalone hook test file deferred (Story 3-3 trim)

**Story:** 3-3 (user-approved trim from M to S at story-creation checkpoint)
**Severity:** Low
**Files:** `src/App.tsx:464-478` (existing inline error block), `src/hooks/useSwapExecution.ts` (no dedicated test file)

The original M-sized 3-3 included two pieces of polish work that the
trimmed S edit deferred without losing 3-3's behavioral payload:

1. **`ErrorDisplay` component refactor.** A dedicated
   `src/ui/ErrorDisplay.tsx` was planned to replace the inline error
   block at `App.tsx:464-478`, with a "Swap failed after 3 attempts"
   title key on `error.details.retriesAttempted === MAX_RETRIES - 1`
   and a Dismiss button as a shadcn `Alert variant="destructive"` +
   `<AlertTitle>` + `<AlertDescription>` composition.

2. **`src/hooks/useSwapExecution.test.ts` standalone file.** A
   dedicated hook-level test file using `@testing-library/react`'s
   `renderHook`. The hook is currently exercised by App.test.tsx
   integration tests; an isolated suite would let the retry-decision
   branching tests run without the full SwapCard render cost and
   would establish the first hook-test pattern in the repo.

**Why deferred:**

- A-13's verbatim Jupiter messages (e.g., "Slippage tolerance
  exceeded", "Transaction didn't land. Retrying...") already give
  the user-facing inline error block production-quality copy. The
  ErrorDisplay refactor would be presentation polish, not a fix —
  pure shape-shuffling at the component boundary.
- `error.details.retriesAttempted` is already attached on the budget-
  exhausted path (`useSwapExecution.ts` Task 1 commit), so the
  data needed for the "after 3 attempts" title is in place; only
  the rendering site is deferred.
- The retry behavior itself — the load-bearing 3-3 deliverable —
  ships intact via the in-hook decision and the App.tsx retry-
  progress copy. 4 new App.test.tsx integration cases cover the
  retry happy path, exhaustion (with `retry_exhausted` log
  assertion + `retriesAttempted` check), non-retryable, and the
  retry-progress copy visibility.
- App.test.tsx integration tests confirm the hook contract end-to-
  end. A standalone hook test file is the better long-term shape
  but the existing coverage is not blocking.

**Why safe:**

- No code path silently broken; the deferred work is additive.
- The inline error block at `App.tsx:464-478` continues to render
  `context.error.message` (A-13-aware) with a working Dismiss
  button. AC-3-3-3 / 3-3-4 / 3-3-5 / 3-3-6 / 3-3-7 satisfied at
  the behavior level; only AC-3-3-3's "Swap failed after 3
  attempts" *title copy* is missing (the message itself still
  surfaces verbatim).

**Revisit:** Story 4-1.
- Story 4-1 ("Pre-flight UX + Responsive Layout") is the natural
  pickup point — it's the polish sweep where component-level UX
  refactors land. Wire `ErrorDisplay` to read
  `error.details?.retriesAttempted === MAX_RETRIES - 1` for the
  exhausted-state title.
- Standalone hook test file: optional. Either spin up
  `useSwapExecution.test.ts` with `renderHook` and migrate the
  retry-decision branching cases out of App.test.tsx, or accept
  the integration coverage as sufficient. Decide during 4-1.

**Resolved**: Story 4-1 Task 1 — `src/ui/ErrorDisplay.tsx` extracted, reads `error.details?.retriesAttempted`, escalates title to 'Swap failed after 3 attempts' on retry budget exhaustion. The standalone `useSwapExecution.test.ts` remains default-skipped per original C-10 clause; integration coverage in App.test.tsx + the existing 3-3 retry tests is sufficient. 2026-04-27

---

## C-11 — 2026-04-27 — `flashSuccess` ref mutation inside effect — readability only (Story 4-1 code review)

**Story:** 4-1 Task 2 (in-flight panel polish + success border flash)
**Severity:** Low
**File:** `src/App.tsx:281-292` (the `useEffect` that toggles `flashSuccess` on Executing/Signing → Success)

**Reviewer's note (code review #2):** The effect captures `prevStateRef.current` for transition detection (Executing/Signing → Success), then unconditionally writes the new state to the ref before checking the transition. The order is correct (`wasInFlight` reads the OLD value first, then ref is updated, then the if-branch fires `setFlashSuccess`). But the unconditional ref write inside an effect-with-deps `[context.state]` is non-obvious — a future maintainer adding an early-return above it could break the transition detection silently.

**No bug today.** Just a maintainability note.

**Revisit:** if more cross-state animations are added (e.g., LoadingQuote → QuoteReady fade, Error → Idle fade), extract the prev-state tracking into a small `useTransition(from, to): boolean` helper. Until then, leave a comment at line 285 noting the unconditional write is intentional.

---

## C-12 — 2026-04-27 — `border-emerald-500` not a theme token (Story 4-1 code review)

**Story:** 4-1 Task 2 (success border flash)
**Severity:** Low
**Files:** `src/App.tsx:402` (output panel flash), `src/ui/SuccessDisplay.tsx:55` (existing precedent)

**Issue:** Both the success-flash on the output panel and the existing SuccessDisplay Alert use `border-emerald-500` directly — a Tailwind palette color, not a theme-token-driven CSS variable. The codebase currently has 2 themes (light + dark via `:root` + `.dark`); both render green fine, so there is no user-visible problem.

**Why this is debt anyway:** the design system spec (`docs/design-system.md`) gestures at "all four themes must work" — that's currently aspirational (only 2 themes shipped), but if a wireframe/monochrome theme is added later, the emerald-500 color will visually break the theme boundary in two places.

**Revisit:** when adding a wireframe theme (or any non-colorful theme), define a `--success` / `--success-border` CSS variable in `globals.css`, then replace `border-emerald-500` with `border-success` (or equivalent Tailwind class that reads the variable) at both call sites. Estimated cost: ~15 minutes including theme-toggle smoke test.
