#!/usr/bin/env node
// LaiM SessionStart Hook (issue #218)
// Event: SessionStart (fires at the start of every Claude Code session)
// Appends the session's id + transcript path into state.json.sessions[] so
// analyze-usage.cjs can enumerate all JSONLs that belong to this feature's
// lifetime. Idempotent — same session id never inserted twice.
//
// This hook writes state.json directly (not via the Write tool) and therefore
// bypasses validate-state.sh. Safe because the only field it touches is the
// new top-level `sessions` array, which validate-state.sh does not police.
// Atomic write via tmp + rename to avoid concurrent-corruption risk.
//
// No-ops when state.json is absent (not a LaiM project, or pre-init).

const fs = require('fs');
const path = require('path');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input || '{}');
    const cwd = data.cwd || process.cwd();
    const sessionId = data.session_id;
    const transcriptPath = data.transcript_path || null;
    if (!sessionId) {
      process.exit(0);
    }

    const statePath = path.join(cwd, 'docs', 'state.json');
    const quickStatePath = path.join(cwd, 'docs', '.quick-state.json');
    const targetPath = fs.existsSync(statePath)
      ? statePath
      : fs.existsSync(quickStatePath)
        ? quickStatePath
        : null;
    if (!targetPath) {
      process.exit(0);
    }

    let state;
    try {
      state = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    } catch {
      process.exit(0);
    }
    if (!state || typeof state !== 'object') {
      process.exit(0);
    }

    if (!Array.isArray(state.sessions)) state.sessions = [];
    if (state.sessions.some((s) => s && s.id === sessionId)) {
      process.exit(0);
    }

    state.sessions.push({
      id: sessionId,
      transcript: transcriptPath,
      firstSeenAt: new Date().toISOString(),
    });

    const tmp = targetPath + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, targetPath);
  } catch {
    /* silent — never break a session on hook error */
  }
  process.exit(0);
});
process.stdin.resume();
