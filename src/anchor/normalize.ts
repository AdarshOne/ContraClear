// Turns extracted text into a canonical form so the same words always hash the same way.
// Pure and deterministic. Bump NORMALIZER_VERSION whenever the output could change: IDs from different
// versions are not comparable, and every stored record carries the version that produced it.
export const NORMALIZER_VERSION = 1;
const QUOTES: [RegExp, string][] = [[/[‘’‚‛′`´]/g, "'"], [/[“”„‟″«»]/g, '"'], [/[‐‑‒–—―−﹘﹣－]/g, '-'], [/[  -   　]/g, ' '], [/[­​-‍⁠﻿]/g, '']];
/** Character-level cleanup for one line or paragraph: NFKC (also expands ligatures such as "ﬁ"), quotes, dashes, spaces. */
export function cleanChars(s: string): string { let t = s.normalize('NFKC'); for (const [re, to] of QUOTES) t = t.replace(re, to); return t; }
const PAGE_NO = /^(?:page\s*)?[-–—]?\s*\d{1,4}\s*[-–—]?(?:\s*(?:of|\/)\s*\d{1,4})?$/i;
/** A line's shape with numbers blanked, so "Page 3 of 10" and "Page 4 of 10" count as the same repeated line. */
const shape = (line: string) => cleanChars(line).toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
/**
 * Normalize a whole document. Pages are separated by form feeds (\f). Paragraphs by blank lines.
 * Removes lines that repeat at the top or bottom of most pages (running headers/footers) and bare page numbers.
 */
export function normalizeDoc(raw: string): string {
  const pages = raw.replace(/\r\n?/g, '\n').split('\f').map(p => p.split('\n'));
  // Running headers and footers are short lines at the very top or bottom of a page. Long lines are never removed.
  const edge = (lines: string[]) => { const nz = lines.map((l, i) => [l, i] as const).filter(([l]) => l.trim()); return [...nz.slice(0, 2), ...nz.slice(-2)].filter(([l]) => l.trim().length <= 70).map(([, i]) => i); };
  const counts = new Map<string, number>();
  if (pages.length >= 3) for (const lines of pages) for (const k of new Set(edge(lines).map(i => shape(lines[i])))) if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  const repeated = (k: string) => (counts.get(k) ?? 0) >= Math.max(3, Math.ceil(pages.length * 0.5));
  const kept: string[] = [];
  for (const lines of pages) {
    const edges = new Set(edge(lines));
    lines.forEach((l, i) => { const t = l.trim(); if (edges.has(i) && (PAGE_NO.test(t) || repeated(shape(t)))) return; kept.push(l); });
    kept.push(''); // a page break also ends a paragraph
  }
  // Paragraphs: blank-line separated. Inside one, join lines; undo end-of-line hyphenation ("termi-\nnation").
  return kept.join('\n').split(/\n\s*\n/).map(p => cleanChars(p).replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n\n');
}
const LABEL = /^(?:(?:ARTICLE|Article|SECTION|Section|Clause|CLAUSE)\s+[IVXLCDM\d]+(?:\.\d+)*[.:]?|\d+(?:\.\d+)*\.?|\((?:[a-z]{1,2}|[ivxlc]+|\d{1,3})\)|[a-z]\))\s+/;
/** Split a leading clause number ("4.2", "(a)", "Section 7") from the text. The label is for display only. */
export function splitLabel(text: string): { label?: string; body: string } {
  const m = text.match(LABEL); if (!m) return { body: text };
  return { label: m[0].trim().replace(/[.:]$/, ''), body: text.slice(m[0].length) };
}
export const startsNumbered = (text: string) => LABEL.test(text);
