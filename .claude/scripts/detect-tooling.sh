#!/bin/bash
# LaiM Tooling Detection Script
# Scans the project for build/test/lint/format tools and outputs JSON.
# Usage: bash detect-tooling.sh [project-dir]
# Output: JSON compatible with state.json tooling section

DIR="${1:-.}"

FORMAT=""
LINT=""
LINT_FIX=""
BUILD=""
TEST=""
TEST_CHANGED=""
TEST_REPORT=""
SECURITY=""
CSS_FRAMEWORK=""
DEV_SERVER=""
DEV_PORT=""
ENV_TEMPLATE=""
A11Y_LINT=""

# --- Node.js (package.json) ---
if [ -f "$DIR/package.json" ]; then
  SCRIPTS=$(python3 -c "
import json, sys
try:
  pkg = json.load(open('$DIR/package.json'))
  scripts = pkg.get('scripts', {})
  deps = {**pkg.get('dependencies', {}), **pkg.get('devDependencies', {})}
  for k, v in scripts.items(): print(f'script:{k}={v}')
  for k in deps: print(f'dep:{k}')
except: pass
" 2>/dev/null)

  # Build
  if echo "$SCRIPTS" | grep -q "^script:build="; then
    BUILD="npm run build"
  fi

  # Test
  if echo "$SCRIPTS" | grep -q "^script:test="; then
    TEST="npm test"
  fi

  # Lint
  if echo "$SCRIPTS" | grep -q "^script:lint="; then
    LINT="npm run lint"
  fi
  if echo "$SCRIPTS" | grep -q "^script:lint:fix="; then
    LINT_FIX="npm run lint:fix"
  elif [ -n "$LINT" ]; then
    LINT_FIX="$LINT -- --fix"
  fi

  # Format
  if echo "$SCRIPTS" | grep -q "^script:format="; then
    FORMAT="npm run format"
  elif echo "$SCRIPTS" | grep -q "^dep:prettier"; then
    FORMAT="npx prettier --write"
  fi

  # Security
  SECURITY="npm audit"

  # Accessibility lint detection
  if echo "$SCRIPTS" | grep -q "^dep:eslint-plugin-jsx-a11y"; then
    A11Y_LINT="eslint-plugin-jsx-a11y"
  elif echo "$SCRIPTS" | grep -q "^dep:jest-axe\|^dep:@axe-core"; then
    A11Y_LINT="axe"
  elif echo "$SCRIPTS" | grep -q "^dep:pa11y"; then
    A11Y_LINT="pa11y"
  fi

  # Test runner detection for test_changed and test_report
  if echo "$SCRIPTS" | grep -q "^dep:vitest"; then
    TEST_CHANGED="npx vitest --changed"
    TEST_REPORT="vitest-json"
  elif echo "$SCRIPTS" | grep -q "^dep:jest"; then
    TEST_CHANGED="npx jest --changedSince=HEAD~1"
    TEST_REPORT="jest-json"
  elif [ -f "$DIR/vitest.config.ts" ] || [ -f "$DIR/vitest.config.mts" ] || [ -f "$DIR/vitest.config.js" ]; then
    TEST_CHANGED="npx vitest --changed"
    TEST_REPORT="vitest-json"
  elif [ -f "$DIR/jest.config.ts" ] || [ -f "$DIR/jest.config.js" ] || [ -f "$DIR/jest.config.mjs" ]; then
    TEST_CHANGED="npx jest --changedSince=HEAD~1"
    TEST_REPORT="jest-json"
  fi

  # CSS framework detection
  if echo "$SCRIPTS" | grep -q "^dep:tailwindcss"; then
    CSS_FRAMEWORK="tailwind"
    # Tailwind v4 consistency: plugin in deps but not in vite config
    if echo "$SCRIPTS" | grep -q "^dep:@tailwindcss/vite"; then
      if [ -f "$DIR/vite.config.ts" ] || [ -f "$DIR/vite.config.js" ]; then
        VITE_CFG=$(cat "$DIR/vite.config.ts" "$DIR/vite.config.js" 2>/dev/null)
        if ! echo "$VITE_CFG" | grep -q "@tailwindcss/vite"; then
          echo "WARN: @tailwindcss/vite in deps but not referenced in vite.config" >&2
        fi
      fi
    fi
  elif echo "$SCRIPTS" | grep -q "^dep:postcss"; then
    CSS_FRAMEWORK="postcss"
  fi

  # Dev server detection
  if echo "$SCRIPTS" | grep -q "^script:dev="; then
    DEV_SERVER="npm run dev"
  elif echo "$SCRIPTS" | grep -q "^script:start="; then
    DEV_SERVER="npm start"
  fi

  # Dev port best-effort extraction
  if [ -n "$DEV_SERVER" ]; then
    if echo "$SCRIPTS" | grep -q "^dep:next"; then
      DEV_PORT="3000"
    elif echo "$SCRIPTS" | grep -q "^dep:vite\|^dep:@vitejs"; then
      DEV_PORT="5173"
    elif echo "$SCRIPTS" | grep -q "^dep:react-scripts"; then
      DEV_PORT="3000"
    fi
  fi
fi

# .env template detection (framework-agnostic)
if [ -f "$DIR/.env.example" ]; then
  ENV_TEMPLATE=".env.example"
elif [ -f "$DIR/.env.sample" ]; then
  ENV_TEMPLATE=".env.sample"
elif [ -f "$DIR/.env.template" ]; then
  ENV_TEMPLATE=".env.template"
fi

# --- Go ---
if [ -f "$DIR/go.mod" ]; then
  BUILD="${BUILD:-go build ./...}"
  TEST="${TEST:-go test ./...}"
  TEST_REPORT="${TEST_REPORT:-go-test-json}"
  LINT="${LINT:-golangci-lint run}"
  LINT_FIX="${LINT_FIX:-golangci-lint run --fix}"
  if command -v govulncheck >/dev/null 2>&1; then
    SECURITY="${SECURITY:-govulncheck ./...}"
  fi
fi

# --- Rust ---
if [ -f "$DIR/Cargo.toml" ]; then
  BUILD="${BUILD:-cargo build}"
  TEST="${TEST:-cargo test}"
  TEST_REPORT="${TEST_REPORT:-cargo-test}"
  LINT="${LINT:-cargo clippy}"
  LINT_FIX="${LINT_FIX:-cargo clippy --fix}"
  FORMAT="${FORMAT:-cargo fmt}"
  if command -v cargo-audit >/dev/null 2>&1; then
    SECURITY="${SECURITY:-cargo audit}"
  fi
fi

# --- Java/Gradle ---
if [ -f "$DIR/build.gradle" ] || [ -f "$DIR/build.gradle.kts" ]; then
  BUILD="${BUILD:-./gradlew build}"
  TEST="${TEST:-./gradlew test}"
  TEST_REPORT="${TEST_REPORT:-junit-xml}"
  LINT="${LINT:-./gradlew check}"
fi

# --- Java/Maven ---
if [ -f "$DIR/pom.xml" ]; then
  BUILD="${BUILD:-mvn compile}"
  TEST="${TEST:-mvn test}"
  TEST_REPORT="${TEST_REPORT:-junit-xml}"
fi

# --- Python ---
if [ -f "$DIR/pyproject.toml" ] || [ -f "$DIR/setup.py" ] || [ -f "$DIR/requirements.txt" ]; then
  TEST="${TEST:-pytest}"
  TEST_REPORT="${TEST_REPORT:-junit-xml}"
  LINT="${LINT:-ruff check .}"
  LINT_FIX="${LINT_FIX:-ruff check --fix .}"
  FORMAT="${FORMAT:-ruff format .}"
  if command -v pip-audit >/dev/null 2>&1; then
    SECURITY="${SECURITY:-pip-audit}"
  fi
fi

# --- Makefile ---
if [ -f "$DIR/Makefile" ]; then
  if grep -q "^test:" "$DIR/Makefile" 2>/dev/null; then
    TEST="${TEST:-make test}"
  fi
  if grep -q "^build:" "$DIR/Makefile" 2>/dev/null; then
    BUILD="${BUILD:-make build}"
  fi
  if grep -q "^lint:" "$DIR/Makefile" 2>/dev/null; then
    LINT="${LINT:-make lint}"
  fi
fi

# Null-safe JSON output
json_val() { [ -n "$1" ] && echo "\"$1\"" || echo "null"; }

cat <<ENDJSON
{
  "format": $(json_val "$FORMAT"),
  "lint": $(json_val "$LINT"),
  "lint_fix": $(json_val "$LINT_FIX"),
  "build": $(json_val "$BUILD"),
  "test": $(json_val "$TEST"),
  "test_changed": $(json_val "$TEST_CHANGED"),
  "test_report": $(json_val "$TEST_REPORT"),
  "security": $(json_val "$SECURITY"),
  "css_framework": $(json_val "$CSS_FRAMEWORK"),
  "dev_server": $(json_val "$DEV_SERVER"),
  "dev_port": $(json_val "$DEV_PORT"),
  "env_template": $(json_val "$ENV_TEMPLATE"),
  "accessibility_lint": $(json_val "$A11Y_LINT")
}
ENDJSON
