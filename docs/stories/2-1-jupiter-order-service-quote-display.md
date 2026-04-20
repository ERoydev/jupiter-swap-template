---
id: "2-1-jupiter-order-service-quote-display"
status: ready
created: 2026-04-14
---

# Story: Jupiter Order Service + Quote Display

## User Story
As a swap end user, I want to see a live price quote when I select tokens and enter an amount, so that I know what I'll receive before committing to a swap.

## Acceptance Criteria
- Given `jupiterService.getOrder(params)` is called with inputMint, outputMint, amount (no taker), When Jupiter API responds successfully, Then it returns OrderResponse with outAmount, router, mode, feeBps, feeMint, and transaction: null
- Given tokens are selected and amount > 0, When the user types/changes amount, Then after 300ms debounce a new /order request fires. Any in-flight request is cancelled via AbortController
- Given a quote is received, When the UI renders QuoteDisplay, Then it shows: output amount in TokenInput (read-only), exchange rate, router Badge, fee %, slippage "0.5% (auto)", and QuoteFreshnessIndicator
- Given a quote is displayed, When 30s passes (STALE_THRESHOLD), Then the QuoteFreshnessIndicator shows red dot + "refreshing soon"
- Given PriceImpactBadge receives impact bps, When impact >= 1% Then amber, >= 5% cautionary, >= 15% danger/red
- Given the /order request fails or times out, When the error occurs, Then state -> Error with user-friendly message and single-action recovery
- Given no wallet is connected (quote-only mode), When tokens and amount are set, Then quote displays normally. Balance fields hidden. Swap button shows "Connect Wallet"

## Architecture Guardrails

**Jupiter API contract (DD-2 LOCKED):**
- Base URL: `JUPITER_API_URL` from `src/config/env.ts`
- Auth: `x-api-key: JUPITER_API_KEY` header on every request
- GET `/order` params: `inputMint`, `outputMint`, `amount`, `taker` (optional)
- Response shape: `OrderResponse { transaction: string | null, requestId: string, outAmount: string, router: string, mode: string, feeBps: number, feeMint: string }`
- Without `taker`: `transaction` is `null` (quote-only mode)
- On non-ok HTTP response: throw `SwapError(ErrorType.OrderFailed, ...)`
- On network error (fetch throws): throw `SwapError(ErrorType.NetworkError, ...)`

**Debounce + cancellation strategy:**
- 300ms debounce on amount/token input changes
- `AbortController` cancels in-flight `/order` request when new input arrives
- Only the latest response updates state
- State flow: Idle -> LoadingQuote (on input) -> QuoteReady (on response) -> Error (on failure)

**State machine transitions used by this story (DD-5 LOCKED):**
- T1: Idle -> LoadingQuote (amount entered / token changed, guard: amount > 0, both tokens selected)
- T2: LoadingQuote -> QuoteReady (/order response, guard: outAmount exists)
- T3: LoadingQuote -> Error (API failure / timeout)
- T4: QuoteReady -> LoadingQuote (input changes)
- T12: Error -> Idle (dismiss / change input)

**Quote freshness (STALE_THRESHOLD_MS = 30000):**
- `quoteFetchedAt` stored in `SwapStateContext` on T2
- QuoteFreshnessIndicator: green dot < 10s, yellow 10-20s, red 20-30s, "refreshing soon" text at red

**PriceImpactBadge thresholds:**
- < 1% (< 100 bps): `secondary` variant (neutral)
- >= 1% (>= 100 bps): `default` variant + amber styling
- >= 5% (>= 500 bps): cautionary + "!" prefix
- >= 15% (>= 1500 bps): `destructive` variant (danger/red)

**Quote display composition (from design-system.md):**
- QuoteDisplay: `Collapsible` + `DetailList` with `DetailRow` entries for rate, fees, router, slippage
- Exchange rate: `outAmount / amount` adjusted for token decimals
- Router shown as `Badge`
- Slippage shown as "0.5% (auto)" (DEFAULT_SLIPPAGE_BPS = 50)

**Dependency direction (LOCKED):** UI -> State -> Handlers -> Services -> Types/Config

## Verified Interfaces

### OrderResponse (interface)
- **Source:** `src/types/swap.ts:10`
- **Signature:** `export interface OrderResponse { transaction: string | null; requestId: string; outAmount: string; router: string; mode: string; feeBps: number; feeMint: string; }`
- **File hash:** `71bfdb83a5e74742b65900f3786937501d7650ee19f9eec8e7f4755b1bf02d7f`
- **Plan match:** Matches

### SwapError (class) + ErrorType (enum)
- **Source:** `src/types/errors.ts:1`
- **Signature:** `export class SwapError extends Error { constructor(type: ErrorType, message: string, code?: number, retryable?: boolean, details?: Record<string, unknown>) }`
- **File hash:** `23ee2b6f7e98ca5cc4a3339c6e2c0b37257434ea4b12b6033051521160ee1ab1`
- **Plan match:** Matches

### JUPITER_API_URL, JUPITER_API_KEY (constants)
- **Source:** `src/config/env.ts:9-11`
- **Signature:** `export const JUPITER_API_URL = requireEnv("VITE_JUPITER_API_URL"); export const JUPITER_API_KEY = requireEnv("VITE_JUPITER_API_KEY");`
- **File hash:** `aee6ddc991c27a6d4690f1b165286d2c8179b2e9df88aa9485959dae5aa1c889`
- **Plan match:** Matches

### STALE_THRESHOLD_MS, DEFAULT_SLIPPAGE_BPS (constants)
- **Source:** `src/config/constants.ts:2,10`
- **Signature:** `export const DEFAULT_SLIPPAGE_BPS = 50; export const STALE_THRESHOLD_MS = 30_000;`
- **File hash:** `8abf2e5bd2290743fd7240153b81a0d5022076e3e57f01334c5d895bc7d1b4ac`
- **Plan match:** Matches

### swapReducer + SwapAction + SwapStateContext
- **Source:** `src/state/swapReducer.ts:40`
- **Signature:** `export function swapReducer(current: SwapStateContext, action: SwapAction): SwapStateContext`
- **File hash:** `4d3e8981840666e821ccda014f002096622bd9d25f0965036cbacaa0597c0f6c`
- **Plan match:** Matches

### useSwapState (hook)
- **Source:** `src/state/useSwapState.ts:17`
- **Signature:** `export function useSwapState(): { context: SwapStateContext; dispatch: (action: SwapAction) => void }`
- **File hash:** `bd52e7c57063b190f4d7ce1a46fe60066a556f99b763da0e368e9f7cf1596dea`
- **Plan match:** Matches

## Tasks
- [x] Task 1: jupiterService + tests
  - Maps to: AC-1 (getOrder returns OrderResponse), AC-2 (AbortController cancellation), AC-6 (error -> SwapError)
  - Files: `src/services/jupiterService.ts`, `src/services/jupiterService.test.ts`
- [x] Task 2: QuoteDisplay + PriceImpactBadge + QuoteFreshnessIndicator
  - Maps to: AC-3 (quote details rendering), AC-4 (freshness indicator at 30s), AC-5 (price impact thresholds)
  - Files: `src/ui/QuoteDisplay.tsx`, `src/ui/PriceImpactBadge.tsx`, `src/ui/QuoteFreshnessIndicator.tsx`
  - Prerequisite: `npx shadcn add badge collapsible` (Badge and Collapsible needed)
- [x] Task 3: App integration -- debounced quote fetch + quote-only mode
  - Maps to: AC-2 (300ms debounce + AbortController), AC-3 (quote display in UI), AC-6 (error state recovery), AC-7 (no-wallet quote-only mode)
  - Files: `src/App.tsx` (modify)

## must_haves
truths:
  - "jupiterService.getOrder sends GET to JUPITER_API_URL/order with inputMint, outputMint, amount as query params and x-api-key header"
  - "jupiterService.getOrder without taker returns OrderResponse with transaction: null"
  - "jupiterService.getOrder passes signal to fetch for AbortController cancellation"
  - "jupiterService.getOrder throws SwapError(OrderFailed) on non-ok HTTP response"
  - "jupiterService.getOrder throws SwapError(NetworkError) on fetch network error"
  - "Amount input change triggers /order request after 300ms debounce, not immediately"
  - "New input during debounce or in-flight request cancels previous via AbortController"
  - "QuoteDisplay renders output amount, exchange rate, router Badge, fee %, slippage 0.5% (auto), and QuoteFreshnessIndicator"
  - "PriceImpactBadge shows amber at >= 100 bps, cautionary at >= 500 bps, destructive at >= 1500 bps"
  - "QuoteFreshnessIndicator shows red dot after 20s and refreshing soon text approaching 30s"
  - "When no wallet connected, quote displays normally and swap button shows Connect Wallet"
artifacts:
  - path: "src/services/jupiterService.ts"
    contains: ["getOrder", "JUPITER_API_URL", "JUPITER_API_KEY", "AbortSignal"]
  - path: "src/services/jupiterService.test.ts"
    contains: ["getOrder", "AbortController", "describe"]
  - path: "src/ui/QuoteDisplay.tsx"
    contains: ["QuoteDisplay", "DetailRow", "DetailList"]
  - path: "src/ui/PriceImpactBadge.tsx"
    contains: ["PriceImpactBadge", "Badge", "destructive"]
  - path: "src/ui/QuoteFreshnessIndicator.tsx"
    contains: ["QuoteFreshnessIndicator", "quoteFetchedAt"]
key_links:
  - pattern: "import { JUPITER_API_URL, JUPITER_API_KEY }"
    in: ["src/services/jupiterService.ts"]
  - pattern: "import type { OrderResponse }"
    in: ["src/services/jupiterService.ts"]
  - pattern: "import { SwapError }"
    in: ["src/services/jupiterService.ts"]
  - pattern: "import { useSwapState }"
    in: ["src/App.tsx"]
  - pattern: "import { QuoteDisplay }"
    in: ["src/App.tsx"]

## Dev Notes (advisory)

**shadcn components required:** Run `npx shadcn add badge collapsible` before Task 2. No shadcn components are currently installed in the project (src/components/ui/ is empty).

> Ref: docs/design-system.md#9.6 DetailRow / DetailList -- custom component implementation (copy from design system)
> Ref: docs/design-system.md#12 Rules -- component state checklist and accessibility requirements

**Quote-only mode (no wallet):** When `useWallet().connected` is false, omit `taker` param from getOrder. Balance fields hidden. Swap button text: "Connect Wallet". Quote fetching still works normally.

**Testing approach:**
- jupiterService.test.ts: mock `globalThis.fetch` with `vi.fn()`, verify URL construction, headers, response parsing, AbortController signal passthrough, error mapping
- UI components: `@testing-library/react` with `@vitest-environment jsdom` comment
- Debounce: `vi.useFakeTimers()` + `vi.advanceTimersByTime(300)`

**Story 1-1 review finding:** Use `bg-background` not `bg-(--background)` for Tailwind v4 utility classes.

**Story 1-2 patterns:** `vi.useFakeTimers` for timeout tests, `@vitest-environment jsdom` comment for React hook tests.

## Detected Patterns

| Pattern | Value | Sampled from | Established? |
|---------|-------|-------------|-------------|
| Import style | Named imports, relative paths, `import type` for type-only | `src/utils/jupiterErrorMapper.ts`, `src/types/swap.ts` | Established |
| Module exports | Named exports only, no default exports | `src/config/constants.ts`, `src/state/swapReducer.ts` | Established |
| Test structure | `describe` + `it` blocks, co-located `*.test.ts`, test ID comments | `src/utils/jupiterErrorMapper.test.ts`, `src/state/swapReducer.test.ts` | Established |
| Test imports | `import { describe, it, expect } from "vitest"` | `src/utils/jupiterErrorMapper.test.ts` | Established |
| Error construction | `new SwapError(ErrorType.X, message, code, retryable, details)` | `src/state/swapReducer.ts` | Established |
| State dispatch | `dispatch({ type: "ACTION_NAME", ...payload })` | `src/state/useSwapState.ts` | Established |

## Wave Structure
Wave 1: [Task 1, Task 2] -- independent, no shared files (service is pure fetch wrapper, UI components are presentational)
Wave 2: [Task 3] -- depends on Task 1 (imports jupiterService) and Task 2 (imports UI components)
