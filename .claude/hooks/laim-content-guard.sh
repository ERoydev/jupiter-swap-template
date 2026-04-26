#!/bin/bash
# LaiM Content Guard Hook
# Blocks: test-disable annotations without tracking refs, lock file edits
# Registered as PreToolUse hook on Edit|Write
#
# Scope discipline (issue #239):
#   - The test-disable scan is gated to files that look like test files
#     (path contains /test/, /tests/, /__tests__/, /spec/, /specs/, or basename
#     contains "test"/"spec"/"Test"/"Spec"). A Go main.go or an application
#     component is never a test file; blocking writes to it based on test-only
#     helpers is incorrect.
#   - Language-specific alternations in the regex use word boundaries so
#     substrings like "xit(" inside "os.Exit(" / "process.exit(" /
#     "Transmit(" cannot match the JavaScript xit() helper.
#   - Lock-file protection is unchanged and fires on every file.

# Read JSON input from stdin
INPUT=$(cat)

# Extract fields and write content to temp file using python3
CONTENT_FILE=$(mktemp /tmp/laim-content-XXXXXX 2>/dev/null || echo "")
EXTRACTED=$(echo "$INPUT" | python3 -c "
import sys, json, os
d = json.load(sys.stdin)
ti = d.get('tool_input', {})
fp = ti.get('file_path', '')
content = ti.get('new_string', '') or ti.get('content', '')
print(fp)
print(os.path.basename(fp))
# Write content to temp file passed via argv
if len(sys.argv) > 1 and content:
    with open(sys.argv[1], 'w') as f:
        f.write(content)
" "$CONTENT_FILE" 2>/dev/null)

# Parse python output (line 1 = file_path, line 2 = filename)
# Use printf + read to avoid echo interpreting escape sequences in file paths
FILE_PATH=$(printf '%s' "$EXTRACTED" | head -1)
FILENAME=$(printf '%s' "$EXTRACTED" | tail -1)

# If extraction failed, allow (safe fallback)
if [ -z "$FILE_PATH" ]; then
  rm -f "$CONTENT_FILE" 2>/dev/null
  exit 0
fi

BLOCKED=false
REASON=""

# --- Lock file protection ---
case "$FILENAME" in
  package-lock.json|yarn.lock|pnpm-lock.yaml|go.sum|Cargo.lock|composer.lock|Gemfile.lock|poetry.lock)
    BLOCKED=true
    REASON="Lock files must not be edited manually. Use package manager commands instead (npm install, go mod tidy, cargo update, etc.)."
    ;;
  *.gen.*)
    BLOCKED=true
    REASON="Generated files (*.gen.*) must not be edited manually. Re-run the code generator instead."
    ;;
esac

# --- Test-disable annotation detection ---
# Gated to test files only. Non-test sources (e.g., application main files,
# CLI scripts) are skipped entirely so JavaScript-specific helpers like xit()
# cannot induce blocks on Go/Rust/Node application code.
IS_TEST_FILE=false
case "$FILE_PATH" in
  */test/*|*/tests/*|*/__tests__/*|*/spec/*|*/specs/*)
    IS_TEST_FILE=true
    ;;
esac
if [ "$IS_TEST_FILE" = false ]; then
  case "$FILENAME" in
    *test*|*spec*|*Test*|*Spec*)
      IS_TEST_FILE=true
      ;;
  esac
fi

if [ "$BLOCKED" = false ] && [ "$IS_TEST_FILE" = true ] && [ -s "$CONTENT_FILE" ]; then
  # Identifier-style alternatives are anchored with \b so that substrings
  # like "xit(" inside "os.Exit(" / "process.exit(" / "Transmit(" do not
  # spuriously match the JavaScript xit() helper. Annotation-style
  # alternatives (@Disabled, @Ignore, #[ignore], etc.) already start with a
  # non-word character and do not need the anchor.
  DISABLE_MATCH=$(grep -nE '@Disabled|@Ignore|@Skip|@Pending|pytest\.mark\.skip|pytest\.skip|unittest\.skip|\bxit\(|\bxdescribe\(|\bxcontext\(|\.skip\(|\.todo\(|\bt\.Skip\b|\bt\.SkipNow\b|\bb\.Skip\b|#\[ignore\]|\[Ignore\]|\[Fact\(Skip|\[Theory\(Skip|enabled\s*=\s*false' "$CONTENT_FILE" 2>/dev/null)

  if [ -n "$DISABLE_MATCH" ]; then
    # Check for tracking reference on the same line (JIRA-123, #123, GH-123, etc.)
    HAS_REF=$(echo "$DISABLE_MATCH" | grep -E '[A-Z]+-[0-9]+|#[0-9]+|GH-[0-9]+' 2>/dev/null)
    if [ -z "$HAS_REF" ]; then
      BLOCKED=true
      REASON="Test-disable annotation detected without a tracking reference. Add a ticket reference (e.g., @Disabled(\"JIRA-123: reason\")) or remove the annotation."
    fi
  fi
fi

# Cleanup temp file
rm -f "$CONTENT_FILE" 2>/dev/null

if [ "$BLOCKED" = true ]; then
  SAFE_REASON=$(echo "$REASON" | sed 's/"/\\"/g')
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"[LaiM] %s"}}\n' "$SAFE_REASON"
  printf '[LaiM] %s\n' "$REASON" >&2
  exit 2
fi

exit 0
