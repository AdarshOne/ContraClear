// Connects clause anchoring (src/anchor) to contracts in the app.
// Every item and tracked phrase records the clause it came from. When an added file is a new version of a
// contract already in the library, review work is carried over clause by clause:
//   unchanged clause, same reading → confirmations, edits and dismissals are kept;
//   edited clause, or a different reading → the item asks for a fresh check, with a note of what you had.
import type { Contract, Item } from './types';
import type { RawPage } from './rules';
import { AnchorStore, buildClauses, normalizeDoc, pagesToText, prepare, resolveMany, type Clause } from '../anchor';
import { fmtShort, today } from './dates';
export interface VersionReport { name: string; version: number; same: number; edited: number; added: number; removed: number; kept: number; recheck: number }
const paraText = (pa: Contract['pages'][number]['paras'][number]) => (pa.lead + ' ' + pa.segs.map(s => s.x).join('')).trim();
/** The contract's text as the anchoring module expects it (pages separated by form feeds). Only valid before slimming. */
export const contractText = (c: Contract) => pagesToText(c.pages.map(p => ({ n: p.n, file: p.file, h: p.h, paras: p.paras.map(paraText) }) as RawPage));
export const SAME_DOC = 0.5;
export const keyOf = (c: Pick<Clause, 'clauseId' | 'occurrence'>) => `${c.clauseId}#${c.occurrence}`;
/** The clause that contains a piece of text, or undefined. */
function clauseFor(text: string, clauses: Clause[]): Clause | undefined {
  const q = normalizeDoc(text); if (!q) return undefined;
  return clauses.find(c => c.exact.includes(q)) ?? clauses.find(c => c.exact.includes(q.slice(0, 40)));
}
const sameKind = (a: Item, b: Item) => (a.fact?.cls ?? a.kind) === (b.fact?.cls ?? b.kind);
/**
 * Anchor a freshly read contract. If it is a new version of one in `library`, carry review work over and
 * return the contract it replaces. Saves the clauses to the encrypted anchor store: full text only for clauses
 * that items or tracked text point at, hashes only for the rest.
 */
export async function anchorContract(c: Contract, store: AnchorStore, library: Contract[]): Promise<{ contract: Contract; replaces?: Contract; report?: VersionReport }> {
  if (c.sample) return { contract: c };
  const norm = normalizeDoc(contractText(c)), draft = buildClauses(norm, 'pending');
  if (!draft.length) return { contract: c };
  // 0.5, not the module's 0.7: in a short contract one edited and one added clause already drops overlap to ~0.6.
  // Unrelated contracts that share boilerplate score far lower.
  const id = store.identify(draft.map(d => d.clauseId), SAME_DOC), prev = id.isNew ? undefined : library.find(x => x.docId === id.docId);
  const docId = id.docId, clauses = buildClauses(norm, docId), version = prev ? (prev.version ?? 1) + (prev.versionId === clauses[0].versionId ? 0 : 1) : 1;
  const items = c.items.map(it => { const cl = clauseFor(it.quote, clauses); return cl ? { ...it, anchor: keyOf(cl) } : it; });
  const tracked = c.tracked.map(t => { const cl = clauseFor(t.txt, clauses); return cl ? { ...t, anchor: keyOf(cl) } : t; });
  let next: Contract = { ...c, items, tracked, docId, versionId: clauses[0].versionId, version };
  let report: VersionReport | undefined;
  if (prev) {
    const old = store.latest(docId).filter(x => x.exact), res = resolveMany(old, prepare(norm, docId)), map = new Map<string, { status: string; to?: string }>();
    for (const r of res) map.set(keyOf(r.old), { status: r.status, ...(r.status !== 'unresolved' ? { to: keyOf(r.match) } : {}) });
    const conf: Contract['conf'] = {}, dis: Contract['dis'] = {}, hist: Contract['hist'] = {}, pick: Contract['pick'] = {}, used = new Set<number>(); let kept = 0, recheck = 0;
    const day = fmtShort(today());
    for (const oi of prev.items) {
      const had: { v: string; how: string } | undefined = prev.conf[oi.id] ?? (prev.dis[oi.id] ? { v: 'dismissed', how: 'dismissed' } : undefined); if (!had || !oi.anchor) continue;
      const m = map.get(oi.anchor), ni = m?.to ? next.items.filter(x => x.anchor === m.to && sameKind(x, oi) && !used.has(x.id)).sort((a, b) => Number(b.value === oi.value) - Number(a.value === oi.value))[0] : undefined;
      if (!ni) { recheck++; continue; }
      used.add(ni.id);
      const before = (prev.hist[oi.id] ?? []).concat();
      if (m!.status === 'exact' && ni.value === oi.value) {
        if (prev.conf[oi.id]) conf[ni.id] = prev.conf[oi.id]; if (prev.dis[oi.id]) dis[ni.id] = true; if (prev.pick[oi.id] !== undefined) pick[ni.id] = prev.pick[oi.id];
        hist[ni.id] = [...before, `${day} · Kept from version ${prev.version ?? 1}: the clause didn’t change`]; kept++;
      } else { hist[ni.id] = [...before, `${day} · Version ${version}: this clause changed. You had ${had.how === 'dismissed' ? 'dismissed it' : `${had.how} ${had.v}`}. Please check it again.`]; recheck++; }
    }
    next = { ...next, conf, dis, hist, pick, accepted: false, tracked: [...next.tracked, ...prev.tracked.filter(t => !next.tracked.some(x => x.txt === t.txt)).flatMap(t => { const p = next.pages.find(pg => pg.paras.some(pa => paraText(pa).includes(t.txt))); return p ? [{ ...t, page: p.n }] : []; })] };
    // Unchanged = same clause hash in both versions. Edited = re-found by fuzzy match. Clauses kept as hashes only
    // can't be fuzzy-matched, so an edit to one of those counts as one gone plus one new.
    const oldKeys = new Set(store.latest(docId).map(keyOf)), newKeys = new Set(clauses.map(keyOf));
    const edits = res.flatMap(r => (r.status === 'fuzzy' ? [[keyOf(r.old), keyOf(r.match)]] : [])), editedFrom = new Set(edits.map(e => e[0])), editedTo = new Set(edits.map(e => e[1]));
    report = { name: prev.name, version, same: clauses.filter(cl => oldKeys.has(keyOf(cl))).length, edited: edits.length,
      added: clauses.filter(cl => !oldKeys.has(keyOf(cl)) && !editedTo.has(keyOf(cl))).length, removed: [...oldKeys].filter(k => !newKeys.has(k) && !editedFrom.has(k)).length, kept, recheck };
  }
  const keep = new Set([...next.items, ...next.tracked].flatMap(x => (x.anchor ? [x.anchor] : [])));
  await store.saveVersion(clauses.map(cl => (keep.has(keyOf(cl)) ? cl : { ...cl, exact: '', prefix: '', suffix: '' })));
  return { contract: next, ...(prev ? { replaces: prev } : {}), ...(report ? { report } : {}) };
}
