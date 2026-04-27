#!/usr/bin/env node
// LaiM Artifact Monitor Hook
// Event: FileChanged
// Watches docs/ artifacts for unexpected modifications during active sessions.
// Injects additionalContext warnings when immutable artifacts are modified.

const fs = require('fs');
const path = require('path');

const STDIN_TIMEOUT_MS = 2000;

function main() {
  let input = '';
  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    process.exit(0);
  }, STDIN_TIMEOUT_MS);

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    clearTimeout(timeout);
    if (timedOut) return;

    try {
      processInput(input);
    } catch {
      process.exit(0);
    }
  });
  process.stdin.resume();
}

function processInput(input) {
  const data = JSON.parse(input);
  const filePath = data.file_path || '';
  const cwd = data.cwd || '';
  if (!filePath || !cwd) process.exit(0);

  // Only monitor docs/ artifacts
  const rel = path.relative(cwd, filePath);
  if (!rel.startsWith('docs/') && !rel.startsWith('docs\\')) process.exit(0);

  const statePath = path.join(cwd, 'docs', 'state.json');
  if (!fs.existsSync(statePath)) process.exit(0); // not a LaiM project

  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    process.exit(0);
  }

  const basename = path.basename(filePath);
  let warning = null;

  // architecture.md modified after Gate 3
  if (basename === 'architecture.md') {
    const archStatus = state.phases?.architecture?.status;
    if (archStatus === 'complete') {
      warning = 'ARCHITECTURE DRIFT: architecture.md modified after Gate 3. Changes should go to docs/amendments.md instead. Architecture is immutable post-gate — drift is tracked via amendments.';
    }
  }

  // spec.md modified after Gate 2
  if (basename === 'spec.md') {
    const specStatus = state.phases?.specify?.status;
    if (specStatus === 'complete') {
      warning = 'SPEC MODIFIED: spec.md changed after Gate 2. Verify the change is intentional — downstream phases (architecture, plan) may have stale assumptions.';
    }
  }

  // plan.md modified after Gate 4
  if (basename === 'plan.md') {
    const planStatus = state.phases?.plan?.status;
    if (planStatus === 'complete') {
      warning = 'PLAN MODIFIED: plan.md changed after Gate 4. Stories may reference outdated plan content. Review affected stories.';
    }
  }

  // state.json external modification — validate structure
  if (basename === 'state.json') {
    try {
      const updated = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!updated.feature || !updated.currentPhase) {
        warning = 'STATE CORRUPTION: state.json modified externally and is missing required fields (feature, currentPhase). Verify the file is valid.';
      }
    } catch {
      warning = 'STATE CORRUPTION: state.json modified externally and is not valid JSON. Recovery may be needed (start.md §10).';
    }
  }

  if (!warning) process.exit(0);

  const output = {
    systemMessage: `⚠ ${warning}`
  };

  process.stdout.write(JSON.stringify(output));
}

main();
