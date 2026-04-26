#!/usr/bin/env node
// LaiM Context Monitor Hook
// Event: PostToolUse
// Reads bridge file from statusline hook, injects additionalContext warnings
// when context window is running low.
//
// Adapted from GSD's gsd-context-monitor.js (proven in production).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WARN_THRESHOLD = 35;   // remaining % — inject WARNING
const CRIT_THRESHOLD = 25;   // remaining % — inject CRITICAL
const DEBOUNCE_CALLS = 5;    // suppress repeated warnings for N tool uses
const STALE_SECONDS = 60;    // ignore bridge data older than this
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

  // Derive session key from cwd (matches laim-statusline.cjs fallback chain)
  const cwd = data.cwd || data.workspace?.current_dir || '';
  if (!cwd) process.exit(0);
  const sessionKey = crypto.createHash('sha256').update(cwd).digest('hex').slice(0, 16);

  // Read bridge file written by laim-statusline.cjs
  const bridgePath = path.join('/tmp', `laim-ctx-${sessionKey}.json`);
  if (!fs.existsSync(bridgePath)) process.exit(0); // no bridge = subagent or statusline not installed

  let bridge;
  try {
    bridge = JSON.parse(fs.readFileSync(bridgePath, 'utf8'));
  } catch {
    process.exit(0); // parse error — reset gracefully
  }

  // Stale check
  const age = Math.floor(Date.now() / 1000) - (bridge.timestamp || 0);
  if (age > STALE_SECONDS) process.exit(0);

  const remaining = bridge.remaining_percentage;
  if (typeof remaining !== 'number' || remaining > WARN_THRESHOLD) process.exit(0);

  // Check opt-out via state.json
  if (isOptedOut()) process.exit(0);

  // Determine severity
  const level = remaining <= CRIT_THRESHOLD ? 'critical' : 'warning';

  // Debounce: suppress repeated same-level warnings
  const statePath = path.join('/tmp', `laim-ctx-${sessionKey}-warned.json`);
  let state = { callsSinceWarn: 0, lastLevel: null };
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch { /* first run or parse error — use defaults */ }

  const escalation = state.lastLevel === 'warning' && level === 'critical';
  const debounced = state.lastLevel === level && state.callsSinceWarn < DEBOUNCE_CALLS;

  if (debounced && !escalation) {
    // Increment counter and exit silently
    state.callsSinceWarn++;
    fs.writeFileSync(statePath, JSON.stringify(state));
    process.exit(0);
  }

  // Fire warning — reset debounce counter
  state.callsSinceWarn = 0;
  state.lastLevel = level;
  fs.writeFileSync(statePath, JSON.stringify(state));

  const used = bridge.used_pct;
  const message = buildMessage(level, used, remaining);

  const output = {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: message
    }
  };

  process.stdout.write(JSON.stringify(output));
}

function buildMessage(level, used, remaining) {
  const isLaim = hasStateJson();
  const roundedRemaining = Math.round(remaining);

  if (level === 'critical') {
    const base = `CONTEXT CRITICAL: Usage at ${used}%. Remaining: ${roundedRemaining}%.
Context is nearly exhausted. Do NOT start new tasks.`;
    return isLaim
      ? `${base}\nInform the user that context is low and recommend pausing.\nState is tracked in state.json — all progress preserved on pause/resume.`
      : `${base}\nInform the user that context is low and recommend pausing.`;
  }

  const base = `CONTEXT WARNING: Usage at ${used}%. Remaining: ${roundedRemaining}%.
Context is getting limited. Avoid starting new complex tasks.`;
  return isLaim
    ? `${base}\nIf between stories: recommend [P] Pause for fresh context on resume.\nState is tracked in state.json — no work will be lost on pause.`
    : `${base}\nIf at a natural stopping point, inform the user so they can prepare to pause.`;
}

function hasStateJson() {
  try {
    return fs.existsSync(path.join(process.cwd(), 'docs', 'state.json'));
  } catch {
    return false;
  }
}

function isOptedOut() {
  try {
    const statePath = path.join(process.cwd(), 'docs', 'state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return state.contextWarnings === false;
  } catch {
    return false;
  }
}

main();
