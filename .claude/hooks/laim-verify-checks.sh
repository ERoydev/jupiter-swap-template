#!/bin/bash
# LaiM Verification Checks Hook
# Event: PostToolUse on Bash (fires after git commit)
# Runs stub detection, security scan, test-disable scan, and assertion-free
# check on staged files. Injects findings via additionalContext.
#
# Design notes (issue #224):
#   - Language-specific heuristics are gated by file extension so a Java pattern
#     cannot match a TypeScript file.
#   - Findings are reported per-match (heuristic: file:line: matched-text) so the
#     agent can triage instead of guess from an aggregated count.
#   - Output framing is explicitly advisory — findings are signals, not commands
#     to rewrite code.
#   - Authoritative pattern enumeration for humans lives in
#     templates/skills/implement/VERIFY.md §4. This script is the enforcer; the
#     doc and this script must stay in sync.

# Read JSON input from stdin
INPUT=$(cat)

# Fast path: skip python3 if input doesn't contain git commit
if ! echo "$INPUT" | grep -q 'git.*commit'; then
  exit 0
fi

# Extract command using python3
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d.get('tool_input', {}).get('command', ''))
" 2>/dev/null)

# Only run after git commit
if ! echo "$COMMAND" | grep -qE 'git\s+commit'; then
  exit 0
fi

# Get changed files from the last commit
CHANGED_FILES=$(git diff --name-only HEAD~1 HEAD 2>/dev/null)
if [ -z "$CHANGED_FILES" ]; then
  exit 0
fi

# Filter to only existing files
EXISTING_FILES=""
for f in $CHANGED_FILES; do
  [ -f "$f" ] && EXISTING_FILES="$EXISTING_FILES $f"
done
if [ -z "$EXISTING_FILES" ]; then
  exit 0
fi

# --- Helpers ---

# filter_by_ext "<extension regex>"
#   Echo the subset of $EXISTING_FILES whose names match the extension regex.
#   Empty output if nothing matches.
filter_by_ext() {
  local ext_regex=$1
  echo "$EXISTING_FILES" | tr ' ' '\n' | grep -E "$ext_regex" | tr '\n' ' '
}

# filter_untracked
#   Reads lines on stdin; emits lines that do NOT carry a tracking reference
#   (JIRA-123, GH-123, or #123). Used to suppress intentionally-tracked items.
filter_untracked() {
  grep -vE '[A-Z]+-[0-9]+|#[0-9]+|GH-[0-9]+'
}

# prepend_heuristic "<NAME>"
#   Reads lines on stdin (grep -HnE style: file:line:match) and prefixes each
#   non-empty line with the heuristic name, yielding "NAME: file:line:match".
prepend_heuristic() {
  local name=$1
  awk -v n="$name" 'NF { print n ": " $0 }'
}

FINDINGS=""

append_block() {
  local block=$1
  [ -n "$block" ] && FINDINGS="${FINDINGS}${block}"$'\n'
}

# ----------------------------------------------------------------------
# Stub detection (canonical source — VERIFY.md §4 describes these patterns)
# ----------------------------------------------------------------------
# Each heuristic:
#   1) narrows to files the pattern is meant for (extension gate)
#   2) emits per-match lines via grep -HnE (no -l)
#   3) optionally filters out matches carrying a tracking reference
#
# HOLLOW (generic return null/undefined/{}/[]) is intentionally dropped:
# the patterns match legitimate nullable returns and empty-state bodies in
# every C-family language. If brought back, it must be gated AND narrowed.

# STUBS — TODO/FIXME/HACK/XXX markers. Not language-specific (apply broadly).
# Tracking-ref exemption: TODO(#123), FIXME(JIRA-45), HACK(GH-99) are allowed.
STUBS=$(grep -HnE "TODO|FIXME|HACK|XXX|placeholder|not implemented|coming soon" $EXISTING_FILES 2>/dev/null \
  | filter_untracked \
  | prepend_heuristic "STUBS")

# THROW_STUB — explicit "not implemented" throws. Gate to source-code extensions.
JS_JAVA_FILES=$(filter_by_ext '\.(js|jsx|mjs|cjs|ts|tsx|java|kt|kts)$')
THROW_STUB=""
[ -n "$JS_JAVA_FILES" ] && THROW_STUB=$(grep -HnE "throw new Error.*not impl|throw new UnsupportedOperationException" $JS_JAVA_FILES 2>/dev/null \
  | prepend_heuristic "THROW_STUB")

# CONSOLE_ONLY — {console.log...} single-line handlers. JS/TS family only.
JS_FILES=$(filter_by_ext '\.(js|jsx|mjs|cjs|ts|tsx)$')
CONSOLE_ONLY=""
[ -n "$JS_FILES" ] && CONSOLE_ONLY=$(grep -HnE "\{[[:space:]]*console\.(log|error|warn)[^}]*\}[[:space:]]*$" $JS_FILES 2>/dev/null \
  | prepend_heuristic "CONSOLE_ONLY")

# Java-specific heuristics. Gate strictly to .java.
JAVA_FILES=$(filter_by_ext '\.java$')
JAVA_THROW=""
JAVA_HOLLOW=""
JAVA_EMPTY_COLL=""
if [ -n "$JAVA_FILES" ]; then
  JAVA_THROW=$(grep -HnE "throw new (RuntimeException|IllegalStateException)\s*\(\s*\"(not impl|Not yet impl|TODO|FIXME|stub)" $JAVA_FILES 2>/dev/null \
    | prepend_heuristic "JAVA_THROW")
  # Narrowed per issue #224: bare `return 0;` and `return false;` are legitimate
  # in Java too. Only `0L` and `""` are genuine stub tells inside .java.
  JAVA_HOLLOW=$(grep -HnE "return\s+(0L|\"\")\s*;" $JAVA_FILES 2>/dev/null \
    | prepend_heuristic "JAVA_HOLLOW")
  JAVA_EMPTY_COLL=$(grep -HnE "return\s+(Collections\.empty(List|Map|Set)\(\)|Optional\.empty\(\)|List\.of\(\)|Map\.of\(\)|Set\.of\(\))\s*;" $JAVA_FILES 2>/dev/null \
    | prepend_heuristic "JAVA_EMPTY_COLL")
fi

# Kotlin TODO() function. Gate to .kt/.kts.
KOTLIN_FILES=$(filter_by_ext '\.(kt|kts)$')
KOTLIN_TODO=""
[ -n "$KOTLIN_FILES" ] && KOTLIN_TODO=$(grep -HnE "\bTODO\(\s*(\"[^\"]*\")?\s*\)" $KOTLIN_FILES 2>/dev/null \
  | prepend_heuristic "KOTLIN_TODO")

# Python pass-only lines. Gate to .py.
PYTHON_FILES=$(filter_by_ext '\.py$')
PYTHON_PASS=""
[ -n "$PYTHON_FILES" ] && PYTHON_PASS=$(grep -HnE "^\s*pass\s*$" $PYTHON_FILES 2>/dev/null \
  | prepend_heuristic "PYTHON_PASS")

STUB_MATCHES=$(printf '%s\n%s\n%s\n%s\n%s\n%s\n%s\n%s' \
  "$STUBS" "$THROW_STUB" "$CONSOLE_ONLY" \
  "$JAVA_THROW" "$JAVA_HOLLOW" "$JAVA_EMPTY_COLL" \
  "$KOTLIN_TODO" "$PYTHON_PASS" | grep -v '^$')
if [ -n "$STUB_MATCHES" ]; then
  append_block "Stubs (per-match):"$'\n'"$STUB_MATCHES"
fi

# ----------------------------------------------------------------------
# Security scan (canonical source — VERIFY.md §3e references this hook)
# ----------------------------------------------------------------------
# Kept aggregated. Emitting raw secret text to additionalContext would leak it
# into the agent's transcript; count-only is the safer contract.
SEC=$(grep -rniE "(password|secret|api_key|private_key)\s*[:=]\s*['\"][^'\"]{8,}['\"]" $EXISTING_FILES 2>/dev/null \
  | grep -v "\.test\.\|\.spec\.\|__tests__\|__mocks__\|\.example\|\.sample" \
  | grep -vi "token_address\|token_symbol\|contract_address\|token_id")
# Java/Spring: unquoted secrets in .properties/.yml/.yaml (skip ${...} placeholders)
SEC_JAVA=$(grep -rnE "(password|secret|api[_.-]?key|private[_.-]?key|token)\s*[=:]\s*[^\${\s'\"][^\s]{8,}" $EXISTING_FILES 2>/dev/null \
  | grep -E "\.(properties|yml|yaml):" \
  | grep -v "\.test\.\|\.spec\.\|\.example\|\.sample\|\.template")

SEC_ALL=$(printf '%s\n%s' "$SEC" "$SEC_JAVA" | grep -v '^$' | sort -u)
if [ -n "$SEC_ALL" ]; then
  COUNT=$(echo "$SEC_ALL" | wc -l | tr -d ' ')
  append_block "Secrets: ${COUNT} potential hardcoded secret(s) detected."
fi

# ----------------------------------------------------------------------
# Test-disable scan (per-match, tracking-ref exemption preserved)
# ----------------------------------------------------------------------
TEST_FILES=$(echo "$EXISTING_FILES" | tr ' ' '\n' | grep -iE 'test|spec' | tr '\n' ' ')
if [ -n "$TEST_FILES" ]; then
  DISABLED=$(grep -HnE "@Disabled|@Ignore|@Skip|@Pending|pytest\.mark\.skip|pytest\.skip|unittest\.skip|xit\(|xdescribe\(|xcontext\(|\.skip\(|\.todo\(|t\.Skip|t\.SkipNow|b\.Skip|#\[ignore\]|\[Ignore\]|\[Fact\(Skip|\[Theory\(Skip|enabled\s*=\s*false" $TEST_FILES 2>/dev/null)

  if [ -n "$DISABLED" ]; then
    NO_REF=$(echo "$DISABLED" | filter_untracked | prepend_heuristic "DISABLED_TEST")
    if [ -n "$NO_REF" ]; then
      append_block "Disabled tests (per-match, no tracking ref):"$'\n'"$NO_REF"
    fi
  fi

  # Assertion-free test detection — inherently filename-level, keep aggregated.
  ASSERT_FREE=$(grep -rLE "expect\(|assert|should\.\|must\.\|\.to\(|\.toBe|\.toEqual|\.toMatch|\.toThrow|\.toContain|\.toHave|Assert\.|assertEquals|assertTrue|assertFalse|assertThrows|assertThat|assertNotNull|assert\.Equal|assert\.NoError|assert\.Nil|assert\.True|assert\.Contains|#\[should_panic\]" $TEST_FILES 2>/dev/null \
    | grep -v "conftest\|testutil\|factory\|fixture\|helper\|setup\|mock\|__fixtures__\|__mocks__")

  if [ -n "$ASSERT_FREE" ]; then
    COUNT=$(echo "$ASSERT_FREE" | wc -l | tr -d ' ')
    append_block "Assertion-free: ${COUNT} test file(s) with zero assertions: ${ASSERT_FREE}"
  fi
fi

# Output findings if any
if [ -n "$FINDINGS" ]; then
  HEADER=$'VERIFICATION FINDINGS (advisory — review each match before acting; do NOT rewrite code solely to satisfy a stub heuristic):\n\n'
  CONTEXT="${HEADER}${FINDINGS}"
  ENCODED=$(printf '%s' "$CONTEXT" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null)
  if [ -n "$ENCODED" ]; then
    printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":%s}}\n' "$ENCODED"
  fi
fi

exit 0
