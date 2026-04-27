---
id: "4-1"
slug: preflight-ux-responsive-layout
title: "Pre-flight UX + Responsive Layout"
size: M
status: done
wave: 4
dependencies: ["3-1"]
storiesDoneAtCreation: 9
created: 2026-04-27
completedAt: 2026-04-27
---

# Story: Pre-flight UX + Responsive Layout

## User Story
As a swap end user, I want clear feedback on why I can't swap and a fully responsive interface, so that the app works well on any device.

## Acceptance Criteria
- AC-1: Given each of 7 pre-flight failures, When swap button renders, Then specific disabled text + Tooltip
- AC-2: Given 320px viewport, When rendered, Then no horizontal scroll, no overlap, tap targets ≥ 44px
- AC-3: Given 375px, 768px, 1024px, 1920px viewports, Then layouts match wireframes
- AC-4: Given mobile token selector, When opened, Then Drawer. Desktop → Dialog
- AC-5: Given mobile quote details, When rendered, Then collapsed by default
- AC-6: Given all interactive elements, When focused via keyboard, Then visible focus ring. Tab order follows spec

**FR Coverage:** FR-13, FR-11 (UX) — **NFR Coverage:** NFR-7 (WCAG AA), NFR-8 (responsive)

## Architecture Guardrails (LOCKED)

**This story is presentation-only.** No reducer changes, no new state actions, no new data fetching, no service-layer modifications.

- **No re-implementation.** A-6 (auto-refresh + manual refresh logic), A-12 (`SwapInFlightPanel`), and 4-3 (slippage logic) are already shipped. 4-1 only owes the **polish layer** on top — animations, hover states, focus-ring parity, a11y attributes.
- **No type changes.** `ErrorType` enum (`src/types/errors.ts`, 18 variants) stays as-is. `SwapError` shape stays as-is. `SwapResult` stays as-is.
- **No new interfaces** for existing components. `SwapButtonProps`, `SuccessDisplayProps`, `SlippageSelectorProps`, etc. stay as-is unless extracting `ErrorDisplay` (C-10) — see Tasks.
- **Mobile breakpoint is fixed** at `<768px` via `useIsMobile()` (`src/hooks/use-mobile.ts:3`, `MOBILE_BREAKPOINT = 768`). Do not introduce a competing breakpoint hook.
- **Toast library selection** is a Rule 4 architectural choice — must be approved before install. Default candidate: `sonner` (works with shadcn + the four documented themes). If user rejects sonner during review, fall back to a `role="status"` aria-live region (no library) and keep the existing Alert as the visual cue.

> Ref: `docs/architecture.md#Responsive Design` (line 659-666) — mobile-first Tailwind, breakpoints `sm:` 640 / `md:` 768 / `lg:` 1024, token-selector mobile/desktop split, collapsed quote details on mobile.
> Ref: `docs/design-system.md#5. Spacing & Layout` — design tokens for spacing, border radius, layout constants. Use these, not hardcoded values.
> Ref: `docs/design-system.md#3. Color System & Themes` — all four themes (wireframe-light/dark, brand-light/dark) must work; no hardcoded colors.

**Amendments applied to this story:**
- **A-6** (line 214) — Quote refresh logic shipped in 3-1. **4-1 owes:** countdown ring animation (optional), hover state polish, focus-visible ring parity. **Do NOT re-implement** auto-refetch or `QUOTE_REFRESH_INTERVAL_MS` plumbing.
- **A-9** (line 269) — Slippage moved into card (4-3 done). **4-1 owes:** verify `aria-pressed` on the 4 preset buttons (3 numeric + 1 custom), keyboard nav across them, custom-input validation announcement. **Source already has most of this** (`SlippageSelector.tsx:119,156` — verify completeness).
- **A-12** (line 597) — `SwapInFlightPanel` shipped in 3-2. **4-1 owes:** card-overlay transitions, output-border flash-green on success, slide-in/fade-out polish. **Do NOT re-implement** the panel itself.
- **A-14** (latest) — `swapHandler` extraction permanently deferred. **No 4-1 impact.**

## Verified Interfaces

All interfaces below are read from live source code on 2026-04-27. SHA-256 hashes captured for downstream skip-on-unchanged.

### `SwapButton` — `src/ui/SwapButton.tsx:96`
- **Signature:** `function SwapButton({ state, hasQuote, preflightError, onClick }: SwapButtonProps): JSX.Element`
- **Internal helper:** `deriveSurface(state, hasQuote, preflightError): { label, disabled, tooltip }` at line 21
- **Existing 7-failure mapping** (lines 45-87): `WalletNotConnected` → "Connect Wallet"; 4 `InvalidInput` variants discriminated by message ("Enter a positive amount", "Invalid input token address", "Invalid output token address", "Cannot swap a token to itself"); `InsufficientSOL` → "Insufficient SOL"; `InsufficientBalance` → `${symbol}` (strips " balance" from message); `default` → "Cannot swap".
- **File hash:** `ffc50d96f46b0379346a3ff089065c73cc817a66e0b0ebb7f1ce390deec9e10f`
- **Plan match:** Matches — all 7 preflight failure types already mapped; AC-1 work is verifying tooltip copy quality and adding a11y polish (e.g., `aria-describedby` on the disabled button pointing at the tooltip).

### `preflightChecks.run` — `src/handlers/preflightChecks.ts:35`
- **Signature:** `async run(params: PreflightParams, wallet: PreflightWallet): Promise<void>` (throws `SwapError` on first failing check)
- **7 checks in declared order:** (1) wallet connected, (2) positive amount, (3) input mint base58, (4) output mint base58, (5) input ≠ output, (6) SOL ≥ `MIN_SOL_BALANCE_UI`, (7) input balance ≥ amount UI.
- **Error messages** (load-bearing for `SwapButton.deriveSurface` discrimination): "Connect a wallet to continue" / "Enter a positive amount" / "Invalid input token address" / "Invalid output token address" / "Cannot swap a token to itself" / "You need at least 0.01 SOL for transaction fees" / `Insufficient ${inputSymbol} balance`.
- **File hash:** `41a25d0f49450c5b6a0308a1876dfb7f1ba33ed8db73f362255fa9d640ded740`
- **Plan match:** Matches.

### `SuccessDisplay` — `src/ui/SuccessDisplay.tsx:26`
- **Signature:** `function SuccessDisplay({ result, inputSymbol, inputDecimals, outputSymbol, outputDecimals, onNewSwap }: SuccessDisplayProps): JSX.Element`
- **TODO breadcrumb at line 41:** `// TODO(4-1): fire toast notification on success per spec AC-FR-9 ("Toast also fires"). Deferred from 3-2 because no toast library was installed at the time of writing.`
- **File hash:** `b6e8f289e5443591727877f8ac3646f8ec1090fdb3cff67043c8d2fb103da1c1`
- **Plan match:** Matches — TODO is the C-9 wire-up site.

### `SlippageSelector` — `src/ui/SlippageSelector.tsx:39`
- **Signature:** `function SlippageSelector({ value, onChange }: SlippageSelectorProps): JSX.Element`
- **A11y already in source:** `role="radiogroup"` (line 109), `aria-pressed={active}` on 3 preset buttons (line 119) + custom button (line 156), `aria-label`, `aria-invalid`, `aria-describedby`, `role="alert"` for error (line 171), `focus-visible:ring-2 focus-visible:ring-ring` on every button.
- **PRESETS** (line 13-17): only 3 presets defined (`0.1%`, `0.5%`, `1.0%`) plus 1 Custom button = 4 total. Spec calls "the 4 preset buttons" which equals 3 numeric presets + 1 custom toggle.
- **File hash:** `b46ef5abcd31a4dee2665c13e465e2e772588aabdee0f0659adf822f303617d2`
- **Plan match:** Matches. **A-9 polish surface:** verify keyboard arrow-key nav across the radiogroup (currently relies on Tab; `role="radiogroup"` semantics expect arrow-key nav per WAI-ARIA).

### `QuoteRefreshIndicator` — `src/ui/QuoteRefreshIndicator.tsx:9`
- **Signature:** `function QuoteRefreshIndicator({ state, onRefresh }: QuoteRefreshIndicatorProps): JSX.Element | null`
- **A-6 polish target:** spin animation already on `LoadingQuote` (line 29). Focus-visible ring already present (line 26). Optional countdown-ring polish lives here.
- **File hash:** `abfc96a797044d6f795bc92faec746613c782e826afd02549e797892db777c1d`
- **Plan match:** Matches.

### `SwapInFlightPanel` — `src/ui/SwapInFlightPanel.tsx:31`
- **Signature:** `function SwapInFlightPanel({ mode }: { mode: "signing" | "executing" }): JSX.Element`
- **A-12 polish surface (per source comment line 26-29):** "card-level backdrop overlay, slide-in animation, and output-border flash-green still belong to Story 4-1."
- **File hash:** `86525fd9ff4bc94c375aefb2917f39e5c01ec1f3e1da3b5aec7aac1c2e94ad22`
- **Plan match:** Matches.

### `TokenSelectorModal` — `src/ui/TokenSelector/TokenSelectorModal.tsx:292`
- **Signature:** `function TokenSelectorModal(props: TokenSelectorModalProps): JSX.Element | null`
- **AC-4 already implemented** (lines 292-305): `useIsMobile()` switches between `<MobileDrawer>` (line 255, `Drawer.Root` from `@base-ui/react/drawer`) and `<DesktopModal>` (line 220, `Dialog.Root` from `@base-ui/react/dialog`). 4-1 only owes verification + tap-target audit on rows.
- **File hash:** `2775bc5574e6bffc3e2af4f883e6ee5d2e58079d47228eb84e9afb64f14fdb5e`
- **Plan match:** Matches — AC-4 is already satisfied; 4-1 is verification, not implementation.

### `useIsMobile` — `src/hooks/use-mobile.ts:5`
- **Signature:** `function useIsMobile(): boolean` — `MOBILE_BREAKPOINT = 768` at line 3.
- **File hash:** `224c66ebfab3502618ba391f62bef1092cf484bb109b467becc58daa9aecd4e1`
- **Plan match:** Matches.

### `useSwapExecution` — `src/hooks/useSwapExecution.ts:41` (read-only context for ErrorDisplay)
- **Signature:** `function useSwapExecution(params: UseSwapExecutionParams): { handleSwap, lastSwapResult }`
- **`error.details.retriesAttempted` set at:** line 267 (budget-exhausted from `EXECUTE_RETRY` decision), line 334 (catch block on threw error). C-10's "Swap failed after 3 attempts" copy reads this off `context.error.details?.retriesAttempted`.
- **File hash:** `17e656ae3d083c7b6a056a6e85986c884d22e50d9f1e2c1290cff0a6b18fa853`
- **Plan match:** Matches.

### `App.tsx` SwapCard composition — `src/App.tsx:46`
- **Inline error block at lines 487-503** (the C-10 refactor target): renders `context.error.message` inside a `<div role="alert">` with a Dismiss button dispatching `{ type: "DISMISS" }`. Wired in render tree between `SwapInFlightPanel`/`QuoteDisplay` and `SuccessDisplay`.
- **In-flight render at lines 460-485** (A-12 polish target).
- **`hasError` boolean at line 264:** `context.state === SwapState.Error`.
- **File hash:** `3fe5147d418ae78c017100ef182c061f81189e7e28494cb8eb3cb2a53204816f`
- **Plan match:** Matches.

### `ErrorType` enum — `src/types/errors.ts:1` and `SwapError` class at line 22
- **18 enum variants** (frozen for 4-1). `SwapError(type, message, code?, retryable?, details?)`.
- **File hash:** `317a0c5d83ba58c22a8d83a22fd8c5699870732c7ebdaa69c496260701b3da30`
- **Plan match:** Matches.

## Tasks

### Task 1 — Pre-flight UX polish + a11y sweep + ErrorDisplay extraction
- **Maps to:** AC-1, AC-6 (a11y portion)
- **Files (modify):**
  - `src/ui/SwapButton.tsx` — verify all 7 preflight failure types produce specific (non-generic) labels + tooltips. Add `aria-describedby` linking the disabled button to its tooltip text so screen readers announce the reason. Confirm `Tooltip.Trigger` keyboard-activates on focus (base-ui tooltip default is hover; explicit focus open may be needed).
  - `src/ui/SlippageSelector.tsx` — A-9 a11y verification. Add arrow-key navigation across the radiogroup (`role="radiogroup"` per WAI-ARIA expects ArrowLeft/ArrowRight to move focus between presets). Confirm validation announcement (`role="alert"` on `#slippage-custom-error` already at line 171). Verify `aria-pressed` reflects active state on all 4 buttons including custom.
  - `src/ui/QuoteRefreshIndicator.tsx` — A-6 polish: hover state parity with other icon buttons; focus-visible ring already present (line 26) — confirm matches design-system spec.
- **Files (create — IF in scope):**
  - `src/ui/ErrorDisplay.tsx` — new component, extracts inline block from `App.tsx:487-503`. Composes shadcn `Alert variant="destructive"` + `AlertTitle` + `AlertDescription`. Reads `error.details?.retriesAttempted`; when `retriesAttempted === MAX_RETRIES - 1` (i.e., budget exhausted), title is "Swap failed after 3 attempts"; otherwise title is "Swap failed". Body renders `error.message`. Dismiss button triggers `onDismiss` callback (parent dispatches `DISMISS`).
  - `src/ui/ErrorDisplay.test.tsx` — covers: (a) generic-failure title, (b) "Swap failed after 3 attempts" title when `retriesAttempted === MAX_RETRIES - 1`, (c) dismiss invokes callback.
  - `src/App.tsx` — replace inline block at lines 487-503 with `<ErrorDisplay error={context.error} onDismiss={() => dispatch({ type: "DISMISS" })} />`.
- **Default-skip switch:** If task scope grows past the M budget at mid-task, skip the `ErrorDisplay` extraction (per C-10 default-skip clause) and document the residual deferral in `docs/concerns.md`. The inline block at `App.tsx:487-503` already satisfies AC-3-3-3 at the behavior level.
- **`useSwapExecution` standalone test file:** Default-skip per C-10. Integration coverage in `App.test.tsx` is sufficient. If user requests during review, add `src/hooks/useSwapExecution.test.ts` using `renderHook` from `@testing-library/react`.

### Task 2 — Responsive layout pass + tap targets + in-flight polish
- **Maps to:** AC-2, AC-3, AC-4, AC-5
- **Files (verify, then modify if non-compliant):**
  - `src/App.tsx` — viewport sweep at 320 / 375 / 768 / 1024 / 1920. Confirm SwapCard root container `max-w-` and padding tokens match design-system §5.3 layout constants. Confirm no horizontal scroll at 320px (browser DevTools device emulation). Confirm tap targets ≥44px on every interactive element (SwapButton already `size="lg"`; check token-pair selectors, SlippageSelector preset buttons, QuoteRefreshIndicator, Dismiss link).
  - `src/ui/QuoteDisplay.tsx` — AC-5: collapse details by default on mobile via `useIsMobile()` + a `<details>`/`<summary>` toggle or aria-expanded button. Desktop expanded by default. **Read this file first** (not touched in Verified Interfaces because it's UI-only and unchanged) and add the responsive collapse only if not already present.
  - `src/ui/TokenSelector/TokenSelectorModal.tsx` — AC-4: verify Drawer-on-mobile / Dialog-on-desktop already works (`useIsMobile()` switch at line 294). Confirm `TokenRow` height `72px` (line 196) ≥44px tap target. Confirm Drawer popup `h-[85vh]` (line 269) leaves room for status bars on mobile.
  - `src/ui/SwapInFlightPanel.tsx` + `src/App.tsx` — A-12 polish: add slide-in/fade-out animation to the panel mount/unmount (Tailwind `animate-in fade-in slide-in-from-bottom-2` or equivalent). Add card-level backdrop overlay (semi-transparent layer over QuoteDisplay region while in-flight). On `EXECUTE_SUCCESS` transition, briefly flash output-border green using transition classes. **All animations must respect `prefers-reduced-motion`** — wrap in a `motion-safe:` Tailwind variant.
- **Files (likely no change, just verification):**
  - `src/ui/WalletButton.tsx`, `src/components/ui/*` (shadcn primitives — do not edit; if a tap target is too small, adjust the *consumer* class).
- **Reduced motion guard:** Every new animation introduced in this task must use `motion-safe:` Tailwind prefix or a `prefers-reduced-motion: reduce` media query. WCAG AA / NFR-7 compliance.

### Task 3 — Success toast + final keyboard/focus pass
- **Maps to:** AC-1 (tooltip focus polish), AC-6 (focus rings + tab order); wires C-9
- **Approval gate (Rule 4):** Toast library selection (sonner default; alternatives: react-hot-toast, native aria-live). **HALT for user approval** before `npm install`. If user rejects all libraries, implement a minimal aria-live `<output role="status" aria-live="polite">` toast region at the SwapCard root and skip the library install — the success Alert already covers the user-facing intent.
- **Files (modify after approval):**
  - `package.json` — add chosen toast library if approved.
  - `src/main.tsx` or `src/App.tsx` — mount `<Toaster />` (sonner) at app root if library chosen.
  - `src/ui/SuccessDisplay.tsx` — at the `// TODO(4-1)` breadcrumb (line 41-43), call `toast.success(\`Swap successful: ${sent} ${inputSymbol} → ${received} ${outputSymbol}\`)` inside a `useEffect(() => { ... }, [result.txId])` so the toast fires once per success and not on every render. Verify the toast does not double-announce for screen readers — the existing `<Alert>` defaults to `role="alert" aria-live="assertive"`. The toast should use `aria-live="polite"` and a non-`alert` role to avoid duplicate announcements (sonner default is polite). If the duplicate is unavoidable, suppress the Alert's implicit live region for this case.
  - `src/App.tsx` — keyboard tab order audit. Expected order top-to-bottom: WalletButton → input-token selector → input amount → output-token selector → SlippageSelector (3 presets + custom; arrow keys move within) → QuoteRefreshIndicator → SwapButton → (if visible) ErrorDisplay Dismiss / SuccessDisplay New Swap link / Solscan link. Add `tabIndex` overrides only if natural DOM order is wrong (it should not be).
  - All focusable elements — confirm visible `focus-visible:ring-2 focus-visible:ring-ring` (or design-system equivalent). Search for any element missing this class.
- **Remove the TODO breadcrumb** at `SuccessDisplay.tsx:41-43` once toast is wired.
- **Remove the C-9 entry** from `docs/concerns.md` (mark resolved with link to this story); same for C-10 if ErrorDisplay shipped in Task 1.

## must_haves
truths:
  - "All 7 preflight failure types produce a specific disabled label and tooltip in SwapButton (no failure path renders the generic 'Cannot swap' fallback during normal use; the default branch at SwapButton.tsx:82 only fires for unmapped ErrorType variants)"
  - "Disabled SwapButton has aria-describedby pointing at its tooltip text so screen readers announce the reason"
  - "App renders without horizontal scroll at 320px viewport (manual verification step 1)"
  - "Every interactive element has a hit-area of at least 44x44 CSS pixels at all five tested breakpoints (320 / 375 / 768 / 1024 / 1920)"
  - "TokenSelectorModal renders Drawer (from @base-ui/react/drawer) when useIsMobile() returns true and Dialog (from @base-ui/react/dialog) otherwise"
  - "QuoteDisplay collapses non-essential details by default on mobile (<768px) and expands them on desktop"
  - "SlippageSelector preset buttons (3 numeric + 1 custom) all have aria-pressed reflecting active state, and ArrowLeft/ArrowRight move focus between them within the radiogroup"
  - "Success toast fires exactly once per EXECUTE_SUCCESS dispatch (via useEffect keyed on result.txId), or — if user rejects toast library — an aria-live='polite' status region announces success without duplicating the Alert's role='alert'"
  - "Keyboard Tab traverses SwapCard in the documented top-to-bottom order with a visible focus ring (focus-visible:ring-2 focus-visible:ring-ring or design-system equivalent) on every focusable element"
  - "All new animations (in-flight slide-in, success border flash, tooltip transitions) respect prefers-reduced-motion via motion-safe: Tailwind prefix"
  - "Existing 286 tests still pass (no regression in App.test.tsx, SwapButton.test.tsx, SlippageSelector.test.tsx, TokenSelectorModal.test.tsx, SuccessDisplay.test.tsx)"
  - "All colors, spacings, and radii reference design-system tokens (CSS vars or Tailwind classes); a grep for hex literals (e.g., #[0-9a-fA-F]{3,6}) in modified files returns zero new occurrences"
artifacts:
  - path: "src/ui/SwapButton.tsx"
    contains: ["aria-describedby"]
  - path: "src/ui/SlippageSelector.tsx"
    contains: ["aria-pressed", "ArrowLeft", "ArrowRight"]
  - path: "src/ui/SuccessDisplay.tsx"
    contains: ["toast"]
  - path: "src/ui/SwapInFlightPanel.tsx"
    contains: ["motion-safe:"]
  - path: "src/App.tsx"
    contains: ["motion-safe:"]
key_links:
  - pattern: "useIsMobile"
    in: ["src/ui/TokenSelector/TokenSelectorModal.tsx", "src/ui/QuoteDisplay.tsx"]
  - pattern: "aria-pressed"
    in: ["src/ui/SlippageSelector.tsx"]
  - pattern: "aria-describedby"
    in: ["src/ui/SwapButton.tsx"]
  - pattern: "toast.success"
    in: ["src/ui/SuccessDisplay.tsx"]

## Dev Notes (advisory)

**Toast library decision (Rule 4 — HALT before installing):**
- `package.json` has no toast library installed (verified 2026-04-27 via grep: only `@base-ui/react` and `lucide-react` cover the UI primitive surface).
- Default candidate: `sonner` — works with shadcn, supports the four documented themes via CSS variables, has good a11y defaults (`aria-live="polite"`).
- Alternatives: `react-hot-toast` (lighter, less themeable); native aria-live status region (zero deps, less polish).
- **Action:** propose at story start; do not install without explicit user approval per code-standards Rule 4.

**No `!` non-null assertions in production code** (per `.claude/rules/nodejs.md`). When reading `context.error.details?.retriesAttempted` in ErrorDisplay, use optional chaining + nullish check, never `!`.

**All four themes must work** (per `.claude/rules/design-system.md`): wireframe-light, wireframe-dark, brand-light, brand-dark. Manually toggle each theme during Task 2 layout sweep.

**Component state checklist** (per `.claude/rules/react.md`): every render branch must handle Loading / Error / Empty / Success / Disabled. SwapButton already covers all five via `deriveSurface`; ErrorDisplay (if extracted) needs explicit Empty (no error) gating in App.tsx (`{hasError && context.error && <ErrorDisplay ... />}`).

**Stub/disable detection (per `.claude/rules/test-integrity.md`):** do not add `xit`, `.skip`, `.todo`, or `@Disabled` to any test in this story. If a test fails after a polish change, fix the test or fix the source — do not silence it.

> Ref: `docs/design-system.md#3. Color System & Themes` — token names and CSS variables for all four themes.
> Ref: `docs/design-system.md#5.1 Spacing Scale` — Tailwind spacing tokens (`gap-2`, `p-4`, etc.).
> Ref: `docs/design-system.md#5.3 Layout Constants` — modal widths, dialog max-width (480px), card max-width.
> Ref: `docs/architecture.md#Responsive Design` — mobile-first breakpoints and component-level responsive expectations.
> Ref: `docs/concerns.md#C-9` — toast deferral context.
> Ref: `docs/concerns.md#C-10` — ErrorDisplay refactor + standalone hook test file deferral context (default-skip clause for hook test file).
> Ref: `docs/stories/3-1-preflight-checks-transaction-signing.md` — origin of preflight 7-failure mapping; baseline for SwapButton tooltip behavior.
> Ref: `docs/stories/3-2-execute-flow-success-display.md` — origin of `SuccessDisplay` and `SwapInFlightPanel`; baseline for the toast TODO and the panel polish surface.
> Ref: `docs/stories/4-3-user-controlled-slippage.md` — origin of `SlippageSelector`; baseline for the a11y attributes 4-1 extends.

## Detected Patterns

| Pattern | Value | Sampled from | Established? |
|---------|-------|-------------|-------------|
| ARIA on interactive controls | `aria-label`, `aria-pressed`, `aria-describedby`, `aria-busy`, `aria-invalid`, `role="alert"`, `role="status"`, `role="radiogroup"` | `SlippageSelector.tsx`, `QuoteRefreshIndicator.tsx`, `SwapInFlightPanel.tsx`, `TokenSelectorModal.tsx`, `SwapButton.tsx` | Established |
| Focus ring | `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` (sometimes `focus-visible:ring-offset-2`) | `SlippageSelector.tsx:123`, `QuoteRefreshIndicator.tsx:26` | Established |
| Mobile breakpoint | `useIsMobile()` (`<768px` per `MOBILE_BREAKPOINT = 768`) | `TokenSelectorModal.tsx:294`, `use-mobile.ts:3` | Established |
| Mobile/desktop overlay split | base-ui `Dialog.Root` desktop + `Drawer.Root` mobile, branched in a wrapper component | `TokenSelectorModal.tsx:292-305` | Established |
| Tailwind theme tokens | `bg-background`, `bg-muted`, `text-foreground`, `border-border`, `text-destructive`, `bg-primary text-primary-foreground` (no hex literals) | All `src/ui/*` | Established |
| Conditional styles | template literal concatenation `("base " + (condition ? "x" : "y"))` | `SlippageSelector.tsx:122-127` | Established (legacy); `cn()` utility from `@/lib/utils` is also in use (`TokenSelectorModal.tsx:13`) — both acceptable |
| Tooltip primitive | `@base-ui/react/tooltip` with `Tooltip.Provider` / `Root` / `Trigger` / `Portal` / `Positioner` / `Popup` | `SwapButton.tsx:127-142` | Established |
| Spinner icon | `<Loader2 className="animate-spin" aria-hidden="true" />` from `lucide-react` | `SwapButton.tsx:115`, `SwapInFlightPanel.tsx:40` | Established |
| Test file colocation | `*.test.tsx` next to source (`SlippageSelector.test.tsx` next to `SlippageSelector.tsx`) | `src/ui/` | Established |

No conflicts detected — pattern set is consistent across the UI layer.

## Wave Structure

Tasks 1, 2, 3 may run sequentially (recommended) or as two parallel waves:

- **Wave A (parallel-eligible):** Task 1 (preflight UX + a11y on SwapButton/SlippageSelector/QuoteRefreshIndicator + optional ErrorDisplay extraction) and Task 2 (responsive sweep + in-flight panel polish) touch disjoint files **except** `src/App.tsx` (Task 1 modifies error block at lines 487-503; Task 2 modifies in-flight render at lines 460-485 and runs the viewport sweep across the file). **They share `src/App.tsx` — do NOT run in parallel.** Run Task 1 first, then Task 2.
- **Wave B (sequential after A):** Task 3 (success toast + final keyboard/focus pass) requires Tasks 1 and 2 to be done so the focus-ring audit and tab-order check operate on the final tree.

Recommended order: **Task 1 → Task 2 → Task 3, sequential.** Each task ends with the full verification chain (format → lint → build → test → test-integrity → security) per code-standards §2.

## Manual Verification Steps

Run after each task and again at Gate 5.

1. **320px no-scroll** — Open Chrome DevTools, set device to "iPhone SE (375×667)" then resize to 320px width. Confirm no horizontal scroll, no overlapping elements, all buttons clickable. Repeat at 375 / 768 / 1024 / 1920.
2. **Tap targets** — DevTools device mode, hover each interactive element, verify computed `width × height` ≥ 44×44 (or hit-area via padding ≥ that). Targets: WalletButton, both token selectors, amount input, slippage presets, QuoteRefreshIndicator, SwapButton, ErrorDisplay Dismiss, SuccessDisplay New Swap, Solscan link.
3. **Keyboard-only swap** — Disconnect mouse. Tab from page top through every focusable element. Confirm visible focus ring on each. Trigger a swap end-to-end (Connect Wallet → set amount → Tab to SwapButton → Enter). Confirm SuccessDisplay's New Swap is reachable via Tab.
4. **Screen reader announcement** — macOS VoiceOver (Cmd+F5) or NVDA. Trigger each preflight failure (no wallet, zero amount, same input/output, insufficient SOL) and confirm SR announces the specific reason from the tooltip / `aria-describedby`. On success, confirm the Alert announces *and* the toast does not double-announce.
5. **All four themes** — Toggle wireframe-light → wireframe-dark → brand-light → brand-dark (theme toggle mechanism per design-system §3). Confirm: no hardcoded colors leak through; focus ring visible on each theme; in-flight panel backdrop overlay readable on each.
6. **Reduced motion** — In macOS System Settings → Accessibility → Display → "Reduce motion" ON. Trigger a swap. Confirm in-flight slide-in and success-flash animations are disabled or instant.

## Quality Self-Check

- [x] Self-containment — no vague refs; every `> Ref:` has `path#section — reason` format.
- [x] AC fidelity — ACs copied verbatim from `docs/plan.md:160-165`.
- [x] Version verification — no new libraries introduced without explicit Rule 4 approval gate (toast library); existing libraries (`@base-ui/react ^1.4.0`, `lucide-react ^1.8.0`) verified in `package.json`.
- [x] Task ↔ AC coverage — Task 1 → AC-1, AC-6; Task 2 → AC-2, AC-3, AC-4, AC-5; Task 3 → AC-1, AC-6. All 6 ACs covered.
- [x] must_haves precision — 12 grep-able truths; all artifact paths have extensions.
- [x] Amendment integration — A-6, A-9, A-12, A-14 explicitly addressed; out-of-scope re-implementations forbidden.
- [x] Wave independence — explicitly noted that Tasks 1 and 2 share `App.tsx` and must run sequentially.
- [x] Previous intelligence — 3 specific learnings each from stories 3-1 (preflight mapping origin), 3-2 (panel + toast TODO origin), 4-3 (slippage a11y baseline).
- [x] Interface verification — 11 source files read on 2026-04-27 with line numbers + SHA-256 hashes.
- [x] Inline/Reference audit — design-system tokens and architecture responsive section referenced (rule 3-5); LOCKED guardrails inlined (rule 1).
- [x] Story size budget — within M target (~280 lines, justified by 11 verified interfaces with hashes).
- [x] must_haves count — 12 truths (M cap is 8-12).
- [x] Derivable content — library versions and test runner commands referenced via `package.json`/codebase conventions, not inlined.
- [x] Structural evaluation — (1) no file expected >500 lines; (2) ErrorDisplay extraction *prevents* App.tsx bloat; (3) implementation details (animation specifics, focus-ring exact pixels) are deliberately advisory because the codebase establishes them; (4) UI decomp covered (ErrorDisplay extraction); (5) no migrations/seed/schema in this story; (6) not a micro story (touches 7+ files, multiple new patterns introduced via toast lib + animations).
