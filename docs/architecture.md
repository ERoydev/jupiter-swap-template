---
status: complete
created: 2026-04-14
feature: jupiter-swap-template
phase: 3
type: frontend-spa
securityDepth: high
---
# Architecture: Jupiter Swap Template

## Goals & Constraints

### Architecture Drivers (from NFRs)
- **NFR-1:** 14/14 Jupiter error codes mapped → comprehensive error taxonomy
- **NFR-2:** 7-state machine with transition guards → enforced state management
- **NFR-3:** Zero silent transaction result loss → every signed tx terminates in Success or Error
- **NFR-4:** Single-action recovery from any error state
- **NFR-6:** Auto-retry from fresh quote, max 3 attempts
- **NFR-7:** WCAG 2.1 AA → accessible component patterns
- **NFR-8:** Responsive 320px–1920px
- **NFR-9:** Tests cover 6 functional areas

### Non-Negotiable Boundaries
- Jupiter Swap API v2 only (DD-2)
- Versioned transactions (v0) only — no legacy Transaction
- Partial signing mandatory — partiallySignTransaction, not signTransaction
- Retry always starts from fresh /order — never resubmit signed tx
- Jupiter handles: priority fees, slippage (RTSE), ALTs, compute budget, ATA creation, landing
- API key required for **swap endpoints only** (`/swap/v2/order`, `/swap/v2/execute`). Tokens (`/tokens/v2/*`) and balances (`/ultra/v1/*`) fall back to `https://lite-api.jup.ag` (keyless) when `VITE_JUPITER_API_KEY` is absent. Amended A-5.

---

## Component Decomposition

### System Context

```
[Swap End User] → [Jupiter Swap Template (SPA)]
                        │                │
                        ▼                ▼
                [Jupiter API v2]   [Solana RPC + Wallet]
```

### Layer Architecture

```
┌─────────────────────────────────────────────────────┐
│                     UI Layer                         │
│  SwapForm │ TokenSelector │ QuoteDisplay │           │
│  TransactionStatus │ SlippageDisplay │ WalletButton  │
├─────────────────────────────────────────────────────┤
│                    State Layer                       │
│  useSwapState (7-state machine with guarded          │
│  transitions, timeout management, retry tracking)    │
├─────────────────────────────────────────────────────┤
│                   Handler Layer                      │
│  swapHandler │ transactionSigner │ preflightChecks   │
├─────────────────────────────────────────────────────┤
│                   Service Layer                      │
│  jupiterClient │ jupiterService │ tokenService │    │
│  balanceService                                      │
├─────────────────────────────────────────────────────┤
│                Types │ Config │ Utils                │
│  swap.ts │ tokens.ts │ errors.ts │ constants.ts │    │
│  env.ts │ swapConfig.ts │ jupiterErrorMapper.ts      │
└─────────────────────────────────────────────────────┘
```

**Dependency direction:** UI → State → Handlers → Services → Types/Config (never reverse)

### Component Responsibilities

#### UI Layer (src/ui/)

| Component | Responsibility | State Consumed | Actions Emitted |
|-----------|---------------|----------------|-----------------|
| `SwapForm` | Main swap interface: token selectors, amount input, swap button | SwapState, quote, selectedTokens, preflightErrors | onAmountChange, onSwap, onTokenSelect |
| `TokenSelector` | Modal: search, display metadata, select token | tokenList, searchResults, isLoading | onSelect, onSearch, onClose |
| `QuoteDisplay` | Quote details: rate, fees, router, price impact, freshness indicator | quote, quoteFreshness | — (read-only) |
| `TransactionStatus` | Progress: signing, executing, success (Solscan link), error, retry count | SwapState, error, txSignature, retryCount | onDismiss, onRetry |
| `SlippageDisplay` | Read-only slippage setting | slippageBps | — (read-only) |
| `WalletButton` | Connect/disconnect wallet | walletState | onConnect, onDisconnect |
| `PriceImpactWarning` | Warning badge at >=1%, cautionary at >=5%, danger at >=15% | priceImpactBps | — (read-only) |

**UI rules:**
- Components render state — no business logic in components
- All interactive elements keyboard navigable (WCAG AA)
- ARIA labels on elements without visible text labels
- Color meaning always paired with text/icon
- Tap targets >=44px on mobile viewports
- Amount input respects token decimals (max decimal places = token.decimals)

#### State Layer (src/state/)

| Component | Responsibility |
|-----------|---------------|
| `swapReducer` | Pure function implementing state machine transitions and guards. Input: (currentState, action) → newState. No side effects, no React dependency. Independently testable with synchronous assertions. Logs invalid transitions with structured format: `{ event: "invalid_transition", from, to, trigger, timestamp }`. |
| `useSwapState` | React hook composing `swapReducer` with side-effect management: timeout scheduling/cleanup, AbortController lifecycle, retry count tracking. Exposes current state, transition function, and derived data (quote, error, retryCount, quoteFreshness). |

#### Handler Layer (src/handlers/)

| Component | Responsibility |
|-----------|---------------|
| `swapHandler` | Orchestrates the full swap flow: pre-flight → order → sign → execute → result. Manages retry loop (up to 3x from fresh /order on retryable errors). Tracks retry count and requestIds for logging. |
| `transactionSigner` | Deserializes base64 → VersionedTransaction, calls wallet.partiallySignTransaction, serializes back to base64. Single responsibility — no API calls. |
| `preflightChecks` | Runs all 7 checks in order. Returns first failing check as SwapError. Each check is an independent function for testability. |

#### Service Layer (src/services/)

| Component | Responsibility |
|-----------|---------------|
| `jupiterClient` | Shared HTTP client. Owns base-URL selection (`api.jup.ag` with key, `lite-api.jup.ag` without) and the `x-api-key` header policy. Routes `/swap/*` paths strictly through keyed URL; throws `SwapError(ConfigError)` synchronously when key missing. Methods: `get<T>(path, params?, signal?)`, `post<T>(path, body, signal?)`. Maps non-ok/network/abort to typed `SwapError`. Amended A-5. |
| `jupiterService` | Swap-endpoint wrapper on top of `jupiterClient`. Methods: `getOrder(params)` → `OrderResponse`, `executeOrder(signedTx, requestId)` → `ExecuteResponse`. |
| `tokenService` | Thin `/tokens/v2/search` wrapper. Method: `search(query, signal?)` → `TokenInfo[]`. Empty query returns Jupiter's server-curated blue-chip list. No client-side cache — TanStack Query owns caching via `useTokenSearch`. Amended A-2. |
| `balanceService` | Balance query layer. Primary: `getAllBalances(pubkey, signal?)` → `BalanceMap` via `/ultra/v1/balances/{pubkey}`. Preserves public methods `getSolBalance(pk)` and `getTokenBalance(pk, mint)` for Story 3-1 preflight. SOL-balance call has a narrow RPC fallback (`connection.getBalance`) if Ultra errors. Token-balance is Ultra-only. Amended A-4. |

#### Types & Config (src/types/, src/config/)

| File | Content |
|------|---------|
| `types/swap.ts` | SwapParams, OrderResponse, ExecuteResponse, SwapResult |
| `types/tokens.ts` | TokenInfo, TokenListResponse |
| `types/errors.ts` | ErrorType enum, SwapError class, error code → ErrorType mapping |
| `config/constants.ts` | DEFAULT_SLIPPAGE_BPS, MIN_SOL_BALANCE, MAX_RETRIES, CONFIRMATION_TIMEOUT_MS, state timeouts |
| `config/env.ts` | Environment variable loading and validation |
| `config/swapConfig.ts` | SwapConfig interface and factory |

#### Utils (src/utils/)

| File | Content |
|------|---------|
| `jupiterErrorMapper.ts` | Maps Jupiter error codes → ErrorType + user-facing message. Classifies each code retryable/non-retryable. Handles unknown codes (default: non-retryable). Named per AC-D-3. |

---

## Data Models

### Core Types

```typescript
interface SwapParams {
  inputMint: string;        // base58 public key
  outputMint: string;       // base58 public key
  amount: string;           // in smallest unit (lamports, etc.)
  userPublicKey: string;    // wallet public key
}

interface OrderResponse {
  transaction: string | null; // base64 v0 tx, null if no taker
  requestId: string;
  outAmount: string;
  router: string;             // "iris" | "jupiterz" | "dflow" | "okx"
  mode: string;               // "ultra" | "manual"
  feeBps: number;
  feeMint: string;
}

interface ExecuteResponse {
  status: "Success" | "Failed";
  signature: string;
  code: number;
  inputAmountResult: string;
  outputAmountResult: string;
  error?: string;
}

interface SwapResult {
  txId: string;
  status: "confirmed" | "failed";
  inputAmount: string;
  outputAmount: string;
  retriesAttempted: number;       // AC-D-1: retry tracking
  swapCorrelationId: string;      // UUID generated per executeSwap call, logged on every retry
  error?: SwapError;
}

interface TokenInfo {
  id: string;                    // base58 mint (Jupiter-native naming)
  name: string;
  symbol: string;
  icon?: string;                 // icon URL from Jupiter
  decimals: number;
  usdPrice?: number;
  liquidity?: number;
  isVerified?: boolean;
  tags?: string[];               // "verified" | "lst" | "community" | "strict" | …
  organicScore?: number;
  organicScoreLabel?: "high" | "medium" | "low";
  audit?: {
    mintAuthorityDisabled?: boolean;
    freezeAuthorityDisabled?: boolean;
    topHoldersPercentage?: number;
  };
}

// Amended A-2: expanded to Jupiter-native shape (supports trust badges, balance-sort, warning overlay).

type BalanceMap = Record<
  string,                        // mint id (key "SOL" for native SOL)
  { uiAmount: number; rawAmount: string; decimals: number }
>;
```

### State Machine

```typescript
enum SwapState {
  Idle = "idle",
  LoadingQuote = "loading_quote",
  QuoteReady = "quote_ready",
  Signing = "signing",
  Executing = "executing",
  Success = "success",
  Error = "error",
}

interface SwapStateContext {
  state: SwapState;
  quote: OrderResponse | null;
  error: SwapError | null;
  txSignature: string | null;
  retryCount: number;
  quoteFetchedAt: number | null;  // timestamp for freshness indicator
}
```

### Error Types

```typescript
enum ErrorType {
  InsufficientSOL = "InsufficientSOL",
  InsufficientBalance = "InsufficientBalance",
  SlippageExceeded = "SlippageExceeded",
  TransactionExpired = "TransactionExpired",
  NetworkError = "NetworkError",
  WalletRejected = "WalletRejected",
  WalletNotConnected = "WalletNotConnected",
  WalletDisconnected = "WalletDisconnected",  // G-1: mid-flow disconnect
  InvalidInput = "InvalidInput",
  OrderFailed = "OrderFailed",
  ExecutionFailed = "ExecutionFailed",
  QuoteTimeout = "QuoteTimeout",              // AC-D-2: timeout
  SigningTimeout = "SigningTimeout",           // AC-D-2: timeout
  ExecutionTimeout = "ExecutionTimeout",       // AC-D-2: timeout
  TokenListError = "TokenListError",          // token list fetch failure
  BalanceCheckFailed = "BalanceCheckFailed",   // AC-A-2: RPC degradation
  ConfigError = "ConfigError",                 // A-5: missing VITE_JUPITER_API_KEY for swap endpoints
  UnknownError = "UnknownError",
}

class SwapError extends Error {
  constructor(
    public readonly type: ErrorType,
    message: string,
    public readonly code?: number,
    public readonly retryable: boolean = false,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SwapError";
  }
}

// Expected details fields by ErrorType:
// - OrderFailed, ExecutionFailed, TransactionExpired, UnknownError:
//     { requestId, responseBody, httpStatus }
// - NetworkError:
//     { url, fetchError }
// - InsufficientSOL, InsufficientBalance, BalanceCheckFailed:
//     { rpcEndpoint, walletAddress }
// - WalletRejected, WalletDisconnected:
//     { walletName }
// - QuoteTimeout, SigningTimeout, ExecutionTimeout:
//     { timeoutMs, elapsedMs }
```

### Token Cache

*Removed A-2.* TanStack Query owns token caching — no custom cache module. `useTokenSearch` hook governs staleTime (5 min for empty/blue-chip query, 30 s for text queries).

### Persisted State (localStorage)

*Removed A-3.* No cross-session persistence. App boots from `DEFAULT_INPUT_MINT` and `DEFAULT_OUTPUT_MINT` constants in `src/config/constants.ts`.

---

## Key Workflows

### Workflow 1: Quote Fetch (UC-1, FR-1, FR-5)

```
User types amount or changes token
  → Debounce (300ms)
  → Cancel any in-flight /order request (AbortController)
  → State: Idle → LoadingQuote
  → Start LoadingQuote timeout (configurable, e.g., 10s)
  → jupiterService.getOrder({ inputMint, outputMint, amount, taker? })
  → On success:
      Clear timeout
      Store quoteFetchedAt = Date.now()
      State: LoadingQuote → QuoteReady
      Display: outAmount, rate, router, feeBps, priceImpact
  → On abort (superseded by newer request):
      No state change (newer request handles it)
  → On timeout:
      State: LoadingQuote → Error (QuoteTimeout)
  → On error:
      State: LoadingQuote → Error (NetworkError or OrderFailed)
```

### Workflow 2: Execute Swap (UC-2, FR-4, FR-8)

```
User clicks Swap
  → Generate swapCorrelationId (UUID) for end-to-end tracing of this swap attempt
  → Check quote freshness: if quoteFetchedAt + STALE_THRESHOLD < now
      State: QuoteReady → LoadingQuote (fresh /order with taker)
      On new quote → QuoteReady → proceed below
  → Run preflightChecks(params, connection, wallet)
      If any check fails → State: QuoteReady → Error (specific SwapError)
  → State: QuoteReady → Signing
  → Start Signing timeout (configurable, e.g., 120s — wallet popups can be slow)
  → transactionSigner.sign(order.transaction, wallet)
      On wallet reject → State: Signing → Error (WalletRejected)
      On wallet disconnect → State: Signing → Error (WalletDisconnected)
      On timeout → State: Signing → Error (SigningTimeout)
  → State: Signing → Executing
  → Start Executing timeout (configurable, e.g., 60s)
  → jupiterService.executeOrder(signedTx, order.requestId)
      On success (code 0):
          Clear timeout
          State: Executing → Success
          Display: Solscan link, inputAmountResult, outputAmountResult
      On retryable error (-1000, -2000, -2003):
          If retryCount < MAX_RETRIES (3):
              retryCount++
              Log: { swapCorrelationId, attempt: retryCount, code, requestId, timestamp }
              Display: "Retrying... attempt {retryCount} of 3"
              State: Executing → LoadingQuote (fresh /order)
              → Loop back to start of this workflow
          Else:
              State: Executing → Error (TransactionExpired, retriesAttempted: 3)
      On non-retryable error:
          State: Executing → Error (mapped ErrorType)
      On timeout:
          State: Executing → Error (ExecutionTimeout)
      On network error:
          State: Executing → Error (NetworkError)
```

### Workflow 3: Token Search & Selection (UC-3, FR-3) — Amended A-2, A-3, A-4

```
App mount
  → Parent initializes inputMint = DEFAULT_INPUT_MINT (SOL),
                       outputMint = DEFAULT_OUTPUT_MINT (USDC)
    from src/config/constants.ts — no network call.
    Full TokenInfo hydrates lazily on first selector open.

User opens token selector
  → Modal mounts; useTokenSearch('') fires ONE call
    GET /tokens/v2/search?query=   → blue-chip list (TanStack staleTime 5 min)
  → Concurrently (if wallet connected): useWalletBalances() fires
    GET /ultra/v1/balances/{pubkey} → BalanceMap (staleTime 30 s)
  → Client-side merge + sort:
      rows with uiAmount > 0 → top, sorted by (usdPrice × uiAmount) desc
      remaining rows         → preserve Jupiter's server order
  → Render virtualized list (react-window, itemSize 72)

User types search query
  → lodash.debounce(setSearch, 200) — debounces the setState
  → Debounced value flows into queryKey ['jupiter-search', debouncedQuery]
  → TanStack fires GET /tokens/v2/search?query={input}
    (same endpoint handles symbol, name, OR mint address)
  → Previous in-flight request aborts via queryKey-change signal
  → Same balance merge + sort applies to new results

User selects token
  → Row click where token.id !== excludeMint
    (if token.id === excludeMint, row renders aria-disabled; click is no-op)
  → onSelect(token: TokenInfo) fires exactly once
  → onOpenChange(false) closes modal
  → Parent updates state; Story 2-1's debounced quote fetch triggers
    automatically if both tokens + amount set (Workflow 1)

Base-URL policy (jupiterClient):
  /tokens/v2/*  → api.jup.ag with key;  lite-api.jup.ag without key
  /ultra/v1/*   → api.jup.ag with key;  lite-api.jup.ag without key
  /swap/v2/*    → api.jup.ag with key;  ConfigError without key (A-5)
```

### Workflow 4: Error Recovery (UC-4, FR-9)

```
App is in Error state
  → Display: user-friendly error message + recovery action

User dismisses error (clicks dismiss / "Try Again" / changes input)
  → State: Error → Idle
  → If input is valid and tokens selected:
      Automatically trigger quote fetch (Workflow 1)

User disconnects wallet while in Error
  → State: Error → Idle (quote-only mode)

Special: Wallet disconnect during Signing/Executing (G-1)
  → Wallet adapter fires disconnect event
  → If state is Signing:
      Cancel signing wait
      State: Signing → Error (WalletDisconnected, "Wallet disconnected during signing")
  → If state is Executing:
      Cannot cancel — tx already submitted to Jupiter
      Stay in Executing, wait for Jupiter response
      Display warning: "Wallet disconnected. Transaction may still complete."
      On Jupiter response → Success or Error as normal
```

### Workflow 5: Pre-flight Checks (FR-11)

```
Checks run in order. First failure stops and returns SwapError.

1. wallet.connected? → WalletNotConnected
2. parseFloat(amount) > 0? → InvalidInput ("Enter a positive amount")
3. isValidBase58(inputMint)? → InvalidInput ("Invalid input token address")
4. isValidBase58(outputMint)? → InvalidInput ("Invalid output token address")
5. inputMint !== outputMint? → InvalidInput ("Cannot swap a token to itself")
6. balanceService.getSolBalance(wallet) >= MIN_SOL_BALANCE?
    → InsufficientSOL ("You need at least 0.01 SOL for transaction fees")
    → On RPC failure: Show warning overlay (NOT a state change — stays in QuoteReady):
       "Unable to verify SOL balance. Your connection may be unstable."
       [Retry Check] — re-attempt RPC call
       [Proceed Without Verification] — skip checks 6+7, continue to Signing
       (AC-A-2: explicit user choice, not silent skip)
7. balanceService.getTokenBalance(wallet, inputMint) >= amount?
    → InsufficientBalance ("Insufficient {symbol} balance")
    → On RPC failure: Same warning overlay as check 6 with "Unable to verify token balance."

Additionally: checks 6 and 7 run proactively when wallet connects (AC-U-4)
to surface SOL/balance warnings early, not just at swap time.
```

---

## State Machine — Full Transition Table

| From | To | Trigger | Guard |
|------|----|---------|-------|
| Idle | LoadingQuote | User enters amount or changes token | amount > 0, both tokens selected |
| LoadingQuote | QuoteReady | /order response received | response.outAmount exists |
| LoadingQuote | Error | /order fails, timeout, or network error | — |
| QuoteReady | LoadingQuote | Input changes OR stale quote at swap time | — |
| QuoteReady | Signing | User clicks swap + pre-flight passes | all 7 checks pass |
| QuoteReady | Error | Pre-flight check fails | — |
| Signing | Executing | Wallet signed transaction | signedTx is valid |
| Signing | Error | Wallet rejects, disconnects, or timeout | — |
| Executing | Success | /execute returns code 0 | — |
| Executing | Error | /execute returns non-retryable error, timeout, or max retries exhausted | — |
| Executing | LoadingQuote | /execute returns retryable error AND retryCount < MAX_RETRIES | retryCount incremented |
| Error | Idle | User dismisses, changes input, or disconnects wallet | — |
| Success | Idle | User clicks "New Swap" | — |

**Invalid transitions:** Any transition not listed above is rejected. Attempted invalid transitions are logged with structured format: `{ event: "invalid_transition", from: currentState, to: attemptedState, trigger: actionType, timestamp: ISO }`. This enables programmatic filtering and monitoring by downstream users.

**Timeouts (configurable constants):**
- LoadingQuote: 10,000ms → Error (QuoteTimeout)
- Signing: 120,000ms → Error (SigningTimeout)
- Executing: 60,000ms → Error (ExecutionTimeout)

**Quote staleness:**
- STALE_THRESHOLD: 30,000ms (30 seconds)
- Checked when user clicks swap: if quoteFetchedAt + STALE_THRESHOLD < Date.now(), transition QuoteReady → LoadingQuote for fresh /order before proceeding

---

## API Contracts

### Jupiter API v2

**Base URL:** `https://api.jup.ag/swap/v2`
**Auth:** `x-api-key: {JUPITER_API_KEY}` on every request

#### GET /order

**Request:**
```
GET /order?inputMint={mint}&outputMint={mint}&amount={lamports}&taker={pubkey}
Headers: x-api-key: {key}
```

**Response (200):**
```json
{
  "transaction": "base64-encoded-v0-transaction",
  "requestId": "uuid",
  "outAmount": "17057460",
  "router": "iris",
  "mode": "ultra",
  "feeBps": 0,
  "feeMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
}
```

**Quote-only (no taker):** Same request without `taker` param. Response has `transaction: null`.

**Error response:** Non-200 status → map to OrderFailed SwapError.

#### POST /execute

**Request:**
```json
POST /execute
Headers: x-api-key: {key}, Content-Type: application/json
{
  "signedTransaction": "base64-encoded-signed-transaction",
  "requestId": "from-order-response"
}
```

**Response (200):**
```json
{
  "status": "Success",
  "signature": "tx-signature",
  "code": 0,
  "inputAmountResult": "100000000",
  "outputAmountResult": "17057460"
}
```

**Error codes and classification:**

| Code | Category | Meaning | Retryable | ErrorType | User Message |
|------|----------|---------|-----------|-----------|-------------|
| 0 | Success | Confirmed | — | — | — |
| -1 | Execute | Missing cached order | Yes | OrderFailed | "Order expired, fetching new quote..." |
| -2 | Execute | Invalid signed tx | No | ExecutionFailed | "Transaction error. Please try again." |
| -3 | Execute | Invalid message bytes | No | ExecutionFailed | "Transaction error. Please try again." |
| -1000 | Aggregator | Failed to land | Yes | TransactionExpired | "Transaction didn't land. Retrying..." |
| -1001 | Aggregator | Unknown error | No | UnknownError | "Something went wrong. Please try again." |
| -1002 | Aggregator | Invalid transaction | No | ExecutionFailed | "Invalid transaction. Please try again." |
| -1003 | Aggregator | Not fully signed | No | ExecutionFailed | "Signing error. Please try again." |
| -1004 | Aggregator | Invalid block height | Yes | TransactionExpired | "Block expired. Retrying with fresh quote..." |
| -2000 | RFQ | Failed to land | Yes | TransactionExpired | "Transaction didn't land. Retrying..." |
| -2001 | RFQ | Unknown error | No | UnknownError | "Something went wrong. Please try again." |
| -2002 | RFQ | Invalid payload | No | ExecutionFailed | "Transaction error. Please try again." |
| -2003 | RFQ | Quote expired | Yes | TransactionExpired | "Quote expired. Fetching new quote..." |
| -2004 | RFQ | Swap rejected | No | ExecutionFailed | "Swap was rejected. Please try again." |

**Default for unknown codes:** Non-retryable → UnknownError → "Something went wrong. Please try again."

**Retryable codes (5 total):** -1, -1000, -1004, -2000, -2003
**Non-retryable codes (8 total):** -2, -3, -1001, -1002, -1003, -2001, -2002, -2004

Note: Code -1 (missing cached order) and -1004 (invalid block height) added to retryable list — both indicate staleness that a fresh /order resolves. This addresses the gap identified in Phase 2 (AC-A-4).

---

## Error Handling Strategy

### Error Taxonomy

Three error categories by source:

1. **Client-side errors** — detected before API calls
   - Pre-flight check failures (7 types)
   - Input validation errors
   - Wallet errors (not connected, disconnected, rejected)

2. **Jupiter API errors** — from /order or /execute responses
   - Order failures (non-200 from /order)
   - Execute failures (14 error codes)
   - Network errors (fetch failures, timeouts)

3. **Infrastructure errors** — from Solana RPC or browser
   - RPC failures (balance checks)
   - AbortController cancellations (not errors — expected behavior)
   - Browser/network connectivity loss

### Error Propagation

```
Service Layer → throws SwapError with type, message, code, retryable
Handler Layer → catches SwapError, decides retry vs propagate
State Layer → receives SwapError, transitions to Error state
UI Layer → renders error.message + recovery action based on error.type
```

Rules:
- Services throw typed SwapError — never raw Error or string
- Handlers catch and either retry (if retryable + retryCount < MAX) or propagate
- State machine validates transition before accepting Error state
- UI displays message from SwapError.message — never error.code or stack trace
- Every catch block either retries, propagates, or transitions to Error — no empty catches
- AbortError from cancelled requests is silently ignored (expected behavior)

### Recovery Patterns

| Error Type | Auto-Recovery | User Recovery |
|-----------|---------------|---------------|
| Retryable Jupiter errors | Auto-retry up to 3x from fresh /order | "Try Again" after max retries |
| Non-retryable Jupiter errors | None | Dismiss → Idle, or change input |
| Pre-flight failures | None | Fix the failing condition (connect wallet, add funds) |
| Wallet rejected | None | Dismiss → QuoteReady (can try again) |
| Wallet disconnected (mid-flow) | None | Reconnect wallet, start over |
| Network errors | None | Dismiss → Idle, retry when connection restored |
| Timeouts | None | Dismiss → Idle, try again |
| RPC balance check failure | Skip check with warning | Proceed at risk, or wait and retry |

---

## UI Component Architecture

### Component Tree

```
App
├── WalletProvider (wallet-adapter-react)
│   └── SwapProvider (context: state machine + handlers)
│       ├── WalletButton
│       ├── SwapForm
│       │   ├── TokenInput (input side)
│       │   │   ├── TokenSelector (modal)
│       │   │   └── AmountInput
│       │   ├── SwapDirectionButton (swap input↔output)
│       │   ├── TokenOutput (output side, read-only)
│       │   │   └── TokenSelector (modal, reused)
│       │   ├── QuoteDisplay
│       │   │   ├── ExchangeRate
│       │   │   ├── PriceImpactWarning
│       │   │   ├── FeeDisplay
│       │   │   ├── RouterDisplay
│       │   │   └── QuoteFreshnessIndicator
│       │   ├── SlippageDisplay
│       │   └── SwapButton (disabled states based on pre-flight)
│       └── TransactionStatus (overlay/toast)
│           ├── SigningIndicator
│           ├── ExecutingIndicator (with retry count)
│           ├── SuccessDisplay (Solscan link)
│           └── ErrorDisplay (message + action)
```

### State Management

**SwapProvider** — React Context wrapping `useSwapState` hook:
- Exposes: state, quote, error, txSignature, retryCount, quoteFreshness
- Exposes: actions (setTokens, setAmount, executeSwap, dismiss, reset)
- No prop drilling — all UI components consume context

**Token state** — managed inside SwapForm:
- inputToken, outputToken (TokenInfo)
- inputAmount (string)
- Persisted to localStorage on change

**Token list state** — managed by tokenService, exposed via `useTokenList` hook:
- verifiedTokens, isLoading, error
- search(query) function

### Responsive Design

- **Mobile-first** Tailwind classes
- Breakpoints: `sm:` (640px), `md:` (768px), `lg:` (1024px)
- Token selector: full-screen modal on mobile, dropdown on desktop
- Quote details: collapsed by default on mobile, expanded on desktop
- Swap button: full-width on all viewports

---

## Security

### Threat Model (High depth — financial transactions)

| Threat | Risk | Mitigation |
|--------|------|-----------|
| API key extraction from bundle | MED — key visible in network tab or JS bundle | Jupiter API keys are per-project, rate-limited, not billed per-call. Document in README that key is client-side by design. If a downstream user needs protection, they should proxy through their backend. Template does not include a proxy (out of scope). |
| Transaction manipulation (MITM) | LOW — HTTPS to Jupiter API, tx verified on-chain | All API calls over HTTPS. Transaction integrity verified by Solana validators. Jupiter signs/co-signs the transaction. |
| Wallet phishing / malicious signing | LOW — wallet-adapter shows tx details before signing | User reviews transaction in their wallet's UI before approving. Template cannot control wallet UX. |
| Stale transaction replay | MED — could execute outdated tx with worse rate | Retry always starts from fresh /order (C-4). Never resubmit previously signed tx. requestId is one-time-use. |
| Input injection via token search | LOW — search queries go to Jupiter API | Sanitize search input: strip non-alphanumeric except for base58 characters. No raw HTML rendering of token names (React auto-escapes JSX). |
| Excessive /order calls (self-DoS) | LOW — debouncing + AbortController | 300ms debounce on input changes. AbortController cancels in-flight requests. Jupiter rate limits provide server-side protection. |
| Fund loss from silent errors | HIGH — user doesn't know tx status | NFR-3: Every signed tx terminates in Success or Error. AC-A-5: No code path swallows /execute response. Timeouts ensure stuck states resolve. |

### Input Validation

- **Mint addresses:** Validated as base58 public keys (pre-flight checks 3, 4)
- **Amount:** Parsed as number, must be > 0, max decimals = token.decimals (pre-flight check 2)
- **Search queries:** Sanitized to alphanumeric + base58 charset before API call
- **API responses:** Type-validated at service layer boundary. Unexpected shapes → OrderFailed/UnknownError

### Secret Management

- `JUPITER_API_KEY` — loaded from `.env`, injected via Vite's `import.meta.env`
- `.env` in `.gitignore` — never committed
- `.env.example` provided with placeholder values and comments
- No other secrets — wallet keys never touch our code (wallet-adapter handles signing)

---

## Infrastructure & Deployment

### Development Environment

- **Runtime:** Node.js >= 18
- **Package manager:** npm
- **Dev server:** Vite dev server with HMR
- **Build:** `vite build` → static assets in `dist/`

### Environment Variables

```bash
# .env.example
VITE_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
VITE_JUPITER_API_URL=https://api.jup.ag/swap/v2
VITE_JUPITER_API_KEY=your_api_key_here
```

All prefixed with `VITE_` for Vite's env exposure. Accessed via `import.meta.env.VITE_*`.

### Deployment

Static SPA — deploy `dist/` to any static hosting (Vercel, Netlify, Cloudflare Pages, S3+CloudFront). No server-side runtime required.

### Monitoring (post-launch, not in template scope)

- Console logging for development (retry attempts, state transitions, errors)
- Structured logging format for easy grep/filter
- Production monitoring (Sentry, DataDog) left to downstream users

---

## Testing Strategy

### Framework & Tools

- **Test runner:** Vitest (native Vite integration, fast, Jest-compatible API)
- **Component testing:** React Testing Library
- **Assertions:** Vitest built-in (expect, describe, it)

### Test Organization

```
src/
├── services/
│   ├── jupiterService.ts
│   ├── jupiterService.test.ts      # Unit: mock fetch, verify request/response
│   ├── tokenService.ts
│   └── tokenService.test.ts        # Unit: mock fetch, verify cache behavior
├── handlers/
│   ├── swapHandler.ts
│   ├── swapHandler.test.ts         # Integration: mock services, verify flow
│   ├── preflightChecks.ts
│   ├── preflightChecks.test.ts     # Unit: each check pass/fail
│   ├── transactionSigner.ts
│   └── transactionSigner.test.ts   # Unit: mock wallet, verify sign flow
├── state/
│   ├── swapReducer.ts              # Pure state machine: transitions + guards
│   ├── swapReducer.test.ts         # Unit: all transitions, guards (sync, no React)
│   ├── swapState.ts                # React hook composing reducer + timeouts + side effects
│   └── swapState.test.ts           # Unit: timeout behavior, side effect cleanup
├── utils/
│   ├── jupiterErrorMapper.ts
│   └── jupiterErrorMapper.test.ts  # Unit: every code → ErrorType mapping
├── ui/
│   ├── SwapForm.tsx
│   └── SwapForm.test.tsx           # Component: render states, user interactions
```

### Coverage by Functional Area (NFR-9)

| Area | Test Files | What's Verified |
|------|-----------|----------------|
| 1. Quote fetching | jupiterService.test, tokenService.test | /order request params, response parsing, error handling, abort |
| 2. Tx building/execution | swapHandler.test, transactionSigner.test | Full flow, signing, /execute, retry logic |
| 3. Token selection | tokenService.test | Cache init, search (local + API fallback), refresh |
| 4. State management | swapState.test | All 13 transitions, guards, invalid transition rejection, timeouts |
| 5. UX states | SwapForm.test | Component renders per SwapState, disabled states, error display |
| 6. Error handling | jupiterErrorMapper.test, preflightChecks.test | 14 codes mapped, 7 pre-flight checks, retry classification |

### Mocking Strategy

- **Jupiter API:** Mock `fetch` at the service test level. No real API calls in tests.
- **Solana RPC:** Mock `Connection.getBalance` and `Connection.getTokenAccountBalance`.
- **Wallet:** Mock `wallet.partiallySignTransaction` (resolve for success, reject for wallet-rejected).
- **localStorage:** Use Vitest's `vi.stubGlobal` or a simple in-memory mock.
- **AbortController:** Real — no need to mock, tests can verify cancellation behavior.
- **Timers:** Use Vitest's `vi.useFakeTimers()` for timeout tests.

---

## Design Rationale

### DD-1: React + TypeScript [LOCKED]
- Source: User requirement (INITIAL_PLAN.md)
- Rationale: Standard modern web framework. TypeScript provides type safety critical for financial apps.

### DD-2: Jupiter Swap API v2 [LOCKED]
- Source: User requirement
- Rationale: v2 combines quoting + tx assembly in single /order call. Simpler than v1 quote→swap.

### DD-3: @solana/web3.js v1.x + wallet-adapter [LOCKED]
- Source: User requirement
- Rationale: Standard Solana web stack. v2 of web3.js has breaking changes and ecosystem isn't fully migrated.

### DD-4: Feature-first file structure [LOCKED]
- Source: User requirement
- Rationale: Groups by domain (services/, handlers/, state/) rather than by type. Easier navigation for new developers.

### DD-5: State machine with 7 states [LOCKED]
- Source: User requirement
- Rationale: Explicit states prevent impossible UI combinations. Guards enforce valid transitions. Critical for financial UX where "stuck" states = user panic.

### DD-6: Error normalization layer [LOCKED]
- Source: User requirement
- Rationale: Single source of truth for error mapping. Isolates Jupiter API changes from UI.

### DD-7: 7 pre-flight checks [LOCKED]
- Source: User requirement + discovery (check #7 added)
- Rationale: Fast-fail before API calls. Clear messages for each failure type.

### DD-8: Tailwind CSS [LOCKED]
- Alternatives: CSS Modules (scoped, zero runtime — but more verbose), styled-components (CSS-in-JS, runtime cost — unnecessary for a template)
- Rationale: Utility-first, excellent responsive support, small purged bundle. Industry standard for React templates.

### DD-9: Jupiter Tokens API — TanStack Query live search [LOCKED, Amended A-2]
- Superseded: previous "hybrid fetch/cache" with in-memory `TokenCache`, TTL, LRU, and visibilitychange refresh.
- Alternatives considered: Static curated list (limited coverage), full verified-list fetch (large payload, no balance merge), hybrid cache (reinvents the data layer).
- Decision: Single endpoint `GET /tokens/v2/search?query={input}` fronted by TanStack Query. Empty query returns Jupiter's server-curated blue-chip list. No client-side cache module. `useTokenSearch(query)` hook governs staleTime (5 min empty, 30 s text). Grounded in `jup-ag/plugin`'s production pattern.
- Rationale: For a production-intent template, copying the real production pattern beats reinventing caching the data layer already provides.

### DD-10: localStorage persistence [RETIRED, Amended A-3]
- Previously LOCKED; `spec.md` already marked the feature DEFERRED, creating an inconsistency.
- Retired: no cross-session persistence of selected tokens. App boots from `DEFAULT_INPUT_MINT` / `DEFAULT_OUTPUT_MINT` constants in `src/config/constants.ts` on every session.
- Rationale: Template consumers fork and customize defaults; persistence adds schema-migration risk with no material UX benefit in a demo context.

### DD-11: Vite [LOCKED]
- Alternatives: Next.js (SSR/SSG overkill for pure SPA), CRA (deprecated, slow builds)
- Rationale: Native ESM, fast HMR, minimal config. Standard for modern React SPAs without SSR needs.

### DD-12: Vitest for testing [LOCKED]
- Alternatives: Jest (works but slower, needs separate Vite config), Playwright (E2E — complementary, not primary)
- Rationale: Native Vite integration. Same config, fast execution, Jest-compatible API.

### DD-13: balanceService — Ultra-primary with narrow RPC fallback [LOCKED, Amended A-4]
- Superseded: previous "RPC-only via `@solana/web3.js` Connection" design.
- Alternatives considered: Ultra-only (single point of failure for preflight), keep RPC primary (no batched balance map for selector display; correlates N+1 calls), full fallback parity (doubles maintenance).
- Decision: `getAllBalances(pubkey)` hits `GET /ultra/v1/balances/{pubkey}` primary. Public methods `getSolBalance` and `getTokenBalance` preserved for Story 3-1 consumers. `getSolBalance` falls back to `connection.getBalance(pubkey)` on Ultra error. `getTokenBalance` has no RPC fallback (N+1 cost). `useWalletBalances` hook shares the cache for selector display.
- Rationale: One balance path for the whole app, batched and Token2022-aware. Narrow SOL-only fallback preserves the most critical preflight check during partial Ultra outages; full fallback parity gains little because Ultra and `/order` share failure modes.

### DD-14: Quote freshness via timestamp comparison [LOCKED]
- Alternatives: Server-provided expiry (not available from Jupiter), WebSocket for live quotes (Jupiter doesn't offer this)
- Rationale: Client-side timestamp check is the only option. 30s threshold balances freshness vs API load.
