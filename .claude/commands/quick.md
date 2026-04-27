---
description: "Quick flow — for known-scope work (bug fixes, enhancements, refactors). Same verification quality as full flow."
paths: [".claude/.laim-manifest.json", "docs/state.json"]
---

# /quick — Quick Flow Orchestrator

3-step workflow for known-scope changes in existing codebases. Same verification chain as `/start`
(TDD, verify, review, Gate 5) — compresses planning into Step 2 (Quick-Spec).

> **Step artifact discipline:** Every step produces an artifact on disk. A step cannot begin until the prior step's artifact exists. Prior conversation context is not a substitute for a file that downstream tooling reads from disk.

> **Path resolution:** All `.claude/skills/` and `.claude/agents/` paths below are relative to the project root or `~/`. If a file is not found at `.claude/skills/...`, check `~/.claude/skills/...` (global install).

## 1. Parse Input

`/quick {name}` or `/quick {description}` — derive lowercase hyphenated slug.

Auto-classify task type from description:

| Signal                                   | Type          |
| ---------------------------------------- | ------------- |
| "fix", "bug", "broken", "error", "crash" | `bug-fix`     |
| "add", "feature", "support", "enable"    | `enhancement` |
| "refactor", "rename", "extract", "clean" | `refactor`    |
| "config", "setting", "env", "update dep" | `config`      |

If description is ambiguous, default to `enhancement`. Confirm slug and type with user.

## 2. Prerequisites

### 2a. Existing Codebase Required

Check for source files (`*.ts`, `*.js`, `*.go`, `*.py`, `*.rs`, `*.java`, `*.kt`). If none found:
`No existing codebase detected. Use /start for greenfield.` — redirect.

### 2b. Greenfield Conflict Check

If `docs/state.json` exists with `"flow": "greenfield"`:

```
Active greenfield: {feature} (Phase {N}/5 — {phase name})

[Q] Quick anyway — creates separate .quick-state.json
[R] Resume greenfield — /start {feature}
[C] Cancel
```

On [Q]: all state operations use `docs/.quick-state.json` instead of `docs/state.json`.
On [R]: hand off to `/start {feature}`.

### 2c. Existing Quick Flow Check

**Existing quick flow check:**

- If `docs/state.json` exists with `"flow": "quick"` and a different feature slug:
  ```
  Active quick task: {feature-name}
  [F] Finish first — resume existing quick task
  [R] Replace — abandon existing, start new (state lost)
  [C] Cancel
  ```
- If same slug: resume existing quick task

**Lock check:**

- When using `.quick-state.json` (greenfield active), all lock operations use `docs/.quick-lock` instead of `docs/.lock`.
- Check for non-stale lock file, offer [W] Wait / [T] Take over / [C] Cancel

### 2d. Initialize

Generate state file: run `node .claude/scripts/init-state.js {slug} quick analyze` to produce the complete schema. Write the output to `docs/state.json` (or `docs/.quick-state.json` if greenfield active) using the Write tool. Then populate `tooling` fields from detection results.

> state.json writes validated by hook (`validate-state.sh`) — structure, timestamps, completeness. Use Write tool (full file), never Edit.
> Create lock file with timestamp + session-id: use `docs/.quick-lock` when greenfield active (i.e., using `.quick-state.json`), otherwise `docs/.lock`.

## 3. Step 1/3 — Analyze

```
═══ LAIM QUICK ═══ Task: {name} │ Step 1/3: Analyze ═══
```

### Intake

Understand what the user wants to change. If the description is vague, ask 1-2 focused
clarifying questions, then proceed. This caps clarifying-question frequency only — it does
not permit skipping §4 (Quick-Spec), its artifact, or the §5 Step 3 entry precondition.

After intake, ask: "Do you have a reference document for this task? (file path)"
If the user provides a path:

1. Read the document. Detect: numbered tasks? file lists? acceptance criteria? constraints?
2. If structured plan detected (numbered tasks with file paths):
   → `mkdir -p docs/user-context/` and copy the file there
   → Pre-populate the quick-spec from the document (tasks, ACs, affected files, constraints)
   → Present: "Imported {N} tasks, {M} ACs, {K} constraints from {filename}. [C] Continue [E] Edit [P] Pause"
   → **HALT — wait for user response.** On [P]: remove lock file, display: `Session paused. Resume with /quick.`
3. If unstructured: copy to `docs/user-context/` for reference, generate quick-spec normally using the document as context.

### Scope Guard

Fires when **≥2** triggers hit simultaneously: new DB table, new bounded context/service, new API namespace/version, new auth flow.

If ≥2: `⚠️ Scope Guard: {triggers}. [C] Continue (override logged)  [F] Switch to /start  [R] Revise scope`
On [C]: log to concerns.md. On [F]: hand off to `/start`.

**Scale guard** (independent of scope guard — checks volume, not architecture):
If affected files >20 OR distinct packages >3:

```
⚠ Large scope: {N} files across {M} packages.
This is fine for well-planned work with a reference document.
[C] Continue with /quick
[S] Switch to /start (adds architectural review and persona validation)
```

**HALT — wait for user response.** This warns without forcing — user with a detailed plan continues, user without a plan may switch.

### Investigate (bug-fix only)

If task type is `bug-fix`, investigate root cause before codebase discovery:

1. **Reproduce:** Identify the failing behavior. Run the relevant test if one exists, or describe the reproduction steps from the user's report.
2. **Trace:** Starting from the symptom, trace the code path backward to the root cause. Use Grep/Glob to follow the call chain.
3. **Root cause:** Write a 1-2 sentence statement: "The bug occurs because {X} in {file}:{line} does {Y} when it should do {Z}."
4. **Scope:** Identify ALL files that need to change for a proper fix (not just the symptom file).

Present to user before proceeding:

```
Root cause: {statement}
Affected files: {list}
[C] Continue — accept root cause
[R] Re-investigate — wrong root cause
```

**HALT — wait for user response.** Include the confirmed root cause and affected files in the quick-spec's `## Change Description` section.

**Skip if:** user already provided root cause analysis in their description, OR task type is not `bug-fix`.

### Codebase Discovery (Iterative Retrieval)

**Cycle 1 — Broad:** `grep -rl`, `find -name`, `git grep` across src. Score files by relevance.
**Cycle 2 — Refined:** Read top 5-10 files, follow import chains 1 level deep, note boundaries.
**Extract conventions:** Import style, error handling pattern, test organization, naming conventions.

### Tooling Detection

Run the detection script: `bash .claude/scripts/detect-tooling.sh` — use output to populate state.json `tooling` block. If script unavailable, same manual fallback as `/start` §4. If test/build not detected → ask user.

**Phase transition:** Update state: `currentPhase` → `spec`, `lastUpdated` → now.

## 4. Step 2/3 — Quick-Spec

```
═══ LAIM QUICK ═══ Task: {name} │ Step 2/3: Spec ═══
```

Auto-generate `docs/quick-{slug}.md` with this structure:

```markdown
---
status: ready
type: { bug-fix|enhancement|refactor|config }
created: { date }
---

# Quick: {name}

## Change Description

{What and why — 2-5 sentences}
{For bug-fix: include "**Root cause:** {X} in {file}:{line} does {Y} when it should do {Z}."}

## Affected Files

- `{path}`: {what changes}

## Acceptance Criteria

### AC-1: {title}

Given {context} / When {action} / Then {outcome}

## Constraints (optional — from user document or intake)

{Extracted from user's document or stated during intake. Omit section if none.}

- {constraint} [LOCKED]

## Tasks (optional — from imported document)

{If a structured document was imported, tasks are pre-populated here with dependencies.
If no document imported, omit this section — the implement skill auto-decomposes.}

- [ ] Task 1: {description}
  - AC: {refs}
  - Files: {list}
  - Depends: none
- [ ] Task 2: {description}
  - AC: {refs}
  - Files: {list}
  - Depends: Task 1

## must_haves

truths: ["{behavioral assertions}"]
artifacts: ["{file paths that must exist}"]
key_links: ["{grep-able patterns proving wiring}"]

## Detected Conventions

{Import style, error handling, test location, naming — from discovery}
```

**Completeness check:** Before presenting, compare the user's original description (from §3 intake) against the generated quick-spec. List every distinct capability or fix the user described, then verify each has ≥1 acceptance criterion in the quick-spec. If any are missing, include a warning in the presentation:
```
⚠ Completeness: {N} of {M} requested items covered.
Missing: {list of uncovered items}
```
This is informational — the user decides via [R] Revise whether to add them or proceed without.

Present to user: `[C] Continue to implement  [R] Revise  [P] Pause`
On [R]: incorporate feedback, regenerate. On [C]: update state `currentPhase` → `implement`, `quickSpec` → path, proceed. On [P]: remove lock file (`docs/.quick-lock` if greenfield active, otherwise `docs/.lock`). Display: `Session paused. Resume with /quick.`

## 5. Step 3/3 — Implement

**Entry precondition:** Before printing the Step 3 banner, verify `docs/quick-{slug}.md` exists on disk. If missing, halt and return to §4 (Quick-Spec) — do not substitute prior conversation context for the file. The implement skill reads the quick-spec directly from disk.

```
═══ LAIM QUICK ═══ Task: {name} │ Step 3/3: Implement ═══
```

1. Update state: `currentPhase` → `implement`
2. **Baseline test snapshot:**
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

      On [I]: `baselineTests: { total: N, passing: P, failing: F, preExisting: true, failingTests: ["{test.class.method}", ...] }`
      Parse test runner output for individual test names. If runner doesn't provide names, store empty array and log: "test names unavailable — baseline comparison will use count only."
      Gate 5 criterion 1 becomes: "no NEW test failures beyond baseline"
      On [F]:
      1. Display the failing test output so the user can see what needs fixing
      2. Pause — the user fixes pre-existing failures manually (outside LaiM)
      3. Present:
         ```
         [R] Re-run baseline — check if failures are resolved
         [I] Ignore — track remaining failures as baseline and continue
         ```
         **HALT — wait for user response.**
      4. On [R]: re-run `{tooling.test}`, check results
         - All pass → `baselineTests: { total: N, passing: N, failing: 0 }` → continue
         - Still failing → show updated failure output, loop back to step 3
      5. On [I]: treat as the [I] path above (track as baseline)
         On [A]: remove lock file, display `Quick flow aborted.` — stop.

   4. If test runner errors (no test infrastructure): `baselineTests: { total: 0, passing: 0, failing: 0, noInfra: true }`
      Gate 5 criterion 1: skip with note "no test infrastructure"

3. **Route:** Invoke the `/implement` skill. Pass `docs/quick-{slug}.md` as story input — implement skill treats it identically: TDD → verify → stub detection → evidence → goal-backward → review → Gate 5.
4. On Gate 5 pass: proceed to §5.5 (Manual Verification). On fail: follow implement skill's escalation.

## 5.5. Manual Verification

After Gate 5 pass, before completion. Update state: `currentCheckpoint` → `manual-verify`.

1. Read `docs/quick-{slug}.md` → extract `## Acceptance Criteria` section.
2. Present as a test checklist:

```
═══ LAIM QUICK ═══ Manual Verification ═══

AC-derived checks:
□ {AC-1 summarized as a test step}
□ {AC-2 summarized as a test step}
{if task type is bug-fix:}
□ Verify the original bug no longer reproduces

[S] Satisfied — proceed to completion
[I] Issue found — describe and fix
[P] Pause
```

**HALT — wait for user response.**

On [P]: save per Pause Protocol (`currentCheckpoint: manual-verify`).

**On [I] — fix cycle (max 3):**

1. User describes the issue.
2. Agent re-reads affected source files from disk (do NOT rely on conversation context).
3. Agent fixes the issue, re-runs verification chain (format → lint → build → test), spawns code-review-agent on the fix diff (`git diff HEAD~1`). If review finds Critical/High → fix before committing. Commits:
   `git commit -m "fix({slug}): {1-line description}"`
4. Re-present this HALT.
5. After 3 fix cycles, if user selects [I] again:

```
═══ LAIM QUICK ═══ Manual Verification — scope limit ═══
3 fix cycles completed. Remaining issues may need a separate task.

[S] Accept current state — proceed to completion
[N] New task — archive this, then start /quick for remaining issues
[P] Pause
```

**HALT — wait for user response.**
On [N]: proceed to §6 Completion (which archives), then display: `Start a new /quick for the remaining issues.`

**On [S]:** proceed to §6 Completion.

## 6. Completion

```
═══ LAIM QUICK ═══ Complete: {name} ═══
Type: {type}  │  Tasks: {N}  │  TDD: {rate}%
Tests: {baseline} → {current} ({delta})
All acceptance criteria verified. ✅

[D] Done — archive artifacts and finish
[R] Retrospect — review learnings before archiving (shown when concerns.md exists or findings were deferred)
[P] Pause
```

**HALT — wait for user response.** Do NOT proceed without user selecting [D].

**On [R] Retrospect:** Invoke the `/retrospect` skill. Pass `docs/concerns.md` and the state file as inputs. After retrospection completes, return to this HALT with `[D]` and `[P]`. Retrospection must run before archival.

- Remove lock file (`docs/.quick-lock` if greenfield active, otherwise `docs/.lock`)
- Update state: `currentPhase` → `complete`, final metrics
- **On [D]: Archive artifacts:** `mkdir -p docs/.archive-{feature-slug}/` and move the state file (`state.json` or `.quick-state.json`), `quick-{slug}.md`, and `user-context/` (if exists) into `docs/.archive-{feature-slug}/`. Do NOT skip this step.

## 7. Resume

On re-invocation with same name, read state file. If state has `recovery.interrupted === true`, display:

```
⚠ PREVIOUS SESSION INTERRUPTED
Error: {recovery.errorType} at {recovery.interruptedAt}
{if recovery.uncommittedChanges: "⚠ Uncommitted changes detected — review `git diff` before proceeding."}

[C] Continue — acknowledge and resume normally
[D] Diff — show uncommitted changes before deciding
```

**HALT — wait for user response.** On [C] or after [D] review: delete the `recovery` field from state file (write full file), proceed to normal resume.

If no `recovery` field, present:
On re-invocation with same name, re-acquire lock file (`docs/.quick-lock` if greenfield active, otherwise `docs/.lock`) with fresh timestamp, then read state file and present:

```
═══ LAIM QUICK ═══ Resuming: {name} │ Step {n}/3 ═══
Last activity: {lastUpdated}
[C] Continue from here  [R] Restart  [P] Pause
```

On [P]: remove lock file, display: `Session paused. Resume with /quick.`

Route by `currentPhase`:
| `currentPhase` | Route to |
|----------------|----------|
| `analyze` | §3 (Analyze) |
| `spec` | §4 (Quick-Spec) |
| `implement` | §5 (Implement) — resume at `currentTask`. If `currentCheckpoint` is `manual-verify` → §5.5 (re-present test checklist) |
| `complete` | Show completion summary |

## 8. Context Window & Restart

If context degrades during a long implement step, the user can start a fresh conversation and re-invoke `/quick {name}`. The framework detects the existing state and quick-spec, and resumes from the current task checkpoint. See `/start` §9 for full context window documentation.

## 9. Error Handling

**Corrupted state:** Reconstruct from available sources:

1. `docs/quick-{slug}.md` exists → resume from implement step
2. git log for recent commits → infer task progress
3. Present reconstructed state → user confirms before proceeding

**Stale lock (>4h):** Auto-break with notice, same as `/start`.

**State/artifact mismatch:** If state says `implement` but quick-spec missing → re-run from analyze.
