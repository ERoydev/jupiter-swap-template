---
id: "4-3-user-controlled-slippage"
slug: user-controlled-slippage
title: "User-Controlled Slippage Tolerance"
status: draft
size: M
wave: 4
dependencies: ["3-1"]
created: 2026-04-24
---

# Story: User-Controlled Slippage Tolerance

## User Story
As a swap end user, I want to control the slippage tolerance for my swap (with sensible presets and a custom option), so that I can trade volatile or low-liquidity tokens without code changes and see the real slippage Jupiter is using.

## Scope

**In scope (this story):**
- New `SlippageSelector` component with four controls: `[ 0.1% ]`, `[ 0.5% ]`, `[ 1.0% ]`, `[ Custom ]`.
- Active-preset visual state, keyboard navigation, `aria-pressed` semantics.
- Custom input: inline numeric field (0.01–50 range), validation, blur/ESC snaps back to the nearest preset.
- Local `slippageBps` state in `SwapCard`, default `50` (0.5%).
- `getOrder` contract extension — accepts optional `slippageBps?: number`, sends as query param to `/swap/v2/order` when provided.
- `OrderResponse.slippageBps?: number` — model Jupiter's echoed slippage from the response.
- `QuoteDisplay` reads actual slippage from `quote.slippageBps`; drops the hardcoded constant + `(auto)` suffix.
- Re-fetch quote immediately when `slippageBps` changes (no debounce — single-click is deliberate).
- Interaction with A-6 auto-refresh: new value flows into the next refresh tick automatically.

**Out of scope (deferred):**
- `[ Auto ]` fifth button (omits `slippageBps`, lets Jupiter decide dynamically).
- Persistence to `localStorage` across page reloads.
- Warning banner for slippage > 5%.
- Auto-adjust default based on token metadata (low-liquidity → 1%).

## Acceptance Criteria

- **AC-4-3-1.** Given the SwapCard mounts, When the user has not interacted with slippage, Then the `[ 0.5% ]` preset is visually active with `aria-pressed="true"` and internal `slippageBps === 50`.
- **AC-4-3-2.** Given any preset button is clicked, When the click fires, Then the clicked preset becomes active, the previously-active one becomes inactive, and `slippageBps` updates to the new value (10 / 50 / 100 bps).
- **AC-4-3-3.** Given `slippageBps` has changed, When the change settles, Then a new `/order` request fires immediately (no debounce) carrying the new `slippageBps` as a query param.
- **AC-4-3-4.** Given `[ Custom ]` is clicked, When rendered, Then a numeric input appears in place of the Custom button with `aria-label="Custom slippage tolerance (percent)"` and focus.
- **AC-4-3-5.** Given the user types in the custom input, When the value parses to a number in `0.01 ≤ n ≤ 50`, Then `slippageBps = Math.round(n * 100)` and a quote refetch fires on blur or Enter.
- **AC-4-3-6.** Given the user types an invalid value (empty, ≤ 0, > 50, non-numeric), When attempted, Then the input shows a red outline + inline error "Enter 0.01–50", no refetch fires, and the previous `slippageBps` is retained.
- **AC-4-3-7.** Given `getOrder` is called with `slippageBps: 50`, When the query is built, Then the outgoing URL includes `slippageBps=50`; when called without `slippageBps`, the param is omitted entirely.
- **AC-4-3-8.** Given `QuoteDisplay` receives a quote with `slippageBps: 73`, When rendered, Then the displayed slippage reads "0.73%" (no `(auto)` suffix). If `quote.slippageBps` is undefined, falls back to the selected `slippageBps` value.
- **AC-4-3-9.** Given the four preset buttons have focus, When Tab / Shift+Tab are pressed, Then focus cycles through the four controls in order; `aria-pressed` semantics flip on Space/Enter.
- **AC-4-3-10.** Given A-6 auto-refresh is active, When 10 seconds pass after a slippage change, Then the next auto-refresh tick uses the new `slippageBps` value.

## Architecture Guardrails

**Dependency direction (LOCKED, DD-4):** `UI (SlippageSelector, SwapCard)` → `Services (jupiterService.getOrder)` → `Types`. Selector must NOT import from state-machine files.

**Component location:** `src/ui/SlippageSelector.tsx` — sibling of `SwapButton`, `QuoteDisplay`, `SolBalanceWarning`.

**Contract changes (LOCKED, per A-7):**
1. `OrderResponse.slippageBps?: number` — optional; decoded from Jupiter's response.
2. `getOrder` params: add optional `slippageBps?: number` — when provided, sent as query param; omitted means Jupiter's dynamic-auto path.

**State management (LOCKED):** local `useState<number>(50)` in `SwapCard`. Does NOT go into the state machine context (no reducer change). Pass through `fetchQuote(lamports, slippageBps)` and add to:
- `fetchQuote` callback deps.
- Debounced preflight effect deps — no, preflight doesn't depend on slippage, leave untouched.
- Auto-refresh effect deps (A-6) — YES, so the next tick uses the new value.
- Token-change refetch effect deps — YES.
- `handleSwap` deps — YES, to carry the click-time value forward.

**Preset values (LOCKED):**
| Label | bps | Use |
|-------|-----|-----|
| 0.1% | 10 | Deepest markets only (SOL/USDC) |
| 0.5% | 50 | Default; most blue-chip pairs |
| 1.0% | 100 | Volatile / mid-cap pairs |
| Custom | user-entered | 0.01–50% |

**Custom-input semantics (LOCKED):**
- Renders when user clicks `[ Custom ]`. Replaces the Custom button visually.
- Numeric input, `inputMode="decimal"`, no spinner arrows.
- Validation: `0.01 ≤ parseFloat(value) ≤ 50`. Empty / NaN / out-of-range → red border + inline error.
- On blur OR Enter with valid value → `setSlippageBps(Math.round(value * 100))`, refetch fires, Custom becomes active preset.
- On blur with invalid value → revert to previous `slippageBps`, collapse input back to `[ Custom ]` button, show no error.
- On ESC → collapse immediately without applying.

**UI placement (LOCKED):**
Mounted **immediately after the output-row block** (the "To: {outputSymbol}" row with the large receive-amount number at `src/App.tsx:~356-380`) and **before** `<SolBalanceWarning />`, `<QuoteDisplay>`, and the Swap button. Rendered inside a new `<div className="border-t border-border pt-3 space-y-2">` wrapper so it visually attaches to the token-rows section above, before the warnings / quote-details / action button flow below. First label row: `<span className="text-xs text-muted-foreground">Slippage tolerance</span>`. Buttons row: `flex gap-2` with the four preset controls filling the row.

**Design tokens only:**
- Active preset: `bg-primary text-primary-foreground`.
- Inactive preset: `bg-transparent text-foreground border border-border hover:bg-accent`.
- Custom input: `bg-transparent border-border focus-visible:ring-2 focus-visible:ring-ring`.
- Invalid state: `border-destructive text-destructive`.
- NO hardcoded hex values.

**Accessibility:**
- Each preset button: `aria-pressed={isActive}`, `aria-label="{label} slippage tolerance"`.
- Container: `role="radiogroup"` with `aria-label="Slippage tolerance"`.
- Custom input: `aria-label="Custom slippage tolerance (percent)"`, `aria-invalid={hasError}`, `aria-describedby` pointing at the inline error id when present.
- Keyboard: Tab cycles the four controls; arrow keys do NOT change selection (not a radio group in the HTML-semantic sense — `role="radiogroup"` is a lightweight grouping label, not a full ARIA radio implementation; keeping it simple for v1, Story 4-1 can elevate to full radio semantics if desired).

## Verified Interfaces

### `getOrder` (existing — to be extended this story)
- **Source:** `src/services/jupiterService.ts:12`
- **Current signature:** `async function getOrder(params: { inputMint: string; outputMint: string; amount: string; taker?: string }, signal?: AbortSignal): Promise<OrderResponse>`
- **Amended signature (this story):** `async function getOrder(params: { inputMint, outputMint, amount, taker?, slippageBps? }, signal?): Promise<OrderResponse>`

### `OrderResponse` (existing — to be extended this story)
- **Source:** `src/types/swap.ts:10`
- **Current shape:** (9 fields, `priceImpactPct` added in A-1)
- **Amended shape:** adds `slippageBps?: number`.

### `DEFAULT_SLIPPAGE_BPS` (existing — retained)
- **Source:** `src/config/constants.ts:4`
- **Value:** `50`
- **Role:** initial state value for `slippageBps` on first mount AND display fallback in `QuoteDisplay` when `quote.slippageBps` is undefined.

### `jupiterClient.get` (existing — do not modify)
- **Source:** `src/services/jupiterClient.ts`
- **Shape:** accepts a `Record<string, string>` of query params; missing keys are omitted from the final URL automatically.

### ⚠ UNVERIFIED — not yet implemented

#### `SlippageSelector`
- **Target source:** `src/ui/SlippageSelector.tsx`
- **Contract props:**
  ```ts
  interface SlippageSelectorProps {
    value: number;                    // current slippageBps
    onChange: (newBps: number) => void;
  }
  ```
- **Marked:** ⚠ UNVERIFIED — source not yet implemented.

## Tasks

- [ ] **Task 1: Extend type + service contract (`OrderResponse.slippageBps`, `getOrder` param)**
  - Maps to: AC-4-3-7, AC-4-3-8 (contract half)
  - Files to modify:
    - `src/types/swap.ts` — add `slippageBps?: number` to `OrderResponse`.
    - `src/services/jupiterService.ts` — extend `GetOrderParams` with `slippageBps?: number`; when provided, add to `queryParams` as `queryParams["slippageBps"] = String(params.slippageBps)`.
  - Tests:
    - `src/services/jupiterService.test.ts` — add two cases: (a) `getOrder` with `slippageBps: 50` → assert fetch URL includes `slippageBps=50`; (b) without `slippageBps` → assert URL does NOT include the key.
  - Amendment: log A-7 entry (already drafted in `docs/amendments.md`).
  - Commit: `feat(services): add slippageBps param to getOrder and response type`

- [ ] **Task 2: `SlippageSelector` component + unit tests**
  - Maps to: AC-4-3-1, AC-4-3-2, AC-4-3-4, AC-4-3-5, AC-4-3-6, AC-4-3-9
  - Files to create:
    - `src/ui/SlippageSelector.tsx` — four buttons + custom-input state machine as described in Architecture Guardrails.
    - `src/ui/SlippageSelector.test.tsx` — cases: default active at 0.5%, click each preset, click Custom → input appears, type valid/invalid, blur/Enter/ESC behaviors, `aria-pressed` semantics.
  - TDD: write test file first; each preset click is a single render + assertion.
  - Commit: `feat(ui): add SlippageSelector with presets + custom input`

- [ ] **Task 3: `QuoteDisplay` display-accuracy fix**
  - Maps to: AC-4-3-8
  - Files to modify:
    - `src/ui/QuoteDisplay.tsx` — replace `const slippagePercent = (DEFAULT_SLIPPAGE_BPS / 100).toFixed(1)` with `const slippageBps = quote.slippageBps ?? fallbackSlippageBps; const slippagePercent = (slippageBps / 100).toFixed(2);`. Drop the `(auto)` suffix. Accept a new prop `fallbackSlippageBps: number` from the caller.
  - Tests:
    - `src/ui/QuoteDisplay.test.tsx` — update existing "Slippage 0.5% (auto)" assertion to match new format; add a case where `quote.slippageBps` is defined and asserts that value is shown.
  - Commit: `feat(ui): read slippage from quote response instead of hardcoded constant`

- [ ] **Task 4: `SwapCard` integration — state, refetch wiring, placement**
  - Maps to: AC-4-3-2, AC-4-3-3, AC-4-3-10
  - Files to modify:
    - `src/App.tsx` —
      1. Add `const [slippageBps, setSlippageBps] = useState<number>(DEFAULT_SLIPPAGE_BPS);`
      2. Pass `slippageBps` into `fetchQuote` — extend `fetchQuote` signature to accept it, pass to `getOrder`.
      3. Add `slippageBps` to: `fetchQuote` useCallback deps, auto-refresh effect deps (A-6), token-change refetch effect deps, `handleSwap` deps.
      4. Mount `<SlippageSelector value={slippageBps} onChange={setSlippageBps} />` **directly below the output-row block** (after the closing `</div>` of the "To: {outputSymbol}" group, before `<SolBalanceWarning />`). Wrap in `<div className="border-t border-border pt-3 space-y-2">` with a label row containing `<span className="text-xs text-muted-foreground">Slippage tolerance</span>`.
      5. Pass `fallbackSlippageBps={slippageBps}` to the existing `<QuoteDisplay>` usage.
    - `src/App.test.tsx` — add integration case: render SwapCard with a quote ready, mock `getOrder`, click the `[ 1.0% ]` preset, assert `getOrder` is re-called with `slippageBps: 100`.
  - TDD: extend App.test.tsx first.
  - Depends on: Tasks 1, 2, 3.
  - Commit: `feat(app): wire SlippageSelector into SwapCard with refetch on change`

- [ ] **Task 5: Manual verification + sprint-status close**
  - Not test-producing; documentation only.
  - Run all manual verification steps below.
  - Close story 4-3 in `docs/sprint-status.yaml`, update `docs/state.json`, create `post-jupiter-swap-template-4-3` tag.

## must_haves

truths:
  - "SlippageSelector renders four controls by default: [0.1%] [0.5%] [1.0%] [Custom], with [0.5%] active"
  - "Clicking a preset button updates slippageBps to the corresponding bps value (10, 50, 100)"
  - "Clicking [Custom] replaces the button with an inline numeric input, which accepts 0.01-50 range"
  - "Custom input with valid value on blur or Enter sets slippageBps = Math.round(value * 100) and triggers refetch"
  - "Custom input with invalid value shows red border + inline error, does not trigger refetch"
  - "ESC in custom input collapses it back to the [Custom] button without applying any change"
  - "Active preset has aria-pressed=true; others aria-pressed=false"
  - "getOrder sends slippageBps as query param when provided, omits it when undefined"
  - "OrderResponse includes optional slippageBps decoded from Jupiter's response"
  - "QuoteDisplay reads slippage from quote.slippageBps when present, falls back to the user-selected value"
  - "Changing slippageBps in SwapCard triggers an immediate fetchQuote call with the new value"
  - "A-6 auto-refresh picks up the new slippageBps on the next 10s tick without extra wiring"

artifacts:
  - path: "src/ui/SlippageSelector.tsx"
    contains: ["SlippageSelector", "aria-pressed", "0.1", "0.5", "1.0", "Custom"]
  - path: "src/ui/SlippageSelector.test.tsx"
    contains: ["describe", "SlippageSelector", "aria-pressed", "Custom"]
  - path: "src/services/jupiterService.ts"
    contains: ["slippageBps"]
  - path: "src/types/swap.ts"
    contains: ["slippageBps"]
  - path: "src/ui/QuoteDisplay.tsx"
    contains: ["quote.slippageBps", "fallbackSlippageBps"]
  - path: "src/App.tsx"
    contains: ["SlippageSelector", "slippageBps", "setSlippageBps"]

key_links:
  - pattern: "import { SlippageSelector }"
    in: ["src/App.tsx"]
  - pattern: "slippageBps?"
    in: ["src/types/swap.ts", "src/services/jupiterService.ts"]

## Dev Notes (advisory)

**Why no reducer change:** the state machine models the *lifecycle* of a swap (Idle → LoadingQuote → QuoteReady → Signing → ...). Slippage is a *parameter* of the request, not a lifecycle state. Elevating it into the reducer would couple two orthogonal concerns — keep it local to SwapCard.

**Why refetch on slippage change is NOT debounced:** unlike amount (which users type digit-by-digit), slippage is a single deliberate click. Debouncing would feel laggy.

**Why the A-6 auto-refresh naturally inherits slippageBps:** adding `slippageBps` to the auto-refresh effect's dep array causes the effect to tear down and rebuild its interval whenever the value changes. The new interval's `refresh` callback closes over the new value.

**Why `fallbackSlippageBps` prop on `QuoteDisplay`:** Jupiter *almost always* returns `slippageBps` in the response, but the type marks it optional. Defensive fallback to the user-selected value keeps the display accurate even if the response field is missing — far better than the current hardcoded constant.

**Commit plan:**
1. `feat(services): add slippageBps param to getOrder and response type` (Task 1)
2. `feat(ui): add SlippageSelector with presets + custom input` (Task 2)
3. `feat(ui): read slippage from quote response instead of hardcoded constant` (Task 3)
4. `feat(app): wire SlippageSelector into SwapCard with refetch on change` (Task 4)
5. `chore(state): close story 4-3 — User-Controlled Slippage` (Task 5)

Pre-story tag: `pre-jupiter-swap-template-4-3`. Post-story tag: `post-jupiter-swap-template-4-3`.

**DO NOT modify:**
- `src/services/balanceService.ts`, `src/services/jupiterClient.ts` (closed contracts).
- `src/state/swapReducer.ts`, `src/state/useSwapState.ts`, `src/state/swapState.ts` (no reducer change).
- `src/types/errors.ts`, `src/types/tokens.ts`.
- `src/handlers/preflightChecks.ts`, `src/handlers/transactionSigner.ts` (Story 3-1 closed contracts).

**MAY ADD to but do not rewrite:**
- `src/types/swap.ts` (add `slippageBps?` to `OrderResponse` only).
- `src/services/jupiterService.ts` (extend `GetOrderParams` + query assembly only).
- `src/ui/QuoteDisplay.tsx` (display-source change only; no prop reshuffling beyond `fallbackSlippageBps`).
- `src/App.tsx` (new state, new mount, extended fetchQuote signature, extended deps).
- `src/config/constants.ts` (retain `DEFAULT_SLIPPAGE_BPS`, no renames).

## Manual Verification Steps

After Task 4 completes:

1. `npm run dev` → connect wallet → enter 1 SOL → quote loads → Slippage section renders with `[ 0.5% ]` active. ✓
2. Click `[ 0.1% ]` → button becomes active, previous becomes inactive, `/order` refetch fires (Network tab), new URL includes `slippageBps=10`. ✓
3. Click `[ 1.0% ]` → same behavior with `slippageBps=100`. ✓
4. Click `[ Custom ]` → input appears, focus auto-lands. Type `2.5` → Tab or press Enter → `slippageBps=250`, refetch fires. ✓
5. Click `[ Custom ]` again → type `abc` or `60` (out of range) → red border + error shown, refetch does NOT fire. Blur → input collapses, previous value retained. ✓
6. Press ESC in Custom input → collapses immediately without applying. ✓
7. Wait 10 s without interacting → auto-refresh tick fires with the current slippage value (Network tab). ✓
8. Tab through the four buttons — focus ring visible on each, keyboard reaches all, Enter/Space activates. ✓
9. Switch theme (wireframe-light ↔ wireframe-dark ↔ brand-light ↔ brand-dark) — all four states legible, active state distinguishable in each theme. ✓
10. In QuoteDisplay, confirm the "Slippage" row now shows the value Jupiter returned (typically matches the selected preset; may differ by <1 bp due to Jupiter rounding) without the `(auto)` suffix. ✓

## Amendments Consulted

- **A-6 (2026-04-24 — Quote auto-refresh + manual refresh indicator).** Impact on 4-3: adding `slippageBps` to the auto-refresh effect dep array ensures post-change ticks carry the new value. No structural change to A-6's effect — just a deps extension.
- **A-7 (2026-04-24 — User-controlled slippage tolerance).** This is the amendment driven by this story; records the contract changes to `OrderResponse` and `getOrder`.
