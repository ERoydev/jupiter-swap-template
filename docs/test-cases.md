---
status: complete
created: 2026-04-14
project: jupiter-swap-template
total_cases: 72
---
# Test Cases: Jupiter Swap Template

## Area 1: State Machine (swapReducer) — 22 tests

| TC-ID | Title | Priority | Type | Technique |
|-------|-------|----------|------|-----------|
| SM-01 | Idle → LoadingQuote on amount entered | P1 | Unit | State Transition |
| SM-02 | LoadingQuote → QuoteReady on quote received | P1 | Unit | State Transition |
| SM-03 | LoadingQuote → Error on API failure | P1 | Unit | State Transition |
| SM-04 | QuoteReady → LoadingQuote on input change | P1 | Unit | State Transition |
| SM-05 | QuoteReady → Signing on swap click + preflight pass | P1 | Unit | State Transition |
| SM-06 | QuoteReady → Error on preflight fail | P1 | Unit | State Transition |
| SM-07 | Signing → Executing on wallet signed | P1 | Unit | State Transition |
| SM-08 | Signing → Error on wallet reject | P1 | Unit | State Transition |
| SM-09 | Executing → Success on code 0 | P1 | Unit | State Transition |
| SM-10 | Executing → Error on non-retryable code | P1 | Unit | State Transition |
| SM-11 | Executing → LoadingQuote on retryable + retryCount < 3 | P1 | Unit | State Transition |
| SM-12 | Error → Idle on dismiss | P1 | Unit | State Transition |
| SM-13 | Success → Idle on new swap | P1 | Unit | State Transition |
| SM-14 | Reject Idle → Executing (invalid) | P1 | Unit | Negative |
| SM-15 | Reject Idle → Success (invalid) | P1 | Unit | Negative |
| SM-16 | Reject QuoteReady → Success (invalid) | P1 | Unit | Negative |
| SM-17 | Reject Signing → Idle (invalid) | P1 | Unit | Negative |
| SM-18 | Reject Executing → Signing (invalid) | P1 | Unit | Negative |
| SM-19 | LoadingQuote timeout after 10s | P1 | Unit | Boundary |
| SM-20 | Signing timeout after 120s | P1 | Unit | Boundary |
| SM-21 | Executing timeout after 60s | P1 | Unit | Boundary |
| SM-22 | Executing → Error when retryCount = 3 (max reached) | P1 | Unit | Boundary |

## Area 2: Error Code Classification — 16 tests

| TC-ID | Title | Priority | Type | Technique |
|-------|-------|----------|------|-----------|
| EC-01 | Code 0 → success | P1 | Unit | EP |
| EC-02 | Code -1 → retryable | P1 | Unit | EP |
| EC-03 | Code -2 → non-retryable | P1 | Unit | EP |
| EC-04 | Code -3 → non-retryable | P1 | Unit | EP |
| EC-05 | Code -1000 → retryable | P1 | Unit | EP |
| EC-06 | Code -1001 → non-retryable | P1 | Unit | EP |
| EC-07 | Code -1002 → non-retryable | P1 | Unit | EP |
| EC-08 | Code -1003 → non-retryable | P1 | Unit | EP |
| EC-09 | Code -1004 → retryable | P1 | Unit | EP |
| EC-10 | Code -2000 → retryable | P1 | Unit | EP |
| EC-11 | Code -2001 → non-retryable | P1 | Unit | EP |
| EC-12 | Code -2002 → non-retryable | P1 | Unit | EP |
| EC-13 | Code -2003 → retryable | P1 | Unit | EP |
| EC-14 | Code -2004 → non-retryable | P1 | Unit | EP |
| EC-15 | Unknown code (-9999) → non-retryable | P1 | Unit | Error Guessing |
| EC-16 | All 14 codes produce non-empty message | P1 | Unit | Exhaustive |

## Area 3: Retry Safety — 6 tests

| TC-ID | Title | Priority | Type | Technique |
|-------|-------|----------|------|-----------|
| RS-01 | Retry calls /order with new requestId | P1 | Integration | Error Guessing |
| RS-02 | Retry never resubmits previous signed tx | P1 | Integration | Error Guessing |
| RS-03 | Third retry failure surfaces error | P1 | Integration | Boundary |
| RS-04 | Retry logs correlationId, attempt, code, requestId, timestamp | P1 | Unit | Inspection |
| RS-05 | Non-retryable on first attempt skips retry | P1 | Integration | EP |
| RS-06 | Mixed retryable then non-retryable stops | P1 | Integration | Error Guessing |

## Area 4: Pre-flight Checks — 13 tests

| TC-ID | Title | Priority | Type | Technique |
|-------|-------|----------|------|-----------|
| PF-01 | Wallet not connected → WalletNotConnected | P1 | Unit | EP |
| PF-02 | Amount = 0 → InvalidInput | P1 | Unit | BVA |
| PF-03 | Amount = -1 → InvalidInput | P1 | Unit | BVA |
| PF-04 | Invalid base58 inputMint → InvalidInput | P1 | Unit | EP |
| PF-05 | Invalid base58 outputMint → InvalidInput | P1 | Unit | EP |
| PF-06 | inputMint === outputMint → InvalidInput | P1 | Unit | EP |
| PF-07 | SOL balance 0.009 → InsufficientSOL | P1 | Unit | BVA |
| PF-08 | SOL balance 0.01 → passes | P1 | Unit | BVA |
| PF-09 | Token balance < amount → InsufficientBalance | P1 | Unit | BVA |
| PF-10 | Token balance = amount → passes | P1 | Unit | BVA |
| PF-11 | RPC failure on SOL check → BalanceCheckFailed (warning) | P1 | Unit | Error Guessing |
| PF-12 | RPC failure on token check → BalanceCheckFailed (warning) | P1 | Unit | Error Guessing |
| PF-13 | All 7 checks pass → no error | P1 | Unit | Happy Path |

## Area 5: UI/Component Rendering — 9 tests

| TC-ID | Title | Priority | Type | Technique |
|-------|-------|----------|------|-----------|
| UI-01 | Quote renders without wallet (no balance, "Connect Wallet" button) | P1 | Integration | EP |
| UI-02 | Stale quote (> 30s) triggers refresh before signing | P1 | Integration | BVA |
| UI-03 | Each SwapState renders distinct UI (7 states) | P1 | Integration | State Transition |
| UI-04 | Success shows Solscan link with correct signature | P1 | Integration | Happy Path |
| UI-05 | Slippage "0.5% (auto)" rendered in QuoteDisplay | P2 | Unit | Happy Path |
| UI-06 | Retry shows "Retrying... attempt 2 of 3" | P1 | Integration | State Transition |
| UI-07 | PriceImpactBadge variants at <1%, >=1%, >=5%, >=15% | P2 | Unit | BVA |
| UI-08 | QuoteFreshnessIndicator green→yellow→red at 10/20/30s | P2 | Unit | BVA |
| UI-09 | SOL warning Alert on wallet connect when < 0.01 | P2 | Integration | EP |

## Area 6: Accessibility — 3 tests

| TC-ID | Title | Priority | Type | Technique |
|-------|-------|----------|------|-----------|
| AX-01 | All components pass axe-core with 0 critical violations | P2 | Integration | Automated |
| AX-02 | Keyboard tab order matches spec | P2 | Integration | Manual/Automated |
| AX-03 | All interactive elements have aria-labels | P2 | Unit | Inspection |

## Area 7: Responsive — 2 tests

| TC-ID | Title | Priority | Type | Technique |
|-------|-------|----------|------|-----------|
| RES-01 | No horizontal scroll at 320px | P3 | Integration | BVA |
| RES-02 | Token selector: Drawer on mobile, Dialog on desktop | P3 | Integration | EP |

## Area 8: AbortController — 3 tests

| TC-ID | Title | Priority | Type | Technique |
|-------|-------|----------|------|-----------|
| AB-01 | Rapid input change cancels previous /order | P2 | Integration | BVA |
| AB-02 | Only latest response updates state | P2 | Integration | Error Guessing |
| AB-03 | Cancelled request does not transition state | P2 | Integration | Error Guessing |

## Area 9: Wallet Disconnect — 4 tests

| TC-ID | Title | Priority | Type | Technique |
|-------|-------|----------|------|-----------|
| WD-01 | Disconnect during Signing → Error(WalletDisconnected) | P2 | Integration | Error Guessing |
| WD-02 | Disconnect during Executing → stay + warning | P2 | Integration | Error Guessing |
| WD-03 | Disconnect during Idle → stays Idle | P2 | Unit | State Transition |
| WD-04 | Disconnect during QuoteReady → Idle | P2 | Unit | State Transition |

## Area 10: Token Service — 6 tests

| TC-ID | Title | Priority | Type | Technique |
|-------|-------|----------|------|-----------|
| TS-01 | Initialize fetches and caches verified tokens | P2 | Integration | Happy Path |
| TS-02 | Search finds local match without API call | P2 | Unit | EP |
| TS-03 | No local match + query >= 3 → API fallback | P2 | Integration | BVA |
| TS-04 | Query < 3 chars → no API call | P2 | Unit | BVA |
| TS-05 | LRU eviction at 501st entry | P2 | Unit | BVA |
| TS-06 | Cache refresh on visibility change when TTL expired | P2 | Integration | Error Guessing |

## Area 11: Transaction Paths — 2 tests

| TC-ID | Title | Priority | Type | Technique |
|-------|-------|----------|------|-----------|
| TX-01 | Every /execute code path terminates in Success or Error | P1 | Integration | Exhaustive |
| TX-02 | transactionSigner produces valid base64 from base64 input | P2 | Unit | Happy Path |
