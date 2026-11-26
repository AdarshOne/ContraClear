// Splits a normalized document into clauses, with offsets back into that text.
import type { Segment } from './types';
import { startsNumbered } from './normalize';
const HEADING = (p: string) => p.length < 80 && !/[.;:]$/.test(p) && (/^(?:ARTICLE|Article|SECTION|Section|SCHEDULE|Schedule)\b/.test(p) || p === p.toUpperCase() && /[A-Z]/.test(p));
/**
 * Numbered documents: each numbered paragraph starts a clause; unnumbered paragraphs join the clause above.
 * Headings ("ARTICLE 2 FEES") belong to no clause: they stay in the prefix context but never in a hash, so
 * renumbering or moving a section leaves its clauses' IDs unchanged.
 * Unnumbered documents: one clause per paragraph, merging paragraphs shorter than `minLength` into the next.
 */
export function segment(text: string, minLength = 40): Segment[] {
  const paras: Segment[] = []; const re = /[^\n]+(?:\n(?!\n)[^\n]+)*/g; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) paras.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  const span = (a: Segment, b: Segment): Segment => ({ text: text.slice(a.start, b.end), start: a.start, end: b.end });
  const numbered = paras.filter(p => startsNumbered(p.text)).length >= 2;
  const out: Segment[] = []; let pending: Segment | null = null;
  for (const p of paras) {
    if (numbered && HEADING(p.text)) { pending = null; continue; }
    const isShort = !numbered && p.text.length < minLength;
    const start: Segment = pending ?? p;
    if (isShort) { pending = start; continue; }
    if (numbered && !startsNumbered(p.text) && out.length && !pending) { out[out.length - 1] = span(out[out.length - 1], p); continue; }
    out.push(span(start, p)); pending = null;
  }
  if (pending) out.push(out.length && !numbered ? span(out.pop()!, pending) : pending);
  return out;
}
