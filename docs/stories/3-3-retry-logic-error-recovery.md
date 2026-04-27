---
id: "3-3-retry-logic-error-recovery"
slug: retry-logic-error-recovery
title: "Retry Logic + Error Recovery"
status: draft
size: S
wave: 3
complexity: high
dependencies: ["3-2"]
created: 2026-04-27T09:55:23Z
revised: 2026-04-27T10:35:00Z
revisionNote: "Trimmed from M to S after user review. See Trim Decision section."
owners:
  story-creator: claude-opus-4-7
  implementer: TBD
---

# Story: Retry Logic + Error Recovery (trimmed S)

## Overview

Story 3-3 closes Epic 3 by activating the retry-budget infrastructure that 1-2's reducer and 1-1's `MAX_RETRIES` constant pre-built but left as dead code. Today every `/execute` failure — retryable or not — collapses to the same Error UI. 3-3 wires the retry decision into `useSwapExecution.handleSwap` so retryable failures (5 of the 14 Jupiter codes) auto-skip the Error UI: state cycles Executing → LoadingQuote → QuoteReady up to 3 total attempts before giving up, with "Retrying… attempt N of 3" copy in the loading area between attempts.

This is the **trimmed S edit** of the original M-sized story — see "Trim Decision" below. The dedicated `ErrorDisplay` component refactor and the standalone `useSwapExecution.test.ts` file were deferred to keep the change minimally invasive. The existing inline error block at `App.tsx:464-478` stays in place; A-13's verbatim Jupiter message already provides the user-facing copy that the deferred component would have rendered.

3-3 sits between 3-2 (which inlined `useSwapExecution.handleSwap` and deferred the standalone `swapHandler` module per A-11) and 4-1 (preflight UX polish, where deferred error-UX refactors land if they're still wanted).

## Trim Decision (2026-04-27)

Original M-sized story shipped 5 tasks: hook retry decision, ErrorDisplay component, App integration, edge-case hardening, manual verify. User-approved trim retains only the hook retry decision + retry-progress copy + integration tests. Rationale:

- A-13 already surfaces Jupiter's verbatim error message ("Slippage tolerance exceeded", "Block height invalid", etc.) — the existing inline error block is functionally adequate. ErrorDisplay refactor is polish, not a fix.
- Wallet popup is required per attempt (Jupiter requires a fresh signed tx every retry), so "auto-retry" really means "auto-fetch-fresh-quote between failures + skip the error UI between attempts." That's the entire UX delta.
- The retry budget exists as dead code in reducer/constants today (`EXECUTE_RETRY`, `retryCount`, `MAX_RETRIES`). Activating it is the actual correctness win.
- Deferred work logged as C-10 in `docs/concerns.md` (added at Task 2 close).

## Acceptance Criteria

Plan ACs from `docs/plan.md` (story 3-3, lines 140-147) preserved verbatim:

- **AC-3-3-1.** Given retryable error (-1, -1000, -1004, -2000, -2003), When retryCount < 3, Then auto `/order` for fresh quote, increment retryCount, log `{ swapCorrelationId, attempt, code, requestId, timestamp }`.
- **AC-3-3-2.** Given retry in progress, When UI renders, Then "Retrying... attempt {N} of 3" with Spinner.
- **AC-3-3-3.** Given all 3 retries exhaust, When final fails, Then state → Error with the underlying message; `retriesAttempted: 2` carried through `error.details` (i.e., 2 retries after the initial attempt = 3 total).
- **AC-3-3-4.** Given non-retryable error (-2, -3, -1001, -1002, -1003, -2001, -2002, -2004), When received, Then state → Error immediately. No retry.
- **AC-3-3-5.** Given any Error state, When user clicks "Dismiss" or changes input, Then state → Idle within one action. (Already shipped in 3-2; no change.)
- **AC-3-3-6.** Given unknown error code, When received, Then non-retryable; A-13's code-bearing message preserved (supersedes plan's literal "Something went wrong").
- **AC-3-3-7.** Given Executing timeout (60s), When fires, Then state → Error(ExecutionTimeout). (Already shipped via `useSwapState`; verified no regression.)

**Trim impact on ACs:** AC-3-3-3's "Swap failed after 3 attempts" title copy is dropped — the existing inline error block shows the underlying Jupiter message after budget exhaustion, with `retriesAttempted` carried through `error.details` for any future consumer (4-1, log analysis). Behavior preserved (state → Error after 3 attempts); copy-level polish deferred.

**AC interpretation note:** Plan AC-3-3-1 says "auto /order for fresh quote" — interpreted as *automatic from a fresh /order request* (no signed-tx replay), not *silent without user click*. Wallet popup still required per attempt (Jupiter design constraint). Industry-standard UX. See Dev Notes #1.

## Architecture Guardrails (LOCKED)

All verified against source 2026-04-27.

**Retry budget:** `MAX_RETRIES = 3` from `src/config/constants.ts:7`. Counter source: `context.retryCount` from reducer (incremented on `EXECUTE_RETRY`, verified `swapReducer.ts:132-140`).

**Predicate:** `mapping.retryable && context.retryCount < MAX_RETRIES - 1`. The `- 1` is because `EXECUTE_RETRY` itself increments retryCount. Trace:

- attempt 1, retryCount=0: fail retryable → 0 < 2 = true → EXECUTE_RETRY → retryCount=1
- attempt 2, retryCount=1: fail retryable → 1 < 2 = true → EXECUTE_RETRY → retryCount=2
- attempt 3, retryCount=2: fail retryable → 2 < 2 = false → EXECUTE_ERROR
- Total attempts: 3. Matches plan AC-3-3-3.

**EXECUTE_RETRY-from-Error is impossible** (verified). Reducer rejects `EXECUTE_RETRY` from Error; only Executing → LoadingQuote handles it. From Error, the only exits (DISMISS / INPUT_CHANGED / WALLET_DISCONNECTED) all reset to `initialState`. **Therefore the retry decision must live inside `useSwapExecution.handleSwap`'s failure branch, BEFORE `EXECUTE_ERROR` is dispatched.** No "Try Again" button on Error state.

**EXECUTE_ERROR resets retryCount to 0** (verified `swapReducer.ts:130`). To preserve attempt count for downstream consumers (logs, tests, future ErrorDisplay refactor), 3-3 attaches `retriesAttempted: context.retryCount` to the SwapError's `details` object at dispatch time on the budget-exhausted branch.

**Final dispatch policy in handleSwap (LOCKED):**

```ts
// Inside non-success branch of executeOrder
const mapping = mapErrorCode(response.code);
const canRetry = mapping.retryable && context.retryCount < MAX_RETRIES - 1;

if (canRetry) {
  logSwap("retry_scheduled", {
    code: response.code,
    attempt: context.retryCount + 1,
    requestId,
  });
  dispatch({ type: "EXECUTE_RETRY" });
  return;
}

// budget exhausted (retryable but limit hit) OR non-retryable
const userMessage = response.error?.trim() || mapping.message;  // A-13 preserved
const swapErr = new SwapError(
  mapping.type,
  userMessage,
  response.code,
  mapping.retryable,
  {
    requestId,
    httpStatus: 200,
    responseBody: response,
    ...(mapping.retryable ? { retriesAttempted: context.retryCount } : {}),
  },
);

if (mapping.retryable) {
  logSwap("retry_exhausted", {
    totalAttempts: context.retryCount + 1,
    code: response.code,
  });
} else {
  logSwap("non_retryable_error", {
    code: response.code,
    errorType: mapping.type,
  });
}

dispatch({ type: "EXECUTE_ERROR", error: swapErr });
```

**Mirror the predicate in the catch block** (around lines 252-269) for thrown SwapError where `swapErr.retryable === true && context.retryCount < MAX_RETRIES - 1` → dispatch EXECUTE_RETRY instead of EXECUTE_ERROR. Same `retry_scheduled` log shape.

**No reducer change. No new constants. Pure consumer story.**

## Verified Interfaces

Computed 2026-04-27 from source on disk. Implementer should re-check hashes before Task 1; any mismatch means the file changed since this story was written.

| Interface | Source | Hash | Status |
|-----------|--------|------|--------|
| `useSwapExecution` | `src/hooks/useSwapExecution.ts:41` | `b587fbdd988db2a48a5b1f435e16c40fdb1fa8f0fd269fb59af1d15a2c2bbdc0` | VERIFIED — failure branch (lines 222-269) is the modification target |
| `swapReducer` + `EXECUTE_RETRY` | `src/state/swapReducer.ts:40, 132-140` | `4d3e8981840666e821ccda014f002096622bd9d25f0965036cbacaa0597c0f6c` | VERIFIED — DO NOT MODIFY |
| `SwapStateContext.retryCount` | `src/state/swapReducer.ts:5-12` | (same hash) | VERIFIED — read-only |
| `mapErrorCode` | `src/utils/jupiterErrorMapper.ts:83` | `5769a73879b3df31d43ab2f9b7e5b64e3f0dcac072eec5949934a02134d6b461` | VERIFIED — 5 retryable codes (-1, -1000, -1004, -2000, -2003); 8 non-retryable; A-13 unknown fallback. DO NOT MODIFY |
| `SwapError` | `src/types/errors.ts:1, 22` | `317a0c5d83ba58c22a8d83a22fd8c5699870732c7ebdaa69c496260701b3da30` | VERIFIED — `details: Record<string, unknown>` accepts `retriesAttempted` |
| `MAX_RETRIES`, `STALE_THRESHOLD_MS` | `src/config/constants.ts:7, 12` | `7c2b71673890964c49887244fac3321d331f996e031f543a07726f5ee41e8f91` | VERIFIED — DO NOT MODIFY |

⚠ **App.tsx hash skipped** — file is the integration target; hash recomputed by implementer post-Task-1.

## Tasks

- [ ] **Task 1: Wire retry decision into useSwapExecution + retry-progress copy in App.tsx**
  - Maps to: AC-3-3-1, AC-3-3-2, AC-3-3-3, AC-3-3-4, AC-3-3-6.
  - Files modified:
    - `src/hooks/useSwapExecution.ts`:
      1. Import `MAX_RETRIES` from `../config/constants`.
      2. In the non-success branch of `executeOrder` (around lines 222-251), insert canRetry predicate per LOCKED policy. On `canRetry === true`: log `retry_scheduled`, dispatch `{ type: "EXECUTE_RETRY" }`, return.
      3. On `canRetry === false` (budget exhausted, i.e., `mapping.retryable === true`): log `retry_exhausted` with `{ totalAttempts: context.retryCount + 1, code: response.code }`. Append `retriesAttempted: context.retryCount` to SwapError details. Dispatch EXECUTE_ERROR.
      4. On `canRetry === false` (non-retryable, i.e., `mapping.retryable === false`): log `non_retryable_error` with `{ code, errorType: mapping.type }`. Build SwapError as today (no retriesAttempted in details — never reached retry path). Dispatch EXECUTE_ERROR.
      5. Mirror the predicate in the catch block (lines 252-269) for thrown SwapError where `swapErr.retryable === true && retryCount < MAX_RETRIES - 1` → dispatch EXECUTE_RETRY (parity with response branch).
    - `src/App.tsx`:
      1. Import `MAX_RETRIES` from `./config/constants`.
      2. Verify `Loader2` is already imported from `lucide-react` (it is — used by SwapButton via inline import; if App.tsx doesn't import it directly yet, add the import).
      3. Add a sibling block in the loading-state rendering branch (next to existing `isLoading && context.quote === null` skeleton):
         ```tsx
         {context.state === SwapState.LoadingQuote && context.retryCount > 0 && (
           <div
             className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2"
             role="status"
             aria-live="polite"
           >
             <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
             <span className="text-sm text-muted-foreground">
               Retrying… attempt {context.retryCount + 1} of {MAX_RETRIES}
             </span>
           </div>
         )}
         ```
         Adjust the className to match adjacent panel patterns in App.tsx — this is illustrative.
      4. Inline error block at `App.tsx:464-478` — UNCHANGED. A-13 message already shows. Future consumer (4-1) can read `context.error.details.retriesAttempted` if a "failed after N attempts" subtitle is wanted later.
    - `src/App.test.tsx` — extend with 4 integration cases under a new `describe("SwapCard — Story 3-3 retry logic")` block:
      1. **Retry happy path:** mock `executeOrder` to fail with `{ status: "Failed", code: -1000 }` first call, `{ status: "Success", code: 0, signature: "sig123", inputAmountResult: "...", outputAmountResult: "..." }` second call. Trigger swap; advance through the retry-tick re-trigger pattern from existing 3-2 tests. Assert: state cycles → Success on attempt 2. Console log includes one `retry_scheduled` event with `attempt: 2`.
      2. **Retry exhausted:** mock `executeOrder` to fail with code -1000 on all 3 calls. Drive 3 sign-execute cycles. Assert: final state = Error, `context.error.details.retriesAttempted === 2`. Console logs include 2× `retry_scheduled` and 1× `retry_exhausted` (with `totalAttempts: 3`).
      3. **Non-retryable:** mock `executeOrder` to fail with code -2 (ExecutionFailed, non-retryable). Assert state → Error immediately on attempt 1, no retry. Console log includes `non_retryable_error` event. No retry-progress copy ever rendered.
      4. **Retry-progress copy:** within the LoadingQuote phase between attempts 1 and 2 (test 1 setup), assert `screen.getByText(/Retrying… attempt 2 of 3/)` is visible.
  - **Test mocking approach:** the user-driven re-trigger pattern means the test must click Swap once per attempt OR use the existing test helpers from 3-2's App.test.tsx that fast-forward through QuoteReady. Implementer should follow the closest existing pattern in App.test.tsx (likely the "happy path" test from 3-2 — verify by reading the file at implement time).
  - TDD: extend App.test.tsx first (red); implement hook + App.tsx changes to green.
  - Pattern reference: existing `useSwapExecution.ts:226-251` for SwapError construction shape (the A-13 `response.error?.trim()` pattern is preserved). App.tsx loading branch (around `isLoading`) for sibling block placement.
  - Per Dev Note #5: file Rule 3 amendment in this commit closing the A-11 swapHandler-extraction follow-up. Append entry to `docs/amendments.md` as A-14.
  - Commit: `feat(retry): wire retry decision and retry-progress copy via useSwapExecution`

- [ ] **Task 2: Manual verification + close**
  - Not test-producing; documentation/verification only.
  - Run all manual verification steps below. Confirm full `npm test` passes (no regressions vs. baseline 281).
  - Append concern C-10 to `docs/concerns.md` (deferred ErrorDisplay refactor + dedicated hook-test file). Suggest 4-1 as pickup candidate.
  - Update `docs/sprint-status.yaml` (3-3 → done) and `docs/state.json` (close-out: storiesDone 8 → 9, gate5Passes 6 → 7, sizeDistribution.S 2 → 3, etc.).
  - Tag `post-jupiter-swap-template-3-3` after Gate 5 passes.
  - Commit: `chore(story): close 3-3 — Gate 5 PASS`.

## must_haves

truths:
  - "On Jupiter response with mapping.retryable===true AND context.retryCount < MAX_RETRIES-1 (i.e., < 2), useSwapExecution dispatches EXECUTE_RETRY (NOT EXECUTE_ERROR); reducer transitions Executing → LoadingQuote and increments retryCount"
  - "On Jupiter response with mapping.retryable===true AND context.retryCount === MAX_RETRIES-1 (i.e., 2), useSwapExecution dispatches EXECUTE_ERROR with the SwapError carrying details.retriesAttempted=2"
  - "On Jupiter response with mapping.retryable===false (8 non-retryable codes or unknown via A-13 fallback), useSwapExecution dispatches EXECUTE_ERROR immediately; no EXECUTE_RETRY is dispatched"
  - "On thrown SwapError with retryable===true AND retryCount < 2, useSwapExecution dispatches EXECUTE_RETRY (parity with response branch)"
  - "Each EXECUTE_RETRY dispatch is preceded by structured log {event:'retry_scheduled', swapCorrelationId, attempt: retryCount+1, code, requestId, timestamp}"
  - "Final EXECUTE_ERROR after budget exhaustion is preceded by {event:'retry_exhausted', swapCorrelationId, totalAttempts: retryCount+1, code} log; non-retryable EXECUTE_ERROR preceded by {event:'non_retryable_error', code, errorType}"
  - "While context.state===LoadingQuote AND context.retryCount > 0, App renders 'Retrying… attempt {retryCount+1} of 3' copy with Loader2 spinner; standard first-load skeleton is unchanged (sibling block, not replacement)"
  - "Existing inline error block at App.tsx:464-478 is UNCHANGED. A-13's verbatim error.message already shows; details.retriesAttempted is available on context.error for future consumers but not yet rendered as a title"

artifacts:
  - path: "src/hooks/useSwapExecution.ts"
    contains: ["MAX_RETRIES", "EXECUTE_RETRY", "retry_scheduled", "retry_exhausted", "non_retryable_error", "retriesAttempted"]
  - path: "src/App.tsx"
    contains: ["MAX_RETRIES", "Retrying", "context.retryCount"]
  - path: "src/App.test.tsx"
    contains: ["retry_scheduled", "retry_exhausted", "non_retryable_error", "retriesAttempted"]

key_links:
  - pattern: "import { MAX_RETRIES }"
    in: ["src/hooks/useSwapExecution.ts", "src/App.tsx"]
  - pattern: 'dispatch({ type: "EXECUTE_RETRY" })'
    in: ["src/hooks/useSwapExecution.ts"]
  - pattern: '"retry_scheduled"'
    in: ["src/hooks/useSwapExecution.ts"]
  - pattern: '"retry_exhausted"'
    in: ["src/hooks/useSwapExecution.ts"]
  - pattern: '"non_retryable_error"'
    in: ["src/hooks/useSwapExecution.ts"]
  - pattern: "Retrying… attempt"
    in: ["src/App.tsx"]

## Dev Notes (advisory)

**1. Manual retry interpretation of AC-3-3-1.** Plan says "auto /order for fresh quote" — interpreted as *automatic from a fresh /order request* (no signed-tx replay), not *silent without user click*. After EXECUTE_RETRY → fresh QuoteReady, the user clicks Swap again to sign the next attempt — wallet popup is unavoidable per Jupiter design (each /execute requires a fresh signed tx). User sees "Retrying… attempt N of 3" copy during the brief LoadingQuote phase between attempts. Industry-standard UX (Raydium, Jupiter, Orca, jup-ag/plugin all use user-confirmed retry).

**2. EXECUTE_RETRY-from-Error problem.** Architecture-locked: the retry decision lives inside useSwapExecution.handleSwap's failure branch, BEFORE EXECUTE_ERROR is dispatched. There is no "Try Again" button on the Error state. Once on Error, the swap attempt is over; user re-enters via Dismiss + Swap.

**3. Off-by-one in canRetry predicate.** `< MAX_RETRIES - 1` (not `< MAX_RETRIES`), because EXECUTE_RETRY itself increments. Verification trace in Architecture Guardrails proves total = 3 attempts. **Risk:** implementer uses `< MAX_RETRIES` and produces 4 attempts. Mitigation: `must_haves.truths` #2 explicitly states the predicate; integration test #2 (retry exhausted) catches off-by-one.

**4. EXECUTE_ERROR resets retryCount to 0.** The existing inline error block cannot read retryCount from context after the final failure — it's been reset. The SwapError's `details.retriesAttempted` carries the count for downstream consumers (4-1's potential refactor, structured logs, integration tests).

**5. swapHandler module — permanent deferral.** A-11 said the standalone swapHandler extraction would be re-evaluated when 3-3's retry loop forced a "second consumer" pattern. It didn't. The retry decision is a single branching dispatch inside the existing handleSwap. **Action:** file Rule 3 amendment in Task 1 commit (A-14) closing the A-11 follow-up; orchestration permanently lives in useSwapExecution.

**6. A-13 already preferred response.error.** The existing inline error block shows error.message directly — whatever string the hook constructed flows through unchanged. 3-3 does not re-map and does not change A-13's `response.error?.trim() || mapping.message` precedence.

**7. C-10 (deferred refactors).** ErrorDisplay component refactor + dedicated `useSwapExecution.test.ts` file deferred. Logged in concerns.md after Task 1 lands. Pickup candidate: 4-1 if it's still wanted then.

**8. ExecutionTimeout (AC-3-3-7) already shipped.** The 60s timer in `useSwapState` (verified `useSwapState.ts:14`) dispatches `TIMEOUT` action with `errorType: ExecutionTimeout` while in Executing. Reducer (`swapReducer.ts:141-147`) handles the transition → Error. No new code needed for AC-3-3-7. Existing inline error block renders the timeout message via A-13 path.

**9. Library versions (verified from `package.json`):**
- `@solana/web3.js@^1.98.4` — no new web3.js usage in 3-3.
- `@solana/wallet-adapter-react@^0.15.39` — no new wallet usage.
- `lucide-react@^1.8.0` — verified, `Loader2` already imported by SwapButton (3-2 Task 3).
- ⚠ VERSION NOT VERIFIED via web search — using installed versions per package.json. No new dependencies needed.

## Manual Verification Steps

After Task 1 completes:

1. **Retryable failure with successful retry.** `npm run dev` → connect funded wallet → trigger a swap that's likely to fail with a retryable code (-1004 stale blockhash on busy mainnet, or simulate by intercepting `/swap/v2/execute` in DevTools network tab during dev). Expected: between attempts, "Retrying… attempt 2 of 3" copy + spinner appears in the loading area. Console shows `retry_scheduled` log with `attempt: 2`. Second attempt sign popup appears; if it succeeds, SuccessDisplay shows.
2. **Budget exhaustion.** Force 3 consecutive retryable failures. Expected: state lands on Error after attempt 3 with the existing inline error block + Jupiter's verbatim message. Console shows 2× `retry_scheduled` + 1× `retry_exhausted` (`totalAttempts: 3`). Inspect `context.error.details.retriesAttempted` via React DevTools — should equal 2.
3. **Non-retryable failure (slippage).** Set slippage to 0.1%, swap with non-trivial amount → Jupiter should respond with -2002 or similar non-retryable. Expected: state → Error immediately on attempt 1; NO retry; existing inline error block shows the slippage message verbatim (A-13). Console shows `non_retryable_error` log.
4. **Wallet rejection on retry.** Trigger a retry (step 1's setup), reject the second wallet popup. Expected: state → Error via SIGNING_ERROR; retryCount preserved at 1 (Signing → Error keeps context per `swapReducer.ts:101-103`); inline error block shows WalletRejected message; "Retrying…" copy is unmounted because state is now Error, not LoadingQuote.
5. **Single-action recovery.** From any Error state, click Dismiss. Expected: state → Idle within one click; retryCount → 0; retry-progress copy unmounts.
6. **No regression.** Run `npm test` → 281 baseline + Task 1's added tests, all green. Run `tsc --noEmit` clean. Run `vite build` clean.
7. **Console log audit.** Open DevTools console; trigger one full retry cycle (step 1). Verify all log events present with same `swapCorrelationId` across the retry attempts (one logical swap = one correlation ID — matches AC-3-3-1's wording "log `{ swapCorrelationId, attempt, code, requestId, timestamp }`" implying ONE correlation ID with multiple attempts).

## Out of Scope (preserved fence)

- **ErrorDisplay component refactor.** Logged C-10. Inline error block stays.
- **Dedicated `src/hooks/useSwapExecution.test.ts` file.** Logged C-10. Hook covered via App.test.tsx integration.
- **Dedicated "Swap failed after 3 attempts" copy in error UI.** `retriesAttempted` carried in `error.details` for future use; copy-level polish deferred to 4-1 if still wanted.
- **Toast notifications** on retry-exhausted or non-retryable errors. C-9 (already deferred to 4-1).
- **Automatic background retry without user click.** Wallet popup is required per attempt — Jupiter design constraint. Manual retry only.
- **Retry analytics / metrics events** beyond structured console logs.
- **Per-error-code retry strategy customization** (different backoff for -1004 vs -2003). All 5 retryable codes treated uniformly.
- **Reducer modifications.** EXECUTE_RETRY exists; pure consumer story.
- **Slippage-exceeded auto-bump UX** ("Retry with 1% slippage instead?"). Out of scope; would be a 4-3 follow-on.
- **Anything in epic 4** — preflight UX (4-1), comprehensive tests (4-2).

## Amendments Consulted

- **A-11 (swapHandler deferred from 3-2 to 3-3).** Recommendation: file A-14 in Task 1 commit closing A-11 follow-up; orchestration permanently lives in useSwapExecution.
- **A-13 (response.error preferred + code-bearing unknown fallback).** Inline error block reads `error.message` directly; no re-mapping. Plan AC-3-3-6 literal "Something went wrong" superseded by A-13's better message; non-retryable behavior preserved.
- **A-12 (SwapInFlightPanel pulled forward to 3-2).** Zero impact on 3-3 — orthogonal surface (Signing/Executing vs LoadingQuote with retryCount > 0).
- **A-10 (executeOrder return type).** Zero impact — pure consumer.
- **A-7 (user-controlled slippage).** Slippage-exceeded errors arrive as -2002 (non-retryable). User adjusts slippage manually after error.
- **A-6 (auto-refresh + stale-while-revalidate).** Retry-progress copy is a SIBLING block (state===LoadingQuote && retryCount > 0), not a modification of A-6's skeleton gate.
- **A-5 (ConfigError non-dismissible).** Aspirational wording; current behavior matches reducer (Dismiss → Idle → next swap re-surfaces error). No special-case code.

## Quality Self-Check

- **AC fidelity:** ✅ all 7 ACs preserved; copy-level deviation on AC-3-3-3 documented in Trim Decision.
- **Task ↔ AC coverage:** Task 1 → AC-3-3-1, 2, 3, 4, 6. Task 2 → all (verification).
- **Verified interfaces:** ✅ 6 entries with hashes; all DO NOT MODIFY.
- **Off-by-one math:** ✅ proven (3 total attempts).
- **must_haves count:** ✅ 8 truths (within S cap of 4-8).
- **Files modified:** 3 (useSwapExecution.ts, App.tsx, App.test.tsx). Files created: 0.
- **Trim documented:** ✅ Trim Decision section + C-10 entry committed in Task 2.

`Story: 3-3 (trimmed S) | Inlined: 8 sections | Refs: 5 scoped references | Omitted: 18 patterns`
