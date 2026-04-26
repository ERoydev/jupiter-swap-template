---
id: "3-1-preflight-checks-transaction-signing"
slug: preflight-checks-transaction-signing
title: "Pre-flight Checks + Transaction Signing"
status: paused
size: M
wave: 3
dependencies: ["2-1", "2-3"]
created: 2026-04-23
pausedCheckpoint: task-4
---

# Story: Pre-flight Checks + Transaction Signing

## User Story
As a swap end user, I want all validations to run before my swap and the transaction to be signed correctly, so that I don't submit invalid or unsigned transactions.

## Scope

**In scope (this story):**
- `preflightChecks.run(params, connection, wallet)` — all 7 FR-11 checks, fail-fast in declared order, typed `SwapError` throws per check.
- `transactionSigner.sign(base64Tx, wallet)` — base64 → `VersionedTransaction` → wallet signs → base64 (partial signing only; Jupiter pre-signs where needed).
- Wallet-reject → `state → Error(WalletRejected)` wiring (caller side, inside `SwapCard.handleSwap`).
- Stale-quote detection (`> STALE_THRESHOLD_MS` = 30s since `quoteFetchedAt`) with `QuoteReady → LoadingQuote` transition via existing `FETCH_QUOTE` action, then re-enter the swap on fresh quote.
- `SwapButton` component: disabled states + Tooltip mapping the 7 preflight failure reasons to concrete button label + tooltip text.
- Integration in `SwapCard` (`src/App.tsx`): replace the inline `<button disabled={!hasQuote}>` with `<SwapButton>` that consumes preflight result + onClick orchestration.

**Out of scope (deferred to later stories):**
- 3-2: `jupiterService.executeOrder` call, Executing → Success transition, "Waiting for wallet…" / "Executing swap…" Spinner copy, success display + Solscan link, `swapCorrelationId` UUID generation, full `swapHandler.executeSwap()` orchestrator.
- **3-2 (inherited from 3-1):** Re-check stale-quote threshold IMMEDIATELY BEFORE calling `/execute` (not just before preflight). Story 3-1 gates freshness at swap-click time; if the user spends >30s in the wallet popup, the quote's blockhash can expire before submission. 3-2 must re-evaluate `Date.now() - context.quoteFetchedAt > STALE_THRESHOLD_MS` right after `transactionSigner.sign` resolves and before `jupiterService.executeOrder` fires, dispatching `FETCH_QUOTE` and returning if stale.
- 3-3: retry loop on retryable Jupiter error codes (-1, -1000, -1004, -2000, -2003), "Retrying… attempt N of 3" copy, `MAX_RETRIES` enforcement.
- 4-1: responsive-layout polish, full Tooltip a11y spec across viewports, tap-target ≥ 44px sweep.
- Unit-convention change to `MIN_SOL_BALANCE` — see Dev Notes (this story keeps the existing lamports-based constant and converts on compare).

## Acceptance Criteria

Copied verbatim from `docs/plan.md` (Story 3-1, lines 109-115) with the only change being AC numbering. No wording has been altered; the plan AC block is a single bullet group and has been decomposed 1:1.

- **AC-3-1-1.** Given `preflightChecks.run(params, connection, wallet)`, When all 7 checks pass, Then returns success.
- **AC-3-1-2.** Given each individual check fails, When run, Then throws correct `SwapError`: (1) `WalletNotConnected`, (2) `InvalidInput` "Enter a positive amount", (3) `InvalidInput` "Invalid input token address", (4) `InvalidInput` "Invalid output token address", (5) `InvalidInput` "Cannot swap a token to itself", (6) `InsufficientSOL`, (7) `InsufficientBalance`.
- **AC-3-1-3.** Given pre-flight failure, When swap button renders, Then disabled with text matching failure + Tooltip.
- **AC-3-1-4.** Given `transactionSigner.sign(base64Tx, wallet)`, When called, Then deserializes, partially signs, re-serializes to valid base64 signed `VersionedTransaction`.
- **AC-3-1-5.** Given wallet rejects signing, When rejection occurs, Then `state → Error(WalletRejected)`.
- **AC-3-1-6.** Given stale quote (> 30s), When user clicks swap, Then `QuoteReady → LoadingQuote` for fresh `/order`.

## Architecture Guardrails

**Dependency direction (LOCKED, DD-4):** `UI (SwapButton, SwapCard)` → `Handlers (preflightChecks, transactionSigner)` → `Services (balanceService, jupiterService)` → `Types/Config`. Handlers MUST NOT import from `App.tsx` or any `ui/` module.

**Handler location (LOCKED):** New files live under `src/handlers/` — the `src/handlers/` directory does NOT exist yet (verified by `ls`); this story creates it. Test files co-locate as `src/handlers/{name}.test.ts`.

**Pre-flight check order (LOCKED, DD-7, plan AC-3-1-2, spec FR-11, architecture Workflow 5):** Checks run in the declared order; the first failing check throws and stops evaluation. Mapping table:

| # | Check | Source | Throws on fail (full `SwapError` construction) |
|---|-------|--------|----------------------------------------------|
| 1 | `wallet.connected === true` AND `wallet.publicKey != null` | `useWallet()` state (caller passes) | `new SwapError(ErrorType.WalletNotConnected, "Connect a wallet to continue", undefined, false)` |
| 2 | `parseFloat(params.amount) > 0` (amount is smallest-unit string, but "0" and negative/NaN all fail) | `params.amount` | `new SwapError(ErrorType.InvalidInput, "Enter a positive amount", undefined, false)` |
| 3 | `isValidBase58PublicKey(params.inputMint)` | `params.inputMint` | `new SwapError(ErrorType.InvalidInput, "Invalid input token address", undefined, false)` |
| 4 | `isValidBase58PublicKey(params.outputMint)` | `params.outputMint` | `new SwapError(ErrorType.InvalidInput, "Invalid output token address", undefined, false)` |
| 5 | `params.inputMint !== params.outputMint` | both | `new SwapError(ErrorType.InvalidInput, "Cannot swap a token to itself", undefined, false)` |
| 6 | `balanceService.getSolBalance(wallet.publicKey) >= MIN_SOL_BALANCE_UI` (UI units — see "Unit convention" below) | `balanceService` (Ultra-first, SOL-only RPC fallback per A-4) | `new SwapError(ErrorType.InsufficientSOL, "You need at least 0.01 SOL for transaction fees", undefined, false, { walletAddress: wallet.publicKey.toBase58() })` |
| 7 | `balanceService.getTokenBalance(wallet.publicKey, params.inputMint) >= params.amount` (both in UI-units; convert `params.amount` smallest-unit → UI via `params.inputDecimals`) | `balanceService` (Ultra-only per A-4) | `new SwapError(ErrorType.InsufficientBalance, "Insufficient {symbol} balance", undefined, false, { walletAddress: wallet.publicKey.toBase58(), mint: params.inputMint })` — `{symbol}` substituted from `params.inputSymbol` |

Check 1 is synchronous. Checks 2-5 are synchronous and string-only (no network). Checks 6-7 are async (hit balanceService). Order matters for error priority.

**`isValidBase58PublicKey(str)` implementation (LOCKED):** Use `new PublicKey(str)` from `@solana/web3.js` and catch. `new PublicKey` throws `TypeError` on invalid base58 or on-curve violation. Do NOT invent a regex validator — web3.js's check is canonical and matches DD-3. Inlined helper is fine; put it in `src/lib/publicKey.ts` (new) for reuse + testability.

**Unit convention for check 6 (LOCKED, this story decides per A-5 2026-04-23):**
- `balanceService.getSolBalance()` returns UI units (e.g. `1.5` for 1.5 SOL) — verified against source.
- Existing `MIN_SOL_BALANCE` constant in `src/config/constants.ts` is in LAMPORTS (`0.01 * LAMPORTS_PER_SOL` = `10_000_000`).
- **Decision:** Introduce a sibling constant `MIN_SOL_BALANCE_UI = 0.01` in `src/config/constants.ts`. Do NOT rename or replace `MIN_SOL_BALANCE` (it may still be referenced in tests or by downstream template consumers). The preflight check compares UI units to UI units. Rationale: explicit unit suffix on the constant name prevents the single most likely bug class in this file (lamport/UI unit confusion).
- `MIN_SOL_BALANCE` lamports value is retained untouched for backward compatibility.

**Parameter shape for `preflightChecks.run` (LOCKED):**
```ts
interface PreflightParams {
  inputMint: string;
  outputMint: string;
  amount: string;          // smallest-unit (lamports), matches SwapParams.amount
  inputDecimals: number;   // needed for check 7 (UI-unit compare)
  inputSymbol: string;     // needed for check 7's error message interpolation
}

interface PreflightWallet {
  connected: boolean;
  publicKey: PublicKey | null;
}

// Signature:
async function run(
  params: PreflightParams,
  wallet: PreflightWallet,
): Promise<void>  // throws SwapError on first failing check; resolves void on all-pass
```

Note: `connection` is NOT a parameter — per A-4, `balanceService` owns its own connection (singleton from `src/lib/connection.ts`). Plan AC wording "run(params, connection, wallet)" is amended to `run(params, wallet)`; see "Deviations from plan AC wording" in Dev Notes. `ensureConnection` is injected internally by `balanceService.getSolBalance`'s RPC fallback path.

**Signing path (LOCKED, architecture §Non-Negotiable Boundaries + §Workflow 2):**
- Input: `base64Tx: string` (from `OrderResponse.transaction`) and `wallet: { signTransaction<T>(tx: T): Promise<T> }` from `@solana/wallet-adapter-react`'s `useWallet()`.
- Flow: `base64 → Uint8Array (atob + Uint8Array.from)` → `VersionedTransaction.deserialize(bytes)` → `await wallet.signTransaction(tx)` → `tx.serialize()` → `Uint8Array → base64 (btoa)`.
- "Partial signing" note: wallet-adapter-react does NOT expose `partiallySignTransaction`. `signTransaction` on a `VersionedTransaction` only appends the user's signature and preserves signatures already attached (Jupiter co-signs certain routes server-side). This IS partial signing. See Dev Notes.
- Wallet-rejection detection: caller wraps `transactionSigner.sign` in try/catch. wallet-adapter-base throws `WalletSignTransactionError` (sometimes wrapped) on user reject. For this story, the handler rethrows whatever it catches so the caller can classify; the caller dispatches `{ type: "SIGNING_ERROR", error: new SwapError(ErrorType.WalletRejected, ...) }` on any thrown error from `sign` (simpler + matches industry: rejection is the only expected failure mode for `signTransaction`).
- `transactionSigner.sign` must never call any network — it's pure (de)serialization + wallet invocation (same scope rule as architecture §Handler Layer).

**Stale-quote detection (LOCKED, architecture §State Machine "Quote staleness"):**
- Check at swap-click time: `context.quoteFetchedAt !== null && Date.now() - context.quoteFetchedAt > STALE_THRESHOLD_MS`.
- If stale: dispatch `{ type: "FETCH_QUOTE" }` (verified transition exists from `QuoteReady` at `swapReducer.ts:89`) which transitions to `LoadingQuote`; then `SwapCard`'s existing `fetchQuote(lamports)` call pattern re-runs (same code path as the token-change effect at `App.tsx:120`). Do NOT block on the re-quote inside `handleSwap` — let the normal `QuoteReady` transition re-render and the user re-clicks, OR capture the fresh quote via an effect that detects the prior-intent-to-swap flag. **Implementation pick (LOCKED for this story):** user-re-click model. Simpler, predictable, matches jup-ag/plugin behavior. A single small `AlertDescription` can hint "Quote refreshed — click Swap to confirm" if the re-quote was triggered by the freshness check; this is a nice-to-have, not a requirement.
- Freshness check happens BEFORE preflight. If stale → refetch and return early from `handleSwap` (no preflight, no signing).

**SwapButton disabled-state mapping (LOCKED, AC-3-1-3):**

| Preflight outcome | Button label | Button `disabled` | Tooltip text |
|-------------------|--------------|-------------------|--------------|
| No quote yet (idle / `!hasQuote`) | "Enter an amount" | true | — |
| Wallet not connected (caller shows "Connect Wallet" button instead — out of this path) | "Connect Wallet" | — | — |
| Check 1 fails | "Connect Wallet" | true | "Connect a wallet to continue" |
| Check 2 fails | "Enter an amount" | true | "Enter a positive amount" |
| Check 3 fails | "Invalid input token" | true | "Invalid input token address" |
| Check 4 fails | "Invalid output token" | true | "Invalid output token address" |
| Check 5 fails | "Same input and output" | true | "Cannot swap a token to itself" |
| Check 6 fails | "Insufficient SOL" | true | "You need at least 0.01 SOL for transaction fees" |
| Check 7 fails | "Insufficient {symbol}" | true | "Insufficient {symbol} balance" |
| All checks pass | "Swap" | false | — (no tooltip when enabled) |
| State `Signing` | "Waiting for wallet…" | true | — (3-2 refines; this story may ship a placeholder) |
| State `Executing` | "Executing swap…" | true | — (3-2 owns) |

`{symbol}` = `inputToken.symbol` from `SwapCard` state.

**Tooltip implementation (LOCKED):** Use `@base-ui/react/tooltip` (already established — see `src/ui/TokenSelector/TokenRow.tsx:82-108` for the exact pattern). Do NOT introduce a shadcn Tooltip — this project uses Base UI's tooltip and the pattern is consistent across the codebase.

> Ref: docs/architecture.md#Workflow 5 — preflight order, early-surfacing on wallet-connect (out-of-scope for this story per the Scope section; 3-1 runs only at swap-click time and button-render time).

> Ref: docs/architecture.md#Workflow 2 — full execute flow (signing portion is in-scope; the `/execute` call + Executing→Success is 3-2).

> Ref: docs/architecture.md#State Machine — Full Transition Table — `QuoteReady → Signing` (guard: all 7 checks pass), `Signing → Error`, `QuoteReady → LoadingQuote` (via `FETCH_QUOTE`).

> Ref: docs/amendments.md#A-4 — `balanceService` Ultra-primary; public API (`getSolBalance`, `getTokenBalance`) preserved for this story.

> Ref: docs/amendments.md#A-5-2026-04-23 — Story 3-1 owns the "Insufficient SOL" disabled-button surface end-to-end; `MIN_SOL_BALANCE_UI` intentionally NOT added in 2-3.

## Verified Interfaces

Computed from source on disk at 2026-04-23. Implementer should re-check hashes before starting; any mismatch means the file has been edited since the story was written and the signatures below should be re-verified.

### `balanceService.getSolBalance` (existing — do not modify)
- **Source:** `src/services/balanceService.ts:108`
- **Signature:** `async getSolBalance(publicKey: PublicKey, signal?: AbortSignal): Promise<number>`
- **File hash:** `b6a5dc4124e6b294590fd20869529978f3ab73caced23e8ee7b0e0d1bc9e8f5c`
- **Plan match:** ⚠ Amended — plan text says "returns lamports"; actual source returns UI units (SOL). Story inlines the correction via `MIN_SOL_BALANCE_UI`. Matches the amendment noted in story 2-3's Verified Interfaces block.
- **Behavior:** Primary `/ultra/v1/balances/{pk}`; on Ultra error, falls back to `connection.getBalance(pk) / 1e9`. On both failing, throws `SwapError(BalanceCheckFailed, retryable=true)`.

### `balanceService.getTokenBalance` (existing — do not modify)
- **Source:** `src/services/balanceService.ts:141`
- **Signature:** `async getTokenBalance(publicKey: PublicKey, mint: string, signal?: AbortSignal): Promise<number>`
- **File hash:** `b6a5dc4124e6b294590fd20869529978f3ab73caced23e8ee7b0e0d1bc9e8f5c`
- **Plan match:** Matches. Ultra-only; returns `0` when wallet doesn't hold the mint. UI units.

### `swapReducer` (existing — do not modify)
- **Source:** `src/state/swapReducer.ts:40`
- **Signature:** `export function swapReducer(current: SwapStateContext, action: SwapAction): SwapStateContext`
- **File hash:** `4d3e8981840666e821ccda014f002096622bd9d25f0965036cbacaa0597c0f6c`
- **Plan match:** Matches. Actions used by 3-1: `FETCH_QUOTE` (stale refresh from `QuoteReady`), `START_SIGNING` (QuoteReady→Signing), `PREFLIGHT_FAILED` (QuoteReady→Error with passed SwapError), `SIGNING_ERROR` (Signing→Error with passed SwapError). All four verified present at `src/state/swapReducer.ts:83-87` (`QuoteReady` block) and `src/state/swapReducer.ts:97-109` (`Signing` block).

### `useSwapState` (existing — do not modify)
- **Source:** `src/state/useSwapState.ts:17`
- **Signature:** `export function useSwapState(): { context: SwapStateContext; dispatch: (action: SwapAction) => void }`
- **File hash:** `bd52e7c57063b190f4d7ce1a46fe60066a556f99b763da0e368e9f7cf1596dea`
- **Plan match:** Matches. Story 3-1 dispatches `START_SIGNING`, `PREFLIGHT_FAILED`, `SIGNING_ERROR`, `FETCH_QUOTE`.

### `SwapError` + `ErrorType` (existing — do not modify, all needed variants present)
- **Source:** `src/types/errors.ts:22` (class), `src/types/errors.ts:1` (enum)
- **Signature:** `class SwapError extends Error { constructor(type: ErrorType, message: string, code?: number, retryable?: boolean, details?: Record<string, unknown>) }`
- **File hash:** `317a0c5d83ba58c22a8d83a22fd8c5699870732c7ebdaa69c496260701b3da30`
- **Plan match:** Matches. Verified variants present: `WalletNotConnected` (line 8), `InvalidInput` (line 10), `InsufficientSOL` (line 2), `InsufficientBalance` (line 3), `WalletRejected` (line 7). No new variants needed.

### `MIN_SOL_BALANCE` (existing — keep untouched; sibling `MIN_SOL_BALANCE_UI` added this story)
- **Source:** `src/config/constants.ts:5`
- **Signature:** `export const MIN_SOL_BALANCE = 0.01 * LAMPORTS_PER_SOL;` (resolves `10_000_000`, units: lamports)
- **File hash:** `df5afdff583452b60396ee1b7171e488d69fada464b30444a8dd3927edfa0ec2`
- **Plan match:** Matches. This story ADDS `MIN_SOL_BALANCE_UI = 0.01` to the same file (Task 1).

### `STALE_THRESHOLD_MS` (existing — do not modify)
- **Source:** `src/config/constants.ts:11`
- **Signature:** `export const STALE_THRESHOLD_MS = 30_000;` (30 seconds, matches AC-3-1-6)
- **File hash:** `df5afdff583452b60396ee1b7171e488d69fada464b30444a8dd3927edfa0ec2`
- **Plan match:** Matches.

### `WalletContextState.signTransaction` (external — wallet-adapter-react)
- **Source:** `node_modules/@solana/wallet-adapter-react/lib/types/useWallet.d.ts:19` (reference only)
- **Signature:** `signTransaction: <T extends TransactionOrVersionedTransaction>(transaction: T) => Promise<T>) | undefined`
- **Plan match:** ⚠ Amended — plan says `wallet.partiallySignTransaction`; wallet-adapter-react only exposes `signTransaction`. For `VersionedTransaction`, `signTransaction` is effectively partial (Solana's `VersionedTransaction` keeps the `signatures[]` array and wallets only fill the slot matching `publicKey`). See Dev Notes.
- **Behavior:** returns the same `T` instance with the user's signature appended to `tx.signatures[]`. Rejects with `WalletSignTransactionError` (from `@solana/wallet-adapter-base`) on user cancel. The Signature undefined-case (wallet doesn't support signing) must be handled — if `signTransaction` is `undefined`, throw `SwapError(ErrorType.WalletNotConnected)` before attempting.

### `VersionedTransaction` (external — @solana/web3.js v1.98.4)
- **Source:** `node_modules/@solana/web3.js/lib/index.d.ts:1765`
- **Signature:**
  ```ts
  declare class VersionedTransaction {
    signatures: Array<Uint8Array>;
    message: VersionedMessage;
    get version(): TransactionVersion;
    constructor(message: VersionedMessage, signatures?: Array<Uint8Array>);
    serialize(): Uint8Array;
    static deserialize(serializedTransaction: Uint8Array): VersionedTransaction;
    sign(signers: Array<Signer>): void;
    addSignature(publicKey: PublicKey, signature: Uint8Array): void;
  }
  ```
- **Plan match:** Matches (v0 versioned tx per architecture §Non-Negotiable Boundaries).

### `connection` singleton (existing — do not modify)
- **Source:** `src/lib/connection.ts:4`
- **Signature:** `export const connection = new Connection(SOLANA_RPC_URL, "confirmed");`
- **File hash:** `8da0732bd3df419cbf5a2b6e89c6509cfbe8662570527c7542b962475cb11d4e`
- **Plan match:** Matches. `balanceService.getSolBalance`'s RPC fallback uses this — preflight does NOT need to import it directly.

### `SwapCard` (existing — mount point for `SwapButton`)
- **Source:** `src/App.tsx:34`
- **Signature:** `export function SwapCard()` — React functional component using `useWallet`, `useSwapState`, `inputToken`/`outputToken` state, `getOrder`, `SolBalanceWarning`, `TokenSelectorModal`.
- **File hash:** `2886914dae3d25f24a0448cdd5fe5d899ff2cb02080ce234a8c2aac667f43b42`
- **Plan match:** Matches. Currently renders an inline `<button disabled={!hasQuote}>` at `src/App.tsx:294-300` — this story replaces it with `<SwapButton>`.

### ⚠ UNVERIFIED — not yet implemented (created by this story)

The following interfaces do NOT exist yet and WILL be created in this story. Signatures listed are the LOCKED contract for this story; implementer must match exactly.

#### `preflightChecks.run`
- **Target source:** `src/handlers/preflightChecks.ts` (new file; `src/handlers/` directory does not yet exist)
- **Contract signature:**
  ```ts
  export const preflightChecks = {
    async run(params: PreflightParams, wallet: PreflightWallet): Promise<void>
  };
  ```
- **Marked:** ⚠ UNVERIFIED — source not yet implemented, contract per this story's Architecture Guardrails + AC-3-1-2.

#### `transactionSigner.sign`
- **Target source:** `src/handlers/transactionSigner.ts` (new file)
- **Contract signature:**
  ```ts
  export const transactionSigner = {
    async sign(
      base64Tx: string,
      wallet: Pick<WalletContextState, "signTransaction">,
    ): Promise<string>  // returns base64 signed VersionedTransaction
  };
  ```
- **Marked:** ⚠ UNVERIFIED — source not yet implemented, contract per this story's Architecture Guardrails (Signing path).

#### `isValidBase58PublicKey`
- **Target source:** `src/lib/publicKey.ts` (new file)
- **Contract signature:** `export function isValidBase58PublicKey(value: string): boolean`
- **Behavior:** `try { new PublicKey(value); return true } catch { return false }`.
- **Marked:** ⚠ UNVERIFIED — source not yet implemented.

#### `SwapButton`
- **Target source:** `src/ui/SwapButton.tsx` (new file)
- **Contract props:**
  ```ts
  interface SwapButtonProps {
    state: SwapState;            // for "Waiting for wallet…" / "Executing swap…" placeholders
    hasQuote: boolean;
    preflightError: SwapError | null;  // null when preflight passed or not-yet-run
    connected: boolean;
    onClick: () => void;
  }
  ```
- **Marked:** ⚠ UNVERIFIED — source not yet implemented. See disabled-state mapping table above.

#### `MIN_SOL_BALANCE_UI`
- **Target source:** `src/config/constants.ts` (existing file, new export)
- **Contract:** `export const MIN_SOL_BALANCE_UI = 0.01;`
- **Marked:** ⚠ UNVERIFIED — not yet in source. Decision recorded in "Unit convention" guardrail above; Story 3-1 owns per A-5 2026-04-23.

## Tasks

- [x] **Task 1: `isValidBase58PublicKey` + `preflightChecks` + `MIN_SOL_BALANCE_UI` + unit tests**
  - Maps to: AC-3-1-1, AC-3-1-2
  - Files to create:
    - `src/lib/publicKey.ts` — single exported `isValidBase58PublicKey(value: string): boolean`. Uses `new PublicKey(value)` + try/catch.
    - `src/lib/publicKey.test.ts` — valid base58 (SOL, USDC, wBTC mints) → true; invalid strings ("not-a-mint", "", "xxx", too-short base58) → false; on-curve violations (all-zeros 32-byte base58) → false.
    - `src/handlers/preflightChecks.ts` — exports `preflightChecks` object with single `run(params, wallet)` method. Implements 7 checks in declared order per the guardrail table. Each check throws `SwapError` on failure and returns (implicitly `undefined`) on pass.
    - `src/handlers/preflightChecks.test.ts` — 7 × (pass + fail) = 14 test cases minimum, plus 1 "all pass" happy path and 1 "first-failure-wins" ordering test (check 1 fails AND check 3 fails → only check 1 throws).
  - Files to modify:
    - `src/config/constants.ts` — add `export const MIN_SOL_BALANCE_UI = 0.01;` after existing `MIN_SOL_BALANCE` line. Leave `MIN_SOL_BALANCE` unchanged.
  - TDD order: write `publicKey.test.ts` first (simple, no mocks); then `preflightChecks.test.ts` with `balanceService` mocked via `vi.mock("../services/balanceService")`; implement both to green.
  - Test notes: Mock `balanceService.getSolBalance` and `balanceService.getTokenBalance` with `vi.mocked(...).mockResolvedValueOnce(value)`. For wallet, construct `{ connected: true, publicKey: { toBase58: () => "..." } as PublicKey }`. For the first-failure-wins test, assert that check 7's `getTokenBalance` mock was NOT called when check 6 fails.
  - Commit message: `feat(handlers): add preflightChecks.run with 7 FR-11 validations`

- [x] **Task 2: `transactionSigner` + unit tests**
  - Maps to: AC-3-1-4
  - Files to create:
    - `src/handlers/transactionSigner.ts` — exports `transactionSigner` object with `sign(base64Tx, wallet)`. Implementation: `base64 → Uint8Array → VersionedTransaction.deserialize → wallet.signTransaction → tx.serialize() → base64`. Two distinct error paths: (a) throw `SwapError(WalletNotConnected, "Wallet does not support signing")` if `wallet.signTransaction` is `undefined` — wallet can't sign at all; (b) throw `SwapError(WalletRejected, "You rejected the signature request")` if the wallet's `signTransaction` rejects — user cancelled. The distinction matters for UX: (a) is a wallet capability failure (surface differently), (b) is a user choice (AC-3-1-5's state-machine target). Caller in Task 4 re-throws whatever it catches; classification lives in this handler.
    - `src/handlers/transactionSigner.test.ts` — happy path: mock `wallet.signTransaction` to return a fake `VersionedTransaction` with a new signature appended; assert output is valid base64 and `atob + Uint8Array + VersionedTransaction.deserialize` round-trips. Rejection path: `wallet.signTransaction` rejects with `WalletSignTransactionError` → `sign` throws `SwapError(WalletRejected)`. Undefined-sign path: `wallet.signTransaction` is `undefined` → throws `SwapError(WalletNotConnected)` with message "Wallet does not support signing". Two separate test cases.
  - TDD: write test first; the mock `VersionedTransaction` can be a real one built from a minimal `MessageV0.compile({ payerKey: fakePk, recentBlockhash: "...", instructions: [] })` OR a hand-rolled Uint8Array fed through `VersionedTransaction.deserialize` of a known-good base64 fixture (copy from Jupiter's `/order` response in a dev environment). Prefer the latter — simpler, deterministic.
  - Commit message: `feat(handlers): add transactionSigner.sign for base64 VersionedTransaction`

- [x] **Task 3: `SwapButton` component + unit tests**
  - Maps to: AC-3-1-3
  - Files to create:
    - `src/ui/SwapButton.tsx` — consumes `SwapButtonProps` (see Verified Interfaces). Renders `<Button>` + `Tooltip` wrapper per the disabled-state mapping table. Tooltip uses `@base-ui/react/tooltip` (same pattern as `src/ui/TokenSelector/TokenRow.tsx:82-108`). When `disabled && tooltipText`, wrap in Tooltip; when enabled, render bare Button (no tooltip).
    - `src/ui/SwapButton.test.tsx` — `@vitest-environment jsdom` header. Test matrix: no-quote → "Enter an amount" disabled, no tooltip; preflightError of each type → correct label + tooltip text; all-pass → "Swap" enabled, no tooltip; `state === Signing` → "Waiting for wallet…" disabled; onClick fires only when enabled. Use `screen.getByRole("button", { name: /swap/i })` for queries. Hover to reveal Tooltip is tricky with @base-ui — prefer asserting the Tooltip content node's presence in DOM via `screen.getByText(tooltipText)` (Tooltip.Popup renders on trigger; for a disabled button, may need `{hidden: true}` or test via `userEvent.hover`). If flaky, fall back to asserting the `aria-describedby`/tooltip content is rendered regardless of visibility — Tooltip.Portal renders off-DOM and can complicate assertions. Defer perfectly-testing Tooltip visibility; focus on button text + disabled + onClick.
  - TDD: write test first; each preflightError case is a single render + assertion.
  - Depends on: Task 1 (uses `SwapError` type; not blocked at compile time since `SwapError` is existing).
  - Commit message: `feat(ui): add SwapButton with preflight-aware tooltip states`

- [ ] **Task 4: `SwapCard` wiring — handleSwap orchestration + stale-quote refresh + SwapButton integration**
  - Maps to: AC-3-1-1 (orchestration path), AC-3-1-3 (mounted in card), AC-3-1-5 (WalletRejected dispatch), AC-3-1-6 (stale-quote detection)
  - Files to modify:
    - `src/App.tsx` —
      1. Add imports: `preflightChecks`, `transactionSigner`, `SwapButton`, `STALE_THRESHOLD_MS`.
      2. Add local state: `preflightError: SwapError | null` (computed on render via `useEffect` or lazy on click; LOCKED choice: lazy on click, because preflight is async and running it on every render is wasteful). Actually — for the BUTTON disabled state (AC-3-1-3), preflight MUST run continuously so the button reflects reality. Compromise: run synchronous checks (1-5) on every render via `useMemo`; run async checks (6-7) debounced via a `useEffect` keyed on `[publicKey, inputToken.id, outputToken.id, inputAmount]`. Store the resolved error in state. This matches jup-ag/plugin's approach.
      3. Add `handleSwap()` callback:
         - If `context.quoteFetchedAt !== null && Date.now() - context.quoteFetchedAt > STALE_THRESHOLD_MS`: dispatch `{ type: "FETCH_QUOTE" }` and re-trigger `fetchQuote(lamports)`; return early (user re-clicks after fresh quote).
         - Else, await `preflightChecks.run(params, wallet)`; on throw, `dispatch({ type: "PREFLIGHT_FAILED", error: err })` and return.
         - On pass: `dispatch({ type: "START_SIGNING" })`; await `transactionSigner.sign(context.quote.transaction, { signTransaction })`.
         - On sign throw: `dispatch({ type: "SIGNING_ERROR", error: new SwapError(ErrorType.WalletRejected, "You rejected the signature request") })`; return.
         - On success: store signed base64 in a local ref/state. **NOTE:** story 3-2 owns the `/execute` call — for 3-1, after successful sign, the signed tx is held and a visible "Signed — execute flow not yet implemented" placeholder is shown, OR the state stays in `Signing` awaiting 3-2. Implementer should leave a `TODO(3-2): call jupiterService.executeOrder` comment and NOT leave the user stuck; safest: immediately dispatch `{ type: "SIGNING_ERROR", error: new SwapError(ErrorType.UnknownError, "Execute flow not yet implemented (story 3-2)") }` so the state machine returns to recoverable `Error` → `Dismiss`. This is ugly but correct for a mid-epic story. Alternative: skip `transactionSigner` invocation entirely in 3-1 and just wire preflight + button state, deferring signing to 3-2. **Decision:** INVOKE `transactionSigner` to satisfy AC-3-1-4 and AC-3-1-5 end-to-end, AND dispatch the placeholder error afterwards to unblock the user. The placeholder exit is a known out-of-scope concession; 3-2 removes it.
      4. Replace the inline `<button disabled={!hasQuote}>` at `src/App.tsx:294-300` with `<SwapButton state={context.state} hasQuote={hasQuote} preflightError={preflightError} connected={connected} onClick={handleSwap} />`.
      5. Keep the `!connected ? <Button>Connect Wallet</Button>` branch exactly as-is — that surface is separate from the preflight-driven disabled state.
    - `src/App.test.tsx` — extend: render `SwapCard`, simulate wallet-connected + quote-ready via the existing test helpers, mock `preflightChecks.run` to reject/resolve, mock `transactionSigner.sign` similarly; assert button text changes and correct dispatches fire.
  - TDD: extend App.test.tsx first with the orchestration cases (6 total: happy path, each preflight fail producing correct button label, wallet-reject producing WalletRejected error, stale-quote triggering FETCH_QUOTE + early return).
  - Depends on: Tasks 1, 2, 3.
  - Commit message: `feat(app): wire preflight + signing + stale-quote refresh into SwapCard`

- [ ] **Task 5: Manual verification pass + sprint-status close**
  - Not test-producing; documentation/verification only.
  - Run all six manual steps in "Manual Verification" below. Confirm no regressions in existing tests (full `npm test`). Update `docs/state.json` to close story 3-1. Tag `post-jupiter-swap-template-3-1` after Gate 5 passes.

## must_haves

truths:
  - "preflightChecks.run returns void when all 7 checks pass (happy path resolves without throwing)"
  - "preflightChecks.run throws SwapError(WalletNotConnected) when wallet.connected is false OR wallet.publicKey is null, message 'Connect a wallet to continue'"
  - "preflightChecks.run throws SwapError(InvalidInput) with message 'Enter a positive amount' when parseFloat(params.amount) <= 0 or NaN"
  - "preflightChecks.run throws SwapError(InvalidInput) with message 'Invalid input token address' when isValidBase58PublicKey(params.inputMint) is false"
  - "preflightChecks.run throws SwapError(InvalidInput) with message 'Invalid output token address' when isValidBase58PublicKey(params.outputMint) is false"
  - "preflightChecks.run throws SwapError(InvalidInput) with message 'Cannot swap a token to itself' when params.inputMint === params.outputMint"
  - "preflightChecks.run throws SwapError(InsufficientSOL) with message 'You need at least 0.01 SOL for transaction fees' when balanceService.getSolBalance result < MIN_SOL_BALANCE_UI (0.01)"
  - "preflightChecks.run throws SwapError(InsufficientBalance) with message 'Insufficient {symbol} balance' where {symbol} is params.inputSymbol, when balanceService.getTokenBalance result < (params.amount / 10 ** params.inputDecimals)"
  - "preflightChecks runs checks in declared order and first failure stops evaluation — when check 1 fails, checks 2-7 are NOT called"
  - "isValidBase58PublicKey returns true for valid Solana mint addresses and false for invalid strings, short strings, empty string, and on-curve violations (uses new PublicKey + try/catch)"
  - "MIN_SOL_BALANCE_UI = 0.01 is exported from src/config/constants.ts alongside (not replacing) the existing lamports MIN_SOL_BALANCE"
  - "transactionSigner.sign deserializes base64 input via VersionedTransaction.deserialize, calls wallet.signTransaction, and returns the re-serialized base64 signed transaction"
  - "transactionSigner.sign throws SwapError(WalletRejected) with message 'You rejected the signature request' when the wallet's signTransaction rejects (user cancellation)"
  - "transactionSigner.sign throws SwapError(WalletNotConnected) with message 'Wallet does not support signing' when wallet.signTransaction is undefined (wallet capability missing — distinct from user rejection)"
  - "SwapButton renders label 'Insufficient SOL' with disabled=true and tooltip text 'You need at least 0.01 SOL for transaction fees' when preflightError.type === ErrorType.InsufficientSOL"
  - "SwapButton renders label 'Swap' with disabled=false and no tooltip when preflightError is null and hasQuote is true"
  - "SwapCard handleSwap detects stale quote (Date.now() - context.quoteFetchedAt > STALE_THRESHOLD_MS) and dispatches {type:'FETCH_QUOTE'} before attempting preflight"
  - "SwapCard handleSwap dispatches {type:'PREFLIGHT_FAILED', error: swapError} when preflightChecks.run throws"
  - "SwapCard handleSwap dispatches {type:'START_SIGNING'} when preflight passes, then awaits transactionSigner.sign"
  - "SwapCard handleSwap dispatches {type:'SIGNING_ERROR', error: SwapError(WalletRejected)} when transactionSigner.sign throws"

artifacts:
  - path: "src/handlers/preflightChecks.ts"
    contains: ["preflightChecks", "run", "WalletNotConnected", "InvalidInput", "InsufficientSOL", "InsufficientBalance", "balanceService", "MIN_SOL_BALANCE_UI"]
  - path: "src/handlers/preflightChecks.test.ts"
    contains: ["describe", "preflightChecks", "vi.mock", "balanceService", "WalletNotConnected", "InvalidInput", "InsufficientSOL", "InsufficientBalance"]
  - path: "src/handlers/transactionSigner.ts"
    contains: ["transactionSigner", "sign", "VersionedTransaction", "deserialize", "serialize", "WalletRejected", "WalletNotConnected"]
  - path: "src/handlers/transactionSigner.test.ts"
    contains: ["describe", "transactionSigner", "signTransaction", "WalletRejected", "WalletNotConnected", "base64"]
  - path: "src/lib/publicKey.ts"
    contains: ["isValidBase58PublicKey", "PublicKey"]
  - path: "src/lib/publicKey.test.ts"
    contains: ["describe", "isValidBase58PublicKey"]
  - path: "src/ui/SwapButton.tsx"
    contains: ["SwapButton", "Tooltip", "preflightError", "Insufficient SOL", "Enter an amount"]
  - path: "src/ui/SwapButton.test.tsx"
    contains: ["describe", "SwapButton", "disabled", "aria-label"]
  - path: "src/config/constants.ts"
    contains: ["MIN_SOL_BALANCE_UI", "MIN_SOL_BALANCE"]
  - path: "src/App.tsx"
    contains: ["SwapButton", "preflightChecks", "transactionSigner", "STALE_THRESHOLD_MS", "START_SIGNING", "PREFLIGHT_FAILED", "SIGNING_ERROR"]

key_links:
  - pattern: "import { preflightChecks }"
    in: ["src/App.tsx"]
  - pattern: "import { transactionSigner }"
    in: ["src/App.tsx"]
  - pattern: "import { SwapButton }"
    in: ["src/App.tsx"]
  - pattern: "import { balanceService }"
    in: ["src/handlers/preflightChecks.ts"]
  - pattern: "import { isValidBase58PublicKey }"
    in: ["src/handlers/preflightChecks.ts"]
  - pattern: "import { VersionedTransaction }"
    in: ["src/handlers/transactionSigner.ts"]
  - pattern: "import { PublicKey }"
    in: ["src/lib/publicKey.ts"]
  - pattern: "import { Tooltip }"
    in: ["src/ui/SwapButton.tsx"]
  - pattern: "import { MIN_SOL_BALANCE_UI, STALE_THRESHOLD_MS }"
    in: ["src/handlers/preflightChecks.ts", "src/App.tsx"]

## Dev Notes (advisory)

**Deviations from plan AC wording (per story-creator Rule 2 audit — ZERO wording changes except where live code forces them):**

1. **Plan AC-3-1-1 says `preflightChecks.run(params, connection, wallet)` (3 args).** Live code: per A-4, `balanceService` owns the Solana `Connection` internally (singleton at `src/lib/connection.ts`); the public API of `balanceService.getSolBalance` takes only `(publicKey, signal?)`. Passing `connection` through `preflightChecks` would be dead weight. **Amended signature: `run(params, wallet)` (2 args).** This is a minor interface deviation recorded here and should trigger an `amendments.md` entry during implementation per code-standards Rule 3. Test file MUST match the 2-arg signature.

2. **Plan AC-3-1-4 says `transactionSigner.sign(base64Tx, wallet)` and "partially signs".** Live external dependency: `@solana/wallet-adapter-react` exposes `signTransaction`, not `partiallySignTransaction`. For `VersionedTransaction`, `signTransaction` IS partial — the wallet appends to the existing `signatures[]` array and preserves any Jupiter-side signatures. **Wording unchanged; implementation uses `signTransaction`.** Architecture §Non-Negotiable Boundaries says "Partial signing mandatory — partiallySignTransaction, not signTransaction"; this is a LEGACY rule from the `Transaction` (legacy, non-versioned) API where the two methods differed. For `VersionedTransaction`, `signTransaction` on a wallet-adapter wallet has the partial-signing semantic by design. If a code reviewer challenges this, point to the `VersionedTransaction.signatures` array semantics — the wallet only signs the slot matching its public key. Consider adding an `amendments.md` entry clarifying this for Story 3-1.

3. **No other AC wording deviations.** All 6 plan ACs were decomposed 1:1 into AC-3-1-1 through AC-3-1-6 with identical wording.

**Why check 6 uses `MIN_SOL_BALANCE_UI` and check 7 converts `params.amount` into UI units:**
`balanceService` returns UI units (confirmed at `src/services/balanceService.ts:108-134` + story 2-3's Verified Interfaces note). `params.amount` is smallest-unit (lamports) — matches `SwapParams.amount` in `src/types/swap.ts`. Check 7 compares UI-to-UI:
```ts
const amountUi = Number(params.amount) / 10 ** params.inputDecimals;
const balanceUi = await balanceService.getTokenBalance(wallet.publicKey, params.inputMint);
if (balanceUi < amountUi) throw new SwapError(ErrorType.InsufficientBalance, `Insufficient ${params.inputSymbol} balance`, ...);
```
Using `Number(params.amount)` is safe for realistic swap sizes (< 2^53). For extreme tokens (decimals > 15) a BigInt path would be needed, but that's out of scope — no Jupiter-supported token currently has decimals > 9 for SOL or > 8 for SPL standards.

**Why sync checks 1-5 run synchronously via `useMemo` and async 6-7 run via `useEffect` in SwapCard:**
The button's disabled state must reflect the most-recent known preflight outcome at render time. Running all 7 checks every render is wasteful (network calls on every keystroke); running none leaves the button stale. The compromise: sync checks (1-5) are cheap → run them inline via `useMemo`; async checks (6-7) are expensive → run them debounced (300ms, piggyback on the existing `handleAmountChange` debounce) and store the result in state. On swap-click, the full preflight runs again (fresh) — the state-mirrored version is for button-disabled signaling only; the authoritative check is the one at click time. This pattern matches jup-ag/plugin.

**Stale-quote implementation note — user-re-click model:**
Architecture §Workflow 2 lists two options:
- (a) automatic re-swap after fresh quote (`handleSwap` awaits the new quote and proceeds)
- (b) user-re-click (our pick)

We pick (b) because (a) requires a "pending-swap-intent" flag and an effect that triggers `handleSwap` when a fresh quote arrives — high bug-surface for a small UX win. jup-ag/plugin also uses (b). The UX is acceptable: stale quote → click → quote refreshes in ~1s → user clicks again.

**Wallet-rejection error-type classification in caller (Task 4):**
The `transactionSigner.sign` handler throws `SwapError(WalletRejected)` for any wallet-side failure (rejection OR `signTransaction === undefined`). The caller in `App.tsx` doesn't need to re-inspect the error type — it can pass the thrown error directly into `dispatch({ type: "SIGNING_ERROR", error })`. If the error is NOT a `SwapError` (unexpected), wrap it: `error instanceof SwapError ? error : new SwapError(ErrorType.WalletRejected, "Signature request failed")`.

**base64 encode/decode in the browser:**
Use `atob` + `btoa` (browser built-ins). For `Uint8Array` → base64: `btoa(String.fromCharCode(...bytes))`. For base64 → `Uint8Array`: `Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))`. This is standard and matches the `@solana/wallet-adapter` + Jupiter ecosystem. DO NOT pull in `buffer` or `bs58` for this — the serialized transaction is already base64 per Jupiter's `/order` response.

**Testing approach.**
- `preflightChecks.test.ts`: Mock `balanceService` via `vi.mock("../services/balanceService", () => ({ balanceService: { getSolBalance: vi.fn(), getTokenBalance: vi.fn() } }))`. Per-test `vi.mocked(balanceService.getSolBalance).mockResolvedValueOnce(0.005)` for check 6 fail, `0.5` for pass. Use a fake `PublicKey` stub: `{ toBase58: () => "So111..." }` cast `as unknown as PublicKey` (same pattern as `src/services/balanceService.test.ts:34-37`).
- `transactionSigner.test.ts`: Build a real `VersionedTransaction` using a minimal `MessageV0.compile({ payerKey: fakePk, recentBlockhash: "1".repeat(44) /* valid base58 */, instructions: [] })` → `new VersionedTransaction(msg)` → `btoa(String.fromCharCode(...tx.serialize()))` as input fixture. Mock `wallet.signTransaction` as `vi.fn(async (tx) => { tx.signatures[0] = new Uint8Array(64).fill(1); return tx; })`. Assert output is base64 and deserializes back with the expected non-empty signature slot.
- `SwapButton.test.tsx`: `@vitest-environment jsdom` header. Use `@testing-library/react`'s `render` + `screen`. Each preflightError → single test case + assertion. Tooltip visibility assertions may be flaky with `@base-ui/react/tooltip`; if so, test the props/state that drive the tooltip rather than the visible text. The button's `aria-label` MUST be static for screen readers ("Swap tokens" or similar); the visible label changes with state.
- `App.test.tsx` extension: re-use existing test scaffolding (see `src/App.test.tsx:436` for `SwapError` construction pattern). Mock `preflightChecks.run` and `transactionSigner.sign` via `vi.mock("./handlers/preflightChecks")` and `vi.mock("./handlers/transactionSigner")`.

**Accessibility requirements per react.md + design-system §12 + NFR-7:**
- `SwapButton` `aria-label` must be static ("Swap tokens") and descriptive. The visible disabled reason goes in the Tooltip body + the `AlertDescription`-equivalent; screen readers pick up the disabled state via `aria-disabled="true"`.
- Tooltip content must be reachable on keyboard focus (not just hover) — `@base-ui/react/tooltip` handles this natively when using `Tooltip.Trigger`.
- Button maintains `focus-visible` ring (shadcn Button handles this) even when disabled (per the button.tsx base class).
- All four themes must render the Tooltip legibly — use design tokens (`bg-popover`, `text-popover-foreground`, `border-border`); NO hardcoded colors.

**Commit plan (per code-standards §1 — one commit per task):**
1. `feat(handlers): add preflightChecks.run with 7 FR-11 validations` (Task 1: publicKey helper, preflightChecks, MIN_SOL_BALANCE_UI, 3 test files)
2. `feat(handlers): add transactionSigner.sign for base64 VersionedTransaction` (Task 2)
3. `feat(ui): add SwapButton with preflight-aware tooltip states` (Task 3)
4. `feat(app): wire preflight + signing + stale-quote refresh into SwapCard` (Task 4)
5. `chore(state): close story 3-1 — Pre-flight Checks + Transaction Signing` (Task 5; bump docs/state.json)

Pre-story tag: `pre-jupiter-swap-template-3-1` (create before Task 1). Post-story tag: `post-jupiter-swap-template-3-1` (after Gate 5).

**Amendment generation for plan deviations 1 and 2:**
Per code-standards Rule 3, both the `run(params, wallet)` signature change AND the `signTransaction`-vs-`partiallySignTransaction` terminology reconciliation should be captured in `docs/amendments.md` during Task 1 and Task 2 respectively. Format: follow A-4 / A-5 style with LOCKED contract, amended contract, why, and downstream impact sections.

**Library versions.**
- `@solana/web3.js@1.98.4` — verified installed, provides `VersionedTransaction` class at `node_modules/@solana/web3.js/lib/index.d.ts:1765`. Latest stable as of 2026-04 per npm.
- `@solana/wallet-adapter-react@0.15.39` — verified installed, `WalletContextState.signTransaction` shape confirmed.
- `@base-ui/react@1.4.0` — verified installed, Tooltip pattern used at `src/ui/TokenSelector/TokenRow.tsx`.
- No new dependencies needed for this story.

**No pre-existing baseline failures.** `docs/sprint-status.yaml` reports baseline green (all 2-x stories `done`). Full verification loop (format → lint → build → test → test-integrity → security) per code-standards §2 before each commit.

**DO NOT modify:** `src/services/balanceService.ts`, `src/services/jupiterService.ts`, `src/services/jupiterClient.ts`, `src/hooks/useWalletBalances.ts`, `src/state/swapReducer.ts`, `src/state/useSwapState.ts`, `src/state/swapState.ts`, `src/types/errors.ts`, `src/types/swap.ts`, `src/types/tokens.ts`, `src/lib/connection.ts`, `src/ui/SolBalanceWarning.tsx`, `src/ui/QuoteDisplay.tsx`, `src/ui/TokenSelector/**`. These are closed contracts from stories 1-x and 2-x.

**MAY ADD to but do not rewrite:** `src/config/constants.ts` (add `MIN_SOL_BALANCE_UI` only), `src/App.tsx` (swap-button integration + handleSwap + preflight effect — no structural rewrite), `src/App.test.tsx` (extend with orchestration tests).

> Ref: docs/design-system.md#13.3 — SwapButton is listed as a project-specific custom component: "Button + Tooltip wrapper. Dynamic text/state per SwapState and pre-flight check results. 7 distinct states with per-check disabled messages."

> Ref: docs/design-system.md#14 Organism 1 (Swap Card) — footer is "SwapButton (full width, state-dependent)". Do not move the button; replace it in place.

> Ref: docs/design-system.md#16 Keyboard Navigation — Tab cycles end at the swap button; must remain keyboard-focusable even when disabled (aria-disabled semantics, not `disabled` attribute, if Tab-reachability is required while disabled — implementer's call; shadcn Button with `disabled` attr is fine for this story since Tooltip-on-focus is more for enabled states).

> Ref: docs/amendments.md#A-4 — balanceService Ultra-first, SOL-only RPC fallback context.

> Ref: docs/amendments.md#A-5-2026-04-23 — scope-narrowing that puts the Insufficient-SOL surface entirely on 3-1.

> Ref: docs/stories/2-3-balance-service-proactive-warnings.md#Verified Interfaces — the balanceService UI-units semantics is documented there; this story reuses the same semantics.

## Detected Patterns

| Pattern | Value | Sampled from | Established? |
|---------|-------|--------------|-------------|
| Handler dir layout | `src/handlers/{name}.ts` + `src/handlers/{name}.test.ts` co-located | ⚠ N/A — `src/handlers/` does NOT exist yet; this story creates the directory. Sibling `src/services/` and `src/hooks/` follow the same co-location pattern. | Precedent established in `src/services/`, `src/hooks/` |
| Named exports only | `export function X` / `export const X` — no default exports | `src/services/balanceService.ts`, `src/hooks/useWalletBalances.ts`, `src/state/swapReducer.ts` | Established |
| Test framework import | `import { describe, it, expect, vi, beforeEach } from "vitest"` | `src/services/balanceService.test.ts:1` | Established |
| Test env header for DOM tests | `// @vitest-environment jsdom` comment at top of test file | `src/ui/SolBalanceWarning.test.tsx`, `src/ui/TokenSelector/TokenRow.test.tsx` | Established |
| Error construction | `new SwapError(ErrorType.X, message, code?, retryable?, details?)` | `src/services/balanceService.ts:122`, `src/state/swapReducer.ts:71`, `src/App.tsx:98` | Established |
| `import type` for type-only imports | Yes, consistently | `src/services/balanceService.ts:1`, `src/hooks/useWalletBalances.ts:4` | Established |
| Hook mocking in tests | `vi.mock("../{path}/{name}", () => ({ {name}: vi.fn() }))` + per-test `mockReturnValue` / `mockResolvedValueOnce` | `src/ui/SolBalanceWarning.test.tsx`, `src/ui/TokenSelector/TokenSelectorModal.test.tsx` | Established |
| `PublicKey` stub in unit tests | `{ toBase58: () => "..." } as unknown as PublicKey` | `src/services/balanceService.test.ts:34-37`, `src/hooks/useWalletBalances.test.tsx:36` | Established |
| Tooltip pattern | `@base-ui/react/tooltip` — `Tooltip.Provider > Root > Trigger + Portal > Positioner > Popup` | `src/ui/TokenSelector/TokenRow.tsx:82-108` | Established (NOT shadcn Tooltip) |
| Alert pattern | shadcn `Alert` with `variant="destructive"`, `AlertTitle`, `AlertDescription` + action buttons | `src/ui/SolBalanceWarning.tsx` | Established |
| Module registration | No barrel exports; each component/service imported directly by path | `src/App.tsx` imports | Established |
| Design tokens usage | Tailwind classes (`bg-background`, `text-muted-foreground`, `border-destructive`) — no hardcoded colors | `src/App.tsx:174+`, `src/ui/SolBalanceWarning.tsx:47-72` | Established |

## Wave Structure (internal to this story)

- **Wave 1:** Task 1 (preflightChecks + publicKey + MIN_SOL_BALANCE_UI). No UI or app dependencies.
- **Wave 1 (parallel):** Task 2 (transactionSigner). Independent of Task 1; different directory (`src/handlers/transactionSigner.ts` vs `src/handlers/preflightChecks.ts` — different files, no shared mutable state, no shared test fixtures).
- **Wave 2:** Task 3 (SwapButton). Depends on Task 1's `SwapError` types (already exist in types/errors.ts), so technically could run in Wave 1, but keeping it in Wave 2 simplifies the integration test in Task 4.
- **Wave 3:** Task 4 (App integration). Depends on Tasks 1, 2, 3.
- **Wave 4:** Task 5 (verification + sprint-status close). Depends on Task 4.

Waves 1's parallelism is real: Task 1 and Task 2 touch different files, no shared App state, no shared test fixtures. Implementer may run them concurrently.

## Story Size: M

- Line count: within M budget (60-220 lines for story file; this file is ~230 to accommodate 7-check mapping table + disabled-state table + deviation notes — justified by the density of contract specification needed for 7 discrete preflight checks each with distinct error text).
- `must_haves.truths` count: 19 (at the top of the M cap; the 7 checks × pass + fail demand this; each check's error message is a distinct assertion).
- Tasks: 5 (4 code tasks + 1 verification).
- Files created: 7 (`preflightChecks.ts` + test, `transactionSigner.ts` + test, `publicKey.ts` + test, `SwapButton.tsx` + test).
- Files modified: 3 (`constants.ts`, `App.tsx`, `App.test.tsx`).

## Manual Verification Steps

After Task 4 completes:

1. `npm run dev` → connect wallet → enter 0 in amount → Swap button shows "Enter an amount", disabled, tooltip hidden (or on hover: "Enter a positive amount"). ✓
2. Enter a valid amount, wait for quote to appear → Swap button enables, shows "Swap". ✓
3. Disconnect wallet, keep amount set → Swap button replaced by "Connect Wallet" surface (the pre-existing branch). Re-connect → "Swap" returns. ✓
4. With a test wallet holding < 0.01 SOL: connect → enter amount → button shows "Insufficient SOL", disabled, tooltip on hover reads "You need at least 0.01 SOL for transaction fees". ✓
5. Set inputMint === outputMint via selector (guard should prevent this — AC-10 of 2-2 disables the row, confirming the belt + suspenders): if somehow reached, button shows "Same input and output". ✓
6. With a valid swap setup, wait 31s without clicking → click Swap → console/UI shows quote refreshing (state transitions QuoteReady → LoadingQuote → QuoteReady) → button becomes "Swap" again with fresh `quoteFetchedAt`. Click Swap again → preflight runs, wallet popup appears asking for signature. ✓
7. In the wallet popup, click Reject → UI transitions to Error state showing "You rejected the signature request" (or equivalent). Click Dismiss → state returns to Idle. ✓ (AC-3-1-5)
8. Approve the signature → UI transitions to a placeholder Error ("Execute flow not yet implemented (story 3-2)") — expected, documented in Task 4. ✓ (Known scope concession; 3-2 removes this.)
9. Switch theme (wireframe-light ↔ wireframe-dark ↔ brand-light ↔ brand-dark) — Swap button + Tooltip legible in all four. ✓
10. Tab through the card — Swap button reachable via keyboard, Enter/Space invokes it (when enabled). ✓

## Amendments Consulted

- **A-4 (2026-04-22 — DD-13 rewritten: balanceService Ultra-primary).** Impact on 3-1: preflight check 6 (SOL) hits the Ultra-backed `balanceService.getSolBalance` which has a narrow SOL-only RPC fallback; check 7 (token) uses `getTokenBalance` which is Ultra-only. Public API unchanged from 3-1's perspective — preflight calls the same method names as plan text; the `connection` parameter is dropped because balanceService owns its own connection (deviation #1 in Dev Notes).
- **A-5 (2026-04-23 — Story 2-3 AC-3 dropped → Story 3-1 owns "Insufficient SOL" disabled-button state end-to-end).** Impact on 3-1: this story owns the `MIN_SOL_BALANCE_UI = 0.01` constant and the `SwapButton` "Insufficient SOL" label + Tooltip. `useWalletBalances` already exposes `refetch` + `isFetching` (added in 2-3) — but 3-1 does not consume those directly; preflight uses `balanceService.getSolBalance` to run the fresh check at swap-click time. The proactive low-SOL Alert that used to live in 2-3 is intentionally NOT re-introduced here — the disabled Swap button + Tooltip is the entire surface per industry norm (Raydium/Uniswap/PancakeSwap/jup-ag/plugin).
