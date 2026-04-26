---
name: retrospect
description: "Feature-level retrospection — extract learnings from code review, concerns, PR feedback, and metrics. Writes rules and contributions."
version: "next-2.0"
input: "docs/concerns.md, docs/state.json, optional PR number"
output: ".claude/rules/retrospect/*.md, docs/retrospect-contributions/*.md"
paths: [".claude/.laim-manifest.json"]
---

# Retrospect Skill

Post-feature learning extraction. Reads concerns.md, state.json metrics, code-review-agent knowledge gaps, and optionally PR review comments. Classifies findings by type and scope, then writes project rules or contribution drafts.

> This skill runs at Feature Completion (start.md §8) or after Quick Flow completion (quick.md §6). It must execute BEFORE artifact archival — concerns.md and state.json are moved to `.archive-{slug}/` during archival and become unreachable.

## Data Sources

Gather from all available sources. Skip unavailable sources silently.

| Source | How | Required? |
|--------|-----|-----------|
| `docs/concerns.md` | Read file | Yes (skip if file doesn't exist) |
| `docs/state.json` → `metrics.codeReview.*` | Read file | Yes |
| `.claude/rules/retrospect/*.md` | Read existing rules | Yes (to avoid duplicates) |
| PR review comments | `gh api repos/{owner}/{repo}/pulls/{pr}/comments` | No — only if user provides PR number and `gh` is available |
| PR diff delta | `git diff pre-{feature}-{first-story}..post-{feature}-{last-story}` | No — only if git tags exist |
| `docs/stories/*.md` knowledge_gap fields | Read story files | Yes (skip if no stories dir) |

**On `gh` unavailability:** If user provides a PR number but `gh` is not installed or fails, display: `⚠ gh CLI unavailable — skipping PR comment ingestion. Proceeding with local sources.` Continue without PR data.

## Step 1: Collect Findings

### From concerns.md

Read `docs/concerns.md`. Each entry follows the override format:
```
## OV-{N}: Gate {gate_number} Override — {criteria_name}
- **Date**: {ISO date}
- **Phase**: {phase name}
- **Criteria**: #{number} — {criteria description}
- **Severity**: HIGH
- **Risk**: {what could go wrong}
- **Acknowledged by**: user
```

Also includes deferred code review findings (Medium/Low items routed via `implement/SKILL.md:591`).

Extract each as a finding. Parse severity, phase, and risk.

### From state.json metrics

Read `docs/state.json` → `metrics` section. Look for patterns:

| Metric pattern | What it suggests |
|---------------|-----------------|
| `codeReview.criticalFindings > 0` | Architecture may have missed a concern |
| `codeReview.findingsDeferred > 2` | Many deferred items — recurring pattern? |
| `stories.gate5Fails > 0` | Implementation quality issues |
| `stories.gate5Overrides > 0` | Gate 5 was overridden — why? |
| `tasks.totalVerificationCycles` / tasks high | Verification loop was costly — verification gaps? |
| `quality.interfaceMismatches > 0` | Interface contracts drifted during implementation |

Synthesize metric patterns into findings (e.g., "3 gate overrides across 7 stories — recurring verification gaps").

### From story files (knowledge_gap)

If `docs/stories/` exists, read each story file. Extract any code review findings that had a non-empty `Knowledge Gap` field. These were already processed by `[L]` during implementation, but check if the rules were actually written to `.claude/rules/retrospect/`. If a knowledge gap was identified but no rule exists, treat as a missed learning.

### From PR review comments (optional)

If user provided a PR number:
1. Determine `{owner}/{repo}` from `gh repo view --json owner,name --jq '.owner.login + "/" + .name'` or from `git remote get-url origin`. If neither succeeds, skip PR ingestion with the `gh unavailable` message.
2. Run `gh api repos/{owner}/{repo}/pulls/{pr}/comments` — extract inline review comments
3. Run `gh api repos/{owner}/{repo}/pulls/{pr}/reviews` — extract review-level feedback
3. For each comment: extract what the reviewer flagged and why. Pair with the diff context.

### From git diff (optional)

If git tags `pre-{feature}-*` and `post-{feature}-*` exist:
1. `git diff pre-{feature}-{first-story-id}..post-{feature}-{last-story-id} --stat` for an overview
2. For files with high churn (many changes across stories), flag potential architectural issues

## Step 2: Classify Findings

For each collected finding, classify by **type** (what needs to change) and **scope** (who benefits).

### Type classification

| Finding type | Target | Example |
|---|---|---|
| Coding pattern/convention | `.claude/rules/retrospect/{lang}.md` | "Always use factory functions for DB connections" |
| Verification gap | `templates/skills/implement/VERIFY.md` | "VERIFY.md should check for unclosed connections" |
| Prompt ambiguity | `templates/agents/{agent}.md` or `templates/skills/{skill}/SKILL.md` | "code-review-agent misinterprets 'error handling' as try-catch only" |
| Missing gate criterion | `templates/skills/implement/SKILL.md` or `templates/skills/specify/SKILL.md` | "Gate 5 should check for hardcoded secrets" |
| Agent blind spot | `templates/agents/{agent}.md` | "code-review-agent doesn't check for N+1 queries" |
| Skill gap | `templates/skills/{skill}/SKILL.md` | "Architecture skill doesn't consider rate limiting" |
| Pipeline flow gap | `templates/commands/start.md` or `templates/commands/quick.md` | "start.md missing env validation before implement" |

### Scope classification

| Scope | Heuristic | Action |
|---|---|---|
| Project | References project-specific entities, domain logic, local conventions | Write to `.claude/rules/retrospect/` (glob-scoped, never alwaysApply) |
| Global | Language/framework pattern, no project-specific references | Write to `~/.claude/rules/retrospect/` (same format, broader applicability) |
| Contribute | Verification gap, prompt ambiguity, gate gap, agent blind spot, skill gap, flow gap | Generate contribution draft for LaiM repo |

## Step 3: Present Findings

```
═══ LAIM ═══ Retrospection: {feature-name} ═══

Sources: concerns.md ({N} entries), metrics ({N} patterns), stories ({N} knowledge gaps){, PR #{pr} ({N} comments)}

| # | Finding | Type | Severity | Suggested Scope |
|---|---------|------|----------|----------------|
| 1 | {description} | {type} | {sev} | [P] Project |
| 2 | {description} | {type} | {sev} | [G] Global |
| 3 | {description} | {type} | {sev} | [C] Contribute |

For each finding, confirm or change scope:
[P] Project rule  [G] Global rule  [C] Contribute to LaiM  [S] Skip

Enter per-finding: "1P 2G 3C 4S" or [A] Accept all suggestions  [S] Skip all  [P] Pause
```

**HALT — wait for user response.** If input doesn't match the expected format ("1P 2G 3C 4S" or [A]/[S]/[P]), re-present the HALT with: "Format: `{number}{P|G|C|S}` per finding, e.g. `1P 2G 3S`, or [A] Accept all / [S] Skip all."

If zero findings from all sources:
```
═══ LAIM ═══ Retrospection: {feature-name} ═══
No actionable findings. Clean feature. ✅
```
Proceed to return.

## Step 4: Apply by Scope

### On [P] — Project Rule

1. `mkdir -p .claude/rules/retrospect/`
2. Determine target file from finding context:
   - Language-specific → `.claude/rules/retrospect/{lang}.md` (same as `[L]` mechanism in implement/SKILL.md)
   - Universal → `.claude/rules/retrospect/universal.md` (omit `paths:` so Claude Code loads it unconditionally; keep `alwaysApply: true` as a Cursor hint; capped at 10 — at cap, consolidate the two most similar existing rules into one, then append)
3. Read existing rules in target file to check for duplicates
4. If duplicate or near-duplicate found: skip with note `"Similar rule already exists: {existing}"`
5. If creating a new file, include path-scoped frontmatter and header (matching [L] format). Claude Code uses `paths:`; `globs:` is kept alongside for Cursor interop:
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
   {finding expressed as a rule the agent should follow}
   ```
   If appending to an existing file that already has frontmatter, append only the `## [{ISO date}]` entry.
6. If file exceeds 20 rules → consolidate the two most similar existing rules into one before appending

### On [G] — Global Rule

1. Determine target file: `~/.claude/rules/retrospect/{lang}.md` (same directory structure as project, but in user's global config)
2. `mkdir -p ~/.claude/rules/retrospect/`
3. Read existing global rules to check for duplicates
4. Append with same format as project rules — `paths:` scoped to the language, `globs:` kept alongside for Cursor interop
5. Same 20-rule cap with consolidation

> ⚠ Global rules apply to ALL projects on this machine. The agent should confirm: "This rule will apply to all your projects. Confirm? [Y] Yes [N] Change to Project scope"

**HALT — wait for user response.**

### On [C] — Contribute to LaiM

1. Generalize the finding: strip project-specific names, paths, and domain terms
2. Identify the target template file from the type classification
3. Present the generalized contribution for user review:

```
═══ Contribution Draft ═══

Target: {templates/skills/implement/VERIFY.md} — {section}
Finding: {generalized description}
Suggested change: {what to add/modify}

[Y] Create issue  [E] Edit first  [S] Skip
```

**HALT — wait for user response.**

4. On [Y]: Run `gh issue create` on the LaiM repo:
   ```
   gh issue create --repo LimeChain/LaiM \
     --title "retrospect: {finding title}" \
     --label "retrospection" \
     --body "{generalized finding + suggested change + target file}"
   ```
5. On [E]: user edits the text, then [Y] to create or [S] to skip
6. If `gh` is unavailable or `gh issue create` fails (auth error, network, missing label): write the contribution to `docs/retrospect-contributions/{finding-slug}.md` instead, with a note: `"Submit manually to LimeChain/LaiM when ready."`

## Step 5: Summary

After all findings are processed:

```
═══ LAIM ═══ Retrospection Complete ═══

Rules written:
  .claude/rules/retrospect/typescript.md — 2 new rules
  ~/.claude/rules/retrospect/python.md — 1 new rule (global)

Contributions:
  LimeChain/LaiM#NNN — "VERIFY.md should check for unclosed connections"

Skipped: {N} findings
```

Return to the calling command (start.md or quick.md) to proceed with archival.
