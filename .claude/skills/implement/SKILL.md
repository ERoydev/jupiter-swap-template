---
name: implement
description: "Per-story implementation with TDD, verification, code review, and Gate 5. Phase 5 of 5."
---

# Implement (Phase 5)

Phase 5 of 5. Per-story: create story → execute tasks → review → Gate 5.

You read **the story file** (or quick-spec) as your **primary context** — context funnel principle. You MAY read project files (package.json, tsconfig.json) for operational HOW. You MAY also read upstream docs (`docs/architecture.md`, `docs/spec.md`, `docs/research.md`) **only when the story file is insufficient to resolve an implementation question** — e.g., a must_have verification fails, a deviation (Rule 3-4) requires checking original intent, or the story file has a gap (missing data model, unclear contract). Never pre-load all upstream docs at the start of a story.

**Two contexts:** Greenfield stories (`docs/stories/{id}.md`) and quick specs (`docs/quick-{slug}.md`).

> **State file note:** All references to "state.json" in this skill use the resolved state file from the Initialize step. For quick flows running alongside greenfield, this may be `.quick-state.json`.

> state.json writes validated by hook (`validate-state.sh`) — structure, timestamps, completeness. Use Write tool (full file), never Edit.

---

## Pause & Resume Protocol

The implement skill uses `currentCheckpoint` (not `currentStep`) in state.json because it operates at story/task granularity, not phase steps.

**State table:**

| Checkpoint                       | `currentCheckpoint` value           |
| -------------------------------- | ----------------------------------- |
| Story creation presented         | `story-creation`                    |
| Quick-flow task decomposition    | `task-decomposition`                |
| Execution strategy presented     | `execution-strategy`                |
| Task N checkpoint                | `task-N` (e.g., `task-1`, `task-2`) |
| Wave N checkpoint (seq/parallel) | `wave-N` (e.g., `wave-1`, `wave-2`) |
| Code review presented            | `code-review`                       |
| Gate 5 shown                     | `gate-5`                            |

On `[P]` at any HALT: save per Universal Pause Protocol (§5.5 in start.md) using the value from the table above. Update state.json root-level `currentCheckpoint` to that value.

On resume: read root-level `currentCheckpoint` from state.json to determine the exact resume point within the story.

## Prerequisite Check

Before Initialize, verify the upstream artifact exists on disk. The implement skill reads its primary context from disk — prior conversation context is not a substitute, even after compaction or session handoff.

1. **Determine flow type and upstream artifact:**
   - If `docs/.quick-state.json` exists (quick flow alongside greenfield) OR `docs/state.json` has `flow: "quick"` → upstream artifact is `docs/quick-{slug}.md` (where `{slug}` = feature slug from the resolved state file)
   - Else if `docs/state.json` has `flow: "greenfield"` → upstream artifact is `docs/plan.md`
   - Else → HALT: `No active LaiM flow detected. Run /start (greenfield) or /quick (existing codebase) before invoking /implement.`
2. **Verify upstream artifact on disk:**
   - Greenfield: `docs/plan.md` must exist AND `phases.plan.status === "complete"` in state.json. If missing or plan incomplete → HALT: `Plan phase incomplete — docs/plan.md missing or phases.plan.status !== "complete". Return to /start and finish the Plan phase before invoking /implement.`
   - Quick: `docs/quick-{slug}.md` must exist. If missing → HALT: `Missing quick-spec: docs/quick-{slug}.md. Return to /quick §4 (Step 2/3 — Quick-Spec) and produce the file before invoking /implement.`
3. Proceed to Initialize only when the prerequisite check passes.

This mirrors the prerequisite pattern in `specify/SKILL.md`, `architecture/SKILL.md`, and `storyplan/SKILL.md`. It is a belt-and-suspenders backstop for `/quick` §5 Step 3's entry precondition — if the orchestrator is bypassed or the skill is invoked directly, the upstream artifact is still verified on disk before any execution begins.

## Initialize

**Metrics:** Before writing to `metrics.*` in state.json (gates, tasks, code review, git), read `templates/references/metrics-triggers.md`.

1. **Determine state file:**
   - If input is `docs/quick-*.md` AND `docs/.quick-state.json` exists → use `.quick-state.json`
   - Otherwise → use `docs/state.json`
   - All state reads/writes in this skill use the resolved state file

2. **Read state file** → extract `currentStory` block and `currentCheckpoint`
   - If `currentStory` is null → this is a new story assignment (normal flow)
   - If `currentStory` has a `storyId` → check for resume (Step 3)

3. **Resume check:**
   - Look for story file at `docs/stories/{storyId}.md` (greenfield) or `docs/quick-{slug}.md` (quick)
   - If `currentCheckpoint` is set → resume at that checkpoint (e.g., `code-review` resumes at Code Review, `task-3` resumes at Task 3, `gate-5` resumes at Gate 5)
   - If story file exists AND tasks have `status: "done"`:
     - Skip story creation
     - Skip completed tasks (status: "done" — regardless of committed value)
     - Resume at the first task with status != "done"
     - Display: `Resuming: Story {id}, Task {resumeTask}/{totalTasks}`
   - If story file exists but no tasks started → skip story creation, start at Task 1
   - If no story file → proceed to Story Creation

4. **Pre-flight checks:**
   - Verify `{tooling.test}` is configured (warn if missing)
   - If first story and no test infrastructure: set baseline to `{ total: 0, passing: 0, failing: 0 }`

---

## Quick-Flow Task Decomposition

When the input is a quick-spec (`docs/quick-*.md`) with no `## Tasks` section:

1. Read the quick-spec's Change Description and Affected Files
2. Auto-decompose into tasks:
   - Each affected file group = one task
   - Add a test task if AC requires new tests
   - Add a cleanup task if refactor touches multiple files
3. Append the `## Tasks` section to the quick-spec file:

   ```markdown
   ## Tasks

   - [ ] Task 1: {description}
     - Maps to: {AC references}
     - Files: {files}
   - [ ] Task 2: ...
   ```

4. Present to user: "Auto-generated {N} tasks from quick-spec. [C] Continue [E] Edit tasks [P] Pause" — On `[P]`: save per Pause Protocol (`currentCheckpoint: task-decomposition`).
5. Proceed to execution strategy selection

This ensures the per-task loop has tasks to iterate over regardless of flow type.

---

## Story Creation (greenfield only — skip for quick)

> Story files are created at the start of their wave — never for all waves at once. In sequential mode: one at a time before each story's execution. In parallel mode: per-wave batch at wave start (§7b-parallel step 2). The story-creator-agent reads live codebase state (completed stories, amendments, verified interfaces) from prior waves. Creating stories for future waves produces stale/empty sections.

**Ensure output directory:** `mkdir -p docs/stories/`

```
═══ LAIM ═══ Feature: {name} │ Story {done}/{total}: {story-name} ═══
```

1. Spawn `.claude/agents/story-creator-agent.md` via Task tool with:
   - `docs/architecture.md` + `docs/amendments.md` (if exists)
   - Target story section from `docs/plan.md`
   - 2-3 most recent completed story files
2. Present story with quality signal: `Story: {story-id} | Inlined: {N} sections | Refs: {M} scoped references | Omitted: {K} patterns`
   → `[C] Continue  [E] Edit  [P] Pause` — **HALT — wait for user response before proceeding.** On `[P]`: save per Pause Protocol (`currentCheckpoint: story-creation`).
3. **Security baseline reminder (non-first stories only):**
   If `storiesDone > 0` AND `baselineTests.securitySensitive[]` is non-empty:
   Display inline warning (no HALT): `🔒 {N} security-sensitive tests remain baselined: {names}. Will be reviewed at next 5-story checkpoint or via [R] Reassess.`
4. **Baseline test snapshot:**
   1. Run `{tooling.test}` and record results
   2. If ALL tests pass: `baselineTests: { total: N, passing: N, failing: 0 }`
   3. If some tests FAIL (pre-existing failures) — **use `AskUserQuestion`** (single-select; if unavailable, present as numbered plain-text list):

      ```
      ⚠ PRE-EXISTING TEST FAILURES
      {N} tests failing before any changes.

      [I] Ignore — track as baseline (Gate 5 checks for NEW failures only)
      [F] Fix first — address failing tests before proceeding
      [A] Abort — this project needs cleanup first
      ```

      On [I]: `baselineTests: { total: N, passing: P, failing: F, preExisting: true, baselinedAt: "{ISO date}", baselinedAtStory: 0, failingTests: ["{test.class.method}", ...] }`
      Extract failing test names mechanically using `{tooling.test_report}` format:
      - `jest-json`: run with `--json`, extract `.testResults[].assertionResults[]` where `status === "failed"` → `{ancestorTitles.join(' > ')} > {title}`
      - `vitest-json`: run with `--reporter=json`, same structure as jest-json
      - `junit-xml`: parse `<testcase>` elements with `<failure>` child → `{classname}.{name}`
      - `go-test-json`: run with `-json`, extract lines where `"Action": "fail"` and `"Test"` exists → `{Package}/{Test}`
      - `cargo-test`: parse stderr for `test {name} ... FAILED` → `{name}`
      - `trx`: parse `<UnitTestResult outcome="Failed">` → `{testName}`
      - `null` (not configured): store empty `failingTests: []` and log: "test_report not configured — baseline comparison will use count only." Append additional warning: `⚠ Cannot identify security-sensitive tests — test_report not configured. If any of these failures are security-related, consider [F] Fix first.`
        **Security-sensitive check:** After extracting `failingTests` (skip if `failingTests` is empty due to null `test_report`), scan names for security-related patterns (case-insensitive): `Security`, `Auth`, `Authz`, `Authn`, `Permission`, `Injection`, `Xss`, `Csrf`, `Sanitiz`, `Encrypt`, `Token`, `Credential`, `Privilege`, `Access.?Control`, `RateLimit`, `Session`, `Cors`, `Validation`, `Certificate`, `Password`, `Jwt`, `Audit`.
        If any match → append WARNING before the `[I]/[F]/[A]` prompt:

      ```
      🔒 SECURITY-SENSITIVE FAILURES DETECTED
      The following baselined failures match security test patterns:
      - {test name} (matches: {pattern})
      Baselined security test failures will be flagged at every story creation.
      ```

      Store matched tests in: `baselineTests.securitySensitive: ["{test.class.method}", ...]`
      Gate 5 criterion 1 becomes: "no NEW test failures beyond baseline"
      On [F]:
      1. Display the failing test output so the user can see what needs fixing
      2. Pause story creation — the user fixes pre-existing failures manually (outside LaiM)
      3. Present:
         ```
         [R] Re-run baseline — check if failures are resolved
         [I] Ignore — track remaining failures as baseline and continue
         ```
         **HALT — wait for user response.**
      4. On [R]: re-run `{tooling.test}`, check results
         - All pass → `baselineTests: { total: N, passing: N, failing: 0 }` → continue story creation
         - Still failing → show updated failure output, loop back to step 3
      5. On [I]: treat as the [I] path above (track as baseline)

   4. If test runner errors (no test infrastructure): `baselineTests: { total: 0, passing: 0, failing: 0, noInfra: true }`
      Gate 5 criterion 1: skip with note "no test infrastructure"

---

## Pre-Implementation Interface Audit

After story creation (or loading), before execution strategy selection:

```
═══ Interface Audit: {story-id} ═══

| Interface | Story Assumes | Actual Source | Status |
|-----------|--------------|---------------|--------|
| {name}()  | {signature}  | {signature}   | ✓ / ⚠  |
```

1. Read the story file's `## Verified Interfaces` section
2. For each interface listed: read the actual source file, extract the current signature
3. Compare story-assumed signature against actual source

**All match →** update state.json: `metrics.quality.interfaceAudits += 1`. Proceed to Execution Strategy Selection.

**Mismatches found →** HALT with options:

```
⚠ INTERFACE MISMATCH DETECTED

| Interface | Story Assumes | Actual Source |
|-----------|--------------|---------------|
| {name}()  | {story sig}  | {actual sig}  |

[F] Fix story — update story file with actual signatures, create amendment in docs/amendments.md
[C] Continue — use actual signatures during implementation (story file unchanged, mismatch logged to docs/concerns.md)
[H] Halt — stop and investigate
```

Update state.json: `metrics.quality.interfaceAudits += 1`, `metrics.quality.interfaceMismatches += {mismatch_count}`.

**No `## Verified Interfaces` section →** skip audit (backward compatible with older story files).

**First story (`storiesDone === 0` in state.json) →** skip audit. No prior implementations exist to verify against. Interfaces marked `UNVERIFIED` by the story-creator are expected — they use plan contracts as placeholders.

### Version Verification Check

After the interface audit, scan the story file's `## Dev Notes` section for `⚠ VERSION NOT VERIFIED` markers. For each unverified library version:

1. Web-search `"{library} latest stable version"` to verify
2. If verified: use the confirmed version during implementation
3. If search fails: proceed with the story's version, log a concern to `docs/concerns.md`

**Migration:** Existing story files may use the old HTML comment marker `<!-- VERSION NOT VERIFIED -->`. Treat identically — check with `grep -rn 'VERSION NOT VERIFIED' docs/stories/` to find both formats.

---

## Execution Strategy Selection

### Capability Check

- Agent Teams: Check `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` env var → Available / Not available

### Strategy Selection Logic

FOR each task wave in the story:

    IF wave has only 1 task:
        → SINGLE-SUBAGENT (one Task tool subagent)

    ELIF wave has 2+ tasks:
        IF Agent Teams available:
            → AGENT-TEAM (teammates with delegate-mode lead, file ownership, messaging)
        ELSE:
            → SEQUENTIAL-SUBAGENTS (one Task tool subagent per task, in dependency order)

Strategy Definitions:

| Strategy             | Description                                                  | When Used                                        |
| -------------------- | ------------------------------------------------------------ | ------------------------------------------------ |
| AGENT-TEAM           | Spawn teammates via Agent Teams, coordinate via shared tasks | Any wave with 2+ tasks AND Agent Teams available |
| SINGLE-SUBAGENT      | One Task tool subagent                                       | Solitary task in a wave                          |
| SEQUENTIAL-SUBAGENTS | One subagent per task, in order                              | 2+ tasks, Agent Teams unavailable                |

### Present Strategy

| Wave | Tasks  | Dependencies | Strategy   |
| ---- | ------ | ------------ | ---------- |
| {w}  | {list} | {deps}       | {strategy} |

[If Agent Teams not available:]
⚠ Agent Teams not enabled. Using sequential subagents as fallback.
To enable: Set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

Does this strategy look good? **Use `AskUserQuestion`** (single-select; if unavailable, present as numbered plain-text list):

- `[A] Approve` — begin implementation with the displayed strategy
- `[O] Override` — change strategy for specific waves
- `[P] Pause` — save state and exit

**HALT — wait for user response before proceeding.** On `[P]`: save per Pause Protocol (`currentCheckpoint: execution-strategy`).

---

## Per-Task Loop (Sequential)

### Task Start

```
═══ LAIM ═══ Feature: {name} │ Story {done}/{total}: {story-name} ═══
Task {t}/{T}: {task-name}
```

**Drift detection** — before any work: `git diff --name-only HEAD`. If changes found:

```
⚠ EXTERNAL CHANGES: {files}
[N] Not related  [R] Related (verify+commit)  [U] Unintentional (discard)
```

### Verification Chain

Read `${CLAUDE_SKILL_DIR}/VERIFY.md` for the full protocol. Execute in order: 0. Interface verification → 1. TDD decision → 2. Implementation → 3. Verification loop (fast tier: format→lint, then slow tier: build→test→test integrity→flaky detection→security; max 5 full cycles) → 4. Stub detection → 5. Behavioral evidence → 6. Goal-backward (EXISTS→NOT_STUB→CONNECTED)

### Change Detection

Before presenting the task checkpoint, determine whether this task produced file changes:

**CWD assertion:** Before any git operation, verify CWD is the project root (where `docs/state.json` lives). If CWD has drifted (e.g., into a subdirectory with its own `.git` from scaffolding tools like `npm create vite`), `cd` back to the project root first.

1. Run `git status --porcelain -uno` (tracked files only, ignores untracked/IDE autosave)
2. Check the task's planned output file list from the story file
3. Classify:
   - **Output files listed + git clean** → WARNING: "Expected changes to {files} but none found." Present full checkpoint.
   - **No output files listed + git clean** → Verification-only. Present stripped checkpoint.
   - **git status shows changes + task has output files** → Implementation task. Present full checkpoint.
   - **git status shows changes + no output files** → Auto-formatter fallback. Present full checkpoint with notice: "Verification produced {N} file changes (auto-format fixes). Review before committing."

### Task Checkpoint

```
═══ Task {t}/{T}: {task-name} — COMPLETE ═══

Verify: Format ✅ │ Lint ✅ │ Build ✅ │ Test ✅ (+{n}) │ Integrity ✅ │ Security ✅

IF changes exist:
  TDD: {Full/After}  │  Evidence: {type} ({confidence})
  Goal-backward: {n}/{total}  │  Stubs: {count or "✅ None"}  │  Flaky: {count or "✅ None"}
  Commit: {type}({scope}): {description}  │  Files: {list}
  Try: {2-4 manual verification steps derived from AC and changed files}
  IF no output files listed (auto-format fallback):
    ⚠ Verification produced {N} file changes (auto-format fixes). Review before committing.
  [C] Continue (commit + next)  [R] Revise  [U] Undo  [X] Change direction  [S] Skip  [P] Pause

ELIF output files listed AND git clean (WARNING):
  ⚠ Expected changes to {files} but none found.
  TDD: {Full/After}  │  Evidence: {type} ({confidence})
  Goal-backward: {n}/{total}  │  Stubs: {count or "✅ None"}  │  Flaky: {count or "✅ None"}
  [C] Continue (next)  [R] Revise  [X] Change direction  [S] Skip  [P] Pause

ELSE (verification-only):
  ✓ No file changes — verification only.
  Evidence: {type} ({confidence})
  [C] Continue (next)  [R] Revise  [X] Change direction  [S] Skip  [P] Pause
```

**HALT — wait for user response before proceeding.** On `[P]`: save per Pause Protocol (`currentCheckpoint: task-{t}` where `{t}` is the current task number).

**Pre-flight env check:** If `tooling.env_template` is set (e.g., `.env.example`) and no `.env` file exists in the project root, display: `⚠ Missing .env file — ${tooling.env_template} exists but .env does not. The app may fail at runtime. Create .env from the template before testing.` This is a warning, not a gate.

**Suggested manual verification:** Derive 2-4 concrete steps from the task's acceptance criteria and modified files (e.g., "Run the app and confirm the new endpoint returns expected data", "Check error handling for invalid tokens"). If `tooling.dev_server` is set, include: "Start `{tooling.dev_server}` and verify the app loads without errors at `localhost:{tooling.dev_port || common default}`." This is guidance, not a gate — the user can pick `[C]` immediately if confident. If no meaningful manual verification is derivable (infra tasks, config changes), omit this section.

**[R] Revise:**

1. Accept user feedback on what needs to change
2. Re-read the affected source files (do NOT rely on conversation context — always re-read from disk, even after compaction)
3. Apply the requested changes
4. Re-run the complete verification protocol per VERIFY.md (all steps 0-6: interface verification → TDD → implementation → verification loop including format/lint/build/test/test integrity/security → stub detection → behavioral evidence → goal-backward) — full re-verify, not a partial check
5. Re-run `git status --porcelain -uno` to detect whether revision produced file changes
6. Re-present the Task Checkpoint using Change Detection logic (variant may flip after revision)
7. **HALT again** — wait for user response. Revision loops until the user selects a different option.

**[S] Skip task:**

1. Mark task as `status: "skipped"` in state.json (NOT "done")
2. Do NOT commit anything for this task
3. Log skip reason to concerns.md: "Task {N} skipped: {user reason}"
4. Gate 5 impact:
   - Skipped tasks' AC mappings are UNVERIFIED — Gate 5 criterion 3 will flag them
   - User can [O] Override at Gate 5 (logged to concerns.md with HIGH severity)
5. Continue to next task

### On [C] Continue

Run `git status --porcelain -uno` to check for file changes.

**IF changes exist:**

```bash
git add {file1} {file2}    # NEVER git add .
git commit -m "{type}({scope}): {description}

Task {t}/{T}: {task-name}
AC: #{ac_nums}
Story: {story-id}"
```

**Commit conventions:**

- **type**: `feat` (new capability), `fix` (bug fix), `refactor` (restructure without behavior change),
  `test` (adding tests only), `docs` (documentation), `chore` (build/config/tooling)
- **scope**: The primary component or module affected (e.g., `auth`, `api`, `db`, `ui`).
  Use the component name from architecture.md. If multiple components: use the highest-level shared ancestor.
- **description**: Imperative mood, ≤72 chars, describes WHAT changed (not HOW)

Update state.json (task → done, `committed: true`). Update story checkbox `[x]`.

**ELSE (no changes — verification-only):**

Skip commit. Update state.json (task → done, `committed: false`). Update story checkbox `[x]`.

### Context Compaction

If `tasks.filter(done).length % 3 === 0` → compact state:

1. Write summary to `state.json` → `currentStory.taskSummary`:
   ```json
   {
     "compactedAt": "{ISO date}",
     "tasksCompleted": 3,
     "filesModified": ["src/foo.ts", "src/bar.ts"],
     "testsAdded": 5,
     "patternsEstablished": [
       "Error handling: AppError class with codes",
       "Tests: factory pattern in tests/factories/"
     ],
     "deviations": [
       "D-1: Rule 1 — renamed FooService to FooHandler per codebase convention"
     ],
     "verificationOnlyTasks": [3, 5],
     "openIssues": []
   }
   ```
2. Keep 2 most recent tasks in full detail in conversation context
3. Earlier tasks: reference summary only — do not re-read implementation details for forward progress. **Exception:** on `[R] Revise`, always re-read affected source files from disk regardless of compaction state.

**Note:** Verification-only tasks (committed: false) have empty `filesModified` and 0 `testsAdded` in the compaction summary. They are tracked in the `verificationOnlyTasks` array.

In Agent Teams mode, compaction is handled per-teammate automatically.
The lead collects taskSummary from each teammate at wave completion.

**Automatic compaction reminders:** The `suggest-compact.sh` hook (PreToolUse on Edit|Write)
tracks tool call count and suggests `/compact` at configurable thresholds
(default: 50, then every 25). Env vars: `COMPACT_THRESHOLD`, `COMPACT_REPEAT`.

**Post-compaction re-read:** If state.json has a `compacted` field, conversation context was lost. Before proceeding with the current task:

1. Re-read the current story file (`docs/stories/{currentStory}*.md`) — ACs, must_haves, verified interfaces
2. Re-read `docs/amendments.md` if it exists — architecture corrections from implementation
3. Delete the `compacted` field from state.json (write full file)
   The `laim-post-compact.cjs` hook sets this marker automatically after every compaction.

### Context Warning Protocol

If you receive a **CONTEXT WARNING** or **CONTEXT CRITICAL** message in your conversation (injected by the `laim-context-monitor.cjs` PostToolUse hook):

**On WARNING (between tasks):**

- Complete the current task checkpoint
- Suggest to user: "Context is getting limited. Recommend [P] Pause and resume with /start for fresh context."
- Do NOT start a new task unless the user explicitly approves

**On WARNING (mid-task):**

- Complete the current verification cycle
- Present the task checkpoint as normal
- Include context status in the checkpoint display

**On CRITICAL (at any point):**

- Save current progress to state.json immediately
- Present: "⚠ Context critically low. [P] Pause recommended. All progress is saved."
- HALT — wait for user response

**Opt-out:** Set `"contextWarnings": false` in `docs/state.json` to disable warnings for this project.

---

## Per-Task Loop (Sequential Subagents)

Fallback when Agent Teams is unavailable. One subagent per task, run in dependency order.

### Spawn + Execute

For each task in the wave (dependency order):

1. Read `${CLAUDE_SKILL_DIR}/PROMPTS.md` "Single Task Implementation Prompt" template
2. Extract `## Verified Interfaces` section from story file → pass as `{verified_interfaces_summary}`
3. Spawn one Task tool subagent with task details from story file
4. Subagent runs: TDD → implement → verify → stub → evidence → goal-backward → stage + report
5. Collect result → task checkpoint (same as Sequential loop above)
6. After each task: run `{tooling.test}` to confirm integration

### Wave Checkpoint

**Important:** Wave checkpoints always run the full `{tooling.test}` suite — never `{tooling.test_changed}`. This ensures cross-task integration is verified at wave boundaries.

```
═══ Wave {w}/{W} Complete ═══

| Task | Status | TDD  | Tests | Verify | Staged |
|------|--------|------|-------|--------|--------|
| T{n} | ✅     | Full | +{n}  | Pass   | {files}|

Integration: {tooling.test} → {total} tests passing
[C] Continue  [U] Undo tasks  [X] Change direction  [P] Pause
```

**HALT — wait for user response before proceeding.** On `[P]`: save per Pause Protocol (`currentCheckpoint: wave-{w}` where `{w}` is the current wave number).

**On [C] Continue:** Commit one-per-task from staged files:

```bash
# For each task in the wave (in order):
git reset HEAD                          # Clear staging area
git add {task_n_files}                  # Stage only this task's files
git commit -m "{type}({scope}): {description}

Task {t}/{T}: {task-name}
AC: #{ac_nums}
Story: {story-id}"
```

Update state.json for each task: `status: "done"`, `committed: true`. Only write `committed: true` after `git commit` succeeds. Update story checkboxes `[x]`.

---

## Per-Task Loop (Agent Teams)

Requires: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

### Team Setup

The main agent (running `/implement`) creates the team but does **NOT** act as lead.
The Agent Team has its own dedicated lead agent that coordinates the teammates.

1. Read `${CLAUDE_SKILL_DIR}/PROMPTS.md` "Agent Team Creation Prompt" for the full creation instructions
2. Populate the teammate prompt template (`${CLAUDE_SKILL_DIR}/PROMPTS.md` "Teammate Implementation Prompt") with task details from the story file:
   - Each task → one teammate
   - File ownership: each teammate owns ONLY its output files
   - Dependencies: task dependency graph from story
   - Verified interfaces: extract `## Verified Interfaces` section from story file → pass as `{verified_interfaces_summary}`
3. Create the Agent Team:
   - Spawn one teammate per task using the populated teammate prompts
   - The team's lead agent operates in **delegate mode** (coordination-only, must NOT write code)
   - The main agent steps back and waits for team completion

### Team Execution

The team's dedicated lead coordinates in **delegate mode**:

1. Assigns tasks via shared task list
2. Independent tasks start immediately in parallel
3. Dependent tasks wait for prerequisite completion
4. Teammates coordinate via messaging for shared interfaces
5. Each teammate runs: TDD → implement → verify → stub → evidence → goal-backward → stage + report
6. The main agent does NOT participate in execution — it waits for the team to finish

### Wave Checkpoint

**Important:** Wave checkpoints always run the full `{tooling.test}` suite — never `{tooling.test_changed}`. This ensures cross-task integration is verified at wave boundaries.

When all teammates complete:

```
═══ Wave {w}/{W} Complete ═══

| Teammate | Task | Status | TDD  | Tests | Verify | Staged |
|----------|------|--------|------|-------|--------|--------|
| T{n}-impl | T{n} | done | Full | +{n} | Pass | {files} |

Integration: {tooling.test} → {total} tests passing
Design Decisions: {count collected from teammates}

[C] Continue  [U] Undo tasks  [X] Change direction  [P] Pause
```

**HALT — wait for user response before proceeding.** On `[P]`: save per Pause Protocol (`currentCheckpoint: wave-{w}` where `{w}` is the current wave number).

**On [C] Continue:** Commit one-per-task from staged files (same as Sequential Subagents wave checkpoint above). Only write `committed: true` to state.json after each `git commit` succeeds.

### Fallback Chain

Agent Teams spawn fails → retry once → SEQUENTIAL-SUBAGENTS.
Subagent fails 3x → present to user for manual resolution (main agent NEVER implements directly without explicit user approval).

---

## Code Review

14. Spawn `.claude/agents/code-review-agent.md` via Task tool with ONLY: story file, `git diff pre-{feature}-{story-id}..HEAD`, state.json. Zero implementation context.

15. Present findings (0+ accepted; fewer than 3 requires Confidence Statement):

```
═══ Code Review: {story-id} ═══
| # | Category | Severity | Finding | Knowledge Gap | Fix |

If any findings have a non-empty Knowledge Gap:
═══ Retrospection ═══
| # | Knowledge Gap | Proposed Rule | Target File |
| 1 | {gap} | {1-line rule derived from gap} | retrospect/{lang}.md |

[C] Apply fixes  [L] Apply fixes + learn (add rules)  [R] Revise plan  [O] Override  [P] Pause

If no knowledge_gap findings:
[C] Apply fixes  [R] Revise plan  [O] Override  [P] Pause
```

**HALT — wait for user response before proceeding.** On `[P]`: save per Pause Protocol (`currentCheckpoint: code-review`).

**On [R] Revise plan:**

1. Accept user feedback on which findings to address differently or what implementation approach to change
2. Re-read affected source files from disk — specifically the files referenced in the review findings being addressed (do NOT rely on conversation context, even after compaction)
3. Apply the revised approach. If revision requires changing already-committed task work:
   - Use `git revert` for the affected task commits
   - Reset those tasks in state.json to `status: "pending"` and uncheck corresponding story file checkboxes `[ ]` (consistent with `[U] Undo`)
   - Re-implement and maintain one atomic commit per task (Gate 5 criterion 5)
4. Re-run the complete verification protocol per VERIFY.md for affected tasks
5. Re-spawn code-review-agent with the updated diff. Apply the "Validate review output" checks (minimum 3 findings, confidence statement) to the re-spawned agent's output before presenting
6. Re-present Code Review findings with the same options:
   `[C] Apply fixes  [R] Revise plan  [O] Override  [P] Pause`
7. **HALT again** — wait for user response.

**Validate review output:**

- 0+ findings are acceptable. Code review is NOT tier-gated.
- If findings count < 3 AND no confidence statement: retry agent with reinforced prompt:
  "Previous review returned {N} findings without a confidence statement. Either dig deeper
  or provide a confidence statement explaining your thoroughness."
- If retry returns <3 WITH confidence statement: present to user as-is.
- If retry returns <3 WITHOUT confidence statement: present warning to user:
  "⚠ Code review returned only {N} findings without a confidence statement. [C] Accept anyway [R] Request manual review"

**On [L] Apply fixes + learn:**

1. Apply code fixes (same as [C])
2. For each finding with a non-empty `knowledge_gap`:
   a. Derive target file from finding's file extension → `.claude/rules/retrospect/{lang}.md` (e.g., `.ts`/`.js` → `retrospect/typescript.md`, `.py` → `retrospect/python.md`, `.go` → `retrospect/go.md`)
   b. If finding is a universal pattern (no language-specific context) → `.claude/rules/retrospect/universal.md` (omit `paths:` so Claude Code loads it unconditionally; keep `alwaysApply: true` as a Cursor hint; capped at 10 rules). At cap: consolidate the two most similar existing rules into one, then append the new rule.
   c. `mkdir -p .claude/rules/retrospect/` — create or append to the target file with path-scoped frontmatter (Claude Code uses `paths:`; `globs:` kept alongside for Cursor interop):

   ```markdown
   ---
   paths:
     - "**/*.ts"
     - "**/*.js"
   globs: ["*.ts", "*.js"]
   alwaysApply: false
   ---

   # Retrospect — TypeScript

   ## [{ISO date}] {finding title}

   {knowledge_gap expressed as a rule the agent should follow}
   ```

   d. If target file exceeds 20 rules → consolidate/deduplicate older entries before appending

3. Proceed to step 16 (routing)

4. Route: Critical/High → fix immediately, re-verify. Medium → fix or defer → concerns.md. Low → fix if quick, else defer. `[architecture]` findings → `docs/amendments.md`.

---

**Mechanical task count (before Gate 5):** Read `/tmp/laim-tasks-{sessionKey}.json` (where `sessionKey` = first 16 hex chars of SHA-256 of the current working directory). The `laim-subagent-tracker.cjs` hook writes this file on every SubagentStop event (when a subagent completes). Use `impl + spawns` total to cross-check overall subagent activity. In Agent Teams mode, `impl` specifically tracks `T{n}-impl` teammates. In sequential mode, all completed subagents appear in `spawns` (agent_type is "general-purpose"). Use total to update `metrics.execution.subagentSpawns`. This count resets per story automatically (the hook detects `currentStory` changes).

## Gate 5 (per story)

| #   | Criterion                | Req | Check                                                                                                                                                                          |
| --- | ------------------------ | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Tests pass               | ✅  | `{tooling.test}` exits 0 (always full suite, never `test_changed`)                                                                                                             |
| 2   | Lint clean               | ✅  | `{tooling.lint}` exits 0                                                                                                                                                       |
| 3   | AC verified              | ✅  | Each AC → passing test(s)                                                                                                                                                      |
| 4   | No regressions           | ✅  | Test count ≥ baseline                                                                                                                                                          |
| 5   | Git history atomic       | ✅  | One commit per task, specific files (exempt: verification-only tasks with committed: false)                                                                                    |
| 6   | Behavioral evidence      | ✅  | Type-specific proof per task                                                                                                                                                   |
| 7   | Goal-backward pass       | ✅  | All must_haves: EXISTS+SUBSTANTIVE+WIRED                                                                                                                                       |
| 8   | Code review passed       | ✅  | 0+ findings (Confidence Statement if <3), Critical/High resolved                                                                                                               |
| 9   | NFR verification         | ✅  | Applicable NFRs verified                                                                                                                                                       |
| 10  | TDD >50%                 | ⚠️  | More than half used test-first                                                                                                                                                 |
| 11  | Zero discrepancies       | ⚠️  | No deviations from plan                                                                                                                                                        |
| 12  | No stubs                 | ⚠️  | Zero TODO/FIXME/HACK                                                                                                                                                           |
| 13  | No disabled tests        | ✅  | Zero @Disabled/@Skip/@Ignore in changed files (VERIFY.md §4)                                                                                                                   |
| 14  | Security scan            | ⚠️  | `{tooling.security}` clean                                                                                                                                                     |
| 15  | No assertion-free tests  | ✅  | Zero test files without assertions in changed files (VERIFY.md §4)                                                                                                             |
| 16  | No flaky tests           | ⚠️  | Zero entries in `flakyTests[]` across all tasks (VERIFY.md §3d.2)                                                                                                              |
| 17  | Integration tests        | ⚠️  | When story has AC-FLOW-\* or cross-story dependencies: ≥1 integration test spanning 2+ components (VERIFY.md §5 Integration type)                                              |
| 18  | Accessibility verified   | ✅  | UI stories: semantic HTML, ARIA labels, keyboard navigation, focus management (VERIFY.md §3f). Skip for non-UI stories.                                                        |
| 19  | Design system compliance | ⚠️  | When `docs/design-system.md` exists: components use documented tokens, follow cataloged patterns, implement all specified interaction states (loading, error, empty, disabled) |

```
═══ GATE 5: {PASS/FAIL} — {story-id} ═══
Required: 1-9, 13, 15, 18 ✅  Recommended: 10-12, 14, 16-17, 19 {status}
[A] Approve  [R] Revise  [O] Override  [P] Pause
```

**HALT — wait for user response before proceeding.** On `[P]`: save per Pause Protocol (`currentCheckpoint: gate-5`).

**On [R] Revise:**

1. Accept user feedback on which Gate 5 criteria to address
2. Re-read affected source files from disk — specifically the files relevant to the failing criteria (do NOT rely on conversation context, even after compaction)
3. Fix the failing or concerning criteria. If fixes involve source code changes, re-run code review (steps 14-15) for the new diff before re-evaluating Gate 5 — minor fixes (lint cleanup, doc additions) may skip re-review at user discretion
4. Re-run the full Gate 5 evaluation (all 19 criteria)
5. Re-present the Gate 5 results with the same options:
   `[A] Approve  [R] Revise  [O] Override  [P] Pause`
6. **HALT again** — wait for user response.

7. On pass: `git tag post-{feature}-{story-id}` → sprint-status.yaml → done → state.json → done.
8. Return to command for next story.

On override: append to `docs/concerns.md` using the standard override format (see Research skill Gate 1 for format definition), sprint-status: `gate5: override`.

**Inter-story baseline refresh (after Gate 5):**
Re-snapshot the test baseline at story boundaries to prevent stale baselines:

1. Run `{tooling.test}` and extract current failing test names (using `{tooling.test_report}`)
2. Compare current failures against `baselineTests.failingTests[]`:
   - Tests that were baselined but now PASS → remove from `failingTests` (they were fixed). Log: "Baseline updated: {N} previously-failing tests now pass."
   - Tests that were baselined and still FAIL → keep in `failingTests`
   - Tests that are NEW failures → these are integration regressions (handled below)
3. Update `baselineTests`: new totals, updated `failingTests[]`, set `lastRefreshedAt: "{ISO date}"`, `lastRefreshedAtStory: {storiesDone}`. Update `baselinedAtStory` if reassessment occurred.
4. **Periodic full review (includes security):** Every 5 stories (`storiesDone % 5 === 0` and `baselineTests.failing > 0`), present unified review with security-sensitive tests marked:

   ```
   📋 BASELINE REVIEW (story {storiesDone})
   {N} tests baselined since story {baselinedAtStory} ({days} days ago):
   - {test name} 🔒  ← (🔒 only if in securitySensitive[])
   - {test name}
   - {test names, truncated to 10}

   [K] Keep all  [R] Reassess — re-run and re-triage  [F] Fix now
   ```

   **HALT — wait for user response.**
   On [K]: proceed. On [R]: re-run tests, re-present `[I]/[F]/[A]` triage for any still-failing tests. On [F]: pause for user to fix, then [R] Re-run.

5. **Staleness warning:** If `max(baselineTests.baselinedAt, baselineTests.lastRefreshedAt)` is >30 days old AND `failingTests` non-empty:
   ```
   ⚠ STALE BASELINE ({days} days old)
   {N} tests baselined on {date} have not been reassessed.
   Consider running [R] Reassess to verify these failures are still expected.
   ```
   This warning is informational (no HALT) — appended to checkpoint display.

**Inter-story integration check (after baseline refresh):**
If this is NOT the first story (`storiesDone > 0`):

1. Run full test suite: `{tooling.test}` (reuse results from baseline refresh if just executed)
2. Compare against cumulative baseline (all stories so far)
3. If new failures detected:

   ```
   ⚠ INTEGRATION REGRESSION
   {N} tests failing that passed after previous story.
   Likely cause: Story {current} conflicts with prior work.

   [F] Fix — investigate and resolve conflicts
   [R] Rollback — revert this story
   [D] Defer — log to concerns.md, continue
   ```

4. **Build verification:** Run `{tooling.build}` after integration test.
   Typed languages catch parameter/signature mismatches at compile time.
   If build fails with type or signature errors → route to `[X] Change Direction` (likely cross-story interface mismatch).

---

## Change Mechanisms

### [U] Undo — Rollback

```
Task history:
  ✅ T1: {name} ({sha})  ✅ T2: {name} ({sha})  🔄 T3: {name}
[1] Discard T3  [2] Rollback to T1  [3] Rollback all  [B] Back
```

For committed tasks: git revert → state.json reset → story checkboxes unchecked.
For staged-but-uncommitted tasks: `git reset HEAD` → state.json reset → story checkboxes unchecked.

### [X] Change Direction

User describes concern → impact analysis table:

```
| Task | Status | Impact | Action |
On accept: amend story → rollback affected → resume.
```

**Cross-story impact check:**
After the user describes their concern, check if completed stories are affected:

- Read `docs/sprint-status.yaml` → identify stories with `status: done`
- Check if the change touches files or patterns from completed stories
- If cross-story impact detected:

  ```
  ⚠ CROSS-STORY IMPACT DETECTED

  | Story | Status | Impact |
  |-------|--------|--------|
  | {id}  | done   | {description} |

  [1] Change Story (CS-*) — create a refactoring story for affected code
  [2] Forward-only — keep existing code, change approach going forward
  [3] Full replan — return to Plan phase
  [4] Cancel — find a different solution
  ```

- **Option [1] — Change Story:**
  1. Create `docs/stories/CS-{N}-{slug}.md` using story-creator-agent
  2. CS-\* stories get full verification chain (TDD → verify → review → Gate 5)
  3. Additional constraint: ALL original ACs from affected stories must still pass
  4. Insert CS-\* into sprint-status.yaml:
     - `wave`: same wave as the triggering story
     - `dependencies`: [triggering story ID]
     - `status`: ready-for-dev
  5. After CS-\*: affected story files get `## Superseded By: CS-{N}` note
  6. Remaining stories regenerated if architecture changed

- **Option [2] — Forward-only:**
  Log as HIGH tech debt in `docs/concerns.md`. Document the divergence.

### Drift Detection

At task start: `git diff --name-only HEAD`. External changes → `[N] Not related / [R] Related / [U] Unintentional`.

---

## Deviation Rules

| Rule | Trigger                        | Action                                                                      |
| ---- | ------------------------------ | --------------------------------------------------------------------------- |
| 1    | Minor (naming, style)          | Auto-fix + log                                                              |
| 2    | Moderate (pattern, dependency) | Auto-fix + log + checkpoint note                                            |
| 3    | Significant (interface change) | Fix + amendment (`docs/amendments.md`)                                      |
| 4    | Architectural (new component)  | **HALT — wait for user response before proceeding.** User approval required |

---

## Error Recovery

| Scenario                 | Options                                                  |
| ------------------------ | -------------------------------------------------------- |
| Dirty git on resume      | `[S]`tash / `[C]`ommit-wip / `[R]`eview / `[D]`iscard    |
| Verification 5x fail     | `[R]`etry / `[S]`kip / `[A]`bort / `[H]`elp              |
| 3 consecutive task fails | `[F]`ix root / `[M]`Amend arch / `[R]`ollback / `[S]`top |
| Agent spawn fails        | Retry once → present to user                             |
| State.json corrupt       | Reconstruct from sprint-status + git log + checkboxes    |

### Agent Teams Specific Issues

**Teammate not responding:**
Team lead should handle; if lead unresponsive, recreate team.

**File conflict detected:**
Lead coordinates reassignment to single owner.

**Lead not coordinating (implementing directly):**
Recreate team with clearer instructions, or fall back to sequential subagents.

**Agent Teams unavailable:**
Fall back to SEQUENTIAL-SUBAGENTS. Show env var hint.

**NEVER:** Pre-load all upstream docs at story start • Skip verification • Use `git add .` • Push to remote (unless user explicitly requests) • Skip review • Proceed without user approval at HALT points • Run git commands from a subdirectory with its own .git
**ALWAYS:** Story file as primary context (read upstream docs only when story file is insufficient) • Full verify per task • Atomic commits • Status bar • Track deviations • Compact every 3 tasks
