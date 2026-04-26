---
name: storyplan
description: "Story decomposition and wave planning with full requirement traceability. Phase 4 of 5."
---

# Plan Skill — Phase 4 of 5

Story decomposition and wave planning. Transforms upstream artifacts into implementable
epics and stories with full requirement traceability, BDD acceptance criteria,
dependency-ordered waves, and a sprint status tracker.

**Input:** `docs/research.md`, `docs/spec.md`, `docs/architecture.md`
**Output:** `docs/plan.md`, `docs/sprint-status.yaml`
**Agents:** None — decomposition is interactive, not delegated.

## Principles

1. **100% FR coverage** — Every functional requirement maps to ≥1 story. Zero gaps.
2. **Vertical slices** — Stories deliver end-to-end value, not horizontal layers.
3. **BDD acceptance criteria** — Given/When/Then for every story, including error cases.
4. **Waves define order** — Dependency waves set execution sequence. Story-level parallelism via Agent Teams is available when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is set.
5. **User drives strategy** — Present 2-3 decomposition options, user chooses.
6. **Size discipline** — L stories must justify why they cannot be split.

## Status Bar & Standard Options

Display at TOP of every checkpoint:
```
═══ LAIM ═══ Feature: {name} │ Phase 4/5: Plan │ Step: {step} ═══
```
Update `{step}`: Initialize, Strategy, Decompose, Coverage, Waves, Review, Gate, Complete.

Options at every checkpoint: `[C] Continue  [R] Revise  [B] Back  [P] Pause`
Gate adds: `[O] Override  [N] Not Applicable`

**`[B] Back` behavior:** Returns to the previous step within this phase, or to the previous phase's gate checkpoint if at the first step. At Gate 4 PASS, `[B]` returns to Phase 3: Architecture.

## Pause & Resume Protocol

**State table:**

| Step | `currentStep` value |
|------|-------------------|
| Step 1: Initialize checkpoint | `initialize` |
| Step 2: Strategy checkpoint | `strategy` |
| Step 3: Decompose checkpoint | `decompose` |
| Step 4: Coverage checkpoint | `coverage` |
| Step 5: Waves checkpoint | `waves` |
| Step 6: Review checkpoint | `review` |
| Gate 4 shown | `gate-4` |

On `[P]` at any HALT: save per Universal Pause Protocol (§5.5 in start.md) using the value from the table above. Write `docs/plan.md` with `status: paused` and `pausedStep: {value}`.

On resume: read root-level `currentStep` from state.json. Present a compact summary (epic/story counts, FR coverage %, current step) with `[F] Show full plan  [C] Continue`. Do NOT auto-advance — wait for user response.

## Prerequisites & Resume

**Metrics:** Before writing to `metrics.*` in state.json (gates, phase lifecycle), read `templates/references/metrics-triggers.md`.

1. Verify `docs/research.md`, `docs/spec.md`, `docs/architecture.md` all exist with `status: complete`
2. Check `docs/plan.md`:
   - `status: complete` AND `docs/sprint-status.yaml` exists → Phase done. Display: "Plan phase complete. [C] Continue to Implement [R] Redo plan [P] Pause"
   - `status: paused` → read root-level `currentStep` from state.json, re-present artifact at that step with its approval options, do NOT advance. If `currentStep` is null, fall back to Step 6 (review).
   - `status: draft` → Resume: "Plan draft found with {N} stories. [C] Continue [N] Start fresh [P] Pause". On [C]: read `currentStep` from state.json — if set, resume at that step; if null, skip to Step 6 (review) with existing content.
   - Not exists → Fresh start. Proceed to Step 1.

## Iteration Protocol

1. Present artifact → **HALT — wait for user response before proceeding.**
2. Feedback → revise → re-present using **delta + unchanged summary** format (see below) → loop
3. Only explicit approval advances: `C`, `continue`, `looks good`, `LGTM`, `yes`, `ok`
4. Feedback signals: `but...`, `what about...`, `change X to Y` → revise and re-present
5. After addressing feedback, re-present the **changed items in full** + a compact summary of unchanged items. User can always request `[F] Show full plan` to see everything.
6. Ambiguous response (e.g., "interesting", "hmm", "ok I see") → ask: "Should I proceed to the next step, or is that feedback for revision?"

**Delta presentation format:**
```
PLAN DELTA SINCE LAST REVIEW:
Modified:
  - Story {id}: {what changed — e.g., "added error handling AC", "split into 2-1a and 2-1b"}
    {show full updated story with ACs}
Added:
  - Story {id}: {new story details}
Removed:
  - Story {id}: {reason}
Unchanged: Story 1-1 (S, Wave 1) | Story 2-2 (M, Wave 2) | ... {compact list with size+wave}
Coverage: FR {N}/{total} (100%) | NFR strategy: {status}

[F] Show full plan  [C] Continue  [R] Revise  [P] Pause
```
First presentation of each step always shows the full artifact. Delta format applies only to revision loops within the same step.

---

## Workflow

### Step 1: Initialize & Inventory

1. **Check prerequisites** — `docs/research.md`, `docs/spec.md`, `docs/architecture.md` all with `status: complete`
2. **Read all three.** Compile:
   - FR inventory: all FR-* with IDs, text, priority, capability area
   - NFR inventory: all NFR-* with IDs, text, measurable targets
   - Components, data models, API contracts from architecture
   - LOCKED DD-* decisions (constrain decomposition)
   - Personas from research (for user stories)
3. **Check for optional skill artifacts (contract points):**
   - `docs/design-system.md` — If exists: note design constraints that affect UI stories (component naming, token system, accessibility requirements)
   - `docs/local-dev.md` — If exists (from `/devops` Pass 1): note local dev services (Docker containers for databases, caches, queues). Stories that need databases or other services can reference the local dev setup. Do NOT create "set up Docker" or "configure local environment" stories — already done.
   - `docs/infrastructure.md` — If exists: check frontmatter for `pass:` field. If `pass: 2` — production-grade, codebase-scanned values. If no `pass:` field — legacy/aspirational. Extract deployment targets, CI/CD pipeline structure, and environment definitions. These constrain DevOps-related stories and deployment order. If only `docs/local-dev.md` exists at plan time (no `docs/infrastructure.md`), that is expected — note "Production infrastructure generated post-implementation via `/devops` pass-2".
   - `docs/test-strategy.md` — If exists: extract testing approach, coverage targets, and tool choices. These inform QA-related acceptance criteria and story task decomposition.
   - If none exist: proceed normally — these are optional inputs from standalone skills.
4. **Present summary:** FR count (Must/Should/Could), NFR count, component count, LOCKED DD-* count, optional skill artifacts detected

**Checkpoint:** `[C] [R] [P]` — On `[P]`: save per Pause Protocol (`currentStep: initialize`).

### Step 2: Decomposition Strategy

Present **2-3 meaningfully different** strategies. Not cosmetic variations.

**User decomposition detection:** If research.md's Additional Context section contains numbered implementation tasks (numbered list where each item describes a deliverable action — e.g., "Create X", "Migrate Y", "Add Z to W" — with file paths or component names as targets), confirm with the user:

"I detected {N} implementation tasks in your document. Should I offer these as a decomposition strategy? [Y] Yes  [N] No — proceed with standard strategies"

If confirmed, include the user's decomposition as **Strategy A**:

```
Strategy A — User's decomposition (from research.md Additional Context):
  {N} tasks in the user's stated order
  Preserves user's dependency ordering
  Horizontal structure allowed (user domain expertise, not an AI anti-pattern)

Strategy B — LaiM vertical decomposition:
  {M} stories across {K} epics, standard vertical slices

[A] Use user's decomposition  [B] Use LaiM's  [C] Hybrid  [P] Pause
```
**HALT — wait for user response.** On `[P]`: save per Pause Protocol (`currentStep: strategy`).

If user selects **[A]**: convert each task to a story 1:1, preserving order. **Vertical slice enforcement is SKIPPED** for this plan — the user provided horizontal tasks intentionally. **Story budget proportionality** (Step 5.5) is checked but user-authored decompositions are auto-justified: if story count exceeds tier target range, log `PD-2: User-authored decomposition — {N} stories from user's {N} tasks [LOCKED]` and proceed without HALT. Gate 4 criterion #12 passes with this justification. BDD ACs still generated per story. FR/NFR coverage still validated. Dependency graph built from user's ordering. Large tasks (>20 files or L-sized) get a size warning with offer to split, not forced decomposition.

If no user tasks detected in Additional Context, proceed with standard strategy generation:

Per strategy show: epic names and goals, estimated story count per epic,
how FRs cluster in this structure, pros and cons.

**Epic constraints:**
- 2-6 epics per feature (justify if >6)
- 2-6 stories per epic (1 story = flag for merge review; >6 = flag for split review)
- Epic 1 = foundation (shared types, DB setup, config)
- Each epic independently testable
- **Total story budget by tier** (from state.json `complexityTier`):

| Tier | Target range | Review threshold | Hard limit |
|------|-------------|-----------------|------------|
| Trivial | 1-2 | 3 | 4 |
| Low | 2-4 | 5 | 7 |
| Medium | 4-8 | 10 | 15 |
| High | custom | custom | custom |

Exceeding the review threshold triggers Trim/Justify/Override at Step 5.5, not an auto-failure.

**Enabling task patterns (Wave 1 foundation):**
When Epic 1 / Wave 1 needs shared infrastructure, prefer these patterns over monolithic setup stories:

| Pattern | When | What |
|---------|------|------|
| **Interface-first** | Multiple components will interact | Define interfaces/types only (no implementation). Downstream stories implement against interfaces. |
| **Mock-first** | A dependency isn't ready yet | Create mock/stub of the dependency. Real implementation replaces it in a later story. |
| **Contract-first** | API consumers and producers in different stories | Define API contract (OpenAPI, GraphQL schema, protobuf). Both sides implement against it independently. |
| **Schema-first** | Multiple stories need the same data models | Define DB schema/migrations only. Stories add business logic. |

Enabling tasks are always size S. They produce artifacts (interfaces, mocks, schemas) that other
stories depend on — making them natural Wave 1 candidates.

**Interface-first recommendation:** For multi-component features, prefer interface-first or contract-first patterns in Wave 1. This ensures downstream stories code against verified interfaces rather than architecture doc descriptions. When an enabling task defines an interface, downstream stories import and implement against that concrete artifact — eliminating cross-story signature mismatches.

```
## Option A: {Strategy Name}
{2-3 sentences}
| Epic | Goal | Est. Stories | Key FRs |
Pros: ... | Cons: ...

## Recommended: Option {X} — Rationale: {why}
```

**Checkpoint:** User selects `[A/B/C]` or describes custom approach. On `[P]`: save per Pause Protocol (`currentStep: strategy`).

**Log the choice:** After user selects a strategy, record as `PD-1: Decomposition Strategy — LOCKED`
with alternatives-considered from the options not selected.

### Step 3: Epic & Story Decomposition

Detail every story. Each MUST have:

1. **User story:** `As a {role}, I want {capability}, so that {benefit}`
2. **BDD acceptance criteria** (minimum 1 happy-path + error ACs proportional to dependencies):
   ```
   AC-1: Given {precondition} When {action} Then {expected outcome}
   AC-2: Given {error condition} When {action} Then {error handling}
   ```
   For each external SDK/API dependency, include ≥1 error AC covering that dependency's failure mode (timeout, auth expired, rate limited, etc.).
3. **Size:** S (half-day) / M (1 day) / L (2+ days, must justify why not split)
4. **Dependencies:** Story IDs or "None"
5. **Flow-level ACs** (for multi-story epics only): if the epic has ≥3 stories with cross-story dependencies, add ≥1 flow-level AC that tests the end-to-end behavior across stories (e.g., "Given user connects wallet, When switching network, Then session persists across all components"). These are tagged `AC-FLOW-{N}` and assigned to the last story in each dependency chain.

**Sizing guide:** S = 1-2 tasks, single concern. M = 2-3 tasks, moderate integration. L = FLAG for splitting — document why splitting breaks atomicity or creates harmful coupling.

**Interface contract requirement:** When a story defines or consumes a shared interface (function, API endpoint, event), its ACs MUST include the concrete signature — function name, parameter types, return type. Not "calls the auth service" but "calls `AuthService.validate(token: string): Promise<AuthResult>`". This ensures the story-creator agent and implement skill can verify interface compatibility across stories.

**Infrastructure story guidance (when `/devops` artifacts exist):**
- If `docs/local-dev.md` exists: do NOT create "set up Docker", "configure local environment", or "create docker-compose" stories — already generated by `/devops` Pass 1.
- If `docs/infrastructure.md` does NOT exist (or only has Pass 1 artifacts): do NOT create Terraform, CI/CD pipeline, or production deployment stories — these are generated post-implementation by `/devops` Pass 2.
- Infrastructure-adjacent application stories ARE appropriate: health check endpoints, graceful shutdown handlers, structured logging, environment variable loading — these are application code that stories should implement.

**Vertical slice enforcement** — reject horizontal stories:
- ❌ "Create all database models" → ✅ Each story creates models it needs
- ❌ "Write all unit tests" → ✅ Tests accompany each story
- ❌ "Configure project structure" → ✅ Fold into first real story

**Checkpoint:** `[C] [R] [P]` — On `[P]`: save per Pause Protocol (`currentStep: decompose`).

### Step 4: FR/NFR Coverage Mapping

**FR Coverage Map (100% required, Gate 4 blocks on gaps):**
```
| FR | Requirement | Story | Status |
|----|-------------|-------|--------|
| FR-1 | [{Actor}] can [{capability}] | 1-1, 1-2 | ✅ Covered |
| FR-3 | [{Actor}] can [{capability}] | — | ❌ GAP |
Coverage: {N}/{total} ({%})
```
Gap = BLOCKER. Resolve: add story, extend existing story, or defer with user approval + rationale.

**NFR Coverage Strategy (every NFR in exactly ONE path):**

| Path | Format | Example |
|------|--------|---------|
| **Direct** | NFR → specific story + verification method | NFR-1 → Story 2-3, load test in AC |
| **Cross-Cutting** | NFR → architecture constraint enforced across all stories | NFR-2 → Data layer encryption |
| **Deferred** | NFR → reason + when to verify + verification plan | NFR-3 → Needs production, post-deploy monitoring |

Gate 4 blocks on any NFR without a coverage path.

**Checkpoint:** `[C] [R] [P]` — On `[P]`: save per Pause Protocol (`currentStep: coverage`).

### Step 5: Dependency Graph & Wave Assignment

**Dependency graph:** Map story-level dependencies. Must be a DAG — no circular deps.

**Waves:** Group stories into dependency waves defining EXECUTION ORDER:
```
| Wave | Stories | Dependencies |
|------|---------|-------------|
| 1 | 1-1, 1-2 | None (foundation) |
| 2 | 1-3, 2-1 | Wave 1 complete |
| 3 | 2-2, 2-3 | Wave 2 complete |
```

**Wave rules:**
- All dependencies in earlier waves
- Same-wave stories have no inter-dependencies
- Foundation stories always Wave 1
- Any coupling between stories → different waves

**Wave independence checks:**

| Rule | Correct | Incorrect |
|------|---------|-----------|
| Dependencies | All in previous waves | "Soft" dependency in same wave |
| Shared files | Never in same wave | "They only append to the file" |
| Shared state | Never in same wave | "They use different parts" |
| Ordering preference | Different waves | Same wave with "run A first" |
| Shared interfaces | Owner in earlier wave | Both stories define the interface |

**Independence test:** Can two developers work on these stories simultaneously with zero communication? If no → different waves.

**Execution:** Stories within a wave process sequentially by default. When Agent Teams is available, same-wave stories can execute in parallel (see start.md §7). Task-level parallelism within a story is also supported (see implement skill).

**Checkpoint:** `[C] [R] [P]` — On `[P]`: save per Pause Protocol (`currentStep: waves`).

### Step 5.5: Quick Plan Sanity Check

Before presenting to the user, self-check against these common plan anti-patterns:

| # | Check | Red Flag |
|---|-------|----------|
| 1 | Story independence | Any story that can't be demo'd/tested in isolation |
| 2 | Goldilocks sizing | >40% of stories are L, OR >60% are S |
| 3 | Wave depth | >5 waves suggests over-serialization |
| 4 | Epic balance | Any epic with >6 stories (split) or <2 stories (merge) |
| 5 | Foundation bloat | Wave 1 has >3 stories |
| 6 | Coverage holes | Any FR mapped to only 1 story with no error-path AC |
| 7 | Story count vs tier budget | Total stories exceed tier's review threshold |
| 8 | AC amplification | Spec ACs → story ACs ratio >1.3x |

Flag any issues in the Interactive Review presentation. These are advisory — user decides
whether to address them.

**Proportionality self-check (if checks 7 or 8 flag):**
```
PROPORTIONALITY SELF-CHECK — PLAN
Feature tier: {tier} | Story budget: {target range}
Story count: {count} | Over threshold: {yes/no}
AC amplification: {spec_ACs} → {story_ACs} = {ratio}x (flag if >1.3x)

[T] Trim — reduce story count or merge small stories
[J] Justify — record rationale and keep all
[O] Override — log to concerns.md and proceed
```
**HALT — wait for user response** (only if threshold exceeded).

### Step 6: Interactive Review

Present the complete plan: epics, stories with ACs, FR coverage (100%), NFR strategy, dependency graph + waves, size distribution with L justifications.

User may request:
- **Split** a story (too large) → re-decompose, update waves and coverage
- **Merge** stories (too granular) → combine, verify coverage preserved
- **Reorder** waves → adjust dependency graph
- **Add/remove** stories → update FR/NFR coverage maps
- **Refine** ACs → improve Given/When/Then specificity

After each revision, re-present using the delta format from the Iteration Protocol (changed items in full + unchanged summary + `[F] Show full plan`). Loop until explicit approval.

**Checkpoint:** `[C] [R] [P]` — On `[P]`: save per Pause Protocol (`currentStep: review`).

### Step 7: Write Artifacts

**Ensure output directory:** `mkdir -p docs/`

**docs/plan.md** — with frontmatter `status: complete`, `feature: {slug}`, `phase: 4`:
Epic overview, all stories + ACs, FR coverage map, NFR strategy, dependency graph, waves, sizes.

**plan.md structure:**
```markdown
---
status: complete
feature: {slug}
created: {ISO date}
---
# Plan: {Feature Name}

## Decomposition Strategy
{Selected strategy name and rationale}

## Epic 1: {Name}

### Story 1-1: {Title} [S/M/L]
**User Story:** As a {actor}, I want {capability}, so that {benefit}
**Dependencies:** none | [story-ids]
**Wave:** {N}

**Acceptance Criteria:**
- Given {context}, When {action}, Then {outcome}
- Given {error context}, When {error action}, Then {error handling}

**FR Coverage:** FR-1, FR-3
**NFR Coverage:** NFR-2 (cross-cutting)

### Story 1-2: {Title} [S/M/L]
...

## FR Coverage Map
| FR | Stories | Status |
|----|---------|--------|
| FR-1 | 1-1, 2-1 | ✅ Covered |

## NFR Coverage Strategy
| NFR | Path | Story/Note |
|-----|------|------------|
| NFR-1 | Direct | Story 3-1 |
| NFR-2 | Cross-cutting | All stories |

## Dependency Graph
{Text or ASCII representation}

## Wave Assignments
| Wave | Stories | Rationale |
|------|---------|-----------|
| 1 | 1-1, 1-2 | Foundation, no deps |
| 2 | 2-1, 2-2 | Depends on wave 1 |

## Interface Contracts
{For each shared interface between stories}

### {InterfaceName}
- **Defined by:** Story {X-Y}
- **Consumed by:** Story {A-B}, Story {C-D}
- **Signature:** `{concrete code signature with types}`
- **Location:** `{expected file path}`

## Plan Decisions
PD-1: {decision title} — {LOCKED/DISCRETION}
  - Alternatives: {what else was considered}
  - Rationale: {why this choice}
PD-2: ...
```

**docs/sprint-status.yaml:**
```yaml
feature: {slug}
epics:
  - id: 1
    name: {Epic Name}
    stories:
      - id: "1-1"
        slug: {story-slug}
        title: {Story Title}
        size: S|M|L
        status: backlog
        wave: 1
        dependencies: []
      - id: "1-2"
        slug: {story-slug}
        title: {Story Title}
        size: M
        status: backlog
        wave: 2
        dependencies: ["1-1"]
```
All stories start `status: backlog`.
Status progression: `backlog → ready-for-dev → in-progress → done | skipped`

The implement skill updates this file as stories progress through implementation.

### Step 8: Gate 4

**Required (ALL must pass):**

| # | Criterion | Check |
|---|-----------|-------|
| 1 | FR coverage 100% | Every FR maps to ≥1 story |
| 2 | NFR strategy defined | Each NFR: direct / cross-cutting / deferred |
| 3 | BDD acceptance criteria | Given/When/Then for each story |
| 4 | Stories sized (S/M/L) | Every story has size label |
| 5 | Dependencies mapped | Story dependency graph present |
| 6 | No unjustified L stories | L stories have documented split justification |
| 7 | sprint-status.yaml created | File exists with all stories |
| 8 | Wave assignments | Stories grouped into execution waves |
| 9 | No circular dependencies | Dependency graph is a DAG — validated via topological sort |

**Recommended (advisory, non-blocking):**

| # | Criterion | Check |
|---|-----------|-------|
| 10 | Vertical slicing | Stories deliver value independently |
| 11 | Interface contracts | Shared interfaces between stories have concrete signatures in `## Interface Contracts` |
| 12 | Story proportionality | Story count within tier budget or justified/overridden |
| 13 | AC amplification | Spec → story AC ratio ≤1.3x or justified |
| 14 | Integration ACs | Multi-story epics (≥3 stories with cross-deps) have ≥1 AC-FLOW-* |

**Gate display format:**
```
┌──────────────────────────────────────────────────────┐
│ GATE 4: PLAN — {PASS | FAIL}                        │
├──────────────────────────────────────────────────────┤
│ Required:                                            │
│  1. FR coverage 100%            ✅ | ❌              │
│  2. NFR strategy defined        ✅ | ❌              │
│  3. BDD acceptance criteria     ✅ | ❌              │
│  4. Stories sized (S/M/L)       ✅ | ❌              │
│  5. Dependencies mapped         ✅ | ❌              │
│  6. No unjustified L stories    ✅ | ❌              │
│  7. sprint-status.yaml created  ✅ | ❌              │
│  8. Wave assignments            ✅ | ❌              │
│  9. No circular dependencies    ✅ | ❌              │
├──────────────────────────────────────────────────────┤
│ Recommended:                                         │
│  10. Vertical slicing           ✅ | ⚠️              │
│  11. Interface contracts        ✅ | ⚠️              │
│  12. Story proportionality      ✅ | ⚠️              │
│  13. AC amplification           ✅ | ⚠️              │
│  14. Integration ACs            ✅ | ⚠️              │
├──────────────────────────────────────────────────────┤
│ FR map: FR-1→S1-1 · FR-2→S1-2,S2-1 · FR-3→S2-2 ... │
│ NFR map: NFR-1→cross-cutting · NFR-2→S3-1 · ...     │
│ Coverage: FR {n}/{total} | NFR {n}/{total}           │
│ Stories: {total} ({s}S / {m}M / {l}L)                │
│ Waves: {count}                                       │
└──────────────────────────────────────────────────────┘
```

**On FAIL:** Identify which criteria failed → route back to relevant step.
**On [P]:** save per Pause Protocol (`currentStep: gate-4`).
**Override [O]:** Append override to `docs/concerns.md` using the standard override format (see Research skill Gate 1 for format definition). Risk propagates.

### Step 9: Completion & Handoff

On PASS:
1. **Update state.json:** `currentPhase: "implement"`, `phases.plan: { status: "complete", gateResult: "pass" }`
2. **Display:**
```
═══ LAIM ═══ Feature: {name} │ Phase 4/5: Plan │ Step: Complete ═══

✅ Plan complete
- docs/plan.md — {epic_count} epics, {story_count} stories
- docs/sprint-status.yaml — all stories at backlog

FR: {n}/{total} (100%) | NFR: {direct} direct, {cross} cross-cutting, {deferred} deferred
Waves: {count} | Size: {s}S / {m}M / {l}L

Next: Phase 5 — Implement
```
3. **Optional skill suggestions:** Before routing to Implement, check in order:
   a. **DevOps suggestion:** If `docs/architecture.md` references databases, caches, queues, message brokers, external services, or container-based deployment AND `docs/local-dev.md` does NOT exist AND `state.json` `devops.pass1` is not `"complete"` → suggest `/devops pass-1` with `[D]/[S]/[C]` options. **HALT — wait for user response.** On [D]: set `devops.pass1 = "in-progress"`, invoke `/devops pass-1`. After `/devops` completes, proceed to 3b. On [S] or [C]: proceed to 3b.
   b. **QA suggestion:** If (`state.json` `complexityTier === "high"` OR `docs/architecture.md` contains ≥2 security/financial keywords: `auth`, `payment`, `billing`, `encryption`, `HIPAA`, `PCI`, `compliance`, `RBAC`, `OAuth`, `token`) AND `docs/test-strategy.md` does NOT exist AND `state.json` `metrics.optionalSkills.qa.used` is not `true`:
      ```
      High complexity or security-sensitive feature detected.

      [Q] Run /qa now (recommended — creates test strategy, coverage targets, testability review)
      [S] Skip — implement with baseline test approach
      [C] Continue to Story Loop
      ```
      **HALT — wait for user response.** On [Q]: set `metrics.optionalSkills.qa.used = true` in state.json, then invoke `/qa`. After `/qa` completes, proceed to step 4. On [S] or [C]: proceed to step 4.
   If neither condition met → skip to step 4.
4. Route to implement skill — begins the story loop, processing stories wave by wave.

---

## Anti-Patterns

**NEVER:** Proceed without user response · Leave FR without story coverage · Leave NFR without path ·
Create horizontal stories · Skip BDD ACs · Create circular dependencies · Assume NFRs "just work" ·
Present only one strategy · Skip error/edge-case ACs

**ALWAYS:** Map every FR (zero gaps) · Classify every NFR · BDD Given/When/Then · Error AC per story ·
Size every story · Flag L for justification · Dependency-ordered waves · sprint-status.yaml at backlog ·
Present [C] [R] [P] · Use delta format for revision loops (changed in full + unchanged summary + [F] Show full)
