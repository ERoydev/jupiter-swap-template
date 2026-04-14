---
id: "1-1-project-scaffold-types-config"
status: ready
created: 2026-04-14
size: "L (plan says S for effort; story file is L because all shared type definitions, error mapping table, and constants are correctness-critical foundations consumed by every subsequent story -- must be inlined per rule 1)"
---

# Story: Project Scaffold + Shared Types + Config

## User Story
As a developer, I want the project scaffolded with all shared types, configuration, and environment setup, so that all subsequent stories have a stable foundation to build on.

## Acceptance Criteria
- Given a fresh checkout, When I run `npm install && npm run dev`, Then the Vite dev server starts without errors
- Given `.env.example` exists, When I copy it to `.env` and fill in values, Then `env.ts` loads and validates all required variables (VITE_SOLANA_RPC_URL, VITE_JUPITER_API_URL, VITE_JUPITER_API_KEY)
- Given the types directory exists, When I import from `types/swap.ts`, `types/tokens.ts`, `types/errors.ts`, Then all interfaces (SwapParams, OrderResponse, ExecuteResponse, SwapResult, TokenInfo), enums (SwapState, ErrorType), and SwapError class are available with correct fields
- Given `config/constants.ts` exists, When I import constants, Then DEFAULT_SLIPPAGE_BPS (50), MIN_SOL_BALANCE, MAX_RETRIES (3), CONFIRMATION_TIMEOUT_MS (60000), and state timeouts (QUOTE_TIMEOUT_MS: 10000, SIGNING_TIMEOUT_MS: 120000, EXECUTING_TIMEOUT_MS: 60000, STALE_THRESHOLD_MS: 30000) are exported
- Given `jupiterErrorMapper.ts` exists, When I call `mapErrorCode(code)` for each of the 14 Jupiter codes, Then it returns correct `{ type: ErrorType, message: string, retryable: boolean }` including unknown codes defaulting to non-retryable
- Given Tailwind CSS is configured, When I use DS utility classes (bg-background, text-foreground, etc.), Then styles render correctly with shadcn/ui theme tokens

## Architecture Guardrails

**Tech Stack (DD-1, DD-8, DD-11, DD-12 -- all LOCKED):**
- React 19 + TypeScript (strict mode)
- Vite 8 (dev server + build)
- Tailwind CSS v4 + shadcn/ui v4
- Vitest (test runner, co-located `*.test.ts` files)
- `@solana/web3.js` ^1.95.0 (LAMPORTS_PER_SOL import for MIN_SOL_BALANCE)

**Dependency direction (LOCKED):** UI -> State -> Handlers -> Services -> Types/Config (never reverse)

**Environment variables:** All prefixed with `VITE_` for Vite exposure. Accessed via `import.meta.env.VITE_*`.

**File structure:**
```
src/
  config/constants.ts
  config/env.ts
  types/swap.ts
  types/tokens.ts
  types/errors.ts
  state/swapState.ts        (SwapState enum only for this story)
  utils/jupiterErrorMapper.ts
  utils/jupiterErrorMapper.test.ts
```

**Jupiter API key:** `x-api-key` header on every Jupiter request. Key loaded from `VITE_JUPITER_API_KEY`.

### Data Models -- Complete Type Definitions

```typescript
// src/types/swap.ts
export interface SwapParams {
  inputMint: string;        // base58 public key
  outputMint: string;       // base58 public key
  amount: string;           // in smallest unit (lamports, etc.)
  userPublicKey: string;    // wallet public key
}

export interface OrderResponse {
  transaction: string | null; // base64 v0 tx, null if no taker
  requestId: string;
  outAmount: string;
  router: string;
  mode: string;
  feeBps: number;
  feeMint: string;
}

export interface ExecuteResponse {
  status: "Success" | "Failed";
  signature: string;
  code: number;
  inputAmountResult: string;
  outputAmountResult: string;
  error?: string;
}

export interface SwapResult {
  txId: string;
  status: "confirmed" | "failed";
  inputAmount: string;
  outputAmount: string;
  retriesAttempted: number;
  swapCorrelationId: string;
  error?: SwapError;
}
```

```typescript
// src/types/tokens.ts
export interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

export interface TokenCache {
  verifiedTokens: TokenInfo[];
  searchResults: Map<string, TokenInfo[]>;
  lastFetched: number;
  ttl: number;
  maxSearchCacheEntries: number;
}

export interface PersistedSwapPreferences {
  inputMint: string | null;
  outputMint: string | null;
}
```

```typescript
// src/types/errors.ts
export enum ErrorType {
  InsufficientSOL = "InsufficientSOL",
  InsufficientBalance = "InsufficientBalance",
  SlippageExceeded = "SlippageExceeded",
  TransactionExpired = "TransactionExpired",
  NetworkError = "NetworkError",
  WalletRejected = "WalletRejected",
  WalletNotConnected = "WalletNotConnected",
  WalletDisconnected = "WalletDisconnected",
  InvalidInput = "InvalidInput",
  OrderFailed = "OrderFailed",
  ExecutionFailed = "ExecutionFailed",
  QuoteTimeout = "QuoteTimeout",
  SigningTimeout = "SigningTimeout",
  ExecutionTimeout = "ExecutionTimeout",
  TokenListError = "TokenListError",
  BalanceCheckFailed = "BalanceCheckFailed",
  UnknownError = "UnknownError",
}

export class SwapError extends Error {
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
```

```typescript
// src/state/swapState.ts (enum only for this story)
export enum SwapState {
  Idle = "idle",
  LoadingQuote = "loading_quote",
  QuoteReady = "quote_ready",
  Signing = "signing",
  Executing = "executing",
  Success = "success",
  Error = "error",
}
```

### Constants

```typescript
// src/config/constants.ts
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export const DEFAULT_SLIPPAGE_BPS = 50;
export const MIN_SOL_BALANCE = 0.01 * LAMPORTS_PER_SOL;
export const MAX_RETRIES = 3;
export const CONFIRMATION_TIMEOUT_MS = 60_000;
export const QUOTE_TIMEOUT_MS = 10_000;
export const SIGNING_TIMEOUT_MS = 120_000;
export const EXECUTING_TIMEOUT_MS = 60_000;
export const STALE_THRESHOLD_MS = 30_000;
```

### Environment Validation

```typescript
// src/config/env.ts
// Validates: VITE_SOLANA_RPC_URL, VITE_JUPITER_API_URL, VITE_JUPITER_API_KEY
// All accessed via import.meta.env.VITE_*
// Throws on missing required variables at module load time
```

### Error Code Mapping (14 codes + unknown)

| Code | Retryable | ErrorType | User Message |
|------|-----------|-----------|-------------|
| 0 | -- | -- | (success, not mapped) |
| -1 | Yes | OrderFailed | "Order expired, fetching new quote..." |
| -2 | No | ExecutionFailed | "Transaction error. Please try again." |
| -3 | No | ExecutionFailed | "Transaction error. Please try again." |
| -1000 | Yes | TransactionExpired | "Transaction didn't land. Retrying..." |
| -1001 | No | UnknownError | "Something went wrong. Please try again." |
| -1002 | No | ExecutionFailed | "Invalid transaction. Please try again." |
| -1003 | No | ExecutionFailed | "Signing error. Please try again." |
| -1004 | Yes | TransactionExpired | "Block expired. Retrying with fresh quote..." |
| -2000 | Yes | TransactionExpired | "Transaction didn't land. Retrying..." |
| -2001 | No | UnknownError | "Something went wrong. Please try again." |
| -2002 | No | ExecutionFailed | "Transaction error. Please try again." |
| -2003 | Yes | TransactionExpired | "Quote expired. Fetching new quote..." |
| -2004 | No | ExecutionFailed | "Swap was rejected. Please try again." |
| unknown | No | UnknownError | "Something went wrong. Please try again." |

**Retryable codes (5):** -1, -1000, -1004, -2000, -2003
**Non-retryable codes (8):** -2, -3, -1001, -1002, -1003, -2001, -2002, -2004

`mapErrorCode(code: number)` returns `{ type: ErrorType, message: string, retryable: boolean }`.

## Verified Interfaces

No external interfaces to verify -- this is the first story (greenfield). All types and functions are defined by this story.

## Tasks
- [ ] Task 1: Vite + React + TypeScript scaffold with Tailwind and shadcn/ui
  - Maps to: AC-1 (dev server), AC-6 (Tailwind/shadcn)
  - Files: `package.json`, `tsconfig.json`, `vite.config.ts`, `src/globals.css`, `src/App.tsx`, `src/main.tsx`, `.env.example`, `.gitignore`, `index.html`
- [ ] Task 2: Shared types + SwapState enum
  - Maps to: AC-3 (types available with correct fields)
  - Files: `src/types/swap.ts`, `src/types/tokens.ts`, `src/types/errors.ts`, `src/state/swapState.ts`
- [ ] Task 3: Config (constants + env validation)
  - Maps to: AC-2 (env validation), AC-4 (constants exported)
  - Files: `src/config/constants.ts`, `src/config/env.ts`
- [ ] Task 4: Jupiter error mapper + test
  - Maps to: AC-5 (mapErrorCode for 14 codes + unknown)
  - Files: `src/utils/jupiterErrorMapper.ts`, `src/utils/jupiterErrorMapper.test.ts`

## must_haves
truths:
  - "npm install && npm run dev starts Vite dev server without errors"
  - "env.ts throws when VITE_SOLANA_RPC_URL is missing from environment"
  - "env.ts throws when VITE_JUPITER_API_URL is missing from environment"
  - "env.ts throws when VITE_JUPITER_API_KEY is missing from environment"
  - "import { SwapParams, OrderResponse, ExecuteResponse, SwapResult } from types/swap.ts compiles"
  - "import { TokenInfo } from types/tokens.ts compiles"
  - "import { ErrorType, SwapError } from types/errors.ts compiles"
  - "import { SwapState } from state/swapState.ts compiles and SwapState.Idle === 'idle'"
  - "DEFAULT_SLIPPAGE_BPS === 50 and MAX_RETRIES === 3 and CONFIRMATION_TIMEOUT_MS === 60000"
  - "QUOTE_TIMEOUT_MS === 10000 and SIGNING_TIMEOUT_MS === 120000 and EXECUTING_TIMEOUT_MS === 60000 and STALE_THRESHOLD_MS === 30000"
  - "mapErrorCode(-1) returns { type: ErrorType.OrderFailed, retryable: true }"
  - "mapErrorCode(-2004) returns { type: ErrorType.ExecutionFailed, retryable: false }"
  - "mapErrorCode(9999) returns { type: ErrorType.UnknownError, retryable: false }"
  - "jupiterErrorMapper.test.ts covers all 14 error codes plus unknown default"
artifacts:
  - path: "src/types/swap.ts"
    contains: ["SwapParams", "OrderResponse", "ExecuteResponse", "SwapResult"]
  - path: "src/types/tokens.ts"
    contains: ["TokenInfo", "TokenCache", "PersistedSwapPreferences"]
  - path: "src/types/errors.ts"
    contains: ["ErrorType", "SwapError"]
  - path: "src/state/swapState.ts"
    contains: ["SwapState"]
  - path: "src/config/constants.ts"
    contains: ["DEFAULT_SLIPPAGE_BPS", "MIN_SOL_BALANCE", "MAX_RETRIES", "CONFIRMATION_TIMEOUT_MS"]
  - path: "src/config/env.ts"
    contains: ["VITE_SOLANA_RPC_URL", "VITE_JUPITER_API_URL", "VITE_JUPITER_API_KEY"]
  - path: "src/utils/jupiterErrorMapper.ts"
    contains: ["mapErrorCode"]
  - path: "src/utils/jupiterErrorMapper.test.ts"
    contains: ["mapErrorCode", "describe"]
  - path: ".env.example"
key_links:
  - pattern: "import { ErrorType"
    in: ["src/utils/jupiterErrorMapper.ts"]
  - pattern: "import { LAMPORTS_PER_SOL"
    in: ["src/config/constants.ts"]

## Dev Notes (advisory)
**Greenfield project -- first story. No existing codebase patterns to follow.**

**Verified library versions (2026-04-14):**
- React: ^19.2.0
- Vite: ^8.0.0
- Vitest: ^4.1.0
- Tailwind CSS: ^4.2.0
- shadcn CLI: ^4.2.0
- @solana/web3.js: ^1.98.0 (architecture specifies ^1.95.0 -- 1.98 is latest 1.x)

**shadcn/ui setup:** Run `npx shadcn@latest init` (TypeScript, Tailwind v4, `src/components/ui`, CSS variables). This story only needs theme tokens in `globals.css` -- no individual components yet.

**Testing:** Vitest co-located `*.test.ts`. Error mapper test IDs: EC-01 through EC-16.

> Ref: docs/design-system.md#2-setup -- shadcn init steps and component add commands
> Ref: docs/test-strategy.md#Test Data Strategy -- fixture approach for future stories

## Detected Patterns
Greenfield -- no existing codebase. All patterns established by this story become the baseline.

| Pattern | Value | Sampled from | Established? |
|---------|-------|-------------|-------------|
| Import style | N/A | (greenfield) | N/A -- this story sets baseline |
| Error handling | N/A | (greenfield) | N/A -- this story sets baseline |
| Test organization | Co-located *.test.ts | docs/architecture.md | N/A -- this story sets baseline |
| Module exports | Named exports (no default) | docs/architecture.md | N/A -- this story sets baseline |

## Wave Structure
Wave 1: [Task 1, Task 2] -- independent, no shared files
Wave 2: [Task 3] -- depends on Task 2 (imports ErrorType, SwapError for type reference)
Wave 3: [Task 4] -- depends on Task 2 (imports ErrorType for mapper)
