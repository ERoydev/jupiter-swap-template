---
id: "2-3-balance-service-proactive-warnings"
status: complete
created: 2026-04-23
completed: 2026-04-23
size: S
---

# Story: Balance Service + Proactive Warnings

## User Story
As a swap end user, when the app can't reach the balance service, I want a clear recovery path (retry or proceed without verification) so I'm not stuck in a silent failure state.

> **Scope narrowed by Amendment A-5 (2026-04-23).** The original proactive low-SOL Alert (AC-3) was dropped in favor of Story 3-1's disabled-Swap-button pattern, matching Raydium / Uniswap / PancakeSwap / jup-ag/plugin industry norm. This story now surfaces ONLY the fetch-failure overlay.

## Acceptance Criteria

- **AC-1 (verified, no new work).** Given `balanceService.getSolBalance(publicKey)`, When called, Then primary path hits `/ultra/v1/balances/{pubkey}` and returns SOL balance in **UI units** (amended from original "lamports" — implementation returns UI units; see Dev Notes); on Ultra error, falls back to `connection.getBalance(publicKey)` (web3.js RPC) and divides by `1e9`. On both-paths failure, throws `SwapError(ErrorType.BalanceCheckFailed, retryable=true)`.
- **AC-2 (verified, no new work).** Given `balanceService.getTokenBalance(publicKey, mint)`, When called, Then returns token balance via the same Ultra call. Ultra-only — no RPC fallback (Story 3-1 preflight uses this).
- **~~AC-3~~ (dropped per A-5).** Proactive low-SOL Alert removed from this story. Story 3-1 handles "Insufficient SOL" via disabled Swap button + Tooltip.
- **AC-4 (verified via Story 2-2, no new work).** Given wallet connected and input token selected, When the selector is open, Then the token row already shows balance + USD — no separate `TokenInput` balance field needed in this story.
- **AC-5 (NEW — the only new work in this story).** Given both Ultra and RPC fail for SOL (i.e. `useWalletBalances.isError === true` with a `SwapError(BalanceCheckFailed)`), Then the `SwapCard` renders a warning Alert: **"Unable to verify SOL balance. Your connection may be unstable."** with two actions:
  - **"Retry Check"** — calls `refetch()` on the query; button shows a loading state while `isFetching === true`.
  - **"Proceed Without Verification"** — dismisses the warning for the current session (component-local `useState`, no persistence). Dismissal persists until the component unmounts OR the user reconnects a different wallet.
  The Alert has `role="alert"`; both buttons have distinct `aria-label`s.

## Architecture Guardrails

**Scope (Amended A-4):** This story only adds UI surfaces to an already-built balance layer. All service/hook code already exists and is fully tested (178/178 green). Do NOT re-implement `balanceService` or `useWalletBalances`.

**What's already built (verify, don't reimplement):**
- `src/services/balanceService.ts` — Ultra-primary with SOL-only RPC fallback; 13 tests passing
- `src/hooks/useWalletBalances.ts` — TanStack Query, `staleTime: 30_000`, `enabled: Boolean(publicKey)`; tests passing
- `src/lib/connection.ts` — shared web3.js `Connection` singleton used by the RPC fallback
- Per-token balance display in `TokenSelector/TokenRow.tsx` (Story 2-2)

**What this story adds:**
- `src/ui/SolBalanceWarning.tsx` — presentational Alert component consuming `useWalletBalances` that renders ONLY the AC-5 fetch-failure overlay.
- Integration in `src/App.tsx` `SwapCard` — mount the component between the output display and the quote area (matches design-system §11 organism recipe).

**Unit semantics (advisory — not exercised by this story after A-5):**
- `balanceService.getSolBalance` and `useWalletBalances["SOL"].uiAmount` return **UI units** (SOL, not lamports).
- The existing `MIN_SOL_BALANCE` constant (`0.01 * LAMPORTS_PER_SOL` = lamports) remains untouched. This story performs no balance-threshold comparison, so no UI-units constant is introduced. Story 3-1 will make its own unit convention decision when it implements the Swap-button preflight.

**Error handling (LOCKED):**
- On `useWalletBalances.isError`, the hook's `error` will be the `SwapError(BalanceCheckFailed)` thrown by `getSolBalance` when both Ultra and RPC fail. UI displays the generic message (not `error.message`, which contains internal details like "Failed to fetch SOL balance from both Ultra and RPC").
- "Proceed Without Verification" is session-local UI state only. It does NOT set any flag that `preflightChecks` (Story 3-1) reads. Story 3-1 will still run its own preflight; this button only silences the proactive warning on `SwapCard`.

**Accessibility (LOCKED — per React rules + design-system §12):**
- Alert uses `role="alert"` (it's a time-of-appearance announcement, not ambient status).
- "Retry Check" button: `aria-label="Retry SOL balance check"`. Disabled state (`aria-disabled` + visual) while `isFetching`.
- "Proceed Without Verification" button: `aria-label="Proceed without verifying SOL balance"`.
- Both buttons must be reachable by Tab and invokable by Enter/Space (shadcn Button handles this; use it).
- All four themes (wireframe-light, wireframe-dark, brand-light, brand-dark) must render the warning legibly — no hardcoded colors; use shadcn Alert's `variant="destructive"` or a CSS-variable-based "warning" pattern.

**Dependency direction (LOCKED):** UI → Hooks → Services (never reverse). `SolBalanceWarning.tsx` imports `useWalletBalances`; `useWalletBalances` imports `balanceService`; neither imports from `App.tsx`.

> Ref: docs/architecture.md#Workflow 5 — the "RPC failure warning overlay" (checks 6 and 7) already specifies Retry Check / Proceed Without Verification semantics. This story implements that overlay proactively (AC-U-4), not just at swap time.

> Ref: docs/design-system.md#8.7 Feedback — shadcn `Alert` + `AlertTitle` + `AlertDescription` component references.

## Verified Interfaces

Computed from source files on disk at 2026-04-23. Implementer should re-check hashes before starting; any mismatch means the file has been edited since this story was written and the signatures below should be re-verified.

### `balanceService.getSolBalance` (existing — do not modify)
- **Source:** `src/services/balanceService.ts:108`
- **Signature:** `async getSolBalance(publicKey: PublicKey, signal?: AbortSignal): Promise<number>`
- **File hash:** `b6a5dc4124e6b294590fd20869529978f3ab73caced23e8ee7b0e0d1bc9e8f5c`
- **Plan match:** ⚠ Amended — plan says "returns lamports"; actual source returns UI units (SOL). Story carries the correction forward in AC-1.
- **Returns:** UI units (e.g. `1.5` for 1.5 SOL). Throws `SwapError(BalanceCheckFailed, retryable=true)` on both-paths failure.

### `balanceService.getTokenBalance` (existing — do not modify)
- **Source:** `src/services/balanceService.ts:141`
- **Signature:** `async getTokenBalance(publicKey: PublicKey, mint: string, signal?: AbortSignal): Promise<number>`
- **File hash:** `b6a5dc4124e6b294590fd20869529978f3ab73caced23e8ee7b0e0d1bc9e8f5c`
- **Plan match:** Matches

### `balanceService.getAllBalances` (existing — do not modify)
- **Source:** `src/services/balanceService.ts:90`
- **Signature:** `async getAllBalances(publicKey: PublicKey, signal?: AbortSignal): Promise<BalanceMap>`
- **File hash:** `b6a5dc4124e6b294590fd20869529978f3ab73caced23e8ee7b0e0d1bc9e8f5c`
- **Plan match:** Matches (amended A-4 spec)

### `useWalletBalances` (existing — do not modify)
- **Source:** `src/hooks/useWalletBalances.ts:6`
- **Signature:** `export function useWalletBalances(): { data: BalanceMap | undefined; isLoading: boolean; isError: boolean; error: Error | null }`
- **File hash:** `d8d211443ea3527e125e5c509982a5fc5c0e04e717f92b2c769fb262c3c074f6`
- **Plan match:** Matches
- **Note:** The hook currently returns only the 4 fields above. **To implement AC-5's Retry**, the story will either (a) extend the hook's return type to include `refetch` and `isFetching` (minor change — TanStack Query provides these for free), or (b) call `useQueryClient().invalidateQueries({ queryKey: ["jupiter-balances", ...] })` from the component. Prefer (a) — it keeps the retry localized and makes the hook more useful for future callers. See Task 1.

### `BalanceMap` (existing — do not modify)
- **Source:** `src/types/tokens.ts:20`
- **Signature:** `export type BalanceMap = Record<string, { uiAmount: number; rawAmount: string; decimals: number }>`
- **File hash:** `5e65668b9f847e59304adb3f3af1464055bb8ae90ad78be3e4a1d09078d72d27`
- **Plan match:** Matches. Native SOL is keyed `"SOL"` (not the wrapped-SOL mint).

### `SwapError` + `ErrorType.BalanceCheckFailed` (existing — do not modify)
- **Source:** `src/types/errors.ts:22` (class), `src/types/errors.ts:17` (enum value)
- **Signature:** `class SwapError extends Error { constructor(type: ErrorType, message: string, code?: number, retryable?: boolean, details?: Record<string, unknown>) }` ; `ErrorType.BalanceCheckFailed = "BalanceCheckFailed"`
- **File hash:** `317a0c5d83ba58c22a8d83a22fd8c5699870732c7ebdaa69c496260701b3da30`
- **Plan match:** Matches

### `MIN_SOL_BALANCE` (existing — keep untouched)
- **Source:** `src/config/constants.ts:5`
- **Signature:** `export const MIN_SOL_BALANCE = 0.01 * LAMPORTS_PER_SOL;` (resolves to `10_000_000`, units: lamports)
- **File hash:** `df5afdff583452b60396ee1b7171e488d69fada464b30444a8dd3927edfa0ec2`
- **Plan match:** Matches — but NOT the constant this story should compare against. See "Unit semantics" in Architecture Guardrails.

### `SwapCard` (existing — mount point for the new component)
- **Source:** `src/App.tsx:33`
- **Signature:** `export function SwapCard()` — React functional component; uses `useWallet()`, `useSwapState()`, renders `WalletButton`, input/output blocks, `QuoteDisplay`, error surface, `TokenSelectorModal`.
- **File hash:** `66d6901b8ec967c639f45e60baace036f8f1fedaed14fb47d76586d7ee46f727`
- **Plan match:** Matches. Currently has no balance-warning surface — this story adds it.
- **Integration point:** Insert `<SolBalanceWarning />` between the output display `</div>` (line 230) and the loading state (line 233). This matches design-system §11's body stacking order.

### shadcn `Alert` component
- **Install:** `npx shadcn add alert` (NOT currently in `src/components/ui/` — verified: only `badge.tsx`, `button.tsx`, `collapsible.tsx`, `detail-row.tsx` present).
- **Expected exports:** `Alert, AlertTitle, AlertDescription` from `@/components/ui/alert`.
- **Variants to use:** `destructive` (shadcn default) or `default` with warning-appropriate styling. Confirm during implementation; `docs/design-system.md` Section 11 advises "yellow" for warnings — inspect the installed `alert.tsx` and use `destructive` variant if a `warning` variant isn't present. Do NOT hardcode colors.

## Tasks

- [x] **Task 1: `SolBalanceWarning` component + unit tests + hook return-type extension** (commit `bc1c61f`)
  - Maps to: AC-5
  - Files to create:
    - `src/ui/SolBalanceWarning.tsx` — consumes `useWalletBalances()`, renders the AC-5 fetch-failure Alert (Retry + Proceed-Without-Verification) when `isError === true` and not dismissed; renders nothing otherwise.
    - `src/ui/SolBalanceWarning.test.tsx` — `@vitest-environment jsdom` comment; uses `@testing-library/react`; mocks `useWalletBalances` via `vi.mock("../hooks/useWalletBalances")`.
  - Files to modify:
    - `src/hooks/useWalletBalances.ts` — extend return type to include `refetch: () => Promise<unknown>` and `isFetching: boolean` (TanStack Query already provides both; just surface them). Update the existing `src/hooks/useWalletBalances.test.tsx` if it asserts on the return-type shape.
  - Files NOT to modify (dropped per A-5):
    - `src/config/constants.ts` — do NOT add `MIN_SOL_BALANCE_UI`. Story 3-1 owns the unit-convention decision.
  - Prerequisite: `npx shadcn add alert` (install + commit the generated `src/components/ui/alert.tsx`).
  - Test cases (minimum):
    1. Wallet disconnected (`useWalletBalances` returns `{ data: undefined, isLoading: false, isError: false }` — because `enabled: false`) → component renders nothing.
    2. `isLoading: true` → component renders nothing.
    3. Data loaded successfully (`isError: false`, any uiAmount) → component renders nothing.
    4. `isError: true` with `SwapError(BalanceCheckFailed)` → fetch-failure Alert with "Unable to verify SOL balance", two buttons with the specified `aria-label`s.
    5. Clicking "Retry Check" → calls `refetch()` exactly once; button becomes disabled while `isFetching === true`.
    6. Clicking "Proceed Without Verification" → the fetch-failure Alert unmounts; re-rendering with `isError: true` again does NOT re-show it (session-local dismiss).

- [x] **Task 2: Wire `SolBalanceWarning` into `SwapCard`** (commit `0a1eb85`)
  - Maps to: AC-5 (UI integration)
  - Files to modify: `src/App.tsx`.
  - Placement: between the output-display `</div>` (currently line 230) and the loading state (currently line 233). No other `SwapCard` logic changes.
  - Test cases (extend existing `src/App.test.tsx` if present):
    1. Smoke: `SwapCard` mounts with `SolBalanceWarning` child and wallet disconnected → no Alert visible.
    2. (If App.test already mocks `useWalletBalances`) — add a case where `isError: true` → the fetch-failure Alert appears in the card.

## must_haves

truths:
  - "SolBalanceWarning renders nothing when wallet is disconnected (useWalletBalances returns data: undefined with isError: false)"
  - "SolBalanceWarning renders nothing during isLoading === true"
  - "SolBalanceWarning renders nothing when data is loaded successfully and isError is false (regardless of balance — low-balance signaling is Story 3-1's responsibility per A-5)"
  - "SolBalanceWarning renders a fetch-failure Alert with role='alert' and text 'Unable to verify SOL balance' when useWalletBalances.isError is true"
  - "Retry Check button calls refetch() and becomes disabled while isFetching is true"
  - "Proceed Without Verification button unmounts the fetch-failure Alert for the remainder of the component lifetime (session-local useState)"
  - "useWalletBalances return type exposes refetch: () => Promise<unknown> and isFetching: boolean (passthrough from TanStack Query)"
  - "SolBalanceWarning imports useWalletBalances — NOT balanceService directly (UI -> Hooks -> Services dependency direction)"

artifacts:
  - path: "src/ui/SolBalanceWarning.tsx"
    contains: ["SolBalanceWarning", "useWalletBalances", "role=\"alert\"", "Retry Check", "Proceed Without Verification"]
  - path: "src/ui/SolBalanceWarning.test.tsx"
    contains: ["describe", "SolBalanceWarning", "vi.mock", "useWalletBalances", "aria-label"]
  - path: "src/hooks/useWalletBalances.ts"
    contains: ["refetch", "isFetching", "jupiter-balances"]
  - path: "src/App.tsx"
    contains: ["SolBalanceWarning"]
  - path: "src/components/ui/alert.tsx"
    contains: ["Alert", "AlertTitle", "AlertDescription"]

key_links:
  - pattern: "import { SolBalanceWarning }"
    in: ["src/App.tsx"]
  - pattern: "import { useWalletBalances }"
    in: ["src/ui/SolBalanceWarning.tsx"]
  - pattern: "import { Alert, AlertTitle, AlertDescription }"
    in: ["src/ui/SolBalanceWarning.tsx"]

## Dev Notes (advisory)

**A-5 scope trim.** This story used to add both a proactive low-SOL Alert (AC-3) AND the fetch-failure overlay (AC-5). A-5 drops AC-3 — the low-SOL signal is better handled by Story 3-1's disabled Swap button. This story now builds ONLY the fetch-failure overlay. Ignore any legacy references to `MIN_SOL_BALANCE_UI` or below-threshold rendering in early drafts.

**Session dismiss implementation.**
```tsx
const [dismissed, setDismissed] = useState(false);
// …
if (isError && !dismissed) {
  return <Alert>… <Button onClick={() => setDismissed(true)}>Proceed Without Verification</Button> …</Alert>;
}
```
Deliberately not persisted. If the user reloads the page, they see the warning again — that's correct behavior for a safety prompt.

**Retry button loading state pattern.**
```tsx
<Button
  onClick={() => void refetch()}
  disabled={isFetching}
  aria-label="Retry SOL balance check"
>
  {isFetching ? "Checking…" : "Retry Check"}
</Button>
```
`void refetch()` discards the returned promise; TanStack will update `isFetching` → `isError`/`data` via the hook's return. No manual error handling needed.

**Render logic (simplified after A-5):**
```tsx
if (!isError) return null;                  // no error → nothing (success, loading, disconnected all fall here)
if (dismissed) return null;                 // user chose Proceed Without Verification
return <FetchFailureAlert onRetry={() => void refetch()} onDismiss={() => setDismissed(true)} isFetching={isFetching} />;
```

**Testing approach.**
- Mock `useWalletBalances`: `vi.mock("../hooks/useWalletBalances", () => ({ useWalletBalances: vi.fn() }))` then per-test `vi.mocked(useWalletBalances).mockReturnValue({ data: ..., isLoading: false, isError: false, error: null, refetch: vi.fn(), isFetching: false })`.
- For Retry test: create a mock `refetch`. Click Retry, assert `refetch` was called once and that the button is disabled while `isFetching: true`. Re-render with the success shape and assert the Alert unmounts.
- For Proceed-Without-Verification test: render with `isError: true`, click the button, assert the Alert unmounts. Then re-render with `isError: true` again (simulating another failed fetch) and assert it STAYS unmounted.
- Use `@testing-library/react`'s `screen.getByRole("alert")` for positive assertions and `screen.queryByRole("alert")` for negative (is-null) assertions.

**Accessibility details.**
- The fetch-failure Alert uses `role="alert"` (important announcement, not ambient) — screen readers interrupt to read it.
- Buttons nested inside the Alert must be reachable by keyboard. shadcn `Button` is a native `<button>` element — no extra work needed.
- Themes: rely on shadcn Alert's CSS variables (`--destructive`, `--foreground`, etc.) — they're already wired for all four themes in the existing theme CSS.

**No pre-existing baseline failures.** `docs/sprint-status.yaml` reports `baselineTests.failing = 0` and 178/178 tests green. This story must not introduce regressions; the full verification loop (format → lint → build → test → test integrity → security, per code-standards §2) runs before every commit.

**Do NOT modify `balanceService.ts`, `balanceService.test.ts`, `src/lib/connection.ts`, or `src/config/constants.ts`.** Those are Story 2-2 / 3-1 contracts. Modify only the public return type of `useWalletBalances` (additive; safe) and create the new component/test files.

**Commit plan (one commit per task per code-standards §1):**
1. `feat(ui): add SolBalanceWarning fetch-failure overlay with retry + dismiss` (Task 1 — component, tests, useWalletBalances refetch/isFetching passthrough)
2. `feat(app): wire SolBalanceWarning into SwapCard` (Task 2)
Pre-story tag: `pre-jupiter-swap-template-2-3` (already created at story start). Post-story tag: `post-jupiter-swap-template-2-3` (after Gate 5 passes).

> Ref: docs/design-system.md#11 — organism stack order (TokenInput → TokenInput → Alerts → Quote → Swap).

> Ref: docs/design-system.md#8.7 — shadcn Alert exports (`Alert, AlertTitle, AlertDescription`) and variants.

> Ref: docs/Decisions.md#7 — rationale for Ultra-primary + narrow SOL-only RPC fallback (context for AC-5's "both paths failed" trigger).

> Ref: docs/amendments.md#A-4 — scope narrowing that makes this story the "SOL preflight warning surface only".

## Detected Patterns

| Pattern | Value | Sampled from | Established? |
|---------|-------|--------------|-------------|
| UI component file location | `src/ui/{ComponentName}.tsx`, single-file or folder with `index.ts` | `src/ui/QuoteDisplay.tsx`, `src/ui/TokenSelector/index.ts`, `src/ui/WalletButton.tsx` | Established |
| Test colocation | `src/ui/{ComponentName}.test.tsx` next to component, `@vitest-environment jsdom` header | `src/ui/TokenSelector/TokenRow.test.tsx`, `src/ui/TokenSelector/TokenSelectorModal.test.tsx` | Established |
| Alert/role pattern | `role="alert"` for errors, `role="status"` for loading | `src/App.tsx:236, 264`, `src/ui/TokenSelector/TokenSelectorModal.tsx:154, 162, 178` | Established |
| Hook mocking in tests | `vi.mock("../hooks/useX", () => ({ useX: vi.fn() }))` + per-test `mockReturnValue` | `src/ui/TokenSelector/TokenSelectorModal.test.tsx` | Established |
| shadcn component install | `npx shadcn add <name>` → generated into `src/components/ui/` | `src/components/ui/badge.tsx`, `src/components/ui/button.tsx` | Established |
| Named exports only | `export function X` / `export const X` — no default exports | `src/hooks/useWalletBalances.ts`, `src/services/balanceService.ts`, `src/App.tsx` | Established |
| Error construction | `new SwapError(ErrorType.X, message, code?, retryable?, details?)` | `src/services/balanceService.ts:122`, `src/App.tsx:97` | Established |
| `import type` for type-only imports | Yes, consistently | `src/hooks/useWalletBalances.ts:4`, `src/services/balanceService.ts:1, 4` | Established |
| Test framework import | `import { describe, it, expect, vi, beforeEach } from "vitest"` | `src/services/balanceService.test.ts:1` | Established |

## Wave Structure (internal to this story)

- **Wave 1:** Task 1 — build `SolBalanceWarning` + its tests + extend `useWalletBalances` return. New file + additive hook change.
- **Wave 2:** Task 2 — wire into `SwapCard`. Depends on Task 1's component existing.

## Story Size: S

- Scope trimmed by A-5 — now strictly fetch-failure overlay only.
- 2 new files (`SolBalanceWarning.tsx`, `SolBalanceWarning.test.tsx`), 2 modified (`useWalletBalances.ts`, `App.tsx`), 1 generated (`alert.tsx` from shadcn).
- `must_haves.truths` count: 8 (within S cap).

## Manual Verification Steps

After Task 2 completes:
1. `npm run dev` → open the app, do NOT connect a wallet → no Alert visible. ✓
2. Connect a wallet, balances load successfully → no Alert visible. ✓
3. Simulate fetch failure (DevTools → Network → block `jup.ag` + `lite-api.jup.ag`; AND stub `Connection.getBalance` to reject — both paths must fail, since Ultra failure alone falls through to RPC) → Alert: "Unable to verify SOL balance …" with Retry + Proceed buttons. ✓
4. Click "Retry Check" while network blocked → button shows "Checking…", disabled; after response, Alert remains (fetch still failing). ✓
5. Unblock network, click "Retry Check" → Alert disappears. ✓
6. Re-block network, dismiss via "Proceed Without Verification" → Alert disappears and does NOT re-appear on next failed fetch until page reload. ✓
7. Switch theme (wireframe-light ↔ wireframe-dark ↔ brand-light ↔ brand-dark) → Alert remains legible in all four. ✓
8. Tab through the swap card → Retry and Proceed buttons reachable by keyboard, Enter/Space invokes them. ✓
