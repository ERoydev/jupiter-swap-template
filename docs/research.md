---
status: complete
created: 2026-04-14
feature: jupiter-swap-template
---
# Brief: Jupiter Swap Template

## Problem
There is no standardized reference implementation for integrating with the Jupiter aggregator on Solana. Developers building swap interfaces must reverse-engineer the v2 API flow (order → sign → execute), handle 14+ error codes, manage complex state transitions, and deal with Solana-specific transaction nuances (versioned transactions, partial signing for JupiterZ routes). Without a well-structured template, each new integration reinvents the wheel, introduces inconsistent error handling, and misses edge cases — leading to poor user experience and lost funds risk.

This template also serves as a LaiM evaluation benchmark: testing LaiM's ability to generate external API integrations, transaction flows, and edge-case handling in real-world DeFi scenarios. All problems must be captured for the LaiM report, not fixed manually.

## Vision
A production-quality, standalone React + TypeScript swap application that correctly implements the full Jupiter v2 swap flow. A user connects their wallet, selects tokens, sees a real-time quote, clicks swap, and receives confirmed transaction results — with clear feedback at every step and robust error handling for all failure modes. The template is clean, well-documented, and production-ready.

## Users
- **Swap End User**: A Solana wallet holder who wants to swap tokens via the Jupiter aggregator. Goals: execute swaps quickly with confidence, understand what's happening at each step, see clear errors when things fail, and trust the app won't lose their funds. Frustrations: cryptic error messages, stuck transactions with no feedback, unclear whether a swap succeeded or failed, having to manually check block explorers.

## Success Metrics

### Completeness Metrics
- **Error coverage**: Handle 100% of documented Jupiter error codes (14 codes across execute categories: Success, Execute, Aggregator, RFQ)
- **State completeness**: All 7 SwapState transitions (Idle, LoadingQuote, QuoteReady, Signing, Executing, Success, Error) implemented with correct transition guards
- **Pre-flight checks**: All 7 validation checks enforced before swap execution (see Design Decisions DD-7)
- **Test coverage**: Unit + integration tests cover all 6 functional requirement areas (quote fetching, tx building/execution, token selection, state management, UX states, error handling)

### Production Readiness Metrics
- **Error recovery**: User can always return to a working state (Idle) within 1 action from any error state — no dead-end UI states
- **Quote freshness**: Quote auto-refreshes if user clicks swap after quote is stale; never submit a stale transaction
- **No fund loss paths**: Zero code paths where a transaction can be signed and submitted but the result (success/failure) is not communicated to the user — every execution path terminates in either Success or Error state with clear feedback
- **Graceful degradation**: Network failures, RPC timeouts, and API errors never leave the UI in a broken/unrecoverable state
- **Retry safety**: Retryable errors always restart from /order (fresh quote + fresh transaction); never resubmit a previously signed transaction

## Scope
### In Scope
- Full Jupiter v2 swap flow: GET /order → partial sign → POST /execute
- Quote-only mode (omit `taker` for price display before wallet connects)
- Token selector with search by symbol or mint address
- Token metadata display (symbol, decimals, logo)
- All 7 SwapState transitions with correct guards
- 7 pre-flight validation checks (see DD-7)
- 14 Jupiter error code mappings to user-friendly messages
- Retry logic: retryable errors restart from /order (up to 3x), non-retryable fail immediately
- Success state with Solscan transaction link
- Mobile responsive UI
- Slippage display (Jupiter RTSE handles optimization; UI shows current setting)
- Unit, integration, and UI test coverage

### Out of Scope
- **Custom RPC node management** — use configured endpoint, no node selection UI
- **Advanced order types** — limit orders, DCA, perps (Jupiter has separate APIs)
- **Token list curation/management** — use Jupiter's token list or a static curated list
- **Slippage manual override UI** — Jupiter RTSE handles slippage; display-only in this template
- **Priority fee configuration** — Jupiter handles priority fees via /execute
- **Transaction history / portfolio tracking** — out of scope, separate feature
- **Multi-wallet support** — single connected wallet only
- **Fiat on/off ramp** — not part of swap flow

## Constraints
- **API key required**: All Jupiter v2 endpoints require `x-api-key` header (get from portal.jup.ag) — Technical
- **Versioned transactions only**: Jupiter v2 always returns v0 transactions; must use `VersionedTransaction`, not legacy `Transaction` — Technical
- **Partial signing mandatory**: Must use `partiallySignTransaction` (not `signTransaction`) because JupiterZ routes require an additional market maker signature added during /execute — Technical
- **Jupiter handles infrastructure**: No need to manage priority fees, slippage optimization (RTSE), ALTs, compute budget, ATA creation, or transaction landing — these are handled by Jupiter's /execute endpoint — Technical
- **LaiM benchmark**: Do not fix issues manually; capture all problems for the LaiM evaluation report — Process
- **Retry = fresh quote**: On retryable failure, must call /order again for a fresh quote; cannot reuse old transaction — Technical

## Design Decisions
- DD-1: React + TypeScript for UI framework [LOCKED] (Source: docs/user-context/INITIAL_PLAN.md §Dependencies)
- DD-2: Jupiter Swap API v2 (order/execute flow, not v1 quote/swap) [LOCKED] (Source: docs/user-context/INITIAL_PLAN.md §Jupiter Swap API v2)
- DD-3: @solana/web3.js v1.x + wallet-adapter for Solana integration [LOCKED] (Source: docs/user-context/INITIAL_PLAN.md §Dependencies)
- DD-4: Feature-first file structure (config/, types/, services/, handlers/, state/, ui/, utils/) [LOCKED] (Source: docs/user-context/INITIAL_PLAN.md §File Structure)
- DD-5: State machine with 7 explicit states and guarded transitions [LOCKED] (Source: docs/user-context/INITIAL_PLAN.md §State Management)
- DD-6: Error normalization layer mapping Jupiter codes to typed SwapError [LOCKED] (Source: docs/user-context/INITIAL_PLAN.md §Error Types)
- DD-7: 7 pre-flight checks before swap — wallet connected, amount > 0, inputMint valid base58, outputMint valid base58, inputMint !== outputMint, SOL balance >= 0.01 SOL for fees, input token balance sufficient for swap amount [LOCKED] (Source: docs/user-context/INITIAL_PLAN.md §Pre-flight Checks + discovery session — token balance check added to catch insufficient non-SOL balances before they surface as cryptic Jupiter errors)
- DD-8: UI component library / styling approach [DISCRETION]
- DD-9: Token list source — Jupiter API vs static curated list [DISCRETION]
- DD-10: localStorage persistence for selected tokens [DEFERRED] — optional per spec, decide during implementation
- DD-11: Bundler / build tool (Vite, Next.js, CRA) [DISCRETION]

## Additional Context

### Jupiter Swap API v2 — Endpoint Reference

**Base URL:** `https://api.jup.ag/swap/v2`

**Authentication:** All endpoints require `x-api-key` header. Keys from https://portal.jup.ag.

**Flow:** GET /order → sign → POST /execute

#### GET /order
Returns a quote and an assembled v0 (versioned) transaction in a single call. All routers compete for the best price: Metis, JupiterZ, Dflow, OKX.

Required query parameters:
- `inputMint` — mint address of the token being sold
- `outputMint` — mint address of the token being bought
- `amount` — amount in smallest unit of the input token (e.g., lamports for SOL)
- `taker` — user's wallet public key (required for assembled transaction; without it, only a quote is returned)

Response shape:
```json
{
  "transaction": "base64-encoded-versioned-transaction",
  "requestId": "unique-request-id",
  "outAmount": "17057460",
  "router": "iris",
  "mode": "ultra",
  "feeBps": 0,
  "feeMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
}
```

Key fields:
- `transaction` — base64 encoded v0 transaction, ready to sign. Null if `taker` is not set.
- `requestId` — must be passed to /execute
- `outAmount` — expected output amount before slippage
- `router` — which router won: "iris", "jupiterz", "dflow", "okx"
- `mode` — "ultra" (no optional params used) or "manual" (optional params used)

#### POST /execute
Takes the signed transaction and requestId. Jupiter handles everything: optimized slippage (RTSE), priority fees, accelerated landing (Jupiter Beam), confirmation polling.

Request body:
```json
{
  "signedTransaction": "base64-encoded-signed-transaction",
  "requestId": "from-order-response"
}
```

Response shape:
```json
{
  "status": "Success",
  "signature": "tx-signature",
  "code": 0,
  "inputAmountResult": "100000000",
  "outputAmountResult": "17057460"
}
```

#### Error Codes from /execute

| Code | Category | Meaning |
|------|----------|---------|
| 0 | Success | Transaction confirmed |
| -1 | Execute | Missing cached order (requestId not found or expired) |
| -2 | Execute | Invalid signed transaction |
| -3 | Execute | Invalid message bytes |
| -1000 | Aggregator | Failed to land |
| -1001 | Aggregator | Unknown error |
| -1002 | Aggregator | Invalid transaction |
| -1003 | Aggregator | Transaction not fully signed |
| -1004 | Aggregator | Invalid block height |
| -2000 | RFQ | Failed to land |
| -2001 | RFQ | Unknown error |
| -2002 | RFQ | Invalid payload |
| -2003 | RFQ | Quote expired |
| -2004 | RFQ | Swap rejected |

### Error Code → ErrorType Mapping

- Code -1 → OrderFailed ("Order expired, please try again")
- Code -2, -3 → ExecutionFailed ("Invalid transaction")
- Code -1000, -2000 → TransactionExpired ("Transaction failed to land")
- Code -1001, -2001 → UnknownError ("Unknown error occurred")
- Code -1002 → ExecutionFailed ("Invalid transaction")
- Code -1003 → ExecutionFailed ("Transaction not fully signed")
- Code -1004 → TransactionExpired ("Invalid block height")
- Code -2002 → ExecutionFailed ("Invalid payload")
- Code -2003 → TransactionExpired ("Quote expired")
- Code -2004 → ExecutionFailed ("Swap rejected by market maker")
- Wallet error 4001 → WalletRejected
- Network/fetch errors → NetworkError

### Retryable vs Non-Retryable Errors

**Retryable** (restart from /order for fresh quote, up to 3x):
- -1000 (Aggregator: failed to land)
- -2000 (RFQ: failed to land)
- -2003 (RFQ: quote expired)

**Non-retryable** (fail immediately, show error):
- -2 (invalid signed transaction)
- -3 (invalid message bytes)
- -1003 (transaction not fully signed)
- -2004 (swap rejected by market maker)

### Type Definitions

```typescript
interface SwapParams {
  inputMint: string;
  outputMint: string;
  amount: string;
  userPublicKey: string;
}

interface OrderResponse {
  transaction: string;
  requestId: string;
  outAmount: string;
  router: string;
  mode: string;
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
  error?: SwapError;
}

interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

enum SwapState {
  Idle = "idle",
  LoadingQuote = "loading_quote",
  QuoteReady = "quote_ready",
  Signing = "signing",
  Executing = "executing",
  Success = "success",
  Error = "error",
}

enum ErrorType {
  InsufficientSOL = "InsufficientSOL",
  InsufficientBalance = "InsufficientBalance",
  SlippageExceeded = "SlippageExceeded",
  TransactionExpired = "TransactionExpired",
  NetworkError = "NetworkError",
  WalletRejected = "WalletRejected",
  WalletNotConnected = "WalletNotConnected",
  InvalidInput = "InvalidInput",
  OrderFailed = "OrderFailed",
  ExecutionFailed = "ExecutionFailed",
  UnknownError = "UnknownError",
}
```

Note: `InsufficientBalance` added to ErrorType for the new token balance pre-flight check (DD-7).

### Pre-flight Checks (7 total)

Run before calling /order. Each failure throws a SwapError:

1. Wallet connected? → WalletNotConnected
2. Input amount > 0? → InvalidInput
3. inputMint is valid base58 public key? → InvalidInput
4. outputMint is valid base58 public key? → InvalidInput
5. inputMint !== outputMint? → InvalidInput
6. SOL balance >= MIN_SOL_BALANCE (0.01 SOL)? → InsufficientSOL
7. Input token balance >= swap amount? → InsufficientBalance (NEW — prevents cryptic Jupiter errors when user has insufficient non-SOL token balance; requires fetching token account balance via RPC before submitting order)

### Core Swap Flow

```
async function executeSwap(params, config, wallet): Promise<SwapResult>
  1. Run 7 pre-flight checks
  2. GET /order with inputMint, outputMint, amount, taker + x-api-key header
     - If response not ok or no transaction → throw OrderFailed
  3. Deserialize: VersionedTransaction.deserialize(Buffer.from(order.transaction, "base64"))
  4. Partially sign with wallet (partiallySignTransaction)
  5. Serialize signed tx back to base64
  6. POST /execute with { signedTransaction, requestId } + x-api-key header
  7. If status "Success" → return SwapResult { confirmed }
  8. If retryable failure (-1000, -2000, -2003) → retry from step 2, up to MAX_RETRIES (3)
  9. If non-retryable failure → return SwapResult { failed, error }
```

### Constants

```typescript
const DEFAULT_SLIPPAGE_BPS = 50;                   // 0.5%
const MIN_SOL_BALANCE = 0.01 * LAMPORTS_PER_SOL;   // for fees + ATA rent
const MAX_RETRIES = 3;
const CONFIRMATION_TIMEOUT_MS = 60_000;
```

### Dependencies

```json
{
  "@solana/web3.js": "^1.95.0",
  "@solana/wallet-adapter-base": "^0.9.23",
  "@solana/wallet-adapter-react": "^0.15.35",
  "@solana/wallet-adapter-wallets": "^0.19.32",
  "bs58": "^5.0.0"
}
```

### Data Flow

```
User selects tokens + enters amount
  → SwapState: LoadingQuote
  → GET /order (without taker for quote-only, or with taker for full tx)
  → SwapState: QuoteReady (display quote to user)

User clicks "Swap"
  → runPreflightChecks(params, connection, wallet)
  → GET /order (with taker) → OrderResponse
  → SwapState: Signing
  → Partially sign VersionedTransaction
  → SwapState: Executing
  → POST /execute (signedTransaction, requestId) → ExecuteResponse
  → If Success → SwapState: Success (show tx link)
  → If retryable failure → retry from /order (up to 3x)
  → If non-retryable failure → SwapState: Error (show message)
```

### State Transitions

- Idle → LoadingQuote (user enters amount or changes tokens)
- LoadingQuote → QuoteReady (quote received)
- LoadingQuote → Error (API failure)
- QuoteReady → Signing (user clicks swap)
- Signing → Executing (wallet signed)
- Signing → Error (wallet rejected)
- Executing → Success (execute returned Success)
- Executing → Error (execute returned Failed)
- Error → Idle (user dismisses error or changes input)
- Success → Idle (user starts new swap)

### File Structure

```
src/
├── config/
│   ├── constants.ts
│   ├── env.ts
│   └── swapConfig.ts
├── types/
│   ├── swap.ts
│   ├── tokens.ts
│   └── errors.ts
├── services/
│   ├── jupiterService.ts
│   └── tokenService.ts
├── handlers/
│   ├── swapHandler.ts
│   ├── transactionSigner.ts
│   └── preflightChecks.ts
├── state/
│   └── swapState.ts
├── ui/
│   ├── SwapForm.tsx
│   ├── TokenSelector.tsx
│   ├── QuoteDisplay.tsx
│   ├── TransactionStatus.tsx
│   └── SlippageSettings.tsx
├── utils/
│   └── errorNormalizer.ts
├── index.ts
├── .env.example
└── README.md
```

### UX Requirements

**Swap interface:** Token in selector + amount input, token out selector + expected output (read-only), swap button, slippage display.

**Quote display:** Expected output amount, exchange rate (e.g., "1 SOL = 170.57 USDC"), router used, fee info, price impact (if significant).

**UX states:** Loading skeleton/spinner for quote fetching, disabled swap button when no wallet/invalid input/loading/insufficient balance, clear error messages per error type, success with tx signature + Solscan link (`https://solscan.io/tx/{signature}`), pending state during signing and execution.

**Mobile responsive.**
