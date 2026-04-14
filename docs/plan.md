---
status: complete
feature: jupiter-swap-template
created: 2026-04-14
---
# Plan: Jupiter Swap Template

## Decomposition Strategy
**PD-1: Vertical Feature Slices [LOCKED]** — 4 epics delivering demo-able slices. Each epic delivers end-to-end value with UI visible from Epic 2. Alternatives: Layer-First (UI too late), Minimal Viable Path (heavy final epic).

## Epic 1: Foundation

### Story 1-1: Project Scaffold + Shared Types + Config [S]
**User Story:** As a developer, I want the project scaffolded with all shared types, configuration, and environment setup, so that all subsequent stories have a stable foundation to build on.
**Dependencies:** None
**Wave:** 1

**Acceptance Criteria:**
- Given a fresh checkout, When I run `npm install && npm run dev`, Then the Vite dev server starts without errors
- Given `.env.example` exists, When I copy it to `.env` and fill in values, Then `env.ts` loads and validates all required variables (VITE_SOLANA_RPC_URL, VITE_JUPITER_API_URL, VITE_JUPITER_API_KEY)
- Given the types directory exists, When I import from `types/swap.ts`, `types/tokens.ts`, `types/errors.ts`, Then all interfaces (SwapParams, OrderResponse, ExecuteResponse, SwapResult, TokenInfo), enums (SwapState, ErrorType), and SwapError class are available with correct fields
- Given `config/constants.ts` exists, When I import constants, Then DEFAULT_SLIPPAGE_BPS (50), MIN_SOL_BALANCE, MAX_RETRIES (3), CONFIRMATION_TIMEOUT_MS (60000), and state timeouts (QUOTE_TIMEOUT_MS: 10000, SIGNING_TIMEOUT_MS: 120000, EXECUTING_TIMEOUT_MS: 60000, STALE_THRESHOLD_MS: 30000) are exported
- Given `jupiterErrorMapper.ts` exists, When I call `mapErrorCode(code)` for each of the 14 Jupiter codes, Then it returns correct `{ type: ErrorType, message: string, retryable: boolean }` including unknown codes defaulting to non-retryable
- Given Tailwind CSS is configured, When I use DS utility classes (bg-background, text-foreground, etc.), Then styles render correctly with shadcn/ui theme tokens

**FR Coverage:** — (enabling)
**NFR Coverage:** NFR-1 (error mapper covers 14 codes)

### Story 1-2: Wallet Connection + State Machine [M]
**User Story:** As a swap end user, I want to connect my Solana wallet and see the app track its state correctly, so that I can trust the interface responds to what I'm doing.
**Dependencies:** 1-1
**Wave:** 1

**Acceptance Criteria:**
- Given the app is loaded without a wallet, When I click "Connect Wallet", Then the wallet-adapter modal opens with available wallets
- Given I connect a wallet, When connection succeeds, Then the button shows my truncated public key and the app enables swap functionality
- Given the `swapReducer` pure function exists, When I call `swapReducer(currentState, action)` with valid transitions (all 13), Then it returns the correct next state
- Given the `swapReducer`, When I attempt an invalid transition (e.g., Idle → Executing), Then it returns the current state unchanged and logs `{ event: "invalid_transition", from, to, trigger, timestamp }`
- Given `useSwapState` hook wraps swapReducer, When state enters LoadingQuote/Signing/Executing, Then a timeout timer starts. When timeout fires, Then state transitions to Error with the appropriate timeout ErrorType
- Given the app is in any state, When the wallet disconnects, Then if Signing → Error(WalletDisconnected); if Executing → stay + show warning; otherwise → Idle

**FR Coverage:** FR-2
**NFR Coverage:** NFR-2 (state transition guards), NFR-4 (single-action recovery)

## Epic 2: Quote Flow

### Story 2-1: Jupiter Order Service + Quote Display [M]
**User Story:** As a swap end user, I want to see a live price quote when I select tokens and enter an amount, so that I know what I'll receive before committing to a swap.
**Dependencies:** 1-1, 1-2
**Wave:** 2

**Acceptance Criteria:**
- Given `jupiterService.getOrder(params)` is called with inputMint, outputMint, amount (no taker), When Jupiter API responds successfully, Then it returns OrderResponse with outAmount, router, mode, feeBps, feeMint, and transaction: null
- Given tokens are selected and amount > 0, When the user types/changes amount, Then after 300ms debounce a new /order request fires. Any in-flight request is cancelled via AbortController
- Given a quote is received, When the UI renders QuoteDisplay, Then it shows: output amount in TokenInput (read-only), exchange rate, router Badge, fee %, slippage "0.5% (auto)", and QuoteFreshnessIndicator
- Given a quote is displayed, When 30s passes (STALE_THRESHOLD), Then the QuoteFreshnessIndicator shows red dot + "refreshing soon"
- Given PriceImpactBadge receives impact bps, When impact >= 1% Then amber, >= 5% cautionary, >= 15% danger/red
- Given the /order request fails or times out, When the error occurs, Then state → Error with user-friendly message and single-action recovery
- Given no wallet is connected (quote-only mode), When tokens and amount are set, Then quote displays normally. Balance fields hidden. Swap button shows "Connect Wallet"

**FR Coverage:** FR-1, FR-5, FR-12
**NFR Coverage:** AC-U-2 (price impact), AC-U-3 (freshness)

### Story 2-2: Token Service + Token Selector UI [M]
**User Story:** As a swap end user, I want to search for and select tokens with full metadata, so that I can confidently choose the right tokens for my swap.
**Dependencies:** 1-1
**Wave:** 2

**Acceptance Criteria:**
- Given `tokenService.initialize()` is called on app load, When it completes, Then ~100-200 verified tokens are cached in memory with symbol, name, decimals, logoURI, mint
- Given the token cache, When user opens token selector and types "US", Then local cache is searched case-insensitively and USDC, USDT appear instantly
- Given a search query with no local matches and length >= 3, When submitted, Then Jupiter Token API is queried as fallback (debounce + AbortController)
- Given no matches anywhere, When results are empty, Then Empty component shows "No tokens found"
- Given a token in the selector, When displayed, Then it shows: Avatar (logo or fallback), symbol, name, decimals (e.g., "USD Coin · 6 decimals")
- Given a token is selected, When user clicks it, Then selector closes, token updates in swap form, if both tokens + amount set → quote fetch triggers
- Given same token selected for both sides, When validation runs, Then error "Cannot swap a token to itself"
- Given selected tokens, When user returns (new session), Then persisted tokens from localStorage pre-loaded
- Given cache TTL expires and app regains focus, When visibilitychange fires, Then verified tokens refresh silently
- Given search cache > 500 entries, When new results added, Then LRU eviction removes oldest
- Given mobile viewport, When token selector opens, Then renders as Drawer. On desktop → Dialog

**FR Coverage:** FR-3
**NFR Coverage:** DD-9 (token list), DD-10 (persistence)

### Story 2-3: Balance Service + Proactive Warnings [S]
**User Story:** As a swap end user, I want to see my token balances and get warned about insufficient SOL before I try to swap, so that I don't waste time on swaps that will fail.
**Dependencies:** 1-2, 2-2
**Wave:** 2

**Acceptance Criteria:**
- Given `balanceService.getSolBalance(publicKey)`, When RPC responds, Then returns SOL balance in lamports
- Given `balanceService.getTokenBalance(publicKey, mint)`, When RPC responds, Then returns token balance in smallest units
- Given wallet connected, When connection succeeds, Then SOL balance fetched. If < 0.01 SOL → warning Alert: "You need at least 0.01 SOL for transaction fees"
- Given wallet connected and input token selected, When balance fetched, Then TokenInput displays "Balance: {amount}" and enables MAX button
- Given RPC call fails, When failure occurs, Then warning overlay: "Unable to verify balance" with "Retry Check" and "Proceed Without Verification" buttons

**FR Coverage:** FR-11 (checks 6, 7)
**NFR Coverage:** AC-U-4 (proactive SOL warning), AC-A-2 (RPC degradation)

## Epic 3: Swap Execution

### Story 3-1: Pre-flight Checks + Transaction Signing [M]
**User Story:** As a swap end user, I want all validations to run before my swap and the transaction to be signed correctly, so that I don't submit invalid or unsigned transactions.
**Dependencies:** 2-1, 2-3
**Wave:** 3

**Acceptance Criteria:**
- Given `preflightChecks.run(params, connection, wallet)`, When all 7 checks pass, Then returns success
- Given each individual check fails, When run, Then throws correct SwapError: (1) WalletNotConnected, (2) InvalidInput "Enter a positive amount", (3) InvalidInput "Invalid input token address", (4) InvalidInput "Invalid output token address", (5) InvalidInput "Cannot swap a token to itself", (6) InsufficientSOL, (7) InsufficientBalance
- Given pre-flight failure, When swap button renders, Then disabled with text matching failure + Tooltip
- Given `transactionSigner.sign(base64Tx, wallet)`, When called, Then deserializes, partially signs, re-serializes to valid base64 signed VersionedTransaction
- Given wallet rejects signing, When rejection occurs, Then state → Error(WalletRejected)
- Given stale quote (> 30s), When user clicks swap, Then QuoteReady → LoadingQuote for fresh /order

**FR Coverage:** FR-11 (all 7 checks), FR-4 (partial)
**NFR Coverage:** NFR-3 (signing path)

### Story 3-2: Execute Flow + Success Display [M]
**User Story:** As a swap end user, I want to see my swap execute and get a confirmed result with a block explorer link, so that I know my tokens were swapped successfully.
**Dependencies:** 3-1
**Wave:** 3

**Acceptance Criteria:**
- Given `jupiterService.executeOrder(signedTx, requestId)`, When Jupiter returns code 0, Then SwapResult with status "confirmed", signature, amounts
- Given successful swap, When UI updates, Then success Alert with sent/received amounts, clickable Solscan link, "New Swap" button. Toast also fires
- Given user clicks "New Swap", When clicked, Then state → Idle
- Given full swap flow, When `swapHandler.executeSwap()` runs, Then `swapCorrelationId` (UUID) generated and logged on every step
- Given state transitions through Signing/Executing, When UI renders, Then SwapButton shows "Waiting for wallet..." / "Executing swap..." with Spinner

**FR Coverage:** FR-4, FR-6, FR-10
**NFR Coverage:** NFR-3 (execute path), AC-D-1 (correlation ID)

### Story 3-3: Retry Logic + Error Recovery [M]
**User Story:** As a swap end user, I want failed swaps to automatically retry when possible and always give me a clear path back to a working state, so that temporary failures don't block me.
**Dependencies:** 3-2
**Wave:** 3

**Acceptance Criteria:**
- Given retryable error (-1, -1000, -1004, -2000, -2003), When retryCount < 3, Then auto /order for fresh quote, increment retryCount, log `{ swapCorrelationId, attempt, code, requestId, timestamp }`
- Given retry in progress, When UI renders, Then "Retrying... attempt {N} of 3" with Spinner
- Given all 3 retries exhaust, When final fails, Then state → Error "Swap failed after 3 attempts", retriesAttempted: 3
- Given non-retryable error (-2, -3, -1001, -1002, -1003, -2001, -2002, -2004), When received, Then state → Error immediately. No retry
- Given any Error state, When user clicks "Dismiss" or changes input, Then state → Idle within one action
- Given unknown error code, When received, Then non-retryable "Something went wrong"
- Given Executing timeout (60s), When fires, Then state → Error(ExecutionTimeout)

**FR Coverage:** FR-7, FR-8, FR-9
**NFR Coverage:** NFR-1 (14 codes), NFR-6 (retry), AC-U-1 (retry progress), AC-U-5 (recovery)

## Epic 4: Resilience & Polish

### Story 4-1: Pre-flight UX + Responsive Layout [M]
**User Story:** As a swap end user, I want clear feedback on why I can't swap and a fully responsive interface, so that the app works well on any device.
**Dependencies:** 3-1
**Wave:** 4

**Acceptance Criteria:**
- Given each of 7 pre-flight failures, When swap button renders, Then specific disabled text + Tooltip
- Given 320px viewport, When rendered, Then no horizontal scroll, no overlap, tap targets ≥ 44px
- Given 375px, 768px, 1024px, 1920px viewports, Then layouts match wireframes
- Given mobile token selector, When opened, Then Drawer. Desktop → Dialog
- Given mobile quote details, When rendered, Then collapsed by default
- Given all interactive elements, When focused via keyboard, Then visible focus ring. Tab order follows spec

**FR Coverage:** FR-13, FR-11 (UX)
**NFR Coverage:** NFR-7 (WCAG AA), NFR-8 (responsive)

### Story 4-2: Comprehensive Test Suite [M]
**User Story:** As a developer, I want a complete test suite covering all 6 functional areas, so that regressions are caught automatically.
**Dependencies:** 3-3, 4-1
**Wave:** 4

**Acceptance Criteria:**
- Given `jupiterService.test.ts`, Then: /order + /execute request/response, AbortController, errors
- Given `tokenService.test.ts`, Then: cache init, search, LRU eviction, refresh, persistence
- Given `swapReducer.test.ts`, Then: 13 transitions, invalid rejection, guards
- Given `swapState.test.ts` (fake timers), Then: 3 timeout transitions
- Given `preflightChecks.test.ts`, Then: 7 checks × pass/fail
- Given `jupiterErrorMapper.test.ts`, Then: 14 codes + unknown default
- Given `SwapForm.test.tsx`, Then: renders per SwapState, disabled states, quote display

**FR Coverage:** — (cross-cutting)
**NFR Coverage:** NFR-9 (6 areas)

## FR Coverage Map

| FR | Stories | Status |
|----|---------|--------|
| FR-1 | 2-1 | ✅ |
| FR-2 | 1-2 | ✅ |
| FR-3 | 2-2 | ✅ |
| FR-4 | 3-1, 3-2 | ✅ |
| FR-5 | 2-1 | ✅ |
| FR-6 | 3-2 | ✅ |
| FR-7 | 3-3 | ✅ |
| FR-8 | 3-3 | ✅ |
| FR-9 | 3-3 | ✅ |
| FR-10 | 3-2 | ✅ |
| FR-11 | 2-3, 3-1, 4-1 | ✅ |
| FR-12 | 2-1 | ✅ |
| FR-13 | 4-1 | ✅ |

## NFR Coverage Strategy

| NFR | Path | Story |
|-----|------|-------|
| NFR-1 | Direct | 1-1, 3-3 |
| NFR-2 | Direct | 1-2 |
| NFR-3 | Direct | 3-1, 3-2 |
| NFR-4 | Direct | 1-2, 3-3 |
| NFR-5 | Deferred | PLV-1 |
| NFR-6 | Direct | 3-3 |
| NFR-7 | Direct | 4-1 |
| NFR-8 | Direct | 4-1 |
| NFR-9 | Direct | 4-2 |

## Wave Assignments

| Wave | Stories | Rationale |
|------|---------|-----------|
| 1 | 1-1 → 1-2 | Foundation: scaffold, types, wallet, state machine |
| 2 | 2-1 ∥ 2-2 → 2-3 | Quoting + tokens (parallel OK), then balance |
| 3 | 3-1 → 3-2 → 3-3 | Pre-flight → execute → retry (strict chain) |
| 4 | 4-1 → 4-2 | Responsive UX, then tests |

## Plan Decisions

PD-1: Decomposition Strategy — Vertical Feature Slices [LOCKED]
- Alternatives: Layer-First (UI late), Minimal Viable Path (heavy Epic 3)
- Rationale: Demo-able slices, UI from Epic 2, balanced epic sizes
