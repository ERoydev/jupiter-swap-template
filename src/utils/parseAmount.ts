// Strict decimal matcher for the user-typed amount. Accepts `1`, `1.5`, `.5`;
// rejects `1.5abc` (which parseFloat silently truncates to 1.5). Used at every
// boundary where we convert the raw input string to lamports.
const POSITIVE_DECIMAL_RE = /^(?:\d+(?:\.\d+)?|\.\d+)$/;

export function parsePositiveAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!POSITIVE_DECIMAL_RE.test(trimmed)) return null;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}
