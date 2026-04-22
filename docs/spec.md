---
status: complete
created: 2026-04-14
feature: jupiter-swap-template
brief: docs/research.md
complexityTier: high
---
# Specification: Jupiter Swap Template

## Overview

Production-quality React + TypeScript swap application implementing the full Jupiter v2 swap flow (order → sign → execute). Single persona (Swap End User), 13 functional requirements, 9 non-functional requirements, 28 acceptance criteria across 5 categories. High complexity tier due to external API integration, 7-state machine, 14 error codes, and fund-loss risk.

## Use Cases

### UC-1: View Quote Without Wallet
User checks token swap pricing before connecting a wallet.
- **Primary actor:** Swap End User
- **Precondition:** Application is loaded; no wallet is connected
- **Main flow:**
  1. User selects an input token and an output token
  2. User enters a swap amount
  3. System fetches and displays a price quote (expected output, exchange rate, router, fees, price impact)
- **Alternative flows:**
  - Network/API failure during quote fetch: System transitions to error state and displays a user-friendly error message; user can change inputs to try again
  - Invalid amount entered (zero or negative): System disables the quote request and shows a validation message
- **Postcondition:** User sees a read-only quote with expected output amount displayed

### UC-2: Execute Token Swap
User performs a full token swap through the application.
- **Primary actor:** Swap End User
- **Precondition:** Wallet is connected; a valid quote is displayed; all 7 pre-flight checks pass
- **Main flow:**
  1. User reviews the displayed quote details (output amount, rate, fees, price impact, slippage)
  2. User initiates the swap
  3. System requests the user's wallet to partially sign the transaction
  4. User approves the signing in their wallet
  5. System submits the signed transaction for execution
  6. System displays progress feedback during execution
  7. System receives confirmation of success
  8. System displays success state with a block explorer link to the confirmed transaction
- **Alternative flows:**
  - User rejects wallet signing: System transitions to error state with a clear "signing rejected" message; user can dismiss and return to ready state
  - Retryable execution error (e.g., failed to land, quote expired): System automatically retries with a fresh quote up to 3 times; if all retries fail, displays error with option to try again manually
  - Non-retryable execution error (e.g., invalid transaction, swap rejected): System immediately displays a non-retryable error message; user can dismiss and return to ready state
  - Quote becomes stale before user clicks swap: System automatically refreshes the quote before proceeding
  - Network failure during execution: System displays a network error message; user can dismiss and return to ready state
- **Postcondition:** User sees either a success confirmation with block explorer link, or a clear error message with a path back to ready state

### UC-3: Search and Select Tokens
User finds and selects tokens for the swap pair.
- **Primary actor:** Swap End User
- **Precondition:** Application is loaded
- **Main flow:**
  1. User opens the token selector (for either input or output)
  2. User types a search query (symbol or mint address)
  3. System displays matching tokens with metadata (symbol, decimals, logo)
  4. User selects a token from the results
  5. System updates the swap pair and fetches a new quote if both tokens and an amount are set
- **Alternative flows:**
  - No tokens match the search query: System displays an empty state message
  - User selects the same token for both input and output: System shows a validation error indicating mints must differ
- **Postcondition:** Selected token is displayed in the appropriate position (input or output) with its metadata

### UC-4: Recover From Error State
User returns to a working state after encountering any error.
- **Primary actor:** Swap End User
- **Precondition:** Application is in an error state (from any cause: network, signing, execution, validation)
- **Main flow:**
  1. User sees a clear error message describing what went wrong
  2. User takes a single recovery action (dismisses error, changes input, or modifies token selection)
  3. System transitions back to the ready state
- **Alternative flows:**
  - User changes input amount while error is displayed: System transitions to ready state and begins fetching a new quote
  - User disconnects wallet while error is displayed: System returns to ready state with quote-only mode
- **Postcondition:** Application is in a usable state (Idle or LoadingQuote); no error is blocking interaction

## Functional Requirements (Capability Contract)

### Quoting & Display
- FR-1: [Swap End User] can [view a price quote for a token pair] [by selecting input/output tokens and entering an amount, without connecting a wallet]
- FR-5: [Swap End User] can [receive real-time quote updates] [when input amount or selected tokens change, with automatic refresh if a quote becomes stale before execution]
- FR-12: [Swap End User] can [view current slippage settings] [as display-only information alongside the quote]

### Token Selection
- FR-3: [Swap End User] can [search for and select tokens] [by symbol or mint address, with token metadata (symbol, decimals, logo) displayed for each option]

### Wallet & Swap Execution
- FR-2: [Swap End User] can [connect their wallet to the application] [to enable swap execution]
- FR-4: [Swap End User] can [execute a token swap] [after reviewing the quote details including expected output, exchange rate, router, fees, and price impact]
- FR-11: [Swap End User] can [be prevented from submitting an invalid swap] [by 7 pre-flight validations: wallet connected, positive amount, valid input mint, valid output mint, different mints, sufficient network-fee token balance, and sufficient input token balance]

### Feedback & Recovery
- FR-6: [Swap End User] can [view the progress of their swap] [through clear visual feedback for each stage: quoting, signing, executing, succeeded, or failed]
- FR-7: [Swap End User] can [see user-friendly error messages] [mapped from all 14 documented error codes, with distinction between retryable and non-retryable failures]
- FR-8: [Swap End User] can [retry a failed swap] [which automatically obtains a fresh quote and transaction rather than resubmitting a previous one, up to 3 automatic retries for retryable errors]
- FR-9: [Swap End User] can [return to a ready state from any error or success state] [within a single action (dismiss error, change input, or start a new swap)]
- FR-10: [Swap End User] can [view a link to the confirmed transaction on a block explorer] [after a successful swap]

### Responsiveness
- FR-13: [Swap End User] can [use the swap interface on mobile devices] [with a responsive layout that adapts to smaller screens]

## Non-Functional Requirements (measurable targets)

- NFR-1: Reliability — 100% of 14 documented swap execution error codes mapped to user-facing messages (0 unmapped)
- NFR-2: Reliability — 100% of 7 defined swap states have transition guards preventing invalid state changes
- NFR-3: Reliability — 0 code paths where a signed transaction result is not communicated to the user
- NFR-4: Reliability — User can return to ready state within 1 action from any error state
- NFR-5: Performance — Quote retrieval completes within 3 seconds under normal network conditions (DISCRETION — demoted to Post-Launch Verification)
- NFR-6: Reliability — Auto-retry restarts from fresh quote, max 3 attempts before surfacing error
- NFR-7: Accessibility — WCAG 2.1 AA contrast and keyboard navigation
- NFR-8: Compatibility — Renders correctly from 320px (mobile) to 1920px (desktop)
- NFR-9: Testability — Unit + integration tests cover all 6 functional areas

## Quality Perspectives

### End User (4 concerns)

| # | Concern | Severity | Suggested AC |
|---|---------|----------|--------------|
| 1 | No feedback during automatic retries — user may think app is frozen | HIGH | AC-U-1 |
| 2 | No price impact warning threshold — user could execute high-impact swap without warning | MED | AC-U-2 |
| 3 | No quote freshness indicator — user doesn't know quote age or when it auto-refreshed | MED | AC-U-3 |
| 4 | SOL balance error surfaced too late — only after clicking swap | MED | AC-U-4 |

### Architect (4 concerns)

| # | Concern | Severity | Category | Suggested AC |
|---|---------|----------|----------|--------------|
| 1 | API key exposure in client bundle | MED | security | AC-A-1 |
| 2 | RPC calls on critical swap path with no failure handling | MED | reliability | AC-A-2 |
| 3 | Quote refresh race condition — state machine missing transition | MED | boundary | AC-A-3 |
| 4 | 6 error codes unclassified for retry behavior | LOW | reliability | AC-A-4 |

### Maintainer (4 concerns)

| # | Concern | Severity | Category | Suggested AC |
|---|---------|----------|----------|--------------|
| 1 | Retry counter invisible to debugging | HIGH | debuggability | AC-D-1 |
| 2 | 6 error codes in neither retry list | HIGH | extensibility | AC-D-2 (merged into AC-A-4) |
| 3 | No timeout for in-progress states | MED | debuggability | AC-D-2 |
| 4 | errorNormalizer naming is ambiguous | LOW | readability | AC-D-3 |

## Acceptance Criteria

### AC-U: End User Criteria

- **AC-U-1:** During automatic retries, UI displays the current attempt number ("Retrying... attempt 2 of 3") so the user knows the app is actively working.
- **AC-U-2:** Price impact warnings at defined thresholds: informational at >=1%, cautionary/amber at >=5%, danger/red at >=15%. Warning visible before user initiates swap.
- **AC-U-3:** Quote freshness indicator (countdown or age) displayed alongside quote. User notified when quote auto-refreshes, especially if output amount changed.
- **AC-U-4:** SOL balance requirement surfaced proactively on wallet connect if insufficient. Error message explains SOL is needed for network fees ("You need at least 0.01 SOL for transaction fees"), not just "Insufficient SOL."
- **AC-U-5:** From any Error state, a single user action (dismiss, change input, or "Try Again") returns UI to Idle or QuoteReady. From Success, "New Swap" returns to Idle. No terminal state requires more than one action.

### AC-FR: Functional Completeness

- **AC-FR-1:** GET /order without `taker` returns quote (outAmount, router, feeBps, mode) and UI renders it. Transaction field is null. Swap button disabled. (covers FR-1)
- **AC-FR-2:** After wallet connection, swap button enabled (provided pre-flight checks pass). Subsequent /order calls include `taker`. (covers FR-2)
- **AC-FR-3:** Token selector supports search by partial symbol (case-insensitive), token name, and mint address — all handled by a single Jupiter endpoint with no client-side branching. Each option shows symbol, name, decimals, icon (or fallback), optional trust badges (verified / LST / Token2022 / Frozen), and — when a wallet is connected — balance + USD value. Selection updates swap form. (covers FR-3; amended A-2)
- **AC-FR-4:** Before swap, UI displays: expected output amount, exchange rate, router, feeBps, price impact. All from /order response. (covers FR-4)
- **AC-FR-5:** Input changes trigger debounced /order request. Stale quote at swap time triggers fresh /order before signing. (covers FR-5)
- **AC-FR-6:** Distinct visual states for each SwapState: LoadingQuote (skeleton/spinner), Signing (wallet prompt), Executing (pending), Success (confirmed + tx link), Error (message + action). (covers FR-6)
- **AC-FR-7:** All 14 Jupiter /execute error codes + wallet error 4001 + network errors map to user-facing messages via error normalization. No raw error strings in UI. (covers FR-7, NFR-1)
- **AC-FR-8:** Retryable errors (-1000, -2000, -2003) auto-retry from fresh /order up to 3x. Never resubmit previously signed tx. After 3 failures, error surfaces to user. (covers FR-8, NFR-6)
- **AC-FR-9:** Success state displays clickable Solscan link: `https://solscan.io/tx/{signature}`. (covers FR-10)
- **AC-FR-10:** All 7 pre-flight checks run before /order with taker: (1) wallet connected, (2) amount > 0, (3) inputMint valid base58, (4) outputMint valid base58, (5) inputMint !== outputMint, (6) SOL >= 0.01, (7) token balance >= amount. Each failure produces correct SwapError. Swap button disabled with message indicating failing check. (covers FR-11)
- **AC-FR-11:** Slippage displayed read-only (0.5% default). No override control. (covers FR-12)

### AC-A: Architecture Criteria

- **AC-A-1:** `.env.example` includes API key variable. README documents whether key is safe for client-side or requires server-side proxy, with rationale. (Architect concern #1)
- **AC-A-2:** RPC failures during pre-flight checks #6 and #7 degrade gracefully: either skip with user warning or surface specific "unable to verify balance" error. No silent proceed or hang. (Architect concern #2)
- **AC-A-3:** State machine includes stale-quote-refresh path: QuoteReady → LoadingQuote → QuoteReady → Signing. All invalid transitions rejected and logged. (covers NFR-2, Architect concern #3)
- **AC-A-4:** All 13 non-success error codes explicitly classified retryable or non-retryable. Codes -1, -1001, -1002, -1004, -2001, -2002 have explicit classification. Unknown codes default to non-retryable with error surfaced. (Architect concern #4, Maintainer concern #2)
- **AC-A-5:** Every code path where tx is signed and submitted to /execute terminates in Success or Error with user-visible feedback. No catch block, timeout, or race condition swallows an /execute response. (covers NFR-3)

### AC-D: Developer/Maintainer Criteria

- **AC-D-1:** Each retry attempt logs: attempt number (1-3), error code, requestId, timestamp. Final Error state includes `retriesAttempted` count. (Maintainer concern #1)
- **AC-D-2:** LoadingQuote, Signing, and Executing states have configurable timeouts (constants). Timeout transitions to Error with descriptive message. User can dismiss and retry. (Maintainer concern #3)
- **AC-D-3:** Error normalization module named for domain responsibility (e.g., `jupiterErrorMapper`) with doc comment explaining mapping source and extension procedure. (Maintainer concern #4)
- **AC-D-4:** In-flight /order requests cancelled (AbortController) when input changes. No stale response overwrites newer request's result. (Architect gap)

### AC-NFR: Non-Functional Criteria

- **AC-NFR-1:** WCAG 2.1 AA: keyboard navigable (tab order, Enter/Space), 4.5:1 contrast for normal text, 3:1 for large text, ARIA labels on interactive elements, meaning not conveyed by color alone. (covers NFR-7)
- **AC-NFR-2:** Responsive 320px–1920px. No horizontal scroll, truncation, or overlap at 320, 375, 768, 1024, 1920px widths. Tap targets >=44px on mobile. (covers NFR-8, FR-13)
- **AC-NFR-3:** Tests exist for all 6 areas: (1) quote fetching, (2) tx building/execution, (3) token selection, (4) state management, (5) UX states, (6) error handling. Each area has at least one test file with assertions. (covers NFR-9)

### Post-Launch Verification

| ID | NFR | Target | Reason for Demotion | Verification Method |
|----|-----|--------|--------------------|--------------------|
| PLV-1 | NFR-5 | Quote < 3s | Depends on Jupiter API + user network; no load testing infra | Measure p50/p95 /order response in production with APM |

## Traceability Matrix

| Requirement | Covered By |
|-------------|-----------|
| FR-1 | AC-FR-1 |
| FR-2 | AC-FR-2 |
| FR-3 | AC-FR-3 |
| FR-4 | AC-FR-4, AC-U-2 |
| FR-5 | AC-FR-5, AC-U-3, AC-D-4 |
| FR-6 | AC-FR-6, AC-U-1 |
| FR-7 | AC-FR-7, AC-A-4 |
| FR-8 | AC-FR-8, AC-D-1 |
| FR-9 | AC-U-5 |
| FR-10 | AC-FR-9 |
| FR-11 | AC-FR-10, AC-U-4 |
| FR-12 | AC-FR-11 |
| FR-13 | AC-NFR-2 |
| NFR-1 | AC-FR-7 |
| NFR-2 | AC-A-3 |
| NFR-3 | AC-A-5 |
| NFR-4 | AC-U-5 |
| NFR-5 | PLV-1 (Post-Launch) |
| NFR-6 | AC-FR-8 |
| NFR-7 | AC-NFR-1 |
| NFR-8 | AC-NFR-2 |
| NFR-9 | AC-NFR-3 |

## Content Quality

| Check | Status | Details |
|-------|--------|---------|
| CQ-1 Density | PASS | No filler phrases in FRs or NFRs |
| CQ-2 Impl Leakage | PASS | No technology names in FR capability text |
| CQ-3 Measurability | PASS | All NFRs have numeric/measurable targets |
| CQ-4 Traceability | PASS | 13/13 FRs → ≥1 AC, 9/9 NFRs → ≥1 AC or PLV |

## Conflict Resolutions

- **CR-1:** Error code classification gap raised by Architect (LOW) and Maintainer (HIGH). Merged into AC-A-4, elevated to HIGH — unclassified codes create ambiguous retry behavior.
- **CR-2:** Retry visibility raised by End User (UI display) and Maintainer (logging). Split: AC-U-1 for user-facing, AC-D-1 for structured logging. Same concern, different verification angles.
- **CR-3:** Quote staleness raised by Architect (state machine) overlaps FR-5 (auto-refresh). AC-FR-5 covers behavior, AC-A-3 covers state machine modeling. Both retained.

## Constraints & Assumptions

### Constraints
- C-1: API key required for all Jupiter v2 endpoints — Technical (LOCKED)
- C-2: Versioned transactions only (v0) — Technical (LOCKED)
- C-3: Partial signing mandatory — Technical (LOCKED)
- C-4: Retry = fresh quote, never resubmit old tx — Technical (LOCKED)
- C-5: Jupiter handles priority fees, slippage, ALTs, compute budget, ATA creation — Technical (LOCKED)
- C-6: React + TypeScript — DD-1 (LOCKED)
- C-7: Jupiter Swap API v2 order/execute — DD-2 (LOCKED)
- C-8: @solana/web3.js v1.x + wallet-adapter — DD-3 (LOCKED)
- C-9: Feature-first file structure — DD-4 (LOCKED)
- C-10: State machine 7 states + guarded transitions — DD-5 (LOCKED)
- C-11: Error normalization layer — DD-6 (LOCKED)
- C-12: 7 pre-flight checks — DD-7 (LOCKED)
- C-13: LaiM benchmark — Process (LOCKED)

### Assumptions
- A-1: Token list from Jupiter API or static curated list (DD-9, DISCRETION) — Risk: inadequate token coverage
- A-2: Quote staleness ~30s before auto-refresh — Risk: too short = excessive API calls; too long = stale quotes
- A-3: 0.01 SOL fee reserve sufficient — Risk: network fee spikes could exceed threshold
- A-4: 3s quote display target assumes normal network + Jupiter API conditions — Risk: API latency higher than expected
- A-5: Styling approach chosen at implementation (DD-8, DISCRETION) — Risk: heavy library impacts mobile performance

## Risk Register

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|-----------|
| R-1 | Jupiter API key exposed in client bundle | HIGH | MED | AC-A-1: Document key safety; proxy if billed/rate-limited |
| R-2 | Unclassified error codes cause incorrect retry behavior | MED | HIGH | AC-A-4: Explicitly classify all codes; default unknown to non-retryable |
| R-3 | In-progress states hang indefinitely (wallet popup lost, network stall) | MED | MED | AC-D-2: Configurable timeouts for all in-progress states |
| R-4 | Stale quote executed due to race condition | LOW | HIGH | AC-A-3: State machine models refresh path; AC-FR-5: fresh /order before signing |
| R-5 | RPC failure blocks swap even when balance is sufficient | MED | LOW | AC-A-2: Graceful degradation for RPC failures |

## Out of Scope

- Custom RPC node selection UI — use configured endpoint
- Limit orders, DCA, perpetuals — separate Jupiter APIs
- Token list curation — consume existing list
- Manual slippage override — Jupiter RTSE handles it
- Priority fee configuration — Jupiter handles via /execute
- Transaction history / portfolio — separate feature
- Multi-wallet support — single wallet only
- Fiat on/off ramp — not part of swap flow
- localStorage persistence — DD-10, DEFERRED

## Identified Gaps (for Architecture phase)

- G-1: Wallet disconnection during Signing/Executing state — define state machine behavior
- G-2: Amount input formatting (max decimals per token, paste, thousand separators) — UI implementation detail
- G-3: Confirmation step before high-impact swaps — deferred; AC-U-2 provides warning visibility
- G-4: AbortController cleanup on component unmount — standard React pattern, covered by AC-D-4
