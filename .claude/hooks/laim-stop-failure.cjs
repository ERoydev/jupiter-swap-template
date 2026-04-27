#!/usr/bin/env node
// LaiM StopFailure Hook
// Event: StopFailure (fires when turn ends due to API error)
// Writes recovery marker into state.json so the next session knows it was interrupted.

const fs = require('fs');
const path = require('path');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const cwd = data.cwd || '';
    if (!cwd) process.exit(0);

    // Only fire in LaiM projects — check both state files
    const statePath = path.join(cwd, 'docs', 'state.json');
    const quickStatePath = path.join(cwd, 'docs', '.quick-state.json');
    const targets = [statePath, quickStatePath].filter(p => fs.existsSync(p));
    if (targets.length === 0) process.exit(0);

    // Check git status for uncommitted changes
    let uncommitted = false;
    try {
      const { execSync } = require('child_process');
      const status = execSync('git status --porcelain', { cwd, timeout: 5000 }).toString().trim();
      uncommitted = status.length > 0;
    } catch { /* git not available or not a repo — skip */ }

    // Write recovery marker into all active state files
    for (const target of targets) {
      let state;
      try { state = JSON.parse(fs.readFileSync(target, 'utf8')); }
      catch { continue; }

      state.recovery = {
        interrupted: true,
        interruptedAt: new Date().toISOString(),
        errorType: data.error_type || 'unknown',
        errorMessage: data.error_message || '',
        uncommittedChanges: uncommitted
      };
      state.lastUpdated = new Date().toISOString();

      fs.writeFileSync(target, JSON.stringify(state, null, 2));
    }
  } catch { /* silent — never interfere with error handling */ }
  process.exit(0);
});
process.stdin.resume();
