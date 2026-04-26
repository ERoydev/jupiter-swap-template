#!/usr/bin/env node
// LaiM Context Statusline Script
// Config: top-level "statusLine" key in settings.json (NOT a hook event)
// Receives context_window metrics from Claude Code on stdin.
// Writes bridge file for laim-context-monitor.js (PostToolUse hook).
// Outputs plain text to stdout — displayed in Claude Code's status line.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STALE_CLEANUP_MS = 24 * 60 * 60 * 1000; // 24h
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

  const ctx = data.context_window;
  if (!ctx || typeof ctx.remaining_percentage !== 'number') process.exit(0);

  const remaining = ctx.remaining_percentage;
  const used = Math.round(ctx.used_percentage || (100 - remaining));

  // Derive session key from cwd (statusLine input has no session_id)
  const cwd = data.cwd || data.workspace?.current_dir || '';
  if (!cwd) process.exit(0);
  const sessionKey = crypto.createHash('sha256').update(cwd).digest('hex').slice(0, 16);

  // Write bridge file for context-monitor hook
  const bridgePath = path.join('/tmp', `laim-ctx-${sessionKey}.json`);
  const bridge = {
    session_id: sessionKey,
    remaining_percentage: remaining,
    used_pct: used,
    timestamp: Math.floor(Date.now() / 1000)
  };
  fs.writeFileSync(bridgePath, JSON.stringify(bridge));

  // Clean stale bridge files (best-effort)
  cleanStaleBridgeFiles();

  // Output plain text — each line is a status line row
  let color;
  if (used < 50) color = '🟢';
  else if (used < 65) color = '🟡';
  else if (used < 80) color = '🟠';
  else color = '🔴';

  process.stdout.write(`${color} Ctx: ${used}% used (${Math.round(remaining)}% left)`);
}

function cleanStaleBridgeFiles() {
  try {
    const files = fs.readdirSync('/tmp');
    const now = Date.now();
    for (const f of files) {
      if (!f.startsWith('laim-ctx-') || !f.endsWith('.json')) continue;
      const full = path.join('/tmp', f);
      try {
        const stat = fs.statSync(full);
        if (now - stat.mtimeMs > STALE_CLEANUP_MS) fs.unlinkSync(full);
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

main();
