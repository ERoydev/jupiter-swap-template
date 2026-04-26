---
description: "Cut a git branch for the current in-progress LaiM story. User-invoked, independent of /implement. Run after story-creation HALT, before task work begins."
paths: ["docs/state.json"]
---

# /story-branch — Per-Story Branch Cutter

Read-only with respect to LaiM artifacts. Only touches git. No state.json writes, no SKILL edits.

This command is an optional, user-invoked add-on. LaiM's `/start` and `/implement` flows are untouched — they continue to commit per-task as usual, but those commits land on the branch this command creates.

## 1. Read current story

Read `docs/state.json` with the Read tool. Extract:

- `currentStory.storyId` — e.g. `3-1`
- `currentStory.slug` — e.g. `preflight-checks-transaction-signing`

If `currentStory` is missing, null, or has `status != "in-progress"`:
```
No in-progress story found in docs/state.json.
Start (or resume) a story via /start before running /story-branch.
```
→ HALT. Do nothing else.

## 2. Compute branch name

```
STORY_BRANCH = story/{storyId}-{slug}
```

Example: story 3-1 with slug `preflight-checks-transaction-signing` → `story/3-1-preflight-checks-transaction-signing`.

## 3. Capture base branch + sanity-check working tree

Run:
```bash
git branch --show-current
```

Capture output as `BASE_BRANCH`.

**If `BASE_BRANCH` is not `main`:**
```
Current branch is {BASE_BRANCH}, not main.
{STORY_BRANCH} will be cut from {BASE_BRANCH}, which may include unmerged work.

[C] Continue — cut from {BASE_BRANCH} anyway
[A] Abort — switch to main manually first
```
→ HALT on this prompt. On `[A]`, exit without creating the branch.

**Check for uncommitted source changes:**
```bash
git status --porcelain src/
```

If the output is non-empty:
```
⚠ Uncommitted changes in src/:
{output}

Creating a branch with dirty src/ will carry those changes onto the new branch.
[C] Continue — take the changes with us onto {STORY_BRANCH}
[A] Abort — commit or stash src/ changes first
```
→ HALT. On `[A]`, exit without creating the branch.

Note: LaiM's own working files (`docs/state.json`, `docs/sprint-status.yaml`, `docs/stories/*.md`) are expected to be dirty mid-story. Do not warn about them — only `src/` matters here.

## 4. Create or switch to the branch

Check whether the branch already exists locally:
```bash
git show-ref --verify --quiet refs/heads/{STORY_BRANCH} && echo exists || echo new
```

- **Exists** (resumed story, prior `/story-branch` invocation):
  ```bash
  git checkout {STORY_BRANCH}
  ```
  Display: `Switched to existing branch {STORY_BRANCH}.`

- **New:**
  ```bash
  git checkout -b {STORY_BRANCH}
  ```
  Display: `Created and switched to {STORY_BRANCH} from {BASE_BRANCH}.`

If the checkout fails for any reason (e.g. detached HEAD, conflicts), print the error verbatim and stop — do not attempt to recover automatically.

## 5. Confirmation output

Print:
```
═══ Story branch ready ═══
  Branch:  {STORY_BRANCH}
  Base:    {BASE_BRANCH}
  Story:   {storyId} — read title from state.json currentStory.title
  Next:    Resume /start. All task commits for this story will land on {STORY_BRANCH}.
           When Gate 5 passes, run /story-pr.
```

No further action. Control returns to the user.
