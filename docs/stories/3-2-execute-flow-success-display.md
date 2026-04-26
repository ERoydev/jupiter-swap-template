---
id: "3-2-execute-flow-success-display"
slug: execute-flow-success-display
title: "Execute Flow + Success Display"
status: draft
size: M
wave: 3
complexity: high
dependencies: ["3-1"]
created: 2026-04-26
---

# Story: Execute Flow + Success Display

## User Story
As a swap end user, I want to see my swap execute and get a confirmed result with a block explorer link, so that I know my tokens were swapped successfully.

## Scope

**In scope (this story):**
- Submit the signed transaction via `jupiterService.executeOrder(signedTx, requestId)` and parse Jupiter's `ExecuteResponse`.
- Re-check stale-quote threshold IMMEDIATELY before `/execute` (carried over from 3-1's "Out of scope" — see scope inheritance note).
- State-machine wiring on the success path: `Signing → Executing` (`TX_SIGNED`) → `Success` (`EXECUTE_SUCCESS`) on Jupiter `code === 0` (`status === "Success"`).
- New `swapCorrelationId` (UUID) generated at the top of `handleSwap`, threaded through every log on the lifecycle (preflight → sign → execute) and stored locally for the success display.
- Loading copy in `SwapButton`: "Waiting for wallet…" while `Signing` (already shipped by 3-1) and "Executing swap…" while `Executing` (already shipped by 3-1; verify still correct).
- New `SuccessDisplay` component (`src/ui/SuccessDisplay.tsx`): success Alert showing input token + amount sent, output token + amount received, clickable Solscan link, "New Swap" button.
- "New Swap" → dispatch `{ type: "NEW_SWAP" }`, which the reducer routes Success → Idle (verified, `swapReducer.ts:160-164`).
- Replace the `App.tsx:387-393` placeholder (`SIGNING_ERROR` with "Execute flow not yet implemented") with the real `executeOrder` call sequence.
- Minimal error classification on the `/execute` failure path: any non-success response or thrown error becomes `EXECUTE_ERROR` with a `SwapError` constructed from the existing `mapErrorCode(code)` helper. **Crucially: do NOT implement retries here** (3-3 owns retries). On retryable codes (-1, -1000, -1004, -2000, -2003), still dispatch `EXECUTE_ERROR` (NOT `EXECUTE_RETRY`) — the user sees the error and dismisses; 3-3 will replace this dispatch with the retry loop without touching 3-2's success path.

**Out of scope (deferred to later stories):**
- **3-3 (retry orchestration):** auto-retry on retryable error codes, "Retrying… attempt N of 3" copy, `MAX_RETRIES` enforcement, the `EXECUTE_RETRY` action wiring, dismiss-from-Error-after-max-retries flow, `retriesAttempted` count surfaced on Error.
- **3-3 (richer error messages):** while 3-2 surfaces Jupiter's mapped message via `mapErrorCode`, the polished error screens with retry-button + dismiss-button affordances and the toast notifications for transient failures live in 3-3.
- **4-1 (UX polish):** toast notifications on Success (per spec AC-FR-9 — "Toast also fires" in plan AC); responsive layout polish; tap-target sweep; full Tooltip a11y on the Solscan link.
- **4-1 (success-state animation):** card-overlay transitions, output-border flash-green, alert slide-in animation per design-system §15.
- Block explorer choice — Solscan only, hardcoded (matches plan AC text and spec AC-FR-9: `https://solscan.io/tx/{signature}`). Configurable explorer URL is out of scope.
- Persisting transaction history — explicit Out of Scope per spec.md §Out of Scope.

## Acceptance Criteria

Copied verbatim from `docs/plan.md` (Story 3-2, lines 125-130). No wording altered; the plan AC block has 5 bullets and is decomposed 1:1.

- **AC-3-2-1.** Given `jupiterService.executeOrder(signedTx, requestId)`, When Jupiter returns code 0, Then SwapResult with status "confirmed", signature, amounts.
- **AC-3-2-2.** Given successful swap, When UI updates, Then success Alert with sent/received amounts, clickable Solscan link, "New Swap" button. Toast also fires.
- **AC-3-2-3.** Given user clicks "New Swap", When clicked, Then state → Idle.
- **AC-3-2-4.** Given full swap flow, When `swapHandler.executeSwap()` runs, Then `swapCorrelationId` (UUID) generated and logged on every step.
- **AC-3-2-5.** Given state transitions through Signing/Executing, When UI renders, Then SwapButton shows "Waiting for wallet..." / "Executing swap..." with Spinner.

**Spec AC mapping (for the Implement phase):**
- AC-3-2-1 ↔ spec AC-FR-9 (Solscan link), AC-A-5 (no swallowed /execute response), NFR-3 (zero silent loss).
- AC-3-2-2 ↔ spec AC-U-5 (single-action recovery; "New Swap" exits Success in one click), AC-FR-9.
- AC-3-2-3 ↔ AC-U-5, NFR-4.
- AC-3-2-4 ↔ AC-D-1 (correlation tracing).
- AC-3-2-5 ↔ AC-FR-6 (distinct visual states for each SwapState), NFR-3.

## Architecture Guardrails

**Dependency direction (LOCKED, DD-4):** `UI (SuccessDisplay, SwapCard)` → `Handlers` (3-1's existing handlers; this story adds NO new handler files) → `Services (jupiterService.executeOrder)` → `Types/Config`. SuccessDisplay must not import services or handlers.

**No new handler — orchestration lives in `SwapCard.handleSwap` (LOCKED for this story):**
Architecture §Component Decomposition mentions a `swapHandler` orchestrator. Plan AC-3-2-4 wording says "When `swapHandler.executeSwap()` runs". **Live code reality:** the orchestration is currently inlined in `src/App.tsx:317-407` (`handleSwap` callback). Story 3-1 inlined it intentionally (small surface, one call site). Extracting `swapHandler.executeSwap()` to a separate file before 3-3's retry loop introduces machinery for no current consumer.

**Decision:** Keep orchestration in `handleSwap`. The `swapCorrelationId` and per-step logs are added inside `handleSwap`. Plan AC wording is preserved verbatim (AC-3-2-4 still references `swapHandler.executeSwap()`); the implementer must satisfy the *behavior* (UUID generated, every step logs it) without creating a new file. **Trigger an `amendments.md` entry** (Rule 3 per code-standards) clarifying that the architecture's "swapHandler" component is realized as `SwapCard.handleSwap` for v1, deferring extraction to whenever a second caller emerges (likely 3-3 if its retry loop benefits from a pure orchestrator).

**`/execute` path semantics (LOCKED, architecture §Workflow 2):**
- Signed base64 transaction (output of `transactionSigner.sign`) → `jupiterService.executeOrder(signedTx, requestId)`.
- The `requestId` is `context.quote.requestId` (verified present on `OrderResponse` at `src/types/swap.ts:11`).
- Response shape per architecture §API Contracts and `src/types/swap.ts:22-29`:
  ```ts
  interface ExecuteResponse {
    status: "Success" | "Failed";
    signature: string;
    code: number;
    inputAmountResult: string;   // smallest units
    outputAmountResult: string;  // smallest units
    error?: string;
  }
  ```
- **Success criterion (LOCKED):** `response.status === "Success"` AND `response.code === 0`. Plan AC-3-2-1 says "code 0"; spec AC-FR-9 maps Solscan link to confirmed. Use both as a belt-and-suspenders check — if Jupiter ever returns `status: "Success"` with a non-zero code or vice versa, treat as failure.
- **Failure criterion:** anything else (`status === "Failed"`, non-zero `code`, missing fields, thrown SwapError, network error). Dispatch `EXECUTE_ERROR` with the mapped `SwapError`.
- **No retries here.** On retryable codes (-1, -1000, -1004, -2000, -2003), still dispatch `EXECUTE_ERROR` — 3-3 will swap this for the retry loop.

**`executeOrder` return-type tightening (LOCKED for this story):**
The current source signature at `src/services/jupiterService.ts:62-68` is:
```ts
export async function executeOrder(
  signedTx: string,
  requestId: string,
  signal?: AbortSignal,
): Promise<unknown>
```
The return type is `unknown` because no caller existed before 3-2. **Tighten to `Promise<ExecuteResponse>`** in this story (Task 1). This is a Rule 3 deviation (interface refinement, not a contract change — `unknown` is the supertype of `ExecuteResponse`, so any caller treating it as `unknown` continues to compile). Log an amendment for the audit trail.

**Error mapping on `/execute` (LOCKED):**
- If `executeOrder` throws a `SwapError` (network/abort/unknown HTTP failure from `jupiterClient`), pass it through directly to `EXECUTE_ERROR`.
- If `executeOrder` resolves with `status === "Failed"` (or `code !== 0`), construct a `SwapError` from `mapErrorCode(response.code)` (existing helper at `src/utils/jupiterErrorMapper.ts:83`):
  ```ts
  const mapping = mapErrorCode(response.code);
  const swapErr = new SwapError(
    mapping.type,
    mapping.message,
    response.code,
    mapping.retryable,    // 3-3 reads this; 3-2 ignores
    { requestId, responseBody: response, httpStatus: 200 },
  );
  ```
  The `details` field shape matches architecture §Data Models comment block (`OrderFailed/ExecutionFailed/TransactionExpired/UnknownError → { requestId, responseBody, httpStatus }`).
- If `executeOrder` resolves with an unexpected shape (e.g., `status` field missing), construct `SwapError(ErrorType.UnknownError, "Unexpected response from Jupiter", undefined, false, { responseBody: response })`. Surface this as `EXECUTE_ERROR`.

**`SwapResult` construction (LOCKED, architecture §Data Models):**
On success, populate the `SwapResult` shape from `src/types/swap.ts:31-39`:
```ts
const result: SwapResult = {
  txId: response.signature,
  status: "confirmed",
  inputAmount: response.inputAmountResult,
  outputAmount: response.outputAmountResult,
  retriesAttempted: context.retryCount,   // 0 in 3-2; 3-3 fills this in
  swapCorrelationId,
};
```
**Where to store this:** local `useState<SwapResult | null>(null)` in `SwapCard` named `lastSwapResult` (or similar). Cleared when `state` transitions out of `Success` (via `useEffect` keyed on `context.state`). The reducer already stores `txSignature` on `EXECUTE_SUCCESS` (`swapReducer.ts:121-127`); pull `inputAmountResult` / `outputAmountResult` from local state because the reducer doesn't carry them.

**Why not extend the reducer with input/output amount fields:** `SwapStateContext` is a closed contract (Story 1-2's reducer is on the "DO NOT modify" list for stories 2-x and 3-x per the established pattern). The reducer holds the *minimum* state needed for transition guards; render-only data (display amounts, correlation ID) lives at the consumer. Confirmed by inspecting `src/state/swapReducer.ts` — `EXECUTE_SUCCESS` only captures `signature`. This is intentional.

**`SuccessDisplay` component placement (LOCKED):**
- Mounted in `SwapCard` immediately after the existing error block (`App.tsx:530-545`) and before the swap/connect button block (`App.tsx:547-565`).
- Wrapper: `<Alert>` from shadcn (per design-system §11.3 / §14 Organism 3 — "Success: Alert (green border)"). Use `variant="default"` with a `border-emerald` accent class layered on top, OR add a custom `variant="success"` to `src/components/ui/alert.tsx` if the project's Alert source supports it. **Implementer decides** — both are acceptable; check `src/components/ui/alert.tsx` first.
- Children: `AlertTitle` "Swap successful", `AlertDescription` rendering a `DetailList` with two `DetailRow`s:
  - "Sent: {inputAmount} {inputSymbol}" (UI units, formatted via existing `Number(rawString) / 10 ** decimals` pattern matching `App.tsx:474-481`)
  - "Received: {outputAmount} {outputSymbol}"
- Solscan link: `<a href="https://solscan.io/tx/{signature}" target="_blank" rel="noopener noreferrer">View on Solscan</a>`. Must be a real anchor (no `<button>` faking it); inherits focus + open-in-new-tab semantics.
- "New Swap" `<Button>` triggers `dispatch({ type: "NEW_SWAP" })` (verified transition exists at `swapReducer.ts:161`).

**Conditional render gate (LOCKED):**
```ts
const showSuccess = context.state === SwapState.Success
  && context.txSignature !== null
  && lastSwapResult !== null;
```
Both conditions must hold — the reducer guarantees `txSignature` is set on `EXECUTE_SUCCESS`, and `lastSwapResult` is set in the same `handleSwap` block before dispatching. If either is null, fall back to whatever 3-1 already shows for that state.

**`swapCorrelationId` generation (LOCKED, AC-3-2-4):**
- Generate at the top of `handleSwap`, BEFORE the stale-quote check, with `crypto.randomUUID()` (browser native, matches react.md style — no new deps). Available since modern Vite/Node 18+; the project's TypeScript target supports it.
- Log structured JSON via `console.log(JSON.stringify({ event, swapCorrelationId, ...payload }))` at every lifecycle step:
  - `event: "swap_started"` — at top of handleSwap, payload `{ inputMint, outputMint, amount, slippageBps }`.
  - `event: "preflight_passed"` after preflightChecks.run resolves.
  - `event: "preflight_failed"` on preflight throw, payload `{ error: { type, message } }`.
  - `event: "signing_started"` before transactionSigner.sign.
  - `event: "signing_failed"` on signing throw.
  - `event: "execute_started"` before executeOrder, payload `{ requestId }`.
  - `event: "execute_succeeded"` on success, payload `{ signature, inputAmountResult, outputAmountResult }`.
  - `event: "execute_failed"` on failure, payload `{ code, mappedType, retryable }`.
- Existing log shape compatible — `swapReducer.ts:168-173` already uses structured JSON for `invalid_transition`. Match that style: single-line stringified JSON with ISO timestamp.

**State-machine transitions used by this story (verified):**

| From → To | Action | Source | Existing? |
|-----------|--------|--------|-----------|
| Signing → Executing | `TX_SIGNED` | `swapReducer.ts:98-100` | ✓ |
| Executing → Success | `EXECUTE_SUCCESS` (`signature`) | `swapReducer.ts:121-127` | ✓ |
| Executing → Error | `EXECUTE_ERROR` (`error`) | `swapReducer.ts:129-131` | ✓ |
| Success → Idle | `NEW_SWAP` | `swapReducer.ts:161-163` | ✓ |
| Executing → Error | `TIMEOUT` (`ExecutionTimeout`) | `swapReducer.ts:141-147` | ✓ (handled by useSwapState's 60s timer) |

**No reducer change is needed.** All targets exist.

**SwapButton state copy already shipped (verified):**
- `Signing → "Waiting for wallet…"` — `src/ui/SwapButton.tsx:27-28`.
- `Executing → "Executing swap…"` — `src/ui/SwapButton.tsx:30-31`.

AC-3-2-5 wording mentions "with Spinner" which the current SwapButton does NOT render (just text). **Decision:** add a small inline spinner next to the label when `state === Signing || state === Executing`, using lucide-react's `Loader2` (already in deps per `package.json:41` — `lucide-react@^1.8.0`) with Tailwind's `animate-spin` utility. Rationale: spec AC-FR-6 demands distinct visual states for each SwapState; loading copy alone is weak signal. Keep change minimal — single `<Loader2 className="mr-2 h-4 w-4 animate-spin" />` prefix when in flight.

**Card overlay during signing/executing (DISCRETION, deferred to 4-1):**
Design-system §15 lists "Card overlay (bg-background/50) during signing/executing". This is a polish concern — Story 4-1 owns the card-overlay sweep. 3-2 leaves the card un-overlaid; the SwapButton's disabled state + label change is the per-AC-3-2-5 signal.

**Dispatch sequence in `handleSwap` (LOCKED, all references verified at `src/App.tsx:317-407`):**
1. Generate `swapCorrelationId = crypto.randomUUID()`.
2. Stale-quote gate (existing logic at lines 324-337) — keep as-is. Re-check stale here too (the same check); 3-1's gate runs at click-time, but if signing took >30s, the quote can be stale by the time we'd call `/execute`. **Add a SECOND stale check** AFTER `transactionSigner.sign` resolves, BEFORE `executeOrder`. If stale at this point, dispatch `SIGNING_ERROR` with `SwapError(ErrorType.TransactionExpired, "Quote expired during signing — please try again")` so the user returns to a recoverable state without consuming the now-stale signed tx.
3. Authoritative preflight (existing logic at lines 342-364) — keep as-is.
4. `dispatch({ type: "START_SIGNING" })` then `await transactionSigner.sign(...)` (existing logic at lines 366-382) — keep as-is.
5. **Replace the placeholder block at lines 384-393:**
   - Re-check stale (per step 2 above).
   - `dispatch({ type: "TX_SIGNED" })` to enter Executing.
   - `await jupiterService.executeOrder(signedTx, context.quote.requestId)`.
   - On success path (`status === "Success" && code === 0`): build `SwapResult`, `setLastSwapResult(result)`, `dispatch({ type: "EXECUTE_SUCCESS", signature: response.signature })`.
   - On failure path: build mapped `SwapError`, `dispatch({ type: "EXECUTE_ERROR", error: swapErr })`.
   - On thrown `SwapError`: pass through to `EXECUTE_ERROR`.
   - On unexpected throw: wrap in `SwapError(ErrorType.UnknownError, ...)`, then `EXECUTE_ERROR`.

> Ref: docs/architecture.md#Workflow 2 — full execute flow narrative; this story implements lines "State: Signing → Executing" through "State: Executing → Success / Error".

> Ref: docs/architecture.md#API Contracts — POST /execute request/response shape and 14 error codes.

> Ref: docs/architecture.md#Component Decomposition — `swapHandler` listed as a separate handler; this story keeps the orchestration inlined per the deviation note above (amendment to follow).

> Ref: docs/architecture.md#Data Models — `ExecuteResponse`, `SwapResult`, and the `details` field-shape table for ExecutionFailed errors.

> Ref: docs/amendments.md#A-5 — `/execute` requires API key; jupiterClient already gates this with `ConfigError`. 3-2 inherits the gate from 3-1's signing path (which itself inherits from 2-1's order path). No new gate needed.

> Ref: docs/amendments.md#A-6 — auto-refresh effect runs only while `state === QuoteReady`; once 3-2's flow advances to Signing/Executing/Success, auto-refresh is naturally paused. No interaction concern.

> Ref: docs/design-system.md#14 Organism 3 (Transaction Status) — "Success: Alert (green border) with DetailList (sent/received), Solscan link, 'New Swap' button. Also fires toast." Toast is deferred to 4-1; the rest is in scope.

## Verified Interfaces

Computed from source on disk at 2026-04-26. Implementer should re-check hashes before starting; any mismatch means the file changed since this story was written.

### `jupiterService.executeOrder` (existing — to be tightened this story)
- **Source:** `src/services/jupiterService.ts:62`
- **Current signature:** `export async function executeOrder(signedTx: string, requestId: string, signal?: AbortSignal): Promise<unknown>`
- **Amended signature (this story, Task 1):** `Promise<ExecuteResponse>` (return type tightened — caller-side breaking change is impossible because previous callers handled `unknown`).
- **File hash:** `7d80efecf7200a376cb0d1905119ba3a83972772307e04c843963b7f67a26c4a`
- **Plan match:** Matches plan AC-3-2-1 wording. Implementation already routes through `jupiterClient.post("/swap/v2/execute", ...)`, which enforces the API-key gate (A-5).
- **Behavior:** posts `{ signedTransaction, requestId }`. `jupiterClient` throws `SwapError(ConfigError)` synchronously when API key absent (verified at `jupiterClient.ts:32-37`). Any non-ok HTTP response throws `SwapError(NetworkError)` (5xx/429, retryable=true) or `SwapError(UnknownError)` (4xx, retryable=false). Network errors throw `SwapError(NetworkError)`. AbortError passes through.

### `ExecuteResponse` (existing — used as-is)
- **Source:** `src/types/swap.ts:22-29`
- **Signature:**
  ```ts
  interface ExecuteResponse {
    status: "Success" | "Failed";
    signature: string;
    code: number;
    inputAmountResult: string;
    outputAmountResult: string;
    error?: string;
  }
  ```
- **File hash:** `5dc4f8547dd63cc9c1786410b9a0d4d500778665f01a54d9f8cd19d6de5bd020`
- **Plan match:** Matches architecture §Data Models exactly.

### `SwapResult` (existing — used as-is)
- **Source:** `src/types/swap.ts:31-39`
- **Signature:** `interface SwapResult { txId, status: "confirmed"|"failed", inputAmount, outputAmount, retriesAttempted, swapCorrelationId, error? }`
- **File hash:** `5dc4f8547dd63cc9c1786410b9a0d4d500778665f01a54d9f8cd19d6de5bd020`
- **Plan match:** Matches.

### `mapErrorCode` (existing — used as-is)
- **Source:** `src/utils/jupiterErrorMapper.ts:83`
- **Signature:** `export function mapErrorCode(code: number): ErrorMapping` where `ErrorMapping = { type: ErrorType; message: string; retryable: boolean }`
- **File hash:** `e74c1a3c17c7d53fafcb508c554618629b66cd2de1eefb9941ff5e480ee91981`
- **Plan match:** Matches. All 14 codes pre-mapped (`-1, -2, -3, -1000…-1004, -2000…-2004`). Unknown codes default to `{ UnknownError, "Something went wrong. Please try again.", retryable: false }`.

### `swapReducer` + `SwapAction` (existing — do not modify)
- **Source:** `src/state/swapReducer.ts:40`
- **Signature:** `export function swapReducer(current: SwapStateContext, action: SwapAction): SwapStateContext`
- **File hash:** `4d3e8981840666e821ccda014f002096622bd9d25f0965036cbacaa0597c0f6c`
- **Plan match:** Matches. Actions used by 3-2: `TX_SIGNED` (Signing→Executing, line 98), `EXECUTE_SUCCESS` (Executing→Success, line 121), `EXECUTE_ERROR` (Executing→Error, line 129), `NEW_SWAP` (Success→Idle, line 161). All four verified present.

### `useSwapState` (existing — do not modify)
- **Source:** `src/state/useSwapState.ts:17`
- **Signature:** `export function useSwapState(): { context: SwapStateContext; dispatch: (action: SwapAction) => void }`
- **File hash:** `bd52e7c57063b190f4d7ce1a46fe60066a556f99b763da0e368e9f7cf1596dea`
- **Plan match:** Matches. Includes the 60s `Executing` timeout (`useSwapState.ts:14`) → `TIMEOUT` action → `Error(ExecutionTimeout)` (verified at `swapReducer.ts:141-147`). 3-2 does NOT need to wire this — already shipped by 1-2.

### `SwapState` enum (existing — do not modify)
- **Source:** `src/state/swapState.ts:1`
- **Signature:** `export enum SwapState { Idle, LoadingQuote, QuoteReady, Signing, Executing, Success, Error }`
- **File hash:** `c451e6a9ab0b6ea3cd0ba58cefb12809f643db0f44f302e94cd570eada4528b9`
- **Plan match:** Matches.

### `transactionSigner.sign` (existing — do not modify)
- **Source:** `src/handlers/transactionSigner.ts:21`
- **Signature:** `async sign(base64Tx: string, wallet: Pick<WalletContextState, "signTransaction">): Promise<string>` (returns base64 signed tx)
- **File hash:** `f210df5e862dfe9ff3e2c2c7691649ae492e9ad9031e920362091e55aeec4705`
- **Plan match:** Matches. 3-1 closed contract. **Update needed in handleSwap:** capture the return value (`const signedTx = await transactionSigner.sign(...)`) — currently the code at `App.tsx:369-371` discards it because the placeholder didn't need it.

### `preflightChecks.run` (existing — do not modify)
- **Source:** `src/handlers/preflightChecks.ts:34`
- **Signature:** `async run(params: PreflightParams, wallet: PreflightWallet): Promise<void>`
- **File hash:** `41a25d0f49450c5b6a0308a1876dfb7f1ba33ed8db73f362255fa9d640ded740`
- **Plan match:** Matches. 3-1 closed contract.

### `SwapButton` (existing — to be tightened with spinner this story)
- **Source:** `src/ui/SwapButton.tsx:95`
- **Current signature:** `function SwapButton({ state, hasQuote, preflightError, onClick }: SwapButtonProps)`
- **File hash:** (computed at implement time — file already shipped by 3-1)
- **Plan match:** AC-3-2-5 requires "Spinner" with the loading copy. Current implementation renders text only (lines 27-31). 3-2 adds an inline `<Loader2 ... animate-spin />` prefix when `state === Signing || state === Executing`. No prop change.

### `SwapCard` (existing — main mount point)
- **Source:** `src/App.tsx:54`
- **File hash:** `521de1bbad4857e951b0021078fe4221efb3c6f4876fa73c15acf08ba6652c2b`
- **Plan match:** Matches. The placeholder block at `App.tsx:384-393` is what 3-2 replaces with the real `/execute` flow.

### `STALE_THRESHOLD_MS` (existing — used as-is)
- **Source:** `src/config/constants.ts:12`
- **Signature:** `export const STALE_THRESHOLD_MS = 30_000;`
- **File hash:** `7c2b71673890964c49887244fac3321d331f996e031f543a07726f5ee41e8f91`
- **Plan match:** Matches. Used for the post-signing stale recheck.

### `crypto.randomUUID()` (external — browser/Node native)
- **Source:** Web Crypto API; available in all modern browsers and Node 19+. Vite bundle targets `module.target === "esnext"` per `tsconfig.json` defaults; project is on Node 18+ (per `package.json` engines); browser support per MDN: Chrome 92+, Firefox 95+, Safari 15.4+. Suitable for this template's audience.
- **Signature:** `crypto.randomUUID(): string` returning a `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx` v4 UUID.
- **Plan match:** Matches AC-3-2-4 ("UUID generated"). No `uuid` npm package needed.

### ⚠ UNVERIFIED — not yet implemented (created by this story)

#### `SuccessDisplay`
- **Target source:** `src/ui/SuccessDisplay.tsx` (new file)
- **Contract props:**
  ```ts
  interface SuccessDisplayProps {
    result: SwapResult;
    inputSymbol: string;
    inputDecimals: number;
    outputSymbol: string;
    outputDecimals: number;
    onNewSwap: () => void;
  }
  ```
- **Marked:** ⚠ UNVERIFIED — source not yet implemented. Composition per Architecture Guardrails "SuccessDisplay component placement".

#### Spinner addition to `SwapButton`
- **Target source:** existing `src/ui/SwapButton.tsx` — modification only.
- **Contract:** When `state === SwapState.Signing` OR `state === SwapState.Executing`, render `<Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />` immediately before the label text. No prop changes.
- **Marked:** ⚠ UNVERIFIED — change not yet applied.

## Tasks

- [x] **Task 1: Tighten `executeOrder` return type + extend tests**
  - Maps to: AC-3-2-1 (contract half).
  - Files to modify:
    - `src/services/jupiterService.ts` — change `Promise<unknown>` → `Promise<ExecuteResponse>`. Import `ExecuteResponse` from `../types/swap`.
    - `src/services/jupiterService.test.ts` — add 3 cases under a new `describe("jupiterService.executeOrder", ...)` block:
      1. Sends POST to `/swap/v2/execute` with `{ signedTransaction, requestId }` body, x-api-key header, Content-Type application/json.
      2. Returns parsed `ExecuteResponse` on `code: 0` success response.
      3. Throws `SwapError(ConfigError)` synchronously when `VITE_JUPITER_API_KEY` is empty (uncovered today; jupiterClient enforces this — assert by re-loading jupiterService with `vi.stubEnv("VITE_JUPITER_API_KEY", "")`).
  - TDD: write test cases first; the type tightening is mechanical once green.
  - Amendment: log a brief entry in `docs/amendments.md` covering the return-type tightening (`unknown → ExecuteResponse`). This is Rule 3 per code-standards (interface refinement).
  - Commit: `feat(services): tighten executeOrder return type to ExecuteResponse`

- [ ] **Task 2: `SuccessDisplay` component + unit tests**
  - Maps to: AC-3-2-2, AC-3-2-3.
  - Files to create:
    - `src/ui/SuccessDisplay.tsx` — props per Verified Interfaces. Uses shadcn `Alert` (check `src/components/ui/alert.tsx` for available variants — if `success`/`green` exists, use it; otherwise compose with explicit border-emerald classes via design tokens). Renders title, sent/received DetailRows (UI units), Solscan anchor, "New Swap" Button.
    - `src/ui/SuccessDisplay.test.tsx` — `// @vitest-environment jsdom` header. Cases: renders sent + received amounts converted to UI units; Solscan link points to correct URL with the signature; clicking "New Swap" fires `onNewSwap`; link opens in new tab (`target="_blank"`, `rel="noopener noreferrer"`); accessible name "Swap successful" surfaced.
  - TDD: write test first; component is presentational and deterministic.
  - Patterns to follow: see `src/ui/SolBalanceWarning.tsx` for the Alert + Button composition; see `src/ui/QuoteDisplay.tsx` for `DetailList` / `DetailRow` usage and the `Number(rawString) / 10 ** decimals` formatting pattern.
  - Commit: `feat(ui): add SuccessDisplay alert with Solscan link + new-swap action`

- [ ] **Task 3: SwapButton spinner addition**
  - Maps to: AC-3-2-5 ("with Spinner").
  - Files to modify:
    - `src/ui/SwapButton.tsx` — import `Loader2` from `lucide-react`. In the rendered Button, prefix the label with `<Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />` when `surface.label === "Waiting for wallet…"` OR `surface.label === "Executing swap…"` (cleanest gate; equivalent to the state check).
    - `src/ui/SwapButton.test.tsx` — extend the existing Signing/Executing cases to assert a `Loader2` icon is rendered (query by `data-lucide` attribute or test-id; check the existing test pattern in the file). If `lucide-react`'s component renders an SVG with no role, query by `[aria-hidden="true"]` inside the button.
  - TDD: extend tests first.
  - Commit: `feat(ui): add inline spinner to SwapButton during signing and executing`

- [ ] **Task 4: `SwapCard.handleSwap` — wire executeOrder + EXECUTE_SUCCESS/ERROR + correlation ID + post-sign stale check**
  - Maps to: AC-3-2-1 (orchestration), AC-3-2-2 (mounts SuccessDisplay), AC-3-2-3 (NEW_SWAP wiring), AC-3-2-4 (correlation ID + logs), AC-3-2-5 (Executing state visible — no code change needed beyond Task 3 since SwapButton already reads state).
  - Files to modify:
    - `src/App.tsx`:
      1. Add imports: `executeOrder` from `./services/jupiterService`, `mapErrorCode` from `./utils/jupiterErrorMapper`, `SuccessDisplay` from `./ui/SuccessDisplay`, `ExecuteResponse, SwapResult` from `./types/swap`.
      2. Add local state `const [lastSwapResult, setLastSwapResult] = useState<SwapResult | null>(null);` near `preflightError` state (`App.tsx:60`).
      3. Add `useEffect` clearing `lastSwapResult` when `context.state` transitions OUT of Success (deps `[context.state]`); set to `null` when state is Idle, LoadingQuote, or Signing — this prevents a stale Success display lingering on a fresh swap.
      4. In `handleSwap` (currently `App.tsx:317-407`):
         - At top: `const swapCorrelationId = crypto.randomUUID();` and the structured `swap_started` log.
         - Capture the return of `transactionSigner.sign`: `const signedTx = await transactionSigner.sign(context.quote.transaction, { signTransaction });`.
         - **Replace lines 384-393** (the placeholder `SIGNING_ERROR` dispatch) with:
           - Post-signing stale recheck: if `Date.now() - context.quoteFetchedAt > STALE_THRESHOLD_MS`, dispatch `SIGNING_ERROR` with `SwapError(ErrorType.TransactionExpired, "Quote expired during signing — please try again")` and return.
           - `dispatch({ type: "TX_SIGNED" })` (enters Executing).
           - `try { const response = await executeOrder(signedTx, context.quote.requestId); ... }` block per Architecture Guardrails dispatch sequence.
           - On success (`status === "Success" && code === 0`): build `SwapResult`, `setLastSwapResult(result)`, `dispatch({ type: "EXECUTE_SUCCESS", signature: response.signature })`, log `execute_succeeded`.
           - On failure: build `SwapError` via `mapErrorCode`, `dispatch({ type: "EXECUTE_ERROR", error: swapErr })`, log `execute_failed`.
           - On thrown SwapError: pass through to `EXECUTE_ERROR`, log `execute_failed`.
           - On unexpected throw: wrap in `SwapError(ErrorType.UnknownError, ...)`, then `EXECUTE_ERROR`, log `execute_failed`.
         - Add `swapCorrelationId` and event labels to all existing log points (preflight, signing) — see Architecture Guardrails "swapCorrelationId generation" for the full event taxonomy.
      5. Mount `<SuccessDisplay>` between the error block (`App.tsx:530-545`) and the swap/connect button block (`App.tsx:547`):
         ```tsx
         {context.state === SwapState.Success && context.txSignature && lastSwapResult && (
           <SuccessDisplay
             result={lastSwapResult}
             inputSymbol={inputToken.symbol}
             inputDecimals={inputToken.decimals}
             outputSymbol={outputToken.symbol}
             outputDecimals={outputToken.decimals}
             onNewSwap={() => dispatch({ type: "NEW_SWAP" })}
           />
         )}
         ```
    - `src/App.test.tsx` — add 5 integration cases:
      1. Happy path: mock `executeOrder` to resolve with `{ status: "Success", code: 0, signature: "sig123", inputAmountResult: "1000000000", outputAmountResult: "100000" }`. Click the wired-up SwapButton (preflight + sign already mocked from 3-1's tests). Assert state advances to Success, SuccessDisplay renders, Solscan link contains `sig123`.
      2. Failure path with retryable code: mock `executeOrder` to resolve with `{ status: "Failed", code: -1000, ... }`. Assert `EXECUTE_ERROR` dispatches with `SwapError(TransactionExpired, retryable=true)` and the existing error block renders (3-3 will replace this with retry copy).
      3. Failure path with non-retryable code: `code: -2`. Assert `EXECUTE_ERROR` with `ExecutionFailed`.
      4. Network throw: `executeOrder` rejects with `SwapError(NetworkError)`. Assert pass-through.
      5. NEW_SWAP click: from Success state, click "New Swap"; assert state → Idle, SuccessDisplay unmounts, `lastSwapResult` cleared.
  - TDD: extend App.test.tsx first.
  - Depends on: Tasks 1, 2, 3.
  - Commit: `feat(app): wire executeOrder into handleSwap with success display and correlation ID`

- [ ] **Task 5: Manual verification + sprint-status close**
  - Not test-producing; documentation/verification only.
  - Run all 8 manual steps in "Manual Verification" below. Confirm full `npm test` passes (no regressions). Update `docs/state.json` to close story 3-2. Tag `post-jupiter-swap-template-3-2` after Gate 5 passes.

## must_haves

truths:
  - "executeOrder returns a typed ExecuteResponse (status, signature, code, inputAmountResult, outputAmountResult, optional error) — no longer typed as Promise<unknown>"
  - "executeOrder POSTs to /swap/v2/execute via jupiterClient with body {signedTransaction, requestId} and x-api-key header"
  - "executeOrder throws SwapError(ConfigError) synchronously when VITE_JUPITER_API_KEY is empty (gate enforced by jupiterClient)"
  - "handleSwap generates swapCorrelationId via crypto.randomUUID() at the top of the callback before any async work"
  - "handleSwap logs structured JSON with swapCorrelationId at every lifecycle step: swap_started, preflight_passed/failed, signing_started/failed, execute_started/succeeded/failed"
  - "handleSwap captures the signed base64 transaction from transactionSigner.sign and passes it to executeOrder along with context.quote.requestId"
  - "handleSwap re-checks stale-quote threshold AFTER transactionSigner.sign resolves; if Date.now() - context.quoteFetchedAt > STALE_THRESHOLD_MS, dispatches SIGNING_ERROR with SwapError(TransactionExpired) and aborts before /execute"
  - "On Jupiter response with status=='Success' AND code===0, handleSwap builds a SwapResult {txId: signature, status: 'confirmed', inputAmount: inputAmountResult, outputAmount: outputAmountResult, retriesAttempted: context.retryCount, swapCorrelationId} and dispatches EXECUTE_SUCCESS with the signature"
  - "On Jupiter response with non-success (status=='Failed' OR code!==0), handleSwap dispatches EXECUTE_ERROR with a SwapError constructed via mapErrorCode(response.code), preserving response.code, mapping.retryable, and details {requestId, responseBody, httpStatus: 200}"
  - "On thrown SwapError from executeOrder, handleSwap passes it through to EXECUTE_ERROR unchanged"
  - "On unexpected non-SwapError throw from executeOrder, handleSwap wraps in SwapError(UnknownError) and dispatches EXECUTE_ERROR"
  - "Story 3-2 does NOT dispatch EXECUTE_RETRY on retryable codes — retries are owned by Story 3-3; retryable failures dispatch EXECUTE_ERROR identically to non-retryable"
  - "SuccessDisplay renders only when context.state===Success AND context.txSignature!==null AND lastSwapResult!==null"
  - "SuccessDisplay shows 'Sent: {inputAmount} {inputSymbol}' and 'Received: {outputAmount} {outputSymbol}' with amounts converted from smallest units to UI units via Number(raw) / 10**decimals"
  - "SuccessDisplay renders a clickable Solscan anchor with href='https://solscan.io/tx/{signature}', target='_blank', rel='noopener noreferrer'"
  - "SuccessDisplay 'New Swap' button calls onNewSwap, which dispatches {type: 'NEW_SWAP'}; reducer transitions Success → Idle"
  - "When state transitions out of Success (NEW_SWAP fires), lastSwapResult is cleared to null and SuccessDisplay unmounts"
  - "SwapButton renders an inline lucide-react Loader2 icon with animate-spin class when state===Signing OR state===Executing, alongside the existing label text"

artifacts:
  - path: "src/ui/SuccessDisplay.tsx"
    contains: ["SuccessDisplay", "solscan.io/tx", "New Swap", "Sent", "Received", "noopener noreferrer"]
  - path: "src/ui/SuccessDisplay.test.tsx"
    contains: ["describe", "SuccessDisplay", "solscan.io/tx", "New Swap", "onNewSwap"]
  - path: "src/services/jupiterService.ts"
    contains: ["executeOrder", "ExecuteResponse", "Promise<ExecuteResponse>"]
  - path: "src/services/jupiterService.test.ts"
    contains: ["executeOrder", "/swap/v2/execute", "signedTransaction", "requestId"]
  - path: "src/ui/SwapButton.tsx"
    contains: ["Loader2", "animate-spin"]
  - path: "src/ui/SwapButton.test.tsx"
    contains: ["Signing", "Executing"]
  - path: "src/App.tsx"
    contains: ["executeOrder", "mapErrorCode", "SuccessDisplay", "swapCorrelationId", "crypto.randomUUID", "EXECUTE_SUCCESS", "EXECUTE_ERROR", "TX_SIGNED", "lastSwapResult"]
  - path: "src/App.test.tsx"
    contains: ["executeOrder", "EXECUTE_SUCCESS", "EXECUTE_ERROR", "SuccessDisplay", "NEW_SWAP"]

key_links:
  - pattern: "import { executeOrder }"
    in: ["src/App.tsx"]
  - pattern: "import { SuccessDisplay }"
    in: ["src/App.tsx"]
  - pattern: "import { mapErrorCode }"
    in: ["src/App.tsx"]
  - pattern: "import type { ExecuteResponse"
    in: ["src/services/jupiterService.ts"]
  - pattern: "Promise<ExecuteResponse>"
    in: ["src/services/jupiterService.ts"]
  - pattern: "crypto.randomUUID"
    in: ["src/App.tsx"]
  - pattern: "https://solscan.io/tx/"
    in: ["src/ui/SuccessDisplay.tsx"]
  - pattern: 'dispatch({ type: "EXECUTE_SUCCESS"'
    in: ["src/App.tsx"]
  - pattern: 'dispatch({ type: "EXECUTE_ERROR"'
    in: ["src/App.tsx"]
  - pattern: 'dispatch({ type: "TX_SIGNED" })'
    in: ["src/App.tsx"]
  - pattern: "import { Loader2 }"
    in: ["src/ui/SwapButton.tsx"]

## Dev Notes (advisory)

**Deviations from plan AC wording (per story-creator Rule 2 audit):**

1. **Plan AC-3-2-4 says `swapHandler.executeSwap()` runs.** Live code: orchestration is inlined in `SwapCard.handleSwap` (`src/App.tsx:317-407`), not extracted to a `swapHandler` module. Architecture §Component Decomposition lists `swapHandler` as a separate handler. **Decision:** keep inlined; satisfy AC behavior (UUID generated, every step logs it) without creating a new file. Trigger an `amendments.md` entry recording the architecture-vs-implementation drift (the `swapHandler` component is realized as `SwapCard.handleSwap` for v1; extraction deferred until 3-3's retry loop justifies a second consumer). AC wording is preserved verbatim.

2. **Plan AC-3-2-2 says "Toast also fires".** Live code: no toast library installed (verified `package.json` — no `sonner`, `react-hot-toast`, or `@base-ui/react/toast`). Adding one introduces a new dependency. **Decision:** scope toast to Story 4-1 (UX polish), inline a `// TODO(4-1): fire toast` comment in `SuccessDisplay`. The success Alert satisfies the "user knows it succeeded" intent; the toast is redundant signal, not load-bearing. Plan AC wording preserved verbatim. Track in `concerns.md` as part of 3-2 close-out.

3. **Plan AC-3-2-5 says "with Spinner".** Live code: `SwapButton` (3-1's deliverable) renders text only — no spinner. **Decision:** add an inline `<Loader2 ... animate-spin />` from `lucide-react` (already in deps). Minor scope addition; documented as Task 3.

4. **No other AC wording deviations.** AC-3-2-1, AC-3-2-3 map cleanly to existing reducer transitions and the executeOrder service contract.

**Why no reducer change:** all four required transitions (`TX_SIGNED`, `EXECUTE_SUCCESS`, `EXECUTE_ERROR`, `NEW_SWAP`) already exist in `swapReducer.ts` (verified). Story 1-2 over-built the reducer; 3-2 just consumes.

**Why store `inputAmountResult` / `outputAmountResult` in local state, not the reducer:** the reducer holds *transition* state (signature is the only execute-time field it captures). Render-only data lives at the consumer. Adds zero churn to the closed reducer contract.

**Why `mapErrorCode` for /execute failures (not custom mapping):** the helper is the canonical 14-code mapper from Story 1-1 (NFR-1). Reusing it ensures parity with whatever 3-3's retry-classification logic does. 3-3 will read `mapping.retryable` from the same helper to decide retry-or-error.

**Why two stale-quote checks:** 3-1's check fires at click-time (before preflight). Signing can take 0-120 seconds (wallet UX, user reading prompt). If signing took >30 s, the quote's blockhash is dead before /execute even fires. The post-sign recheck catches this. Without it, a slow-signing user would always hit a `code -1004` ("invalid block height") response and 3-3's retry loop would burn an attempt for free. Cheap belt-and-suspenders.

**Why `crypto.randomUUID()` not the `uuid` package:** `crypto.randomUUID` is native in modern browsers (Chrome 92+, Firefox 95+, Safari 15.4+) and Node 19+. The project already requires modern browsers (wallet-adapter-react targets ES2020+). Adding `uuid` would be a 12 kB dep for a single call site. Confirmed no `uuid` import in the existing codebase.

**Why I picked the `SwapResult.retriesAttempted = context.retryCount`:** the reducer's `retryCount` starts at 0 and increments on `EXECUTE_RETRY`. In 3-2 (no retries), it's always 0 on success. 3-3 will populate it correctly when the retry loop fires. Forward-compatible.

**Why hardcode `https://solscan.io/tx/`:** spec AC-FR-9 specifies Solscan exactly. Future stories can introduce an explorer config if needed; not needed for v1.

**Why `target="_blank" rel="noopener noreferrer"`:** standard external-link safety pattern (matches `react.md` / accessibility expectations).

**TanStack `useQueryClient` interaction:** the `executeOrder` POST does NOT go through TanStack Query (it's an imperative one-shot, not a cached read). Auto-refresh of /order pauses naturally because state advances out of `QuoteReady` (verified at `App.tsx:282-315` — effect early-returns if state is not `QuoteReady`). No explicit cancellation needed.

**`AbortController` for /execute:** `executeOrder` accepts a `signal` parameter (verified `jupiterService.ts:65`). For 3-2, we do NOT pass a signal — once the user has signed the transaction, aborting the /execute request would put us in a state where the wallet has authorized funds movement but we have no idea whether Jupiter received and submitted it. Per NFR-3 ("zero silent transaction result loss"), we let the call run to completion (60s timeout from `useSwapState` will surface `ExecutionTimeout` if it hangs).

**Wallet-disconnect during Executing:** verified at `swapReducer.ts:148-151` — `WALLET_DISCONNECTED` during Executing returns the current state unchanged (with the warning surfaced by the parent UI). Architecture §Workflow 4 G-1 confirms this is intentional ("Cannot cancel — tx already submitted to Jupiter"). 3-2 inherits this behavior; no changes needed. The architecture says "Display warning: 'Wallet disconnected. Transaction may still complete.'" — implementing this warning is technically in 3-2's scope but the existing error block (`App.tsx:530-545`) doesn't read disconnect state. **Defer the warning copy to 4-1** — current behavior (state unchanged, last error not shown, button still says "Executing swap…") is acceptable for v1 because the timeout will eventually surface.

**Testing approach:**
- `jupiterService.test.ts`: extend with `describe("executeOrder", ...)`. Pattern matches existing `describe("getOrder", ...)`. Mock `fetch` via `vi.stubGlobal("fetch", ...)`. Use `vi.stubEnv` for the API key tests (existing pattern at `jupiterService.test.ts:22-24`).
- `SuccessDisplay.test.tsx`: `// @vitest-environment jsdom` header. Use `@testing-library/react` `render` + `screen`. Build a fixture `SwapResult` and assert: title text, sent/received DetailRows (visible amounts), Solscan link `href` and `target`, `onNewSwap` invoked on button click.
- `SwapButton.test.tsx`: extend Signing/Executing cases — assert the Loader2 SVG is rendered inside the button. Use `container.querySelector("svg")` or `[aria-hidden='true']` selector since lucide-react's icons render as SVGs without explicit roles.
- `App.test.tsx`: extend with the 5 integration cases. Mock `executeOrder` via `vi.mock("./services/jupiterService", () => ({ getOrder: vi.fn(), executeOrder: vi.fn() }))`. Build a quote-ready state in the test setup (re-use 3-1's helpers). Walk the full handleSwap path and assert dispatches + rendered output.

**Library versions (verified from `package.json`):**
- `@solana/web3.js@^1.98.4` — verified, `VersionedTransaction` available (used by 3-1's signer; 3-2 doesn't add new web3.js usage).
- `@solana/wallet-adapter-react@^0.15.39` — verified, `signTransaction` shape unchanged (used by 3-1's signer call; 3-2 doesn't extend wallet usage).
- `lucide-react@^1.8.0` — verified, `Loader2` available (used elsewhere in the codebase per token-selector usage; sanity-check at implement time with `grep -rn "from \"lucide-react\"" src/`). ⚠ VERSION NOT VERIFIED via web search — use the installed version.
- `@tanstack/react-query@^5.99.2` — verified, no new query hooks needed for /execute (it's imperative, not cached). ⚠ VERSION NOT VERIFIED via web search — use the installed version.
- No new dependencies needed for this story. `crypto.randomUUID` is browser-native.

**Pre-existing baseline:** `docs/state.json` reports `baselineTests: { total: 187, passing: 187, failing: 0 }` (lastRefreshedAt 2026-04-23). Story 4-3 has shipped since the last refresh — implementer should re-baseline at story start (per `test-integrity.md` §4 baseline hygiene). Story 5-checkpoint is approaching.

**DO NOT modify:** `src/state/swapReducer.ts`, `src/state/useSwapState.ts`, `src/state/swapState.ts`, `src/types/errors.ts`, `src/types/swap.ts`, `src/types/tokens.ts`, `src/handlers/preflightChecks.ts`, `src/handlers/transactionSigner.ts`, `src/services/balanceService.ts`, `src/services/jupiterClient.ts`, `src/services/tokenService.ts`, `src/lib/connection.ts`, `src/lib/publicKey.ts`, `src/ui/SolBalanceWarning.tsx`, `src/ui/QuoteDisplay.tsx`, `src/ui/QuoteRefreshIndicator.tsx`, `src/ui/QuoteFreshnessIndicator.tsx`, `src/ui/SlippageSelector.tsx`, `src/ui/PriceImpactBadge.tsx`, `src/ui/TokenSelector/**`, `src/utils/jupiterErrorMapper.ts`, `src/config/constants.ts`, `src/config/env.ts`. These are closed contracts.

**MAY ADD to but do not rewrite:**
- `src/services/jupiterService.ts` — Task 1 tightens the `executeOrder` return type only.
- `src/services/jupiterService.test.ts` — extend with `executeOrder` cases.
- `src/ui/SwapButton.tsx` — Task 3 adds the spinner only; no other behavior change.
- `src/ui/SwapButton.test.tsx` — extend the existing Signing/Executing cases.
- `src/App.tsx` — Task 4: replace placeholder block, add `lastSwapResult` state + cleanup effect, add SuccessDisplay mount, add `swapCorrelationId` + structured logs.
- `src/App.test.tsx` — extend with 5 integration cases.

**Commit plan (per code-standards §1 — one commit per task):**
1. `feat(services): tighten executeOrder return type to ExecuteResponse` (Task 1)
2. `feat(ui): add SuccessDisplay alert with Solscan link + new-swap action` (Task 2)
3. `feat(ui): add inline spinner to SwapButton during signing and executing` (Task 3)
4. `feat(app): wire executeOrder into handleSwap with success display and correlation ID` (Task 4)
5. `chore(state): close story 3-2 — Execute Flow + Success Display` (Task 5)

Pre-story tag: `pre-jupiter-swap-template-3-2` (create before Task 1). Post-story tag: `post-jupiter-swap-template-3-2` (after Gate 5).

**Amendment generation for plan deviations (per code-standards Rule 3):**
- Deviation #1 (`swapHandler` extraction deferred → orchestration in `SwapCard.handleSwap`) — log during Task 4.
- Deviation #2 (toast deferred to 4-1) — log during Task 2 OR add to `concerns.md` (Low severity, polish-only).
- Deviation in Task 1 (`executeOrder` return type tightening) — log a brief amendment.

> Ref: docs/architecture.md#Workflow 2 — full execute flow narrative.
> Ref: docs/architecture.md#Component Decomposition — `swapHandler` listed as a separate handler; deviated per Dev Note #1.
> Ref: docs/architecture.md#API Contracts — `/execute` request/response shape and 14 error codes.
> Ref: docs/architecture.md#Data Models — `ExecuteResponse`, `SwapResult`, error `details` fields.
> Ref: docs/amendments.md#A-5 — `/execute` requires API key; jupiterClient enforces this — 3-2 inherits the gate.
> Ref: docs/amendments.md#A-6 — auto-refresh effect runs only while QuoteReady; naturally pauses for 3-2's flow.
> Ref: docs/concerns.md#C-3 — Swap button reactivity to balance fetch failure already addressed by 3-1; 3-2 doesn't reopen.
> Ref: docs/spec.md#AC-FR-9 — Solscan URL format.
> Ref: docs/spec.md#AC-A-5 — no swallowed /execute response (NFR-3).
> Ref: docs/spec.md#AC-D-1 — correlation ID logging requirements.
> Ref: docs/design-system.md#14 Organism 3 (Transaction Status) — Success Alert composition (Solscan link, "New Swap" button, DetailList for sent/received).
> Ref: docs/stories/3-1-preflight-checks-transaction-signing.md#Verified Interfaces — transactionSigner + preflightChecks contracts inherited unchanged.

## Detected Patterns

| Pattern | Value | Sampled from | Established? |
|---------|-------|--------------|--------------|
| Handler/orchestration location | Inlined in `SwapCard.handleSwap` (App.tsx) when single-caller; standalone module under `src/handlers/` only when reused | `src/App.tsx:317-407` (inlined), `src/handlers/preflightChecks.ts` + `transactionSigner.ts` (standalone after 3-1) | Established (single-caller inlined for v1) |
| Service POST + typed response | `jupiterClient.post<T>(...)` + caller annotates the generic `T` | `src/services/jupiterClient.ts:132`, used by `getOrder` at `jupiterService.ts:32` | Established |
| Error mapping for Jupiter codes | `mapErrorCode(code)` from `src/utils/jupiterErrorMapper.ts` | `src/utils/jupiterErrorMapper.ts:83`, all 14 codes pre-mapped | Established |
| Structured log format | Single-line `console.warn(JSON.stringify({event, ...payload, timestamp}))` | `src/state/swapReducer.ts:168-173` (invalid_transition) | Established |
| Component test environment | `// @vitest-environment jsdom` comment header | `src/ui/SolBalanceWarning.test.tsx`, `src/ui/SwapButton.test.tsx`, `src/ui/QuoteDisplay.test.tsx` | Established |
| External link composition | `<a href={url} target="_blank" rel="noopener noreferrer">…</a>` | (no existing example in src; pattern is universal — established by react.md / WCAG conventions) | Universal |
| Number formatting (raw → UI units) | `Number(rawString) / 10 ** decimals` then `.toLocaleString` for display | `src/App.tsx:474-481` (output amount), `src/ui/QuoteDisplay.tsx` | Established |
| Alert composition | shadcn `Alert` + `AlertTitle` + `AlertDescription` + action buttons | `src/ui/SolBalanceWarning.tsx` | Established |
| Lucide icon usage | `import { IconName } from "lucide-react"` + className with size + animation tokens | (sanity-check at implement time with `grep -rn "from \"lucide-react\"" src/`) | ⚠ Verify at implement |
| Test mocking pattern for services | `vi.mock("./services/jupiterService", () => ({ getOrder: vi.fn(), executeOrder: vi.fn() }))` + per-test `mockResolvedValueOnce` / `mockRejectedValueOnce` | `src/App.test.tsx` (existing), `src/services/jupiterService.test.ts` (existing) | Established |
| State machine action dispatch | `dispatch({ type: "ACTION_NAME", ...payload })` | `src/state/useSwapState.ts`, `src/App.tsx` (multiple sites) | Established |
| UUID generation | `crypto.randomUUID()` browser-native — NO `uuid` npm dep present in package.json | (verified absence) | Pattern asserted by this story — first use |

## Wave Structure (internal to this story)

- **Wave 1:** Task 1 (executeOrder type tightening). Pure type/test change, no UI dep.
- **Wave 1 (parallel):** Task 2 (SuccessDisplay component). Independent of Task 1; presentational only.
- **Wave 1 (parallel):** Task 3 (SwapButton spinner). Independent of Task 1 and 2; small modification to existing file.
- **Wave 2:** Task 4 (App integration). Depends on Tasks 1, 2, 3.
- **Wave 3:** Task 5 (verification + sprint-status close). Depends on Task 4.

Wave 1's parallelism is real: Tasks 1, 2, 3 touch different files (`jupiterService.ts/test.ts` vs `SuccessDisplay.tsx/test.tsx` vs `SwapButton.tsx/test.tsx`), no shared App state, no shared test fixtures. Implementer may run them concurrently.

## Story Size: M

- Line count: within M budget (story file ~480 lines — over the 220 baseline, justified by the density of execute-flow specification: 5 ACs × dispatch sequences + error mapping table + state-machine transition verification + post-sign stale recheck rationale).
- `must_haves.truths` count: 18 (top of M cap; mid-story flow has many distinct assertions across success path, failure path, retry-deferral, correlation ID, success display, spinner addition).
- Tasks: 5 (4 code tasks + 1 verification).
- Files created: 2 (`SuccessDisplay.tsx` + test).
- Files modified: 6 (`jupiterService.ts`, `jupiterService.test.ts`, `SwapButton.tsx`, `SwapButton.test.tsx`, `App.tsx`, `App.test.tsx`).

## Manual Verification Steps

After Task 4 completes:

1. `npm run dev` → connect a funded wallet → enter a small SOL amount → quote loads → click Swap → wallet popup appears for signing. Approve. ✓
2. After approval, the SwapButton shows "Executing swap…" with the inline spinner; the card stays interactive otherwise (no overlay — that's 4-1's job). ✓ (AC-3-2-5)
3. Within ~5-15s, Jupiter responds. The state transitions Executing → Success. The SuccessDisplay appears showing: "Sent: {amount} SOL", "Received: {amount} USDC", a clickable "View on Solscan" link, and a "New Swap" button. ✓ (AC-3-2-1, AC-3-2-2)
4. Open browser console → confirm structured logs at every step: `swap_started`, `preflight_passed`, `signing_started`, `execute_started`, `execute_succeeded` — all carrying the same `swapCorrelationId`. ✓ (AC-3-2-4)
5. Click the Solscan link → opens in new tab → shows the confirmed transaction with the correct signature. ✓ (AC-3-2-2)
6. Click "New Swap" → SuccessDisplay disappears, state returns to Idle, input fields clear (or stay populated — verify against existing reset behavior in `swapReducer.ts:initialState`). ✓ (AC-3-2-3)
7. Repeat the swap, but reject the wallet popup → state transitions to Error with "You rejected the signature request" — UNCHANGED from 3-1's behavior. ✓ (AC-3-1-5; sanity-check no regression)
8. Switch theme (wireframe-light ↔ wireframe-dark ↔ brand-light ↔ brand-dark) — SuccessDisplay legible in all four; Solscan link readable; spinner visible. ✓
9. Force a `/execute` failure (e.g., disconnect network during Executing, or use a contrived test wallet that triggers `code: -2`): observe state transitions Executing → Error with the mapped error message. SuccessDisplay does NOT render. ✓ (AC-A-5: no silent loss)
10. Sleep through signing for >30s (open wallet popup, wait): on approval, verify the post-sign stale check fires — state goes to Error with "Quote expired during signing — please try again". ✓ (post-sign stale check)

## Amendments Consulted

- **A-5 (2026-04-22 — API-key gate softened to swap endpoints only).** Impact on 3-2: `jupiterService.executeOrder` calls `/swap/v2/execute` which is a key-required path. `jupiterClient` throws `SwapError(ConfigError)` synchronously when the key is missing. 3-2 does not need to re-implement the gate; the existing test "throws SwapError(ConfigError) synchronously when VITE_JUPITER_API_KEY is empty" (Task 1) confirms the inherited gate.
- **A-6 (2026-04-24 — Quote auto-refresh + manual refresh indicator).** Impact on 3-2: auto-refresh effect early-returns when `state !== QuoteReady` (`App.tsx:283`). Once `handleSwap` advances state to Signing/Executing/Success, auto-refresh naturally pauses. No interaction concern. The `hasQuote` stale-while-revalidate gate (`App.tsx:268-271`) does not apply during Signing/Executing because those states aren't QuoteReady or LoadingQuote.
- **A-7 (2026-04-24 — User-controlled slippage tolerance).** Impact on 3-2: the `slippageBps` field is already on `OrderResponse` and threaded into `getOrder`. Story 3-2 doesn't read or modify slippage — `executeOrder` doesn't accept a slippage param (Jupiter takes it from the original /order request, embedded in the requestId). No interaction concern.
- **A-8 / A-9 (2026-04-24 — wSOL alias).** Impact on 3-2: zero. The wSOL alias lives in `balanceService.getTokenBalance`; preflight (called by 3-1, not 3-2) is the consumer. 3-2 does not call balance services.

## Open Questions / Risks

1. **Toast notification deferral (AC-3-2-2 wording).** Plan says "Toast also fires" — no toast library installed. Deferred to 4-1; the success Alert satisfies the user-facing intent. **Risk:** if QA reviews against verbatim plan text, this surfaces as a gap. Mitigation: log in `concerns.md` and reference the deferral in 4-1's story.

2. **`swapHandler.executeSwap()` extraction deferral (AC-3-2-4 wording).** Plan references the architecture component name. Implementation keeps orchestration inlined. **Risk:** Architecture audit may flag the drift. Mitigation: amendment entry on commit, plus a follow-up story in 3-3 (or a CS-* story after 3-3) to extract once retry orchestration adds a second consumer.

3. **Execute-time wallet-disconnect warning copy.** Architecture §Workflow 4 mandates "Wallet disconnected. Transaction may still complete." UI when wallet disconnects during Executing. Reducer behavior is correct (state unchanged), but UI doesn't render the warning today. Deferred to 4-1 per Dev Note. **Risk:** edge case rare in practice; acceptable for v1.

4. **Card overlay during Signing/Executing.** Design-system §15 specifies `bg-background/50` overlay. Deferred to 4-1. **Risk:** weak visual signal that user is mid-flow; mitigated by the SwapButton spinner (Task 3).

5. **Re-baseline drift.** Last refresh was after Story 5 (3-1); two more stories (3-1 polishing + 4-3) have completed since. Per `test-integrity.md` §4, every 5 stories baselined failures must be re-presented. Implementer should run the baseline-refresh check before Task 5 close.

6. **Conflicts noted (no silent resolution):**
   - **Plan AC-3-2-2 ("Toast also fires") vs. live deps (no toast library):** flagged above; toast deferred to 4-1.
   - **Architecture §Component Decomposition (`swapHandler` as a standalone module) vs. live code (`handleSwap` inlined in `SwapCard`):** flagged above; extraction deferred via amendment.
   - **Plan AC-3-2-4 ("`swapHandler.executeSwap()` runs") vs. live code:** behavior preserved; module extraction deferred.
   - **Architecture §Workflow 4 G-1 (mid-Executing disconnect warning) vs. live UI:** copy deferred to 4-1; reducer behavior already correct.
   - **Plan AC-3-2-1 (`SwapResult` shape) vs. spec wording ("status confirmed"):** plan says `status: "confirmed"` (lowercase string) and `signature, amounts`. The architecture's `SwapResult.status` type is `"confirmed" | "failed"` (verified `swap.ts:33`). No conflict.
