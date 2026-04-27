---
paths:
  - "**/*test*"
  - "**/*spec*"
  - "**/*Test*"
  - "**/*Spec*"
  - "**/__tests__/**"
  - "**/*.{java,kt,py,ts,tsx,js,jsx,go,rs,cs}"
globs: ["*test*", "*spec*", "*Test*", "*Spec*", "*.java", "*.kt", "*.py", "*.ts", "*.js", "*.go", "*.rs", "*.cs", "*.tsx", "*.jsx"]
alwaysApply: false
---

# Test Integrity

These rules are **awareness-layer** guidance. Enforcement is procedural — see VERIFY.md §3d.1 (test integrity gate) and §4 (stub/disable detection grep).

---

## 1. Transparent Reporting

- Report ALL test failures accurately. Never dismiss a failure as "pre-existing" without a mechanical check against `baselineTests.failingTests[]`.
- Extract failing test names using `{tooling.test_report}` format — never rely on LLM judgment to determine test names from raw output. If `test_report` is not configured, use count-only comparison and warn the user.
- If you cannot determine whether a failure is pre-existing, HALT and present it to the user — do not silently skip it.
- Every test run must produce a clear pass/fail summary with counts.

## 2. Never Disable Tests

- Never add `@Disabled`, `@Ignore`, `@Skip`, `@Pending`, `pytest.mark.skip`, `unittest.skip`, `xit(`, `xdescribe(`, `.skip(`, `.todo(`, `t.Skip`, `t.SkipNow`, `#[ignore]`, `[Ignore]`, `[Fact(Skip`, `enabled = false`, or any equivalent annotation to silence a failing test.
- If a test fails and you cannot fix it, escalate to the user/lead — do not disable it.
- **Escape hatch:** A disabled test WITH a tracking reference (e.g., `@Disabled("JIRA-1234: flaky due to external service timeout")`) is logged as INFO and allowed to proceed. A disabled test WITHOUT a tracking reference is a HALT violation.

## 3. Tests Must Exercise Real Code

- Every test file must exercise production code. Tests that define standalone helper functions and test only those functions (never accessing production code) are not valid tests.
- Tests must assert on the behavior of production code paths, not on locally-defined mocks or stubs that shadow the real implementation.
- If a test cannot access production code yet (e.g., the module doesn't exist yet in TDD), that is expected — but the access must exist before the task is marked complete.
- **Ecosystem-specific access patterns** — all of the following count as exercising production code (no explicit import required):
  - **Java/Kotlin:** same-package tests accessing production classes without imports
  - **Go:** `package foo` internal tests accessing unexported symbols via same-package membership
  - **Rust:** `mod tests { use super::*; }` or `use crate::` accessing parent module code
  - **Any language:** test file in the same directory/package as production code with implicit access

## 4. Baseline Hygiene

- Baselines are not permanent — they must be refreshed at story boundaries and reviewed periodically.
- Security-sensitive test failures (matching patterns: `Security`, `Auth`, `Authz`, `Authn`, `Permission`, `Injection`, `Xss`, `Csrf`, `Sanitiz`, `Encrypt`, `Token`, `Credential`, `Privilege`, `Access.?Control`, `RateLimit`, `Session`, `Cors`, `Validation`, `Certificate`, `Password`, `Jwt`, `Audit`) must be flagged and reviewed at 5-story checkpoints.
- Stale baselines (>30 days old) must trigger a staleness warning.
- Every 5 stories, all baselined failures must be re-presented for user reassessment.
- When a previously-failing test starts passing, remove it from the baseline immediately — never carry resolved failures forward.

## 5. Test Anti-Patterns

- **Assertion-free tests** are the highest-priority anti-pattern. A test with no `expect`, `assert`, `should`, or equivalent call always passes — it verifies nothing. VERIFY.md §4 greps for this mechanically. Ignore test helpers, fixtures, and factory files (they exist to support other tests, not to assert directly).
- **Over-mocking**: If mock/stub/spy setup significantly outnumbers assertions, the test may verify wiring rather than behavior. Flagged by code review agent, not by grep.
- **Snapshot rot**: Blindly running `--updateSnapshot` whenever a snapshot test fails turns it into a rubber stamp. When both a test file and its `.snap` file change in the same commit, verify the update was intentional.
- **Test doubles in production**: Conditional `if (NODE_ENV === 'test')` logic or `@VisibleForTesting` on public methods in production files suggests the API was shaped around testability rather than encapsulation. Note: `#[cfg(test)]` in Rust and `@VisibleForTesting` on package-private methods in Java are idiomatic — do not flag.

## 6. Flaky Test Awareness

- A **flaky test** is one whose pass/fail status changes across verification cycles without any code changes to the test file or its production dependencies.
- Flaky detection runs automatically within the verification loop (VERIFY.md §3d.2) when `{tooling.test_report}` is configured. It compares test results between cycles and checks `git diff --name-only` to determine if file changes explain the flip.
- Flaky tests are **informational** — they do NOT block progress, do NOT count as new failures, and do NOT trigger a HALT.
- When flaky tests are detected, report them clearly in the task checkpoint (`Flaky: ⚠ {N} detected`) so the user can investigate outside the current task.
- Never retry a test run solely to "confirm" flakiness. The verification loop already provides multiple cycles — use the data you have.
- If the same test is flagged flaky across multiple tasks in the same story, it likely has a systemic issue (timing, shared state, external dependency). Note this pattern at Gate 5.

---

**Enforcement:** VERIFY.md §3d.1 runs a test integrity gate after tests complete (pass or fail) and before the security scan. VERIFY.md §3d.2 runs flaky detection after test integrity, comparing results across cycles. On test failure, §3d.1(c) performs baseline comparison before any slow-tier restart. VERIFY.md §4 includes stub detection greps, test-disable detection, and test anti-pattern detection (assertion-free, snapshot rot, test doubles). Violations increment `metrics.quality.testIntegrityViolations`. Assertion-free tests increment `metrics.quality.assertionFreeTests`. Flaky tests increment `metrics.quality.flakyTestsDetected`. SKILL.md inter-story baseline refresh enforces periodic review, security flagging, and staleness warnings.
