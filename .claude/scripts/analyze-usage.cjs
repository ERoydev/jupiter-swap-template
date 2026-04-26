#!/usr/bin/env node
// LaiM Usage Analysis (issue #218)
//
// Reads Claude Code session JSONLs and prints per-phase + per-subagent token
// breakdowns for the current LaiM feature. Read-side only — no hooks fire as
// a consequence of running this, no cost/pricing table (tokens are stable;
// pricing rates drift).
//
// Usage: node .claude/scripts/analyze-usage.cjs
// Invoked by: /status skill (section 7).
//
// File extension is `.cjs` (CommonJS) because LaiM projects may set
// `"type": "module"` in package.json, which makes Node reject CommonJS
// `require()` in `.js` files. Using `.cjs` forces CommonJS parsing
// regardless of the surrounding package's type.
//
// Discovery precedence:
//   1. state.json.sessions[]  — populated by laim-session-tracker.cjs hook on
//      SessionStart. Authoritative when present.
//   2. cwd-slug fallback      — scan ~/.claude/projects/{slug}/*.jsonl where
//      slug is the absolute cwd with '/' replaced by '-'. Filtered to sessions
//      started at or after state.created so historical feature JSONLs from
//      previous features in the same cwd do not contaminate the report.
//   Both sources are unioned and deduped by session id.
//
// Tested against Claude Code JSONL format as of 2026-04-20. The JSONL format
// is Claude Code internal — not a stable public API. The script fails
// gracefully on parse errors and never throws.

const fs = require('fs');
const path = require('path');
const os = require('os');

const JSONL_FORMAT_TESTED = '2026-04-20';

function projectSlug(cwd) {
  return cwd.replace(/\//g, '-');
}

function projectDir(cwd) {
  return path.join(os.homedir(), '.claude', 'projects', projectSlug(cwd));
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function* readJsonl(p) {
  let buf;
  try {
    buf = fs.readFileSync(p, 'utf8');
  } catch {
    return;
  }
  for (const line of buf.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      yield JSON.parse(s);
    } catch {
      /* skip unparseable line */
    }
  }
}

function parseIsoToMs(s) {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function discoverSessions(state, cwd) {
  const bySlug = new Map(); // id → { id, transcript, source }
  const dir = projectDir(cwd);

  // Source 1: state.json.sessions[] — already per-feature by construction
  // (hook only appends while this state.json exists). Included unconditionally.
  if (Array.isArray(state?.sessions)) {
    for (const s of state.sessions) {
      if (!s || !s.id) continue;
      bySlug.set(s.id, {
        id: s.id,
        transcript: s.transcript || path.join(dir, s.id + '.jsonl'),
        source: 'state.json.sessions',
      });
    }
  }

  // Source 2: cwd-slug directory scan — filter by file mtime against
  // state.created. A JSONL whose last-modified time is before the feature was
  // created is definitively historical (old feature in the same cwd) and gets
  // excluded. Sessions that start before and continue past feature creation
  // still have mtime >= state.created once any post-creation activity is
  // appended, so they are included — important for the retrofit case where
  // /quick or /start is invoked inside an already-running Claude session.
  // If state.created is missing/unparseable, degrade to including all JSONLs
  // rather than hiding everything.
  const createdMs = parseIsoToMs(state?.created);
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.jsonl')) continue;
      const id = f.replace(/\.jsonl$/, '');
      if (bySlug.has(id)) continue;
      const full = path.join(dir, f);
      if (createdMs != null) {
        try {
          if (fs.statSync(full).mtimeMs < createdMs) continue;
        } catch {
          continue; // cannot stat — skip defensively
        }
      }
      bySlug.set(id, {
        id,
        transcript: full,
        source: 'cwd-slug fallback',
      });
    }
  }

  return {
    projectDir: dir,
    sessions: Array.from(bySlug.values()),
  };
}

function buildPhaseRanges(state) {
  const phases = state?.phases;
  if (!phases || typeof phases !== 'object') return [];
  const out = [];
  for (const [name, data] of Object.entries(phases)) {
    if (!data || typeof data !== 'object') continue;
    const start = parseIsoToMs(data.startedAt);
    if (start == null) continue;
    const end = parseIsoToMs(data.completedAt);
    out.push({ name, start, end: end != null ? end : Infinity });
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

function phaseFor(ranges, tsMs) {
  if (tsMs == null) return null;
  for (const r of ranges) {
    if (tsMs >= r.start && tsMs <= r.end) return r.name;
  }
  return null;
}

function zeroUsage() {
  return { turns: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

function addUsage(a, u) {
  a.turns += 1;
  a.input += u.input_tokens || 0;
  a.output += u.output_tokens || 0;
  a.cacheRead += u.cache_read_input_tokens || 0;
  a.cacheWrite += u.cache_creation_input_tokens || 0;
}

function totalTokens(u) {
  return u.input + u.output + u.cacheRead + u.cacheWrite;
}

function fmtInt(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function padRight(s, n) {
  s = String(s);
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

function padLeft(s, n) {
  s = String(s);
  return s.length >= n ? s.slice(-n) : ' '.repeat(n - s.length) + s;
}

function renderTable(title, rows, cols, sessionTotal) {
  if (rows.length === 0) return title + '\n  (no rows)';
  const lines = [title];
  const header = cols
    .map((c) => (c.align === 'right' ? padLeft(c.header, c.width) : padRight(c.header, c.width)))
    .join('  ');
  lines.push(header);
  lines.push(cols.map((c) => '─'.repeat(c.width)).join('  '));
  for (const row of rows) {
    lines.push(
      cols
        .map((c) => {
          const val = c.get(row, sessionTotal);
          return c.align === 'right' ? padLeft(val, c.width) : padRight(val, c.width);
        })
        .join('  ')
    );
  }
  return lines.join('\n');
}

function pct(value, total) {
  if (!total) return '—';
  return ((value / total) * 100).toFixed(1) + '%';
}

function main() {
  const cwd = process.cwd();
  const statePath = path.join(cwd, 'docs', 'state.json');
  const quickStatePath = path.join(cwd, 'docs', '.quick-state.json');
  const state = readJson(statePath) || readJson(quickStatePath);

  if (!state) {
    console.log('(analyze-usage: no state.json or .quick-state.json found — skipping usage analysis.)');
    return;
  }

  const { projectDir: pDir, sessions } = discoverSessions(state, cwd);
  if (sessions.length === 0) {
    console.log('(analyze-usage: no sessions discovered in ' + pDir + '.)');
    return;
  }

  const ranges = buildPhaseRanges(state);
  const hasPhases = ranges.length > 0;

  const phaseModelBuckets = new Map(); // key → {phase, model, usage}
  const subagentModelBuckets = new Map(); // key → {agentType, description, model, usage}
  const sessionTotal = zeroUsage();
  let parseErrors = 0;

  for (const s of sessions) {
    // Parent conversation JSONL
    try {
      for (const entry of readJsonl(s.transcript)) {
        if (entry.type !== 'assistant') continue;
        const msg = entry.message || {};
        const usage = msg.usage || {};
        const model = msg.model || 'unknown';
        const ts = parseIsoToMs(entry.timestamp);
        const phase = hasPhases ? phaseFor(ranges, ts) || 'unattributed' : 'session-total';
        const key = phase + '\x00' + model;
        if (!phaseModelBuckets.has(key)) {
          phaseModelBuckets.set(key, { phase, model, usage: zeroUsage() });
        }
        addUsage(phaseModelBuckets.get(key).usage, usage);
        addUsage(sessionTotal, usage);
      }
    } catch {
      parseErrors += 1;
    }

    // Subagent JSONLs — nested under {transcript_dir}/{session_id}/subagents/
    const subDir = path.join(path.dirname(s.transcript), s.id, 'subagents');
    if (!fs.existsSync(subDir)) continue;
    let subFiles;
    try {
      subFiles = fs.readdirSync(subDir);
    } catch {
      continue;
    }
    for (const f of subFiles) {
      if (!f.endsWith('.jsonl')) continue;
      const hash = f.replace(/\.jsonl$/, '');
      const meta = readJson(path.join(subDir, hash + '.meta.json')) || {};
      const agentType = meta.agentType || 'unknown';
      const description = meta.description || '';
      try {
        for (const entry of readJsonl(path.join(subDir, f))) {
          if (entry.type !== 'assistant') continue;
          const msg = entry.message || {};
          const usage = msg.usage || {};
          const model = msg.model || 'unknown';
          const key = agentType + '\x00' + description + '\x00' + model;
          if (!subagentModelBuckets.has(key)) {
            subagentModelBuckets.set(key, { agentType, description, model, usage: zeroUsage() });
          }
          addUsage(subagentModelBuckets.get(key).usage, usage);
          addUsage(sessionTotal, usage);
        }
      } catch {
        parseErrors += 1;
      }
    }
  }

  const totalSessionTokens = totalTokens(sessionTotal);
  const feature = state.feature || '(unnamed)';
  const flow = state.flow || 'unknown';
  const out = [];
  out.push('');
  out.push('═══ LAIM USAGE ═══ Feature: ' + feature + '  │  Flow: ' + flow);
  out.push(
    'Sessions: ' +
      sessions.length +
      '  (' +
      sessions.map((s) => s.id.slice(0, 8)).join(', ') +
      ')'
  );
  out.push(
    'Totals — turns: ' +
      fmtInt(sessionTotal.turns) +
      '  │  tokens: ' +
      fmtInt(totalSessionTokens) +
      '  (in: ' +
      fmtInt(sessionTotal.input) +
      ', out: ' +
      fmtInt(sessionTotal.output) +
      ', cache_r: ' +
      fmtInt(sessionTotal.cacheRead) +
      ', cache_w: ' +
      fmtInt(sessionTotal.cacheWrite) +
      ')'
  );

  const phaseRows = Array.from(phaseModelBuckets.values()).sort((a, b) => {
    if (a.phase === 'unattributed' && b.phase !== 'unattributed') return 1;
    if (b.phase === 'unattributed' && a.phase !== 'unattributed') return -1;
    return a.phase.localeCompare(b.phase) || a.model.localeCompare(b.model);
  });
  const phaseCols = [
    { header: hasPhases ? 'Phase' : 'Session', width: 14, align: 'left', get: (r) => r.phase },
    { header: 'Model', width: 22, align: 'left', get: (r) => r.model },
    { header: 'Turns', width: 7, align: 'right', get: (r) => fmtInt(r.usage.turns) },
    { header: 'Input', width: 12, align: 'right', get: (r) => fmtInt(r.usage.input) },
    { header: 'Output', width: 10, align: 'right', get: (r) => fmtInt(r.usage.output) },
    { header: 'Cache_R', width: 12, align: 'right', get: (r) => fmtInt(r.usage.cacheRead) },
    { header: 'Cache_W', width: 10, align: 'right', get: (r) => fmtInt(r.usage.cacheWrite) },
    { header: '% Tokens', width: 8, align: 'right', get: (r) => pct(totalTokens(r.usage), totalSessionTokens) },
  ];
  out.push('');
  out.push(
    renderTable(
      hasPhases ? 'Per phase × model (parent chat):' : 'Parent chat total (no contiguous phase ranges):',
      phaseRows,
      phaseCols,
      sessionTotal
    )
  );

  if (subagentModelBuckets.size > 0) {
    const subRows = Array.from(subagentModelBuckets.values()).sort(
      (a, b) => totalTokens(b.usage) - totalTokens(a.usage)
    );
    const subCols = [
      { header: 'Subagent', width: 22, align: 'left', get: (r) => r.agentType },
      { header: 'Description', width: 36, align: 'left', get: (r) => (r.description || '').slice(0, 35) },
      { header: 'Model', width: 22, align: 'left', get: (r) => r.model },
      { header: 'Turns', width: 6, align: 'right', get: (r) => fmtInt(r.usage.turns) },
      { header: 'Tokens', width: 12, align: 'right', get: (r) => fmtInt(totalTokens(r.usage)) },
      { header: '% Tokens', width: 8, align: 'right', get: (r) => pct(totalTokens(r.usage), totalSessionTokens) },
    ];
    out.push('');
    out.push(renderTable('Per subagent × model:', subRows, subCols, sessionTotal));
  } else {
    out.push('');
    out.push('(No subagent activity recorded in the discovered sessions.)');
  }

  out.push('');
  if (!hasPhases) {
    out.push(
      'Note: no contiguous phase ranges in state.json (expected for quick flows, or greenfield projects created before #222 shipped). Showing session total only.'
    );
  } else {
    const unattributed = phaseRows.filter((r) => r.phase === 'unattributed');
    if (unattributed.length > 0) {
      out.push(
        '"unattributed" = API calls outside every recorded phase range (routing, gate evaluation, /status runs, or pre-#222 fabricated timestamps).'
      );
    }
  }
  if (parseErrors > 0) {
    out.push('⚠  ' + parseErrors + ' JSONL parse errors suppressed (partial data shown).');
  }
  out.push(
    'Tested against Claude Code JSONL format as of ' +
      JSONL_FORMAT_TESTED +
      '. Format is Claude Code internal — not a stable public API.'
  );

  console.log(out.join('\n'));
}

try {
  main();
} catch (err) {
  console.error('analyze-usage: unexpected error — ' + ((err && err.message) || err));
  process.exit(2);
}
