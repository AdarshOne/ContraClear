// Re-find clauses in a new version of a document.
// 1. Exact: the clauseId exists in the new version (a Map lookup).
// 2. Fuzzy, only for misses: candidates from word-overlap and diff-match-patch's match_main (using the old
//    position as a hint), scored by edit distance of the text, with prefix/suffix context as a tie-breaker.
// 3. Accept only at or above the threshold; otherwise "unresolved" for a human. Never a silent guess.
import DiffMatchPatch from 'diff-match-patch';
import type { AnchorOptions, Clause, Resolution } from './types';
import { DEFAULTS } from './types';
import { normalizeDoc, splitLabel } from './normalize';
import { buildClauses } from './ids';
const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}$%]+/gu) ?? []);
function jaccard(a: Set<string>, b: Set<string>): number { let n = 0; for (const w of a) if (b.has(w)) n++; return n / Math.max(1, a.size + b.size - n); }
export interface Prepared { text: string; clauses: Clause[]; byId: Map<string, number[]>; tokens: Set<string>[]; starts: number[] }
/** Normalize and segment the new text once; reused for every clause being resolved. */
export function prepare(newText: string, docId: string, opts: Partial<AnchorOptions> = {}): Prepared {
  const text = normalizeDoc(newText), clauses = buildClauses(text, docId, opts), byId = new Map<string, number[]>();
  clauses.forEach((c, i) => { const l = byId.get(c.clauseId); if (l) l.push(i); else byId.set(c.clauseId, [i]); });
  return { text, clauses, byId, tokens: clauses.map(c => words(splitLabel(c.exact).body)), starts: clauses.map(c => c.position) };
}
function similarity(dmp: DiffMatchPatch, a: string, b: string): number {
  if (!a && !b) return 1; const d = dmp.diff_main(a, b, false); return 1 - dmp.diff_levenshtein(d) / Math.max(a.length, b.length);
}
const clauseAt = (p: Prepared, pos: number) => { let lo = 0, hi = p.starts.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (p.starts[m] <= pos) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
/** Resolve many old clauses against one new text. Results are in the same order as `oldClauses`. */
export function resolveMany(oldClauses: Clause[], newText: string | Prepared, opts: Partial<AnchorOptions> = {}): Resolution[] {
  const o = { ...DEFAULTS, ...opts }, p = typeof newText === 'string' ? prepare(newText, oldClauses[0]?.docId ?? '', o) : newText;
  const out: (Resolution | undefined)[] = new Array(oldClauses.length), claimed = new Set<number>();
  // 1. Exact hits: same occurrence first, otherwise the nearest unclaimed one by position.
  oldClauses.forEach((old, i) => {
    const list = p.byId.get(old.clauseId); if (!list) return;
    const free = list.filter(j => !claimed.has(j)); if (!free.length) return;
    const j = free.find(k => p.clauses[k].occurrence === old.occurrence) ?? free.reduce((a, b) => Math.abs(p.starts[a] - old.position) <= Math.abs(p.starts[b] - old.position) ? a : b);
    claimed.add(j); out[i] = { status: 'exact', old, match: p.clauses[j], confidence: 1 };
  });
  // 2. Fuzzy, misses only. Score candidate pairs, then assign greedily from the most confident down.
  const dmp = new DiffMatchPatch(); dmp.Match_Threshold = 0.5; dmp.Match_Distance = 5000; dmp.Diff_Timeout = 0.05;
  const pairs: { i: number; j: number; conf: number; tie: number }[] = [], best = new Map<number, { j: number; conf: number }>();
  oldClauses.forEach((old, i) => {
    if (out[i]) return;
    const body = splitLabel(old.exact).body, tw = words(body), cands = new Set<number>();
    p.tokens.map((t, j) => [j, claimed.has(j) ? -1 : jaccard(tw, t)] as const).filter(([, s]) => s > 0.2).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 3).forEach(([j]) => cands.add(j));
    for (const [pat, at] of [[body.slice(0, 32), old.position], [body.slice(-32), old.position + old.exact.length - 32]] as const) {
      if (pat.length < 8) continue; const loc = dmp.match_main(p.text, pat, Math.max(0, Math.min(p.text.length, at))); if (loc >= 0) { const j = clauseAt(p, loc); if (j >= 0 && !claimed.has(j)) cands.add(j); }
    }
    for (const j of cands) {
      const c = p.clauses[j], conf = similarity(dmp, body, splitLabel(c.exact).body), tie = (similarity(dmp, old.prefix, c.prefix) + similarity(dmp, old.suffix, c.suffix)) / 2;
      pairs.push({ i, j, conf, tie }); const b = best.get(i); if (!b || conf > b.conf) best.set(i, { j, conf });
    }
  });
  pairs.sort((a, b) => b.conf - a.conf || b.tie - a.tie || a.i - b.i || a.j - b.j);
  const taken = new Set<number>();
  for (const x of pairs) {
    if (x.conf < o.resolveThreshold || out[x.i] || claimed.has(x.j) || taken.has(x.j)) continue;
    const old = oldClauses[x.i], match = p.clauses[x.j]; taken.add(x.j);
    out[x.i] = { status: 'fuzzy', old: { ...old, supersededBy: match.clauseId }, match, confidence: Math.round(x.conf * 1000) / 1000, successor: { from: old.clauseId, to: match.clauseId } };
  }
  return oldClauses.map((old, i) => out[i] ?? (() => { const b = best.get(i); return { status: 'unresolved' as const, old, ...(b ? { best: p.clauses[b.j] } : {}), confidence: b ? Math.round(b.conf * 1000) / 1000 : 0 }; })());
}
/** Resolve one clause. For several clauses against the same text, use resolveMany (it prepares the text once). */
export const resolve = (oldClause: Clause, newText: string, opts: Partial<AnchorOptions> = {}): Resolution => resolveMany([oldClause], newText, opts)[0];
