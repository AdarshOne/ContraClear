// What ContraClear keeps. Never the file, and never the whole contract text: only each extracted item
// (sentence, value, exact quote, file, page, section) and the clause paragraphs those items and your
// tracked text come from. Pages stay as empty placeholders so page numbers and the trace still line up.
import type { Contract, Db } from './types';
const text = (pa: Contract['pages'][number]['paras'][number]) => (pa.lead + ' ' + pa.segs.map(s => s.x).join('')).trim();
export function slimContract(c: Contract): Contract {
  if (c.slim) return c;
  return { ...c, slim: true, pages: c.pages.map(p => ({ ...p, paras: p.paras.filter(pa => pa.segs.some(s => s.q) || c.tracked.some(t => t.page === p.n && text(pa).includes(t.txt))) })) };
}
export const slimDb = (d: Db): Db => ({ ...d, contracts: d.contracts.map(slimContract) });
