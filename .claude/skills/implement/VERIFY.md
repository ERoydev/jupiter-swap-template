# Verification Protocol

Read by the implement skill during per-task verification. Contains TDD decision, verification loop, stub detection, behavioral evidence, goal-backward checks, failure handling, and deviation rules.

---

## 0. Interface Verification (pre-implementation)

Before any coding begins, verify that external interfaces this task depends on match expectations:

1. Read the story's `## Verified Interfaces` section
2. If the story includes a **File hash** for this interface → compute SHA-256 of the current source file
   - **Match** → interface unchanged, skip re-read for this interface
   - **Differs** → proceed to step 3
   - **No hash field** → proceed to step 3 (backward compatible)
3. For each interface relevant to **this task**: read the actual source file, confirm the signature matches what the story assumes
4. If mismatch detected: **HALT** — deviation Rule 3 (significant interface change). Do not proceed with stale interface assumptions.
5. **Skip if:** no `## Verified Interfaces` section in the story file (backward compatible), OR no external dependencies for this task, OR this is the first story (`storiesDone === 0` — no prior implementations to verify against)

This step catches interface drift that may have occurred between story creation and task execution (e.g., a teammate in a parallel wave changed a signature).

---

## 1. TDD Decision

```
"Can I write expect(fn(input)).toBe(output) before fn exists?"
  YES → Full TDD (write failing tests first)
  NO  → Test-after (implement, then test)
```

**Full TDD:** Pure functions, services, utilities, validators, API handlers, state reducers.
**Test-after:** UI rendering, complex integration, infrastructure, config, migrations. Document rationale.

**Bug fix? → Test-first (default):**
1. Write a failing test that reproduces the reported bug
2. Confirm it fails for the right reason
3. Fix the code
4. Confirm the test passes
5. Run full suite for regressions

**Exception:** If the bug is not reproducible in a test (UI rendering, race condition, environment-specific, config-only):
→ Document why in task checkpoint → fix first → write regression test after → mark "test-after (bug — {reason})"

Tests for NEW functionality must fail before implementation. Integration tests with prior tasks may pass — expected.

**Quality (both paths):** ≥1 test per AC, ≥2 error cases per public function, edge cases (null, empty, boundary). No vacuous assertions.

---

## 1.4. Graph-Assisted Lookup (optional)

If `.code-review-graph/graph.db` exists, prefer graph queries over grep/glob for these operations:

| Operation | Graph query | Fallback (no graph) |
|-----------|------------|-------------------|
| Find definition | `query_graph(pattern="definition_of", symbol="{name}")` | `Grep` for symbol name |
| Find callers | `query_graph(pattern="callers_of", symbol="{name}")` | `Grep` for import/usage |
| Find tests | `query_graph(pattern="tests_for", symbol="{name}")` | `Glob` for `*test*`/`*spec*` |
| Blast radius | `query_graph(pattern="dependents", symbol="{name}", depth=2)` | `Grep` for import chain |
| Check usage | `query_graph(pattern="references", symbol="{name}")` | `Grep` for symbol name |

**No graph?** Zero behavior change — fall back to grep/glob as before. This section is purely additive.

---

## 1.5. Precedence (when instructions conflict)

1. **Safety/security rules** → override all
2. **User-visible behavior from ACs** → binding
3. **Existing codebase patterns** → govern internal implementation
4. **Language/framework rules** (auto-loaded by Claude Code via `.claude/rules/*.md` `paths:` frontmatter — fires on matching file reads for main agent and Task-tool subagents alike) → govern when no codebase pattern exists
5. **Story-prescribed internal details** → advisory unless marked LOCKED

**Hard-limit rules are ceilings, not precedent.** If a rule sets a threshold (e.g., file >800 lines), existing codebase violations do not override it — the threshold still applies. Codebase patterns govern style and structure choices, not limit exemptions.

---

## 1.7. Codebase Pattern Scan

Before writing new code, check for cached patterns first:

1. **Check story table:** If the story includes a `## Detected Patterns` table:
   - All relevant patterns marked ✅ Established → follow them, skip file reading
   - Any relevant pattern marked ⚠ Conflicting or table absent → proceed to step 2
2. **Choose:** Pick 1 analogous existing file per file you will create or modify — same directory, same component layer, or closest responsibility
3. **Extract:** Note error handling pattern, import style, naming convention, file organization
4. **Apply:** Follow these patterns in your implementation unless a LOCKED constraint or hard-limit rule requires divergence
5. **No analogous file?** Fall back to language/framework rules from `.claude/rules/`

---

## 2. Implementation

**Full TDD:** Write tests → run (MUST fail) → implement → run (must pass). If all pass before code → tests are weak → **rewrite**.

**Test-after:** Implement → write tests → run (must pass). Same coverage requirements.

Stay within planned file list. Apply deviation rules for surprises (§8).

---

## 3. Verification Loop

Max **5 full cycles** (a full cycle restarts from 3a after any slow-tier failure).
Track: `verifyAttempts: {n}/5` in task state (full cycles).
Track: `fastTierAttempts: {n}/5` in task state (fast tier only).
Track: `testResultHistory: []` in task state (per-cycle test results for flaky detection).
Track: `flakyTests: []` in task state (tests flagged as flaky across cycles).
Each restart logs which step failed and why.

### Fast Tier (format + lint) — max 5 iterations

```
3a. FORMAT → {tooling.format} {changed_files}
3b. LINT   → {tooling.lint_fix} {changed_files}
    On fail → restart from 3a (fast tier only, does NOT count toward the 5 full cycles)
    Max 5 fast-tier iterations — if lint still fails after 5 → escalate to user
```

The fast tier loops independently. A lint failure never triggers a build or test re-run.

### Fast Tier Error State (5 iterations exhausted)

```
⚠ FAST TIER FAILED — 5 format/lint iterations exhausted
Last failure: {step} — {error details}

[R] Retry with guidance  [S] Skip task  [A] Abort story  [H] Show full log
```
**HALT — wait for user response before proceeding.**

### Slow Tier (build + test + test integrity + security) — runs once per full cycle after fast tier passes

```
3c. BUILD    → {tooling.build}
    On fail  → Build Error Resolution:
               1. Parse error → identify file:line
               2. Smallest fix (<5% of file, one error at a time)
               3. NO architecture changes, NO refactoring, NO features
               4. Re-run from 3a (full cycle, counts toward 5 max)
               5. Max 3 build-fix attempts → escalate to user
3d. TEST     → {tooling.test_changed} (if configured)
              OR {tooling.test} (fallback — always used at wave checkpoints and Gate 5)
              If {tooling.test_changed} exits with a runner error (not a test assertion failure),
              fall back to {tooling.test} and log the fallback reason.
    On test failure → route to §3d.1(c) BEFORE slow-tier restart.
    On test pass   → proceed to §3d.1(a).
3d.1 TEST INTEGRITY → Run after tests complete (pass or fail), before security:
    (a) Disabled-test scan (on pass or fail): grep -rnE "@Disabled|@Ignore|@Skip|@Pending|pytest\.mark\.skip|pytest\.skip|unittest\.skip|xit\(|xdescribe\(|xcontext\(|\.skip\(|\.todo\(|t\.Skip|t\.SkipNow|b\.Skip|#\[ignore\]|\[Ignore\]|\[Fact\(Skip|\[Theory\(Skip|enabled\s*=\s*false" {changed_files}
        Match WITH tracking ref (e.g. @Disabled("JIRA-1234: reason")): INFO — log, proceed.
        Match WITHOUT tracking ref: HALT — present to user.
    (b) Test authenticity (on pass or fail): for each changed test file, verify it exercises
        production code. Acceptable evidence (any one):
        - Explicit import from production source (e.g. `import com.foo.MyService`)
        - Same-package access (Java/Kotlin test in same package as production class)
        - Internal package test (Go `package foo` test accessing unexported symbols)
        - `use super::*` or `use crate::` (Rust module tests)
        Zero evidence of production code access → HALT: "Test {path} has no production code access."
    (c) Baseline comparison (on test failure only):
        Extract current failing test names using `{tooling.test_report}` format:
        - `jest-json` / `vitest-json`: parse JSON → `.testResults[].assertionResults[]` where `status === "failed"` → `{ancestorTitles.join(' > ')} > {title}`
        - `junit-xml`: parse XML → `<testcase>` with `<failure>` child → `{classname}.{name}`
        - `go-test-json`: parse JSON lines → `"Action": "fail"` with `"Test"` key → `{Package}/{Test}`
        - `cargo-test`: parse stderr → `test {name} ... FAILED` → `{name}`
        - `trx`: parse XML → `<UnitTestResult outcome="Failed">` → `{testName}`
        Compare extracted names against baselineTests.failingTests[]:
        - Failure IN baseline → pre-existing, proceed (do not restart).
        - Failure NOT in baseline → HALT as new failure.
        - If `{tooling.test_report}` is null (not configured):
          If baselineTests.failingTests is empty AND baselineTests.failing > 0 (count-only mode):
          compare failure count. If current failures ≤ baseline.failing → proceed with WARNING:
          "⚠ Count-only baseline: cannot verify which tests failed. Configure tooling.test_report for mechanical comparison."
          If current failures > baseline.failing → HALT as new failure(s).
        Never classify a failure as "pre-existing" without this mechanical baseline check.
        After baseline comparison: if only pre-existing failures remain → proceed to (a)/(b).
        If new failures detected → HALT (do NOT restart slow tier — user must decide).
    On any HALT → metrics.quality.testIntegrityViolations += 1
3d.2 FLAKY DETECTION → After each test run (pass or fail), compare results across cycles:
    Requires `{tooling.test_report}` — if null, skip flaky detection entirely.
    1. Record: extract all test names + status (pass/fail) from this cycle's test output
       using `{tooling.test_report}` format (same parsers as §3d.1(c)).
       Append to `testResultHistory[cycle]`.
    2. If this is cycle N > 1:
       a. Diff changed files since last test run: `git diff --name-only`
       b. For each test whose status FLIPPED (pass→fail or fail→pass) between cycle N-1 and N:
          - Check if the test file appears in the changed files → if YES, flip is expected (skip)
          - Check if any production file imported by that test appears in the changed files
            → if YES, flip is expected (skip)
          - If NEITHER the test file NOR its production dependencies changed → FLAKY
            Append test name to `flakyTests[]` (deduplicated).
    3. Report: `Flaky: {count} detected — {names}` (WARNING, not HALT).
       Flaky tests do NOT block progress and do NOT count as new failures.
       On detection: `metrics.quality.flakyTestsDetected += {count}` (new names only, not duplicates).
    4. If a test flagged flaky in cycle N appears in `baselineTests.failingTests[]`,
       note it as "pre-existing + flaky" — still non-blocking.
3e. SECURITY → {tooling.security} + secret scan:
    grep -rniE "(password|secret|api_key|private_key)\s*[:=]\s*['\"][^'\"]{8,}['\"]" {changed_files} \
      | grep -v "\.test\.\|\.spec\.\|__tests__\|__mocks__\|\.example\|\.sample" \
      | grep -vi "token_address\|token_symbol\|contract_address\|token_id"
    # Java/Spring: unquoted secrets in .properties/.yml/.yaml (skip ${...} placeholders)
    grep -rnE "(password|secret|api[_.-]?key|private[_.-]?key|token)\s*[=:]\s*[^${\s'\"][^\s]{8,}" {changed_files} \
      | grep -E "\.(properties|yml|yaml):" \
      | grep -v "\.test\.\|\.spec\.\|\.example\|\.sample\|\.template"
    # Also enforced by laim-verify-checks.sh hook on commit

    On any slow-tier fail → restart from 3a (full cycle, counts toward 5 max)
```

3f. ACCESSIBILITY (UI stories only — skip for backend, CLI, infra tasks):
    If changed files include UI components (`.tsx`, `.jsx`, `.vue`, `.svelte`):
    - If `tooling.accessibility_lint` is set: run it against changed UI files
    - If not set: manual checklist — verify changed components use semantic HTML elements,
      have ARIA labels on interactive elements, support keyboard navigation (onKeyDown handlers),
      and maintain focus management (autoFocus, focus traps for modals)
    - Advisory: does not trigger cycle restart. Report gaps as WARN.
    Skip when no UI files in the diff.

If a command is not configured: SKIP with note. If test command missing: WARN.
`tooling.test_changed` is optional — if not configured, falls back to `tooling.test`.

3f. ENV COMPLETENESS (advisory, does not trigger cycle restart):
    If `tooling.env_template` is set (e.g., `.env.example`):
    - Extract key names from the template: `grep -oE '^[A-Z_][A-Z0-9_]*' {tooling.env_template}`
    - Check if `.env` exists. If not: WARN "Missing .env — create from {tooling.env_template}"
    - If `.env` exists: extract its keys via Bash (`grep -oE '^[A-Z_][A-Z0-9_]*' .env`), diff against template keys. Report missing keys as WARN (not blocking).
    - Key-name extraction only — do not extract or display values.

On **all pass** → proceed to stub detection without halting.

### Error State (5 cycles exhausted)

```
⚠ VERIFICATION FAILED — 5 attempts exhausted
Last failure: {step} — {error details}

[R] Retry with guidance  [S] Skip task  [A] Abort story  [H] Show full log
```
**HALT — wait for user response before proceeding.**

---

## 4. Stub Detection

Scan all changed files after verification passes. The `laim-verify-checks.sh` hook enforces these checks automatically on every `git commit` — this section describes what it catches and how to interpret findings.

Findings are emitted **per match** as `HEURISTIC: file:line: matched-text`. They are **advisory**: treat them as signals to review, not as commands to rewrite. A matching line is not proof of a defect — grep has no understanding of comments, strings, scope, or intent. Confirm the stub exists by reading the code before acting.

**Stub patterns** (WARNING on match — flags Gate 5 Criterion 12):
- **STUBS** — Markers `TODO`, `FIXME`, `HACK`, `XXX`, `placeholder`, `not implemented`, `coming soon`. Matches carrying a tracking reference (`[A-Z]+-[0-9]+`, `#123`, `GH-123`) are exempted — e.g., `TODO(#42): wire up retry` is intentional and not flagged.
- **THROW_STUB** — `throw new Error(...not impl...)` or `throw new UnsupportedOperationException(...)`. Gated to `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.java`, `.kt`, `.kts`.
- **CONSOLE_ONLY** — single-line `{ console.log/error/warn(...) }` handler bodies. Gated to `.js/.jsx/.mjs/.cjs/.ts/.tsx`.
- **JAVA_THROW** — `throw new (RuntimeException|IllegalStateException)("not impl"|"TODO"|...)`. Gated to `.java`.
- **JAVA_HOLLOW** — Java-only hollow return values `return 0L;` and `return "";`. Gated to `.java`. Bare `return 0;` and `return false;` are intentionally **not** flagged — they are legitimate values in Java and every C-family language, and the previous broader regex induced harmful rewrites of correct control flow (issue #224).
- **JAVA_EMPTY_COLL** — `return Collections.emptyList()`, `Optional.empty()`, `List.of()`, `Map.of()`, `Set.of()`. Gated to `.java`.
- **KOTLIN_TODO** — `TODO()` / `TODO("reason")` (Kotlin's built-in that throws `NotImplementedError`). Gated to `.kt/.kts`.
- **PYTHON_PASS** — lines containing only `pass`. Gated to `.py`.

`HOLLOW` (generic `return null/undefined/{}/[]`) is intentionally **not scanned**. It matched legitimate nullable returns in every C-family language and produced too many false positives to be useful; Claude Code sees plain `return null;` as a real intent, not a stub, and so should the hook.

Also check manually: empty catch blocks, unused imports, functions returning hardcoded values, mock data in production code.

**Test-disable annotations** (flags Gate 5 Criterion 13 — required):
All 20 patterns across Java, Python, JS/TS, Go, Rust, C# — enforced by hook. Matches WITHOUT a tracking reference (e.g., `JIRA-1234`, `#123`) trigger HALT.

**Assertion-free tests** (flags Gate 5 Criterion 15 — required):
Test files with zero assertion calls (`expect`, `assert`, `should`, `Assert.*`, `#[should_panic]`). Excludes helpers: conftest, testutil, factory, fixture, helper, setup, mock.

**Test anti-patterns** (review heuristics — check manually, not in hook):
- *Snapshot test rot*: test with `toMatchSnapshot` AND `.snap` file both changed → verify intentional
- *Test doubles in prod*: `NODE_ENV === "test"` or `os.Getenv("TEST")` in non-test files → flag (exclude Rust `#[cfg(test)]`, Java `@VisibleForTesting` on non-public methods)

Report: `Stubs: {count matches across heuristics}` (recommended, per-match detail in hook output) · `Disabled tests: {count}` (required, per-match detail) · `Assertion-free: {count}` (required) · `Snapshots: {count}` (info) · `Test doubles in prod: {count}` (info).

---

## 5. Behavioral Evidence

Type-specific proof the code actually WORKS:

| Task Type | Evidence |
|-----------|----------|
| Service / Business logic | Unit tests with concrete assertions (input → output) |
| API endpoint | Integration test (request → status code + response shape) |
| UI component | Render test (mounts, interaction handlers fire) |
| CLI command | Output capture (args → expected stdout) |
| Database migration | Up + down cycle without error |
| Configuration | Validation test (valid loads, invalid rejects) |
| State management | Transition test (action → state change) |
| Middleware | Chain test (passes through / blocks as expected) |
| Integration / cross-component flow | End-to-end test spanning 2+ components (e.g., connect → switch → disconnect flow). Expected when story has AC-FLOW-* criteria or cross-story dependencies. |

**Confidence:** High (end-to-end automated) / Medium (unit only) / Low (manual check needed).
If Low → document manual steps in checkpoint.

---

## 6. Goal-Backward Verification

For each `must_haves` entry relevant to this task:

### L1 — EXISTS
```bash
ls -la {must_haves.artifacts[].path}  # File exists?
```

### L2 — NOT A STUB
Run stub detection (§4) specifically on must_have artifacts. If any stub markers found → FAIL.
Additionally check: file has ≥10 non-blank, non-import, non-comment lines.

### L3 — CONNECTED
For each `key_links` entry:
```bash
grep -rn "{pattern}" {in_files}
```
If pattern not found: flag as WARNING (not automatic FAIL). Some connection patterns (dependency
injection, dynamic imports, plugin registration) aren't grep-able. If grep fails, check:
1. Is the component registered via config/IoC? → PASS with note
2. Is there a test that imports and uses it? → PASS with note
3. Neither? → FAIL

Report with nuance:
```
| must_have | exists | not_stub | connected | status |
|-----------|--------|----------|-----------|--------|
| {item}    | ✅     | ✅       | ✅        | PASS   |
| {item}    | ✅     | ✅       | ⚠️ (IoC)   | PASS*  |
```

**Note:** Not all must_haves apply per task. Full verification runs at Gate 5.

---

## 7. Consecutive Failure Protocol

If **3 tasks in a row** fail verification:

```
⚠ 3 CONSECUTIVE FAILURES — Root cause analysis needed

Failed: {task_n-2}, {task_n-1}, {task_n}
Common patterns: {shared error/file/dependency}

[F] Fix root cause — investigate shared issue
[M] Amend architecture — fundamentally wrong (→ docs/amendments.md)
[R] Rollback to last passing task
[S] Stop — save state and exit
```
**HALT — wait for user response before proceeding.** Do NOT attempt a 4th task.

**Indicators:** Same file in all failures → structural. Same test fails → dependency broken. Build cascade → base component.

---

## 8. Deviation Rules

Applied when implementation diverges from story plan.

| Rule | Trigger | Action |
|------|---------|--------|
| **1** | Minor (naming, style, path) | Auto-fix to match codebase + log discrepancy |
| **2** | Moderate (pattern, extra dependency) | Auto-fix + log + note in task checkpoint |
| **3** | Significant (interface, data structure) | Fix + create amendment (`docs/amendments.md`) |
| **4** | Architectural (new component, boundary) | **HALT — wait for user response before proceeding.** Present to user, amendment if approved |

**Amendment format** (Rule 3-4):
```markdown
## Amendment A-{N}: {title}
- **Story**: {story-id}
- **Date**: {ISO date}
- **Original**: {what story specified}
- **Actual**: {what was implemented}
- **Rationale**: {why the change}
- **Affected**: {architecture sections}
```

**Discrepancy tracking:** `D-{N} (Task {t}): Rule {1-4} — Expected: {story} → Actual: {implemented} → Resolution: {action}`
Categories: signature | structure | flow | addition | removal | pattern | architecture

---

## Execution Order Summary

```
 0. Interface verification (check Verified Interfaces against actual source)
 1. Drift detection (git diff)
 2. TDD decision
 3. Implementation (code + tests)
 4. Verification loop:
    - Fast tier (format → lint) — loops until clean, max 5 iterations
    - Slow tier (build → test → test integrity → flaky detection → security) — runs once after fast tier passes
    - Slow-tier failure restarts full cycle from 3a (max 5 full cycles)
 5. Stub detection
 6. Behavioral evidence
 7. Goal-backward (EXISTS → NOT_STUB → CONNECTED)
 8. Stage files (specific files only — never git add .)
 9. Task checkpoint (HALT — wait for user)
10. Orchestrator commits (after user approval)
11. Context compaction (every 3 tasks)
```

Never skip a step. Never proceed past a HALT point without user approval.
