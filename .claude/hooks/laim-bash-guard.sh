#!/bin/bash
# LaiM Bash Command Guard
# Blocks dangerous git commands: blanket staging, force pushes,
# blanket checkout/restore, hard resets, and force cleans
# Registered as PreToolUse hook on Bash

# Read JSON input from stdin
INPUT=$(cat)

# Extract command using python3 (available on macOS/Linux)
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d.get('tool_input', {}).get('command', ''))
" 2>/dev/null)

# If extraction failed, allow (safe fallback)
if [ -z "$COMMAND" ]; then
  exit 0
fi

BLOCKED=false
REASON=""

# Blanket git staging: git add . / git add -A / git add --all / git add -u
# Dot check uses \./?(\s|$) instead of \b because \b treats the transition
# from . to a letter (e.g. .gitmodules) as a word boundary, causing false
# positives on dotfile staging.
if echo "$COMMAND" | grep -qE 'git\s+add\s+(--all|-A|-u)\b' || echo "$COMMAND" | grep -qE 'git\s+add\s+\./?(\s|$)'; then
  BLOCKED=true
  REASON="Blanket staging blocked. Use \`git add <file1> <file2> ...\` to stage specific files."
fi

# Force push: git push --force / git push -f
if echo "$COMMAND" | grep -qE 'git\s+push\s+.*(-f|--force)\b'; then
  BLOCKED=true
  REASON="Force push blocked. Use \`git push\` without --force, or ask the user for explicit approval."
fi

# Blanket checkout/restore: git checkout -- . / git restore . / git restore --staged .
if echo "$COMMAND" | grep -qE 'git\s+(checkout|restore)\s+(--\s+)?\./?$|git\s+(checkout|restore)\s+--staged\s+\./?$'; then
  BLOCKED=true
  REASON="Blanket checkout/restore blocked. Use \`git checkout -- <file>\` or \`git restore <file>\` to target specific files."
fi

# Hard reset / blanket unstage: git reset --hard / git reset HEAD -- .
if echo "$COMMAND" | grep -qE 'git\s+reset\s+(--hard|.*--\s*\.)'; then
  BLOCKED=true
  REASON="Destructive reset blocked. Use \`git reset --soft\` or \`git reset HEAD -- <file>\` to target specific files."
fi

# Force clean: git clean -f / -fd / -ffd (deletes untracked files)
if echo "$COMMAND" | grep -qE 'git\s+clean\s+-[a-z]*f'; then
  BLOCKED=true
  REASON="Force clean blocked. Use \`git clean -n\` to preview first, then target specific paths."
fi

if [ "$BLOCKED" = true ]; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"[LaiM] %s"}}\n' "$REASON"
  printf '[LaiM] %s\n' "$REASON" >&2
  exit 2
fi

exit 0
