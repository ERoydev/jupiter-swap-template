#!/usr/bin/env node
// LaiM PostCompact Hook
// Event: PostCompact (fires after conversation compaction)
// Writes compacted marker into state.json so the implement skill knows
// to re-read critical artifacts before proceeding.
// PostCompact cannot output additionalContext — side-effects only.

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

    // Check both state files
    const statePath = path.join(cwd, 'docs', 'state.json');
    const quickStatePath = path.join(cwd, 'docs', '.quick-state.json');
    const targets = [statePath, quickStatePath].filter(p => fs.existsSync(p));
    if (targets.length === 0) process.exit(0);

    // Write compacted marker into all active state files
    for (const target of targets) {
      let state;
      try { state = JSON.parse(fs.readFileSync(target, 'utf8')); }
      catch { continue; }

      state.compacted = {
        at: new Date().toISOString(),
        trigger: data.compaction_trigger || 'unknown'
      };
      state.lastUpdated = new Date().toISOString();

      fs.writeFileSync(target, JSON.stringify(state, null, 2));
    }
  } catch { /* silent */ }
  process.exit(0);
});
process.stdin.resume();
