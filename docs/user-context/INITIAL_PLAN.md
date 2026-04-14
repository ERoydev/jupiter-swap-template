# Jupiter Swap Template — Full Specification

## Background

This is a **reference swap integration template** that standardizes how applications interact with the Jupiter aggregator on Solana. It is a **standalone app** that fetches quotes, builds transactions, and executes swaps via the user's wallet. A second template (Titan) will be built separately by copy-pasting and adapting this one.

This template also serves as a **LaiM evaluation benchmark**: testing its ability to generate external API integrations, transaction flows, and edge-case handling in real-world DeFi scenarios. Do **not** fix issues manually — capture all problems for the LaiM report.

---

## Jupiter Swap API v2

**Base URL:** `https://api.jup.ag/swap/v2`

**Authentication:** All endpoints require an API key via the `x-api-key` header. Get one at `https://portal.jup.ag`.

**Flow:** `/order` → sign → `/execute`

Jupiter's v2 API combines quoting and transaction assembly into a single `/order` call. Jupiter handles transaction landing, slippage optimization (via RTSE), and priority fees automatically through the `/execute` endpoint.

### Endpoints

#### GET /order

Returns a quote and an assembled v0 (versioned) transaction in a single call. All routers compete for the best price: Metis, JupiterZ, Dflow, OKX.

**Required query parameters:**
- `inputMint` — mint address of the token being sold
- `outputMint` — mint address of the token being bought
- `amount` — amount in smallest unit of the input token (e.g., lamports for SOL)
- `taker` — user's wallet public key (required to get an assembled transaction; without it, only a quote is returned)

**Response shape:**
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
- `requestId` — must be passed to `/execute`
- `outAmount` — expected output amount before slippage
- `router` — which router won: "iris", "jupiterz", "dflow", "okx"
- `mode` — "ultra" (no optional params used) or "manual" (optional params used)

#### POST /execute

Takes the signed transaction and `requestId`. Jupiter handles everything: optimized slippage (RTSE), priority fees, accelerated landing (Jupiter Beam), confirmation polling.

**Request body:**
```json
{
  "signedTransaction": "base64-encoded-signed-transaction",
  "requestId": "from-order-response"
}
```

**Response shape:**
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

---

## Transaction Signing

- The transaction from `/order` is a **v0 versioned transaction**, always
- Use `partiallySignTransaction` (not full sign) because JupiterZ routes require an additional market maker signature which is added during `/execute`
- Jupiter handles ALTs, compute budget, ATA creation, and priority fees in the returned transaction

---

## Functional Requirements

### 1. Quote Fetching

- Fetch real-time swap quotes via GET `/order` (with or without `taker`)
- Inputs: token in, token out, amount
- Display to user:
  - Expected output amount (`outAmount`)
  - Price impact (if available from response)
  - Route / router that won the quote (`router` field)
  - Fees (`feeBps`)
- Omitting `taker` returns a quote without a transaction — useful for price display before wallet is connected

### 2. Transaction Building & Execution

- GET `/order` with `taker` returns the assembled transaction
- Deserialize as `VersionedTransaction`
- Partially sign via wallet adapter
- POST `/execute` with signed transaction + `requestId`
- Jupiter handles landing, slippage, priority fees

### 3. Token Selection

- Token selector UI component:
  - Search by symbol or mint address
  - Display token metadata: symbol, decimals, logo
  - Use Jupiter's token list API or a static curated list of popular tokens (SOL, USDC, USDT, etc.)
- Prevent invalid pairs:
  - Cannot swap same token to itself
  - Validate mint addresses are valid base58 public keys
- Persist selected tokens across sessions (optional, localStorage)

### 4. State Management

The app must handle these states cleanly:

```typescript
enum SwapState {
  Idle = "idle",                       // initial state, no quote
  LoadingQuote = "loading_quote",      // fetching quote from /order
  QuoteReady = "quote_ready",          // quote received, ready to swap
  Signing = "signing",                 // waiting for wallet signature
  Executing = "executing",             // POST /execute in progress
  Success = "success",                 // swap confirmed
  Error = "error",                     // something failed
}
```

State transitions:
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

Optional: persist last selected tokens and input amount.

### 5. UX / UI Requirements

**Swap interface:**
- Token in selector + amount input
- Token out selector + expected output display (read-only)
- Swap button
- Slippage settings (display current, allow user override — optional since Jupiter RTSE handles it)

**Quote display:**
- Expected output amount
- Rate (e.g., "1 SOL = 170.57 USDC")
- Router used
- Fee info
- Price impact (if significant)

**UX states:**
- Loading skeleton / spinner when fetching quote
- Disabled swap button when: no wallet connected, invalid input, loading quote, insufficient SOL
- Clear error messages for each error type (user-friendly, not raw errors)
- Success state: tx signature + link to Solscan (`https://solscan.io/tx/{signature}`)
- Pending state during signing and execution

**Mobile responsive**

### 6. Error Handling

| Scenario | Expected Behavior |
|----------|-------------------|
| No wallet connected | Show "Connect wallet" prompt, disable swap |
| Insufficient SOL | Show clear message, disable swap |
| Invalid token / same token | Validation error, disable swap |
| API failure (GET /order) | Retry with backoff + show error message |
| User rejects transaction | Reset to QuoteReady state, show message |
| Execute fails — retryable (-1000, -2000, -2003) | Auto-retry from /order up to 3x, then show error |
| Execute fails — non-retryable (-2, -3, -2004) | Show error immediately, offer manual retry |
| Network/RPC issues | Retry with backoff + show error message |
| Quote expired (user waited too long) | Auto-refresh quote when user clicks swap |

---

## Template Architecture

### Environment & Configuration

```typescript
interface SwapConfig {
  rpcEndpoint: string;
  jupiterApiBaseUrl: string;       // default: "https://api.jup.ag/swap/v2"
  jupiterApiKey: string;           // required
  confirmationTimeout: number;     // default: 60000 (ms)
  maxRetries: number;              // default: 3
}
```

```
# .env.example
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
JUPITER_API_URL=https://api.jup.ag/swap/v2
JUPITER_API_KEY=your_api_key_here
```

### Types

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
```

### Error Types

```typescript
enum ErrorType {
  InsufficientSOL = "InsufficientSOL",
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

class SwapError extends Error {
  type: ErrorType;
  message: string;
  code?: number;
  details?: any;
}
```

**Jupiter error code → ErrorType mapping:**
- Code -1 → OrderFailed ("Order expired, please try again")
- Code -2, -3 → ExecutionFailed ("Invalid transaction")
- Code -1000, -2000 → TransactionExpired ("Transaction failed to land")
- Code -1003 → ExecutionFailed ("Transaction not fully signed")
- Code -2003 → TransactionExpired ("Quote expired")
- Code -2004 → ExecutionFailed ("Swap rejected by market maker")
- Wallet error 4001 → WalletRejected
- Network/fetch errors → NetworkError

### Constants

```typescript
const DEFAULT_SLIPPAGE_BPS = 50;                   // 0.5%
const MIN_SOL_BALANCE = 0.01 * LAMPORTS_PER_SOL;   // for fees + ATA rent
const MAX_RETRIES = 3;
const CONFIRMATION_TIMEOUT_MS = 60_000;
```

### Pre-flight Checks

Run before calling `/order`. Each failure throws a `SwapError`:

1. Wallet connected? → `WalletNotConnected`
2. Input amount > 0? → `InvalidInput`
3. inputMint and outputMint are valid base58 public keys? → `InvalidInput`
4. inputMint !== outputMint? → `InvalidInput`
5. SOL balance >= MIN_SOL_BALANCE? → `InsufficientSOL`

### Core Swap Flow

```typescript
async function executeSwap(params, config, wallet): Promise<SwapResult> {
  // 1. Run pre-flight checks
  // 2. GET /order with inputMint, outputMint, amount, taker + x-api-key header
  //    - If response not ok or no transaction → throw OrderFailed
  // 3. Deserialize: VersionedTransaction.deserialize(Buffer.from(order.transaction, "base64"))
  // 4. Partially sign with wallet (partiallySignTransaction)
  // 5. Serialize signed tx back to base64
  // 6. POST /execute with { signedTransaction, requestId } + x-api-key header
  // 7. If status "Success" → return SwapResult { confirmed }
  // 8. If retryable failure (-1000, -2000, -2003) → retry from step 2, up to MAX_RETRIES
  // 9. If non-retryable failure → return SwapResult { failed, error }
}
```

### Retry Logic

- Retryable errors (-1000, -2000, -2003): start over from `/order` for a fresh quote
- Max 3 retries
- Non-retryable errors (-2, -3, -2004, -1003): fail immediately
- Timeout after 60 seconds total

### What Jupiter Handles (NOT your concern)

- Slippage optimization (RTSE)
- Priority fees
- Transaction landing and acceleration (Jupiter Beam)
- Compute budget
- ATA creation
- Address Lookup Tables (ALTs)
- Confirmation polling

---

## Data Flow

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

---

## File Structure

```
src/
├── config/
│   ├── constants.ts              # all constants
│   ├── env.ts                    # env var loading, validation
│   └── swapConfig.ts             # SwapConfig type, factories
├── types/
│   ├── swap.ts                   # SwapParams, OrderResponse, ExecuteResponse, SwapResult
│   ├── tokens.ts                 # TokenInfo
│   └── errors.ts                 # ErrorType enum, SwapError class
├── services/
│   ├── jupiterService.ts         # getOrder, executeOrder (API calls)
│   └── tokenService.ts           # token list fetching, search, metadata
├── handlers/
│   ├── swapHandler.ts            # executeSwap (main orchestrator)
│   ├── transactionSigner.ts      # deserialize, partial sign, serialize
│   └── preflightChecks.ts        # runPreflightChecks
├── state/
│   └── swapState.ts              # SwapState enum, state machine logic
├── ui/
│   ├── SwapForm.tsx              # main swap UI (token selectors, amount, swap button)
│   ├── TokenSelector.tsx         # token search + selection modal
│   ├── QuoteDisplay.tsx          # quote details (rate, fees, router)
│   ├── TransactionStatus.tsx     # pending / success / error states
│   └── SlippageSettings.tsx      # slippage override (optional)
├── utils/
│   └── errorNormalizer.ts        # normalizeError, mapJupiterErrorCode
├── index.ts                      # exports
├── .env.example
└── README.md
```

---

## Dependencies

```json
{
  "@solana/web3.js": "^1.95.0",
  "@solana/wallet-adapter-base": "^0.9.23",
  "@solana/wallet-adapter-react": "^0.15.35",
  "@solana/wallet-adapter-wallets": "^0.19.32",
  "bs58": "^5.0.0"
}
```

UI framework: React (or framework of choice — adjust file structure accordingly).

---

## Test Coverage

### Unit Tests

- Quote parsing: `/order` response correctly mapped to internal types
- Transaction signing: base64 → deserialize → partial sign → serialize round-trip
- Pre-flight checks: each validation throws correct error type
- Error normalizer: each Jupiter error code maps to correct ErrorType
- Slippage calculations applied correctly
- State transitions: each state only transitions to valid next states

### Integration Tests

- Full flow: GET /order → sign → POST /execute → SwapResult
- Token switch triggers new quote fetch
- API failure triggers retry with backoff
- Retryable execute errors trigger re-order up to 3x
- Non-retryable errors fail immediately

### UI Tests

- Selecting tokens updates quote display
- Invalid input (0 amount, same token) disables swap button
- Successful swap shows tx signature + Solscan link
- Error states display correct user-friendly messages
- Loading states show skeleton/spinner
- Wallet not connected shows connect prompt

---

## Key Implementation Notes

1. **Always use `VersionedTransaction`** — Jupiter v2 always returns v0 transactions
2. **Always partially sign** — `partiallySignTransaction`, not `signTransaction`, because JupiterZ routes need an additional market maker signature added during `/execute`
3. **API key is required** — every request needs `x-api-key` header
4. **Retry = start over** — on retryable failure, call `/order` again for a fresh quote, don't reuse the old transaction
5. **Jupiter handles the hard stuff** — no need to manage priority fees, slippage, ALTs, compute budget, or transaction landing yourself
6. **Quote without transaction** — omit `taker` from `/order` for quote-only (useful for price display before wallet connects)

---

## README Requirements

The README must include:
- Prerequisites (Node.js version, npm/yarn)
- Environment setup: how to get Jupiter API key, how to configure `.env`
- RPC provider options (public endpoint for dev, Helius/QuickNode/Triton for production)
- How to run the template locally
- How to run tests
- Architecture overview (brief)

---

## References

- Jupiter Swap API v2 docs: https://developers.jup.ag/docs/swap
- Order & Execute flow: https://developers.jup.ag/docs/swap/order-and-execute
- API Reference: https://developers.jup.ag/docs/api-reference/swap/order
- Portal (API keys): https://portal.jup.ag