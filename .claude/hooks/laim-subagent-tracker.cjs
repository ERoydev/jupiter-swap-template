#!/usr/bin/env node
// LaiM SubagentStop Hook
// Event: SubagentStop (fires when a subagent completes)
// Tracks completed implementation tasks vs agent spawns in a bridge file.
// The implement skill reads the bridge at checkpoints for mechanical task counts.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const cwd = data.cwd || '';
    if (!cwd) process.exit(0);

    // Only track in LaiM projects during implement phase
    const statePath = path.join(cwd, 'docs', 'state.json');
    if (!fs.existsSync(statePath)) process.exit(0);
    let state;
    try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); }
    catch { process.exit(0); }
    if (state.currentPhase !== 'implement') process.exit(0);

    // Classify by agent_type
    const agentType = data.agent_type || '';
    const isImplTask = /^T\d+-impl$/i.test(agentType);

    // Session key (same derivation as context-monitor and statusline)
    const sessionKey = crypto.createHash('sha256').update(cwd).digest('hex').slice(0, 16);
    const bridgePath = path.join('/tmp', `laim-tasks-${sessionKey}.json`);

    // Read existing counts — reset if story changed
    let counts = { impl: 0, spawns: 0, storyId: null, updatedAt: null };
    try { counts = JSON.parse(fs.readFileSync(bridgePath, 'utf8')); } catch {}

    const currentStoryId = state.currentStory?.storyId || null;
    if (counts.storyId !== currentStoryId) {
      counts = { impl: 0, spawns: 0, storyId: currentStoryId, updatedAt: null };
    }

    if (isImplTask) counts.impl++;
    else counts.spawns++;
    counts.updatedAt = new Date().toISOString();
    counts.lastAgent = agentType;

    fs.writeFileSync(bridgePath, JSON.stringify(counts));
  } catch { /* silent */ }
  process.exit(0);
});
process.stdin.resume();
