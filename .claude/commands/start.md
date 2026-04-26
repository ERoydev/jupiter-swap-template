---
description: "Start or resume a feature development workflow. Routes through Research → Specify → Architecture → Plan → Implement with quality gates."
paths: [".claude/.laim-manifest.json", "docs/state.json"]
---

# /start — Greenfield Orchestrator

5-phase lifecycle: initialize features, detect existing work, route through gates, manage story loop.
For bug fixes and small changes, suggest `/quick` instead.

> **Path resolution:** All `.claude/skills/` and `.claude/agents/` paths below are relative to the project root or `~/`. If a file is not found at `.claude/skills/...`, check `~/.claude/skills/...` (global install).

## 1. Parse Input

`/start {name}` — derive lowercase hyphenated slug (2-50 chars, no special chars beyond hyphens).
If sentence given, derive slug: "Build a user settings page" → `user-settings`. Confirm derived names.
`/start {name} --context {path}` — same as above, plus copy the file at `{path}` into `docs/user-context/` (`mkdir -p docs/user-context/` first). The Research phase will discover and consume it.
`/start` alone — scan for `docs/state.json`; if found offer resume, else ask what to build.

## 2. Scan for Existing Work

**Lock check (before state):**

- If `docs/.lock` exists and is NOT stale (<4h):
  ```
  ⚠ Active session detected (started {time})
  [W] Wait — check again in a moment
  [T] Take over — break lock and proceed
  [C] Cancel
  ```
- If stale (>4h): "Stale lock from {time}. Taking over." → auto-break
- If no lock → proceed normally

Check `docs/state.json`. If state.json is missing or fails to parse, follow the reconstruction protocol in §10 (Error Handling).

### Recovery Check

After reading state.json, before the resume flow:

1. Check if state.json has a `recovery` field with `recovery.interrupted === true`
2. If found, display:

   ```
   ⚠ PREVIOUS SESSION INTERRUPTED
   Error: {recovery.errorType} at {recovery.interruptedAt}
   {if recovery.uncommittedChanges: "⚠ Uncommitted changes detected — review `git diff` before proceeding."}

   [C] Continue — acknowledge and resume normally
   [D] Diff — show uncommitted changes before deciding
   ```

   **HALT — wait for user response.**

3. On [C] or after [D] review: delete the `recovery` field from state.json (write full file), proceed to normal resume flow
4. If no `recovery` field → proceed to normal resume flow

### Same Feature → RESUME

1. Read state.json → extract `currentPhase`, `currentStep`, `currentCheckpoint`, `currentStory`
2. Cross-reference artifacts: check frontmatter `status: complete` on research.md, spec.md, architecture.md, plan.md. Cross-check story files with sprint-status.yaml.
3. Update metrics: `metrics.execution.totalSessions += 1`
4. If dirty git — **use `AskUserQuestion`** (single-select):
   - `[S] Stash` — stash changes, resume clean
   - `[C] Commit-wip` — commit as work-in-progress
   - `[R] Review diff` — show changes before deciding
   - `[D] Discard` — discard all uncommitted changes
5. Present resume:
   ```
   ═══ LAIM ═══ Resuming: {feature} ═══
   Phase: {N}/5 ({name})  │  Story: {done}/{total}  │  Task: {t}/{T}
   Last activity: {lastUpdated}
   [C] Continue from here  [R] Restart current phase  [P] Pause
   ```
   On [P]: follow §5.5 Universal Pause Protocol (remove `docs/.lock`, update state.json, display pause message).
6. **Artifact integrity check (on resume):**
   When resuming, verify key artifacts haven't been modified externally:
   1. Compare artifact file modification times against state.json.lastUpdated
   2. If any planning artifact (research.md, spec.md, architecture.md, plan.md) was modified AFTER the phase completed:

      ```
      ⚠ ARTIFACT MODIFIED EXTERNALLY
      Modified: docs/spec.md (changed {time} — phase completed {time})

      [A] Accept changes — proceed with modified artifact
      [R] Revert — restore from git (git checkout docs/spec.md)
      [D] Diff — show what changed
      ```

7. **Orphaned `currentStory` check (on resume):**
   If state.json has `currentStory` with a `storyId`, verify the corresponding story file exists on disk (`docs/stories/{storyId}*.md`). This catches the state-says-in-progress-but-file-never-created case from issue #222 Incident 1.

   If the story file is missing:

   ```
   ⚠ ORPHANED currentStory
   state.json says story {storyId} is {status}, but docs/stories/{storyId}*.md does not exist.
   Likely cause: prior session recorded story start but crashed before creating the file,
   or the file was deleted externally.

   [R] Recreate — clear currentStory to null, return to the story picker (fresh entry into the story loop)
   [C] Continue — keep currentStory; `/implement` will proceed to Story Creation under the same ID
   [D] Diff — show `git log -- docs/stories/` to see what happened before deciding
   ```

   **HALT — wait for user response before proceeding to step 8.** On `[R]`: clear `currentStory` and `currentCheckpoint` to `null` in state.json, update `lastUpdated` per the timestamp capture protocol (`date -u +%Y-%m-%dT%H:%M:%SZ`), proceed. On `[C]`: proceed without changes — `/implement` handles the no-story-file case. On `[D]`: run `git log --oneline -- docs/stories/` and re-present the prompt.

8. **Re-acquire lock:** Create `docs/.lock` with fresh timestamp + session identifier (same as §5 step 3). This protects the resumed session from concurrent access.
9. Route to correct skill at correct step (see §6 Routing Table)

### Different Feature Found

```
Active: "{existing}" — requested: "{new}"
[R] Resume existing
[A] Archive existing + start fresh (replaces current)
[W] Worktree — start in parallel (preserves both)
[C] Cancel
```

On [A]: `mv docs/ docs/.archive-$(date +%Y%m%d-%H%M%S)/`, recreate `docs/` and `docs/stories/`.
On [W]: Display worktree commands for the user to run:

```
git worktree add ../{project-name}-{new-slug} -b feature/{new-slug} main
cd ../{project-name}-{new-slug} && claude
# Then run: /start {new-feature}
```

Note: `docs/` in the new worktree is independent — no conflict with current feature. Complete features get archived (§8), keeping merge-back clean.

### No State Found → Fresh Start

If `docs/.archive-*/` directories exist, inform the user: `Previous features archived: {list of archive slugs}. Starting fresh.`

Proceed to §3.

## 3. Scope Check

If description suggests known-scope work ("fix", "bug", "refactor", "config", "tweak", "rename",
"small change", "update") — **use `AskUserQuestion`** (single-select):

```
This might fit /quick — same verification chain (TDD, lint, build, test,
security, code review, Gate 5), skips planning phases.

[Q] Switch to quick — hand off to /quick {name}, skip planning phases
[F] Full flow — proceed with all 5 phases
```

If [Q]: hand off to `/quick {name}`. If clearly complex or [F]: proceed.

## 4. Detect Tooling

Run the detection script: `bash .claude/scripts/detect-tooling.sh` — outputs JSON with `format`, `lint`, `lint_fix`, `build`, `test`, `test_changed`, `test_report`, `security`, `css_framework`, `dev_server`, `dev_port`, `env_template`, `accessibility_lint` fields. Use the output to populate state.json `tooling` block.

If the script is not available, scan project files manually as fallback:

| File                                              | Detects                                                  |
| ------------------------------------------------- | -------------------------------------------------------- |
| `package.json` scripts                            | npm/node: build, test, lint, format                      |
| `go.mod` + config                                 | go build/test, golangci-lint                             |
| `Cargo.toml`                                      | cargo build/test/clippy                                  |
| `Makefile` / `Justfile`                           | make/just targets                                        |
| `pyproject.toml` / `requirements.txt`             | pytest, ruff, black                                      |
| `build.gradle` / `build.gradle.kts`               | `./gradlew build`, `./gradlew test`, checkstyle/spotless |
| `pom.xml`                                         | `mvn compile`, `mvn test`, checkstyle/spotbugs           |
| Linter configs (`.eslintrc*`, `biome.json`)       | Confirm lint tool                                        |
| Test configs (`vitest.config.*`, `jest.config.*`) | Confirm test runner + `test_changed`                     |
| Test runner type                                  | Detect `test_report` format (see below)                  |

**CI/CD detection:**
Scan for CI/CD configuration:

- `.github/workflows/` → GitHub Actions
- `.gitlab-ci.yml` → GitLab CI
- `vercel.json` or `.vercel/` → Vercel
- `netlify.toml` → Netlify
- `Jenkinsfile` → Jenkins
- `.circleci/` → CircleCI

If found:

```
⚠ CI/CD DETECTED: {provider}
Commits may trigger automated builds/deployments.

Recommendation: Work on a feature branch to avoid partial deployments.
Current branch: {branch}

[B] Create feature branch (git checkout -b feature/{slug})
[C] Continue on current branch (I understand the risk)
```

**`test_changed` auto-detection** (for per-task verification — full `test` always runs at wave checkpoints and Gate 5):

- `jest` detected → `"jest --changedSince=HEAD~1"`
- `vitest` detected → `"vitest --changed HEAD~1"`
- `pytest` detected → `null` (no built-in changed-file mode)
- `go test` detected → `null`
- `gradle` detected → `null` (`--tests` filters by class name, not changed files)
- `mvn` detected → `null` (`-Dtest=` filters by class name, not changed files)
- If not detected or unsupported → `null` (falls back to `tooling.test`)

**`test_report` auto-detection** (for mechanical test name extraction in baseline comparison):

- `jest` detected → `"jest-json"` — run with `--json`, extract `.testResults[].assertionResults[]` where `status === "failed"` → `{ancestorTitles.join(' > ')} > {title}`
- `vitest` detected → `"vitest-json"` — run with `--reporter=json`, same extraction as jest-json
- `pytest` detected → `"junit-xml"` — run with `--junitxml=test-results.xml`, parse `<testcase classname="..." name="...">`
- `go test` detected → `"go-test-json"` — run with `-json`, parse lines where `"Test"` key exists and `"Action": "fail"`
- `cargo test` detected → `"cargo-test"` — parse `test {name} ... FAILED` lines from stderr
- `junit` (Java/Kotlin via Maven/Gradle) detected → `"junit-xml"` — parse `target/surefire-reports/*.xml` or `build/test-results/**/*.xml`
- `.NET` (`dotnet test`) detected → `"trx"` — run with `--logger trx`, parse `.trx` XML
- If not detected → `null` (baseline comparison falls back to count-only mode)

Present detected tooling table — **use `AskUserQuestion`** (single-select):

- `[C] Continue` — accept detected tooling as-is
- `[E] Edit commands` — review and override detected commands

If test or build not detected → ask user for commands explicitly.

## 5. Initialize

1. `mkdir -p docs/ docs/stories/`
   Ensure `docs/.lock` and `docs/.quick-lock` are gitignored: if `.gitignore` doesn't already contain `docs/.lock` (create `.gitignore` if it doesn't exist), append:
   ```
   docs/.lock
   docs/.quick-lock
   ```
2. Generate `docs/state.json`: run `node .claude/scripts/init-state.js {slug} greenfield research` to produce the complete schema. Write the output to `docs/state.json` using the Write tool. Then populate `tooling` fields with detection results from §4.

   > state.json writes validated by hook (`validate-state.sh`) — structure, timestamps, completeness. Use Write tool (full file), never Edit.

   ### Metrics Write Reference

   Before writing to `metrics.*` in state.json, read `templates/references/metrics-triggers.md` for the full list of fields and their exact triggers.

3. Create `docs/.lock` with current timestamp + session identifier
4. Branch check: if on `main` and `docs/state.json` already tracks a different feature → warn

```
═══ LAIM ═══ Starting: {feature} ═══
Research → Specify → Architecture → Plan → Implement
Agent Teams: {Enabled / Not enabled}
[C] Begin Phase 1: Research  [P] Pause
```

On [P]: follow §5.5 Universal Pause Protocol (remove `docs/.lock`, update state.json, display pause message).

## 5.5 Universal Pause Protocol

When a user selects `[P] Pause` at any HALT point in any skill:

1. **Write artifact** with `status: paused` and the skill's pause field (e.g., `pausedStep`, `current_stage`, `current_step`) set to the exact value from the skill's state table. Never invent suffixes like `-approved` or use descriptive sentences.
2. **Update state.json** (root-level fields, NOT inside `phases.*`):
   - Set `currentStep` (or `currentCheckpoint` for implement phase) to the state value from the skill's table.
   - Update `lastUpdated` to the current ISO timestamp.
   - Update metrics: `metrics.execution.pauseResumeCount += 1`
3. **Release lock:** Remove `docs/.lock` (or `docs/.quick-lock` for `/quick` flows). Pause is an intentional clean exit — locks detect crashed sessions, not deliberate pauses.
4. **Display:** `Session paused at {step name}. Resume with /start.`

**On resume** (when a skill detects `status: paused` in its artifact):

1. Read root-level `currentStep` (or `currentCheckpoint`) from state.json — not from inside `phases.*`.
2. Re-present the artifact for that step with the same approval options.
3. **Do NOT advance** — the user must explicitly select `[C]` to proceed.

**On `[C]` after resume:** When the user selects `[C]` to proceed from a paused checkpoint, clear `currentStep` (or `currentCheckpoint`) to `null` in state.json and set the artifact's `status` back to `draft`. This prevents stale state if the session crashes before the next checkpoint writes a new value.

**Critical:** A state value means "user is AT this step, has NOT yet approved it." Approval is expressed by the user selecting `[C]`, which advances to the next step.

**Standalone skills exception:** Optional standalone skills (Designer, DevOps, QA) store pause state in their artifact frontmatter only (e.g., `current_step` or `current_stage`), not in root-level `currentStep`. They are not part of the 5-phase flow and manage their own resume via artifact detection. The Notion skill uses `notion.pausedStage` inside state.json's `notion` key.

**AskUserQuestion definition:** `AskUserQuestion` is a Claude Code built-in tool that presents options as an interactive single-select UI with descriptions. Use it for multi-option tradeoff decisions (marked with `**use AskUserQuestion**` in this document). Simple `[C]/[P]` checkpoints remain as plain text. When a user selects "Other" (free-text), map the input to the nearest valid option and confirm before proceeding; if no match, re-present the selection. **Fallback:** If `AskUserQuestion` is unavailable (e.g., `--channels` mode), present the same options as a numbered plain-text list and accept the user's choice as text input.

**HALT display rule:** At every HALT point, the choices (e.g., `[C] ... [R] ... [P] ...`) MUST be the absolute last output. For plain-text HALTs this is the choices line; for `AskUserQuestion` prompts the options block (bullet list) satisfies this rule. Any supplementary information — task summaries, status recaps, progress notes — goes above the choices, never below. This ensures the actionable prompt is always visible at the bottom of the terminal without scrolling.

**Git push rule:** Never `git push` unless the user explicitly requests it. All commits stay local by default.

**Inter-phase discipline:** Between phases, do not create artifacts governed by downstream skills. Story files are created inside the story loop (per-story in sequential mode, per-wave in parallel mode) — not before the loop starts. If the user asks about story files between Plan and Implement, explain that they are created during implementation when live codebase state from prior waves is available.

## 6. Phase Routing

### Routing Table

| Phase          | Condition                        | Action                                              |
| -------------- | -------------------------------- | --------------------------------------------------- |
| 1 Research     | `currentPhase == "research"`     | Invoke the `/research` skill                        |
| 2 Specify      | `currentPhase == "specify"`      | Invoke the `/specify` skill                         |
| 3 Architecture | `currentPhase == "architecture"` | Invoke the `/architecture` skill                    |
| 4 Plan         | `currentPhase == "plan"`         | Read and follow `.claude/skills/storyplan/SKILL.md` |
| 5 Implement    | `currentPhase == "implement"`    | Enter Story Loop (§7)                               |

### Phase Transition Protocol

When a skill completes and its embedded gate passes:

1. **Capture wall-clock time first.** Run `date -u +%Y-%m-%dT%H:%M:%SZ` and use its exact output (call it `$NOW`) for every timestamp in the remainder of this protocol. Do not estimate, increment, or reuse a previously-captured value — `validate-state.sh` denies writes where any tracked timestamp drifts >30 min from wall-clock.
2. Update state.json on the current phase: `status`→`complete`, `gateResult`→`pass`, `completedAt`→`$NOW`, `lastUpdated`→`$NOW`.
3. Set `currentPhase` to the next phase AND set `phases.{next}.startedAt`→`$NOW`. Consecutive phases must form contiguous time ranges so every API call can be bucketed into its phase (required for per-phase analysis).
4. Clear `currentStep` to `null` (the new phase sets its own step values)
5. **Phase tagging:** Create a phase tag:
   ```
   git tag phase-{N}-{feature}  (e.g., phase-1-payment-gateway, phase-2-payment-gateway, etc.)
   ```
   This enables recovery if docs/ is deleted during planning phases.
6. Display: `═══ LAIM ═══ Phase {N} Complete ═══` + artifact path + Gate PASS ✅ + 2-4 bullet summary + `[C] Continue to Phase {N+1}  [B] Back to Phase {N}  [P] Pause`
7. On [C]: invoke the next phase skill (e.g. `/specify`, `/architecture`, `/storyplan`)
8. On [B]: revert `currentPhase` to the previous phase in state.json, set that phase's status back to `pending`, and re-invoke the previous phase's skill. The artifact from the previous phase is preserved for revision.
9. On [P]: State is already updated (steps 1-4: wall-clock captured, current phase marked complete, next phase started, `currentStep` null, artifact `status: complete`). Remove `docs/.lock`. Display: `Session paused after Phase {N}. Resume with /start.` On resume, `/start` routes to the next phase's skill which starts fresh.

### Backward Navigation Protocol

When a user selects `[B] Back` at any checkpoint:

| Current Phase                     | `[B]` Target              | Action                                                         |
| --------------------------------- | ------------------------- | -------------------------------------------------------------- |
| Phase 1: Research (at Synthesis)  | Discovery step            | Re-enter conversational discovery                              |
| Phase 2: Specify (within steps)   | Previous specify sub-step | Return to Requirements/Perspectives/AC/Verification            |
| Phase 2: Specify (at Gate 2)      | Phase 1: Research         | Set `currentPhase` → `research`, re-invoke `/research`         |
| Phase 3: Architecture (at Gate 3) | Phase 2: Specify          | Set `currentPhase` → `specify`, re-invoke `/specify`           |
| Phase 4: Plan (at Gate 4)         | Phase 3: Architecture     | Set `currentPhase` → `architecture`, re-invoke `/architecture` |
| Phase 5: Implement                | N/A                       | Use `[X] Change Direction` or `[U] Undo` instead               |

**On cross-phase back:**

1. Capture wall-clock time: run `date -u +%Y-%m-%dT%H:%M:%SZ` and use its exact output as `$NOW` (do not estimate — `validate-state.sh` denies drifted writes). Update state.json: set `currentPhase` to target phase, set target phase status → `pending`, clear `currentStep` to `null`, set `lastUpdated`→`$NOW`. Update metrics: `metrics.gates.backNavigations += 1`
2. The existing artifact (research.md, spec.md, architecture.md) is preserved — the target skill detects it and enters revision/resume mode
3. Re-invoke the target phase's skill
4. When the target phase completes again, normal forward flow resumes

### Resume Routing

When resuming, route based on `currentPhase` in state.json:

| `currentPhase`                       | Route                                                             |
| ------------------------------------ | ----------------------------------------------------------------- |
| `research`                           | Invoke `/research` skill                                          |
| `specify`                            | Invoke `/specify` skill                                           |
| `architecture`                       | Invoke `/architecture` skill                                      |
| `plan`                               | Invoke `/storyplan` skill                                         |
| `implement` + `currentStory` is null | Pick next story from sprint-status.yaml                           |
| `implement` + `currentStory` set     | Invoke `/implement` skill (resumes at `currentCheckpoint` if set) |

## Optional Standalone Skills

Standalone skills can be invoked **between phases** to produce artifacts consumed by downstream phases via contract points. They are NOT part of the 5-phase flow — invoke them when the project needs them.

| Skill         | Command                       | Output                                                                    | Invoke When                      | Consumed By                                                 |
| ------------- | ----------------------------- | ------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------- |
| Designer      | `/designer`                   | `docs/design-system.md`                                                   | After Phase 3, before Phase 4    | Plan (design constraints), Story creator (design tokens)    |
| DevOps Pass 1 | `/devops` or `/devops pass-1` | `docs/local-dev.md` + `## Infrastructure Architecture` in architecture.md | After Phase 4, before Phase 5    | Story creator (local dev, Docker), Plan (infra constraints) |
| DevOps Pass 2 | `/devops` or `/devops pass-2` | `docs/infrastructure.md`                                                  | After Phase 5 (all stories done) | Deployment, ops                                             |
| QA            | `/qa`                         | `docs/test-strategy.md`                                                   | After Phase 4, before Phase 5    | Story creator (test approach, coverage targets)             |
| Notion        | `/notion`                     | Notion pages (Feature Hub + child pages)                                  | After any phase                  | Team knowledge base (Notion)                                |

**Contract point detection:** Downstream phases automatically detect these artifacts. If a file exists, the consuming phase extracts relevant content. If it doesn't exist, the flow proceeds normally with baseline decisions from the architecture document.

**Two-pass DevOps model:**

- **Pass 1** (pre-implementation): Generates infrastructure architecture decisions and local dev environment (Docker, scripts, env vars). Run after planning, before implementing stories. Story-creator inlines local dev context into stories.
- **Pass 2** (post-implementation): Scans actual codebase for ground-truth values (env vars, ports, build commands, schemas), then generates production Terraform, CI/CD, security, monitoring using real values. Run after all stories are implemented.
- Auto-detection: `/devops` without a pass flag auto-routes based on `state.json` devops block and `currentPhase`.

**When to invoke:**

- `/designer` — UI-heavy features, new visual identity, design system creation
- `/devops` — Infrastructure needs. Pass 1 for local dev + architecture; Pass 2 for production infra
- `/qa` — Complex testing requirements, compliance-driven projects, high-risk features

**When to skip:** Internal tools, simple features, CLIs, libraries without UI — the 5-phase flow handles these without optional skills.

### Post-Architecture Designer Suggestion

After Phase 3 gate passes, before Phase 4 (Plan):

1. Read `docs/architecture.md` — check for frontend framework references (`React`, `Vue`, `Angular`, `Svelte`, `Next`, `Nuxt`, `Remix`).
2. If frontend framework detected AND `docs/design-system.md` does NOT exist AND `state.json` `metrics.optionalSkills.designer.used` is not `true`:

   ```
   Frontend components detected in architecture ({framework}).

   [D] Run /designer now (recommended — creates design tokens, component specs, accessibility rules)
   [S] Skip — implement without design system
   [C] Continue to Phase 4
   ```

   On [D]: set `metrics.optionalSkills.designer.used = true` in state.json, then invoke `/designer`.

3. If no frontend framework detected, or `docs/design-system.md` already exists → proceed directly to Phase 4.

### Post-Plan DevOps Suggestion

After Phase 4 gate passes, before entering the Story Loop:

1. Read `docs/architecture.md` — check for references to databases, caches, queues, message brokers, external services, or container-based deployment.
2. If infrastructure dependencies are found AND `docs/local-dev.md` does NOT exist AND `state.json` `devops.pass1` is not `"complete"`:

   ```
   Infrastructure dependencies detected in architecture (database, cache, queue, etc.).
   Local dev environment not yet configured.

   [D] Run /devops pass-1 now (recommended — sets up Docker, dev scripts, env vars)
   [S] Skip — implement without local dev setup
   [C] Continue to Story Loop
   ```

3. If no infrastructure dependencies found, or `docs/local-dev.md` already exists → proceed directly to QA suggestion (or Story Loop).

### Post-Plan QA Suggestion

After DevOps suggestion (or skip), before entering the Story Loop:

1. Read `docs/state.json` — check `complexityTier` field. Read `docs/architecture.md` — scan for security/financial keywords (`auth`, `payment`, `billing`, `encryption`, `HIPAA`, `PCI`, `compliance`, `RBAC`, `OAuth`, `token`).
2. If (`complexityTier === "high"` OR ≥2 security/financial keywords found) AND `docs/test-strategy.md` does NOT exist AND `state.json` `metrics.optionalSkills.qa.used` is not `true`:

   ```
   High complexity or security-sensitive feature detected.

   [Q] Run /qa now (recommended — creates test strategy, coverage targets, testability review)
   [S] Skip — implement with baseline test approach
   [C] Continue to Story Loop
   ```

   On [Q]: set `metrics.optionalSkills.qa.used = true` in state.json, then invoke `/qa`.

3. If complexity is not high AND no security/financial keywords, or `docs/test-strategy.md` already exists → proceed directly to Story Loop.

## 7. Story Loop

After Gate 4 passes, manage the story execution loop.

### 7a. Initialize Loop

1. Read `docs/sprint-status.yaml` → count stories, set `storiesTotal` in state.json
2. Stories execute in wave order. Within a wave, process sequentially.
3. **Wave execution strategy:**
   Check `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` env var.
   - If available AND wave has 2+ stories:

     ```
     Wave {N} has {count} independent stories.

     [S] Sequential — Full checkpoints per story (current behavior, recommended)
     [P] Parallel — Agent Teams executes stories simultaneously (autonomous, wave-level checkpoint)
     ```

   - If wave has 1 story → sequential (regardless of Agent Teams, no prompt)
   - If not available AND wave has 2+ stories:
     ```
     ℹ Wave {N} has {count} independent stories — running sequentially.
     Tip: See README for enabling parallel execution via Agent Teams.
     ```

   **Sequential (default):** Current behavior. Full HALT points per story.
   **Parallel:** Each story becomes a teammate. Autonomous execution with wave-level checkpoint only.

   Parallel mode implications (shown to user):
   - Per-story HALT points (task checkpoint, code review) run autonomously
   - User reviews at wave completion, not per-story
   - Higher token cost (~Nx for N stories)
   - Faster wall-clock time

   Store the choice in state.json `waveStrategy` (maps wave number → "sequential" | "parallel").

   This prompt applies to the first wave. Subsequent waves are prompted at wave boundaries (§7c.2).

### 7b. Per Story

For each story (respecting wave and dependency order):

1. **Tag baseline:** `git tag pre-{feature}-{story-id}`
2. **Update state:** set `currentStory` in state.json with storyId, clear `currentCheckpoint` to `null`, status → `in-progress`, `lastUpdated`→now. Update metrics: `metrics.stories.sizeDistribution.{S|M|L} += 1` (from sprint-status.yaml size)
3. **Update sprint-status.yaml:** story status → `in-progress`
4. **Display story header:**

   ```
   ═══ LAIM ══════════════════════════════════════════════
   Feature: {name}  │  Story {done+1}/{total}: {title}
   ████████████░░░░░░░░  {done}/{total} stories
   ═══════════════════════════════════════════════════════

   [C] Continue  [S] Skip  [J] Jump to specific  [E] Edit story  [P] Pause
   ```

   On [P]: `currentStory` is already set (step 2). Remove `docs/.lock`. Display: `Session paused at story {storyId}. Resume with /start.` On resume, `/start` sees `currentPhase: implement` + `currentStory` set → routes to `/implement` skill.

5. **Route to implement skill:** Invoke the `/implement` skill
6. **On Gate 5 pass:**
   - Update sprint-status.yaml: story → `done`
   - Clear `currentStory` and `currentCheckpoint` to `null` in state.json
   - Increment `storiesDone` and update `lastUpdated` in state.json
   - Update metrics: `metrics.stories.completed += 1`, `metrics.stories.gate5Passes += 1`
   - `git tag post-{feature}-{story-id}`
   - Check for remaining stories

**Change Story insertion:**
If the implement skill created a CS-\* story (cross-story change detected during [X] Change Direction):

1. CS-\* story was inserted into sprint-status.yaml by the implement skill
2. Process it next (before continuing to the originally next story)
3. After CS-\*: regenerate remaining story files if architecture was amended

### 7b-parallel. Per Wave (Parallel Mode)

For each wave with parallel execution:

1. **Tag baselines:** `git tag pre-{feature}-wave-{N}`
2. **Create story files:** Spawn story-creator-agent for each story in the wave (parallel Task tool calls)
3. **Present stories:** Show all wave stories for review

   ```
   === Wave {N}: {count} stories ===
   | # | Story | Tasks | Size |
   [C] Continue all  [E] Edit  [P] Pause
   ```

   **HALT — wait for user approval.** On [P]: Remove `docs/.lock`. Display: `Session paused before wave {N} execution. Resume with /start.` On resume, `/start` routes to implement phase; the wave stories are re-presented from sprint-status.yaml.

4. **Launch Agent Team:**
   - One teammate per story in the wave
   - Each teammate invokes the full `/implement` skill autonomously
   - Lead coordinates in delegate mode
   - Teammates cannot modify files outside their story scope

5. **Wave Checkpoint:**

   ```
   === Wave {N} Complete ===

   | Story | Tasks | Tests | Gate 5 | Status |
   |-------|-------|-------|--------|--------|
   | {id}  | {t/T} | +{n} | PASS   | staged |

   Integration: {tooling.test} → {total} tests passing

   [C] Continue to Wave {N+1}  [R] Review specific story  [U] Undo wave  [P] Pause
   ```

   **HALT — wait for user response.** On [P]: Wave stories are committed at wave checkpoint approval. Remove `docs/.lock`. Display: `Session paused after wave {N}. Resume with /start.` On resume, `/start` routes to implement phase; remaining waves continue from sprint-status.yaml state.

6. **On wave pass:**
   - Update sprint-status.yaml: all wave stories → `done`
   - `git tag post-{feature}-wave-{N}`
   - Increment storiesDone for all stories
   - Update metrics: `metrics.execution.parallelWaves += 1`, `metrics.execution.parallelStories += {count}`
   - Check for remaining stories in sprint-status.yaml

### 7c. Between Stories

```
═══ LAIM ═══ Story {id} complete ═══
Progress: {done}/{total} stories

[N] Next: {next-title}  [J] Jump  [S] Skip  [P] Pause
```

On [N]: Read the next story's wave number from sprint-status.yaml.

- If next story is in a **different wave** than the completed story → route to §7c.1 (Wave Transition Verification), then §7c.2 (Wave Strategy Evaluation)
- If next story is in the **same wave** → route to §7b (Per Story) directly

On [P]: Previous story is already complete (Gate 5 passed, `currentStory` cleared). Remove `docs/.lock`. Display: `Session paused between stories. Resume with /start.` On resume, `/start` sees `currentPhase: implement` + `currentStory` null → picks next story from sprint-status.yaml.

In parallel mode: per-story checkpoints within a wave are replaced by the wave checkpoint (§7b-parallel step 5). After wave approval, control returns here to detect the next wave boundary.

### 7c.1. Wave Transition Verification

When the last story in wave N completes, before starting wave N+1:

1. **Build check:** Run `{tooling.build}` — typed languages catch cross-story parameter/signature mismatches at compile time
2. **Integration test:** Run `{tooling.test}` — full test suite catches behavioral regressions across stories
3. **Present wave transition checkpoint:**

   ```
   ═══ Wave {N} → Wave {N+1} Transition ═══

   Build: ✅ PASS / ❌ FAIL ({error summary})
   Tests: {passing}/{total} passing ({new_failures} new failures)

   [C] Continue to Wave {N+1}  [F] Fix failures  [H] Halt
   ```

4. **HALT** before starting wave N+1 — user must approve transition
5. Update metrics: `metrics.quality.interfaceAudits += 1`, `metrics.quality.interfaceMismatches += {count}`

If build or tests fail with type/signature errors, this likely indicates a cross-story interface mismatch. Route to `[F] Fix` which investigates the mismatch and may create a CS-\* change story.

If `{tooling.build}` is not configured: skip build check, note "no build tooling configured — skipping compile-time interface check".

### 7c.2. Wave Strategy Evaluation

After wave transition verification passes (§7c.1), evaluate execution strategy for the new wave:

1. Count remaining stories in wave N+1 from sprint-status.yaml (exclude `done` and `skipped`)
2. If wave has 1 story → sequential, no prompt. Proceed to §7b.
3. Check `waveStrategy[N+1]` in state.json:
   - If already set (e.g., from a resumed session) → use stored value
   - If NOT set → present strategy choice (same as §7a.3):
     - Check `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` env var
     - If available: present `[S] Sequential / [P] Parallel` choice
     - If not available: inform and default to sequential
     - Store choice in `waveStrategy[N+1]` in state.json
4. Route based on strategy:
   - Sequential → proceed to §7b (Per Story) for first story in wave
   - Parallel → proceed to §7b-parallel (Per Wave) for the wave

### 7d. Tech Debt Check

After each story, if `docs/concerns.md` has ≥5 medium-severity or any high-severity items:

```
⚠️ Tech Debt Alert: {count} concerns ({high} high)
Review docs/concerns.md before continuing.
[A] Acknowledge and continue  [F] Fix first
```

### Post-Implementation DevOps Suggestion

When all stories in sprint-status.yaml are `done`, before displaying Feature Completion:

1. If `state.json` `devops.pass2` is NOT `"complete"`:

   ```
   All stories implemented. Production infrastructure not yet generated.

   [D] Run /devops pass-2 now (recommended — scans codebase, generates Terraform/CI/CD with actual values)
   [S] Skip — complete feature without production infra
   [C] Complete without infrastructure
   ```

2. If `devops.pass2` is already `"complete"` → proceed directly to Feature Completeness Audit.

### Feature Completeness Audit

When all stories are done, before Feature Completion. Skip if `docs/research.md` has no `## Feature Inventory` section (legacy features or features started before this check was added).

1. Read `docs/research.md` → extract all `FI-*` items from `## Feature Inventory`
2. Read `docs/sprint-status.yaml` → list all completed stories with their titles and AC references
3. For each FI-\* item: find ≥1 completed story that addresses it (by title match, AC coverage, or story description)
4. Present results:

```
═══ LAIM ═══ Feature Completeness Audit ═══

| FI | Capability | Covered by |
|----|-----------|------------|
| FI-1 | {description} | Story 1-2: {title} ✅ |
| FI-2 | {description} | Story 2-1: {title} ✅ |
| FI-3 | {description} | ❌ NOT COVERED |

{if all covered:}
All Feature Inventory items covered. ✅
{else:}
⚠ {N} inventory items not covered by any completed story.

[S] Create change stories for missing items
[A] Acknowledge gap — proceed without coverage
[P] Pause
```

**HALT — wait for user response.** Only shown when gaps exist. If all items are covered, proceed to Feature Completion without halting.

On [S]: for each uncovered FI-\* item, create a change story in `sprint-status.yaml` and route back to the story loop (§7b). These stories go through the normal implement cycle.
On [A]: log gaps to `docs/concerns.md` with severity HIGH, proceed to Feature Completion.

## 8. Feature Completion

When all stories in sprint-status.yaml are `done`:

```
═══ LAIM ═══ Feature Complete: {name} ═══
Stories: {N}/{N}  │  Tech Debt: {n}  │  Amendments: {n}  │  Time: {duration}
All stories implemented and verified. 🎉
Commits are local only — push when ready.
Rollback: git revert --no-commit pre-{feature}-{id}..post-{feature}-{id}

[D] Done — archive artifacts and finish
[R] Retrospect — review feature learnings before archiving (shown when docs/concerns.md exists OR metrics.codeReview.findingsDeferred > 0)
[P] Pause
```

**HALT — wait for user response.** Do NOT proceed without user selecting [D].

**On [R] Retrospect:** Invoke the `/retrospect` skill. Pass `docs/concerns.md` and `docs/state.json` as inputs. If user provides a PR number, pass it as context. After retrospection completes, return to this HALT with `[D]` and `[P]`. Retrospection must run before archival — concerns.md and state.json are moved to `.archive-{slug}/` during the `[D]` step.

Remove `docs/.lock`. Update state.json: `currentPhase` → `complete`. Compute final metrics: `metrics.stories.avgTasksPerStory` = `(metrics.tasks.totalCompleted + metrics.tasks.totalCompletedNoCommit) / metrics.stories.completed`, `metrics.tasks.avgVerificationCycles` = `metrics.tasks.totalVerificationCycles / (metrics.tasks.totalCompleted + metrics.tasks.totalCompletedNoCommit)`.

**On [D]: Archive all feature artifacts** to keep `docs/` clean for the next feature or merge. Do NOT skip this step:

1. `mkdir -p docs/.archive-{feature-slug}/`
2. Move: `state.json`, `research.md`, `spec.md`, `architecture.md`, `plan.md`, `sprint-status.yaml`, `amendments.md` (if exists), `concerns.md` (if exists), `design-system.md` (if exists), `local-dev.md` (if exists), `infrastructure.md` (if exists), `test-strategy.md` (if exists), `stories/` into `docs/.archive-{feature-slug}/`
3. If `docs/user-context/` exists: move into `docs/.archive-{feature-slug}/user-context/`
4. After archive, `docs/` should contain only `.archive-*/` directories and `.gitignore`-managed files

## 9. Context Window & Restart-from-Checkpoint

**Context accumulation:** Each phase adds skill instructions to the conversation. By Phase 5, the conversation may include instructions from all prior phases plus implementation artifacts. Claude Code compacts (summarizes) the conversation automatically when the context limit is approached — this is expected and normal.

**Signs of context degradation:**

- Claude forgets earlier instructions or conventions
- Responses become less structured or miss checkpoint formatting
- Gate criteria are evaluated incompletely

**Restart-from-checkpoint:** If context degradation is noticeable, the user can start a fresh conversation and re-invoke `/start`. The framework detects the existing state.json and resumes from the current checkpoint:

1. All completed phases are preserved (artifacts on disk with `status: complete`)
2. The current phase resumes with full skill instructions freshly loaded
3. No work is lost — only in-progress conversation context between the last checkpoint and the restart

**Proactive compaction in implement phase:**
During the story loop, every 3 completed tasks trigger a summary write to state.json (see implement SKILL.md "Context Compaction"). Only the 2 most recent tasks are kept in full detail. This extends the effective context window for long stories.

**Tool-call compaction hook:** LaiM installs a PreToolUse hook (`hooks/suggest-compact.sh`)
that counts Edit/Write calls and suggests `/compact` at configurable thresholds. This provides
session-wide compaction reminders independent of the implement skill's per-3-task compaction.
The hook is found at `.claude/hooks/suggest-compact.sh` (local) or `~/.claude/hooks/suggest-compact.sh` (global).

**Recommendation for complex features (>5 stories):**
Consider restarting the conversation between stories. Each story starts fresh from sprint-status.yaml and the story file, so no cross-story context is needed in the conversation.

## 10. Error Handling

**Corrupted state.json:**
Reconstruct from available sources in priority order:

1. `docs/sprint-status.yaml` → story statuses (highest authority)
2. `git log --tags` → completed stories via `post-{feature}-*` tags
3. Artifact frontmatter `status: complete` → phase completion
   Present reconstructed state → user confirms before proceeding.

**Stale lock (>4 hours):**

```
Stale lock detected ({hours}h ago). Previous session likely crashed.
[T] Take over — break lock  [C] Cancel
```

**State/artifact mismatch:**
If state.json says a phase is complete but artifact is missing or incomplete:

```
⚠️ State mismatch: {phase} marked complete but {artifact} missing.
[R] Re-run phase  [F] Fix state to match reality  [C] Cancel
```
