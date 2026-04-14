---
id: "1-2-wallet-connection-state-machine"
status: ready
created: 2026-04-14
---

# Story: Wallet Connection + State Machine

## User Story
As a swap end user, I want to connect my Solana wallet and see the app track its state correctly, so that I can trust the interface responds to what I'm doing.

## Acceptance Criteria
- Given the app is loaded without a wallet, When I click "Connect Wallet", Then the wallet-adapter modal opens with available wallets
- Given I connect a wallet, When connection succeeds, Then the button shows my truncated public key and the app enables swap functionality
- Given the `swapReducer` pure function exists, When I call `swapReducer(currentState, action)` with valid transitions (all 13), Then it returns the correct next state
- Given the `swapReducer`, When I attempt an invalid transition (e.g., Idle -> Executing), Then it returns the current state unchanged and logs `{ event: "invalid_transition", from, to, trigger, timestamp }`
- Given `useSwapState` hook wraps swapReducer, When state enters LoadingQuote/Signing/Executing, Then a timeout timer starts. When timeout fires, Then state transitions to Error with the appropriate timeout ErrorType
- Given the app is in any state, When the wallet disconnects, Then if Signing -> Error(WalletDisconnected); if Executing -> stay + show warning; otherwise -> Idle

## Architecture Guardrails

**State Machine (DD-5 LOCKED):** Pure `swapReducer` function -- transitions + guards, sync testable. Composed by `useSwapState` hook -- timeouts + side effects. 7 states, 13 valid transitions.

**Wallet Integration (DD-3 LOCKED):** `@solana/wallet-adapter-react` provides WalletProvider, useWallet, useConnection. `@solana/wallet-adapter-react-ui` provides WalletMultiButton for connect/disconnect modal. `@solana/wallet-adapter-wallets` provides wallet list.

**Dependency direction (LOCKED):** UI -> State -> Handlers -> Services -> Types/Config (never reverse).

### SwapStateContext

```typescript
interface SwapStateContext {
  state: SwapState;
  quote: OrderResponse | null;
  error: SwapError | null;
  txSignature: string | null;
  retryCount: number;
  quoteFetchedAt: number | null;
}
```

### State Machine Transition Table (13 valid transitions)

| # | From | To | Trigger | Guard |
|---|------|----|---------|-------|
| 1 | Idle | LoadingQuote | Amount entered / token changed | amount > 0, both tokens selected |
| 2 | LoadingQuote | QuoteReady | /order response received | response.outAmount exists |
| 3 | LoadingQuote | Error | API failure / timeout / network error | -- |
| 4 | QuoteReady | LoadingQuote | Input changes OR stale quote at swap time | -- |
| 5 | QuoteReady | Signing | Swap clicked + preflight passes | all 7 checks pass |
| 6 | QuoteReady | Error | Preflight check fails | -- |
| 7 | Signing | Executing | Wallet signed transaction | signedTx valid |
| 8 | Signing | Error | Wallet rejects / disconnects / timeout | -- |
| 9 | Executing | Success | /execute returns code 0 | -- |
| 10 | Executing | Error | Non-retryable error, timeout, or max retries | -- |
| 11 | Executing | LoadingQuote | Retryable error AND retryCount < MAX_RETRIES | retryCount incremented |
| 12 | Error | Idle | Dismiss / change input / wallet disconnect | -- |
| 13 | Success | Idle | "New Swap" clicked | -- |

**Invalid transitions:** Return current state unchanged. Log: `{ event: "invalid_transition", from: currentState, to: attemptedState, trigger: actionType, timestamp: ISO }`.

### Timeout Constants (from `src/config/constants.ts`)

| State | Constant | Value | Error on timeout |
|-------|----------|-------|-----------------|
| LoadingQuote | QUOTE_TIMEOUT_MS | 10,000ms | ErrorType.QuoteTimeout |
| Signing | SIGNING_TIMEOUT_MS | 120,000ms | ErrorType.SigningTimeout |
| Executing | EXECUTING_TIMEOUT_MS | 60,000ms | ErrorType.ExecutionTimeout |

### Wallet Disconnect Handling (G-1)

- During Signing: cancel + Error(WalletDisconnected, "Wallet disconnected during signing")
- During Executing: stay in Executing, wait for Jupiter response, show warning "Wallet disconnected. Transaction may still complete."
- During Idle/QuoteReady/other: -> Idle

### Action Types for swapReducer

The reducer accepts discriminated union actions. Each action type maps to one or more transitions above. Minimum set: `FETCH_QUOTE` (T1), `QUOTE_RECEIVED` (T2), `QUOTE_ERROR` (T3), `INPUT_CHANGED` (T4), `START_SIGNING` (T5), `PREFLIGHT_FAILED` (T6), `TX_SIGNED` (T7), `SIGNING_ERROR` (T8), `EXECUTE_SUCCESS` (T9), `EXECUTE_ERROR` (T10), `EXECUTE_RETRY` (T11), `DISMISS_ERROR` (T12), `NEW_SWAP` (T13), `WALLET_DISCONNECTED` (Signing->Error, Executing->stay, other->Idle), `TIMEOUT` (LoadingQuote/Signing/Executing->Error).

## Verified Interfaces

### SwapState (enum)
- **Source:** `src/state/swapState.ts:1`
- **Signature:** `export enum SwapState { Idle = "idle", LoadingQuote = "loading_quote", QuoteReady = "quote_ready", Signing = "signing", Executing = "executing", Success = "success", Error = "error" }`
- **File hash:** `c451e6a9ab0b6ea3cd0ba58cefb12809f643db0f44f302e94cd570eada4528b9`
- **Plan match:** Matches

### ErrorType (enum) + SwapError (class)
- **Source:** `src/types/errors.ts:1`
- **Signature:** `export enum ErrorType { InsufficientSOL, ..., UnknownError }` (17 values); `export class SwapError extends Error { constructor(type: ErrorType, message: string, code?: number, retryable?: boolean, details?: Record<string, unknown>) }`
- **File hash:** `23ee2b6f7e98ca5cc4a3339c6e2c0b37257434ea4b12b6033051521160ee1ab1`
- **Plan match:** Matches

### OrderResponse (interface)
- **Source:** `src/types/swap.ts:10`
- **Signature:** `export interface OrderResponse { transaction: string | null; requestId: string; outAmount: string; router: string; mode: string; feeBps: number; feeMint: string; }`
- **File hash:** `71bfdb83a5e74742b65900f3786937501d7650ee19f9eec8e7f4755b1bf02d7f`
- **Plan match:** Matches

### Timeout Constants
- **Source:** `src/config/constants.ts:7-9`
- **Signature:** `export const QUOTE_TIMEOUT_MS = 10_000; export const SIGNING_TIMEOUT_MS = 120_000; export const EXECUTING_TIMEOUT_MS = 60_000;`
- **File hash:** `8abf2e5bd2290743fd7240153b81a0d5022076e3e57f01334c5d895bc7d1b4ac`
- **Plan match:** Matches

## Tasks
- [ ] Task 1: Pure swapReducer + tests
  - Maps to: AC-3 (all 13 valid transitions), AC-4 (invalid transition rejection + logging)
  - Files: `src/state/swapReducer.ts`, `src/state/swapReducer.test.ts`
- [ ] Task 2: useSwapState hook + timeout tests
  - Maps to: AC-5 (timeout timers for LoadingQuote/Signing/Executing), AC-6 (wallet disconnect handling)
  - Files: `src/state/useSwapState.ts`, `src/state/useSwapState.test.ts`
- [ ] Task 3: WalletButton + App integration with WalletProvider
  - Maps to: AC-1 (wallet-adapter modal opens), AC-2 (truncated public key + enable swap)
  - Files: `src/ui/WalletButton.tsx`, `src/App.tsx` (modify), install `@solana/wallet-adapter-react-ui`

## must_haves
truths:
  - "swapReducer(Idle, FETCH_QUOTE) returns state LoadingQuote when amount > 0 and both tokens selected"
  - "swapReducer(LoadingQuote, QUOTE_RECEIVED) returns state QuoteReady with quote populated"
  - "swapReducer(LoadingQuote, QUOTE_ERROR) returns state Error with error populated"
  - "swapReducer(QuoteReady, INPUT_CHANGED) returns state LoadingQuote"
  - "swapReducer(QuoteReady, START_SIGNING) returns state Signing"
  - "swapReducer(Signing, TX_SIGNED) returns state Executing"
  - "swapReducer(Signing, SIGNING_ERROR) returns state Error"
  - "swapReducer(Executing, EXECUTE_SUCCESS) returns state Success with txSignature"
  - "swapReducer(Executing, EXECUTE_RETRY) returns state LoadingQuote with retryCount incremented"
  - "swapReducer(Idle, any invalid action like EXECUTE_SUCCESS) returns Idle unchanged and logs invalid_transition"
  - "useSwapState transitions to Error(QuoteTimeout) after QUOTE_TIMEOUT_MS when in LoadingQuote"
  - "useSwapState transitions to Error(SigningTimeout) after SIGNING_TIMEOUT_MS when in Signing"
artifacts:
  - path: "src/state/swapReducer.ts"
    contains: ["swapReducer", "SwapStateContext", "SwapAction"]
  - path: "src/state/swapReducer.test.ts"
    contains: ["swapReducer", "describe", "invalid_transition"]
  - path: "src/state/useSwapState.ts"
    contains: ["useSwapState", "swapReducer", "setTimeout"]
  - path: "src/state/useSwapState.test.ts"
    contains: ["useSwapState", "useFakeTimers"]
  - path: "src/ui/WalletButton.tsx"
    contains: ["WalletMultiButton"]
  - path: "src/App.tsx"
    contains: ["WalletProvider", "ConnectionProvider"]
key_links:
  - pattern: "import { SwapState }"
    in: ["src/state/swapReducer.ts"]
  - pattern: "import { ErrorType, SwapError }"
    in: ["src/state/swapReducer.ts"]
  - pattern: "import { swapReducer }"
    in: ["src/state/useSwapState.ts"]
  - pattern: "import { QUOTE_TIMEOUT_MS"
    in: ["src/state/useSwapState.ts"]

## Dev Notes (advisory)

**New dependency required:** `@solana/wallet-adapter-react-ui` (^0.9.39) -- provides WalletMultiButton and WalletModalProvider. Not yet in package.json. Install alongside this story.

> Ref: package.json -- existing wallet-adapter deps already installed (react ^0.15.39, wallets ^0.19.38, base ^0.9.27)

**Wallet provider setup in App.tsx:** Wrap app with `ConnectionProvider` (endpoint from env), `WalletProvider` (wallets array, autoConnect: false), and `WalletModalProvider`. The existing App.tsx is a placeholder -- replace its content.

**Testing approach:**
- swapReducer tests: pure synchronous assertions, no React hooks needed (test IDs SM-01 through SM-22)
- useSwapState tests: use `vi.useFakeTimers()` and `vi.advanceTimersByTime()` for timeout tests
- WalletButton: no unit test needed -- thin wrapper around WalletMultiButton
- Wallet disconnect tests: WD-01 through WD-04 from test strategy

> Ref: docs/test-strategy.md#Mocking Strategy -- wallet mock approach with vi.fn()

**Story 1-1 review finding:** Use `bg-background` not `bg-(--background)` for Tailwind v4 utility classes.

## Detected Patterns

| Pattern | Value | Sampled from | Established? |
|---------|-------|-------------|-------------|
| Import style | Named imports, relative paths, `import type` for type-only | `src/utils/jupiterErrorMapper.ts`, `src/types/swap.ts` | Established |
| Module exports | Named exports only, no default exports | `src/state/swapState.ts`, `src/config/constants.ts` | Established |
| Test structure | `describe` + `it` blocks, test ID comments (e.g., `// EC-02:`), co-located `*.test.ts` | `src/utils/jupiterErrorMapper.test.ts`, `src/config/env.test.ts` | Established |
| Test imports | `import { describe, it, expect } from "vitest"` | `src/utils/jupiterErrorMapper.test.ts` | Established |

## Wave Structure
Wave 1: [Task 1, Task 2] -- independent, no shared files (reducer is a pure function imported by hook, but Task 2 can import as soon as Task 1 file exists)
Wave 2: [Task 3] -- depends on Task 2 (App.tsx wraps providers, WalletButton consumes wallet context)
