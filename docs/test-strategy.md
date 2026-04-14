---
status: complete
created: 2026-04-14
last_updated: 2026-04-14
project: jupiter-swap-template
test_case_count: 72
coverage_percent: 100
---
# Test Strategy: Jupiter Swap Template

## Test Scope

| Area | In Scope | Out of Scope |
|------|----------|--------------|
| Features | All 13 FRs, 4 UCs, 28 ACs | — |
| Integrations | Jupiter API (mocked), Solana RPC (mocked), Wallet (mocked) | Real API/RPC calls, mainnet testing |
| UI | All 7 components, responsive layouts, WCAG AA | Visual regression (screenshots), E2E browser automation |
| State | All 13 transitions, guards, timeouts | Concurrent session testing |

## Test Types

| Type | Purpose | Tools | Scope |
|------|---------|-------|-------|
| Unit | Pure logic: reducer, mapper, checks, services | Vitest | swapReducer, jupiterErrorMapper, preflightChecks, tokenService, balanceService |
| Integration | Multi-layer flow with mocked externals | Vitest | swapHandler (full flow), jupiterService + fetch mock, component + state interaction |
| Accessibility | WCAG 2.1 AA compliance | vitest-axe (axe-core) | All rendered components per SwapState |
| Regression | Prevent regressions on every change | Vitest (full suite) | All unit + integration on every commit |
| Smoke | Quick sanity: app loads, quote fetches, swap button renders | Vitest | 5-10 fast critical-path tests |

## Test Environments

| Environment | Purpose | Data | Jupiter API |
|-------------|---------|------|------------|
| Local (dev) | Development + unit/integration tests | Mock data (fixtures) | Mocked via vi.fn() |
| CI | Automated on push/PR | Same fixtures | Mocked |
| Manual | Developer testing with real API | Real tokens, devnet/mainnet | Real API key |

## Test Data Strategy

**Fixtures approach:**
- `__fixtures__/orderResponse.json` — valid /order response
- `__fixtures__/executeResponses.json` — success + each of 14 error codes
- `__fixtures__/tokenList.json` — 10-20 test tokens with all metadata
- `__fixtures__/walletMock.ts` — mock wallet with partiallySignTransaction

No external test data dependencies. All tests run offline with mocked responses.

## Entry/Exit Criteria

### Entry
- Code complete for the story
- Vitest configured and passing on existing tests
- Mock fixtures available for story's integration points

### Exit
- All unit tests passing
- All integration tests passing
- Accessibility audit: 0 critical (P1) violations
- Smoke tests passing
- Coverage: ≥1 test file per functional area touched by the story

## Risk Assessment

### Quality Risks

| ID | Risk | Prob | Impact | Priority | Mitigation |
|----|------|------|--------|----------|-----------|
| QR-1 | Silent transaction result loss | LOW | CRITICAL | P1 | TX-01: exhaustive /execute path check |
| QR-2 | Stale transaction resubmission | LOW | CRITICAL | P1 | RS-01, RS-02: verify fresh /order per retry |
| QR-3 | State machine reaches impossible state | MED | HIGH | P1 | SM-14 to SM-18: invalid transition rejection |
| QR-4 | Error code misclassification | MED | HIGH | P1 | EC-01 to EC-16: all 14 codes tested |
| QR-5 | Token balance false positive | MED | MED | P2 | PF-07 to PF-10: boundary tests |
| QR-6 | AbortController race condition | MED | MED | P2 | AB-01 to AB-03: rapid input tests |
| QR-7 | Wallet disconnect during Executing | LOW | HIGH | P2 | WD-01 to WD-04: mid-flow disconnect |
| QR-8 | Token selector wrong metadata | LOW | HIGH | P2 | TS-01, TS-02: verify metadata integrity |
| QR-9 | Quote freshness misleads user | LOW | MED | P3 | UI-08: timing threshold test |
| QR-10 | Responsive layout breaks | MED | LOW | P3 | RES-01, RES-02: viewport tests |

### Risk-Based Testing Priority

**P1 — Test First:** Transaction result handling, retry safety, state machine integrity, error code classification
**P2 — Test Thoroughly:** Balance checks, AbortController, wallet disconnect, token metadata
**P3 — Standard Coverage:** Quote freshness timing, responsive layout

### External Dependencies

| Dependency | Risk | Contingency |
|------------|------|-------------|
| Jupiter API v2 | API changes, rate limits | All tests use mocked responses. Fixtures updated on API changes. |
| Solana RPC | Node downtime, rate limits | Mocked in tests. Architecture has RPC degradation (AC-A-2). |
| Wallet Adapter | Extension not installed | Mocked in tests. Manual testing with real wallet. |
| Jupiter Token API | Token list changes | Mocked in tests. Cache refresh handles staleness. |

## Testability Assessment

All 13 FRs and 9 NFRs are testable. Zero blockers. NFR-5 (quote < 3s) deferred to Post-Launch Verification (PLV-1).

Key testability enabler: Pure `swapReducer` function (DD from architecture persona review) makes the state machine fully testable with synchronous assertions — no React hooks or timer mocking needed for transition logic.

## Test Cases Summary

### By Area

| Area | TC Count | Priority |
|------|----------|----------|
| State Machine (swapReducer) | 22 | P1 |
| Error Code Classification | 16 | P1 |
| Pre-flight Checks | 13 | P1 |
| Retry Safety | 6 | P1 |
| UI/Component Rendering | 9 | P1-P2 |
| Accessibility | 3 | P2 |
| Responsive | 2 | P3 |
| Token Service | 6 | P2 |
| AbortController | 3 | P2 |
| Wallet Disconnect | 4 | P2 |
| Transaction Paths | 2 | P1-P2 |
| **Total** | **72** | |

### By Priority

| Priority | Count | % |
|----------|-------|---|
| P1 Critical | 52 | 72% |
| P2 High | 16 | 22% |
| P3 Medium | 4 | 6% |

### 6 Functional Area Coverage (NFR-9)

| Area | Test Files | TC Count |
|------|-----------|----------|
| 1. Quote fetching | jupiterService.test, AB-*, UI-01, UI-02 | 6 |
| 2. Tx building/execution | RS-*, TX-01, TX-02, SM-09 | 9 |
| 3. Token selection | TS-01 to TS-06 | 6 |
| 4. State management | SM-01 to SM-22 | 22 |
| 5. UX states | UI-03 to UI-09 | 7 |
| 6. Error handling | EC-01 to EC-16, PF-01 to PF-13 | 29 |

## Coverage Matrix

### FR Coverage

| FR | Test Cases | Status |
|----|-----------|--------|
| FR-1 | UI-01 | ✅ |
| FR-2 | SM-05, WD-03, WD-04 | ✅ |
| FR-3 | TS-01 to TS-06 | ✅ |
| FR-4 | SM-09, RS-01, RS-02, TX-02 | ✅ |
| FR-5 | AB-01 to AB-03, UI-02 | ✅ |
| FR-6 | UI-03 | ✅ |
| FR-7 | EC-01 to EC-16 | ✅ |
| FR-8 | RS-01 to RS-06, SM-11, SM-22, UI-06 | ✅ |
| FR-9 | SM-12, SM-13 | ✅ |
| FR-10 | UI-04 | ✅ |
| FR-11 | PF-01 to PF-13 | ✅ |
| FR-12 | UI-05 | ✅ |
| FR-13 | RES-01, RES-02 | ✅ |

### NFR Coverage

| NFR | Test Cases | Status |
|-----|-----------|--------|
| NFR-1 | EC-01 to EC-16 | ✅ |
| NFR-2 | SM-01 to SM-22 | ✅ |
| NFR-3 | TX-01 | ✅ |
| NFR-4 | SM-12, SM-13 | ✅ |
| NFR-5 | — | ⏳ PLV-1 |
| NFR-6 | RS-01, RS-02 | ✅ |
| NFR-7 | AX-01, AX-02, AX-03 | ✅ |
| NFR-8 | RES-01, RES-02 | ✅ |
| NFR-9 | All 6 areas covered | ✅ |

### AC Coverage

| AC | Test Cases | Status |
|----|-----------|--------|
| AC-U-1 (retry progress) | UI-06 | ✅ |
| AC-U-2 (price impact) | UI-07 | ✅ |
| AC-U-3 (quote freshness) | UI-08 | ✅ |
| AC-U-4 (SOL warning) | UI-09, PF-07, PF-08 | ✅ |
| AC-U-5 (recovery) | SM-12, SM-13 | ✅ |
| AC-A-1 (API key docs) | Manual | ✅ |
| AC-A-2 (RPC degradation) | PF-11, PF-12 | ✅ |
| AC-A-3 (stale refresh) | UI-02, SM-04 | ✅ |
| AC-A-4 (all codes classified) | EC-01 to EC-16 | ✅ |
| AC-A-5 (no silent tx loss) | TX-01 | ✅ |
| AC-D-1 (retry logging) | RS-04 | ✅ |
| AC-D-2 (timeouts) | SM-19, SM-20, SM-21 | ✅ |
| AC-D-3 (naming) | Manual | ✅ |
| AC-D-4 (AbortController) | AB-01, AB-02, AB-03 | ✅ |
| AC-NFR-1 (WCAG AA) | AX-01, AX-02, AX-03 | ✅ |
| AC-NFR-2 (responsive) | RES-01, RES-02 | ✅ |
| AC-NFR-3 (6 test areas) | All 6 covered | ✅ |

## Effort Estimation

| Activity | Hours |
|----------|-------|
| Fixture creation | 2h |
| Unit test implementation (48 tests) | 8h |
| Integration test implementation (8 tests) | 4h |
| UI/Component tests (9 tests) | 4h |
| Accessibility tests (3 tests) | 1.5h |
| Responsive tests (2 tests) | 1h |
| Smoke test suite | 1h |
| **Total** | **21.5h (~3 days)** |

Tests are implemented alongside each story, not batched. Story 4-2 fills gaps and adds smoke/accessibility suite.

## Mocking Strategy

| External | Mock Approach | Used By |
|----------|-------------|---------|
| Jupiter API (fetch) | vi.fn() returning fixture JSON | jupiterService.test, swapHandler.test |
| Solana RPC (Connection) | vi.fn() on getBalance, getTokenAccountBalance | balanceService.test, preflightChecks.test |
| Wallet (partiallySignTransaction) | vi.fn() resolving/rejecting | transactionSigner.test, swapHandler.test |
| localStorage | vi.stubGlobal or in-memory mock | tokenService.test |
| AbortController | Real (no mock needed) | jupiterService.test, AB-* tests |
| Timers | vi.useFakeTimers() | swapState.test, UI-08 |

## Post-Launch Verification

| ID | NFR | Target | Method |
|----|-----|--------|--------|
| PLV-1 | NFR-5 | Quote < 3s P95 | APM monitoring (Sentry/DataDog) on /order response times |
