import { describe, expect, test } from 'vitest';
import { buildClauses, normalizeDoc, pagesToText, publicId, resolve, resolveMany, prepare, DocIndex, identifyDoc, versionIdOf } from './index';
import type { Clause } from './types';
import type { RawPage } from '../lib/rules';

// A realistic contract: articles with numbered clauses, split over pages.
const ARTICLES: [string, string[]][] = [
  ['ARTICLE 1 TERM', ['1.1 The Term begins on March 1, 2026 and ends on February 28, 2027, unless renewed under Article 4.', '1.2 Each party represents that it has authority to enter into this Agreement.']],
  ['ARTICLE 2 FEES', ['2.1 Client shall pay Provider a fixed monthly retainer of $4,500.00 CAD, due on the first day of each calendar month.', '2.2 Amounts not paid when due bear interest at one and one-half percent (1.5%) per month.', '2.3 All fees are exclusive of applicable GST/HST.']],
  ['ARTICLE 3 CONFIDENTIALITY', ['3.1 Each party shall keep the other party’s confidential information secret and use it only for this Agreement.', '3.2 On request, each party shall return or destroy the other party’s confidential information.']],
  ['ARTICLE 4 RENEWAL', ['4.1 This Agreement renews automatically for successive twelve (12) month terms unless either party gives written notice at least sixty (60) days before the end of the then-current term.']],
  ['ARTICLE 5 GENERAL', ['5.1 This Agreement is governed by the laws of the Province of Ontario.', '5.2 Any notice under this Agreement must be sent by email and by courier.']],
];
const pages = (arts: [string, string[]][], file = 'contract.pdf', chrome = false): RawPage[] => arts.map(([h, ps], i) => ({ n: i + 1, file, h: chrome ? 'ACME CORP CONFIDENTIAL' : h, paras: chrome ? [h, ...ps, `Page ${i + 1} of ${arts.length}`] : ps }));
const doc = (arts = ARTICLES, docId = 'doc-a', opts = {}) => buildClauses(normalizeDoc(pagesToText(pages(arts))), docId, opts);
const ids = (cs: Clause[]) => cs.map(c => `${c.clauseId}#${c.occurrence}`);

describe('identity', () => {
  test('renaming the file changes nothing', () => {
    const a = buildClauses(normalizeDoc(pagesToText(pages(ARTICLES, 'Contract v1.pdf'))), 'd'), b = buildClauses(normalizeDoc(pagesToText(pages(ARTICLES, 'FINAL renamed (2).pdf'))), 'd');
    expect(ids(b)).toEqual(ids(a)); expect(b[0].versionId).toBe(a[0].versionId); expect(publicId(b[3])).toBe(publicId(a[3]));
  });
  test('re-saving with different bytes but the same words changes nothing', () => {
    const text = pagesToText(pages(ARTICLES));
    const resaved = text.replace(/\n/g, '\r\n').replace(/ /g, (m, i: number) => (i % 7 === 0 ? ' ' : i % 11 === 0 ? '  ' : m)).replace(/’/g, "'").replace(/confidential/g, 'conﬁdential').replace(/ the Term begins/, ' the Term\nbegins');
    expect(resaved).not.toBe(text);
    expect(ids(buildClauses(normalizeDoc(resaved), 'd'))).toEqual(ids(buildClauses(normalizeDoc(text), 'd')));
  });
  test('page headers, footers and page numbers do not change IDs', () => {
    const plain = doc(), withChrome = buildClauses(normalizeDoc(pagesToText(pages(ARTICLES, 'x.pdf', true))), 'doc-a');
    expect(ids(withChrome)).toEqual(ids(plain)); expect(withChrome.some(c => /CONFIDENTIAL|Page \d/.test(c.exact))).toBe(false);
  });
  test('the label is shown but never hashed', () => {
    const a = doc(), renumbered = doc(ARTICLES.map(([h, ps]) => [h, ps.map(p => p.replace(/^(\d+)\.(\d+)/, (_m, x: string, y: string) => `${+x + 10}.${y}`))]));
    expect(a[2].label).toBe('2.1'); expect(renumbered[2].label).toBe('12.1'); expect(ids(renumbered)).toEqual(ids(a));
  });
  test('the same input always gives the same IDs', () => { expect(ids(doc())).toEqual(ids(doc())); expect(doc()[0].clauseId).toMatch(/^[a-z2-7]{20}$/); });
});

describe('order and versions', () => {
  const swapped: [string, string[]][] = [ARTICLES[0], ARTICLES[3], ARTICLES[2], ARTICLES[1], ARTICLES[4]];
  test('reordering sections keeps clauseIds; versionId changes only when order counts', () => {
    const a = doc(), b = doc(swapped);
    expect(new Set(ids(b))).toEqual(new Set(ids(a)));
    expect(b[0].versionId).not.toBe(a[0].versionId);
    expect(doc(swapped, 'd', { orderSensitive: false })[0].versionId).toBe(doc(ARTICLES, 'd', { orderSensitive: false })[0].versionId);
  });
  test('reordered clauses resolve exactly', () => {
    const r = resolveMany(doc(), pagesToText(pages(swapped)));
    expect(r.every(x => x.status === 'exact')).toBe(true);
  });
});

describe('edits', () => {
  test('one edited word: new clauseId, successor link with high confidence', () => {
    const old = doc(), edited = ARTICLES.map(([h, ps]) => [h, ps.map(p => p.replace('$4,500.00', '$4,750.00'))] as [string, string[]]);
    const target = old.find(c => c.exact.includes('$4,500.00'))!;
    const r = resolve(target, pagesToText(pages(edited)));
    expect(r.status).toBe('fuzzy');
    if (r.status !== 'fuzzy') return;
    expect(r.match.clauseId).not.toBe(target.clauseId); expect(r.match.exact).toContain('$4,750.00');
    expect(r.confidence).toBeGreaterThan(0.95); expect(r.successor).toEqual({ from: target.clauseId, to: r.match.clauseId }); expect(r.old.supersededBy).toBe(r.match.clauseId);
  });
  test('a heavily rewritten clause is unresolved, never a wrong match', () => {
    const old = doc(), target = old.find(c => c.exact.startsWith('4.1'))!;
    const rewritten = ARTICLES.map(([h, ps]) => [h, ps.map(p => p.startsWith('4.1') ? '4.1 Either side may extend the arrangement for another year by agreeing in writing before it lapses.' : p)] as [string, string[]]);
    const r = resolve(target, pagesToText(pages(rewritten)));
    expect(r.status).toBe('unresolved'); expect(r.confidence).toBeLessThan(0.85);
  });
  test('identifyDoc: a lightly edited version keeps its docId; a different contract gets a new one', () => {
    const index = new DocIndex(), a = doc(); index.set('doc-a', a.map(c => c.clauseId));
    const v2 = doc(ARTICLES.map(([h, ps]) => [h, ps.map(p => p.replace('$4,500.00', '$4,750.00'))]), 'tmp');
    expect(identifyDoc(index, v2.map(c => c.clauseId), 0.7, () => 'new')).toMatchObject({ docId: 'doc-a', isNew: false });
    const other = doc([ARTICLES[2], ['ARTICLE 9 SUPPLY', ['9.1 Supplier shall deliver 400 units of product to the Buyer each week.', '9.2 Buyer shall pay each invoice within thirty (30) days of receipt.']]], 'tmp');
    expect(identifyDoc(index, other.map(c => c.clauseId), 0.7, () => 'new')).toMatchObject({ docId: 'new', isNew: true });
  });
});

describe('boilerplate', () => {
  const boiler = '7.1 This Agreement is governed by the laws of the Province of Ontario.';
  test('the same clause twice in one document gets distinct occurrences', () => {
    const cs = doc([...ARTICLES, ['SCHEDULE A', [boiler.replace('7.1', '8.1'), '8.2 Schedule A sets out the services.']]]);
    const dup = cs.filter(c => c.exact.endsWith('the laws of the Province of Ontario.'));
    expect(dup.length).toBe(2); expect(dup[0].clauseId).toBe(dup[1].clauseId); expect(dup.map(c => c.occurrence)).toEqual([0, 1]);
  });
  test('the same clause in two documents: same clauseId, separate docIds, no cross-talk', () => {
    const a = doc(ARTICLES, 'doc-a'), b = doc([['ARTICLE 1 SUPPLY', ['1.1 Supplier shall deliver 400 units each week.', boiler]]], 'doc-b');
    const ca = a.find(c => c.exact.endsWith('Province of Ontario.'))!, cb = b.find(c => c.exact.endsWith('Province of Ontario.'))!;
    expect(ca.clauseId).toBe(cb.clauseId); expect(ca.docId).not.toBe(cb.docId); expect(publicId(ca)).not.toBe(publicId(cb));
    const index = new DocIndex(); index.set('doc-a', a.map(c => c.clauseId)); index.set('doc-b', b.map(c => c.clauseId));
    expect([...index.docsWith(ca.clauseId)].sort()).toEqual(['doc-a', 'doc-b']);
    expect(index.best(b.map(c => c.clauseId))?.docId).toBe('doc-b');
  });
});

describe('performance', () => {
  test('exact lookup of 500 clauses takes under 5 ms', () => {
    const many: [string, string[]][] = Array.from({ length: 100 }, (_, i) => [`ARTICLE ${i + 1} PART`, Array.from({ length: 5 }, (_, j) => `${i + 1}.${j + 1} Clause ${i}-${j}: the Client shall pay ${i * 5 + j} dollars for item ${j} under schedule ${i}.`)]);
    const cs = doc(many); expect(cs.length).toBe(500);
    const map = new Map(cs.map(c => [c.clauseId, c])), t0 = performance.now(); let hits = 0; for (const c of cs) if (map.get(c.clauseId)) hits++;
    const ms = performance.now() - t0; console.log(`exact lookup of 500: ${ms.toFixed(3)} ms`); expect(hits).toBe(500); expect(ms).toBeLessThan(5);
  });
  test('resolveMany: 100 misses on ~300 KB of text (timing reported)', () => {
    const word = (i: number) => ['payment', 'notice', 'renewal', 'invoice', 'service', 'term', 'party', 'schedule', 'delivery', 'fee'][i % 10];
    const many: [string, string[]][] = Array.from({ length: 120 }, (_, i) => [`ARTICLE ${i + 1} PART ${i}`, Array.from({ length: 6 }, (_, j) => `${i + 1}.${j + 1} ` + Array.from({ length: 60 }, (_, k) => word(i * 7 + j * 3 + k * k)).join(' ') + ` reference ${i}-${j}.`)]);
    const oldText = pagesToText(pages(many)), old = buildClauses(normalizeDoc(oldText), 'd');
    const victims = new Set(old.filter((_, i) => i % 7 === 0).slice(0, 100).map(c => c.exact));
    const newText = pagesToText(pages(many.map(([h, ps]) => [h, ps.map(p => (victims.has(normalizeDoc(p)) ? p.replace(/reference/, 'ref.') : p))])));
    expect(newText.length).toBeGreaterThan(280_000);
    const prepared = prepare(newText, 'd'), t0 = performance.now(), r = resolveMany(old, prepared), ms = performance.now() - t0;
    const fuzzy = r.filter(x => x.status === 'fuzzy'), wrong = fuzzy.filter(x => x.status === 'fuzzy' && x.match.exact.replace('ref.', 'reference') !== x.old.exact);
    console.log(`resolveMany: ${old.length} clauses, ${fuzzy.length} fuzzy, ${r.filter(x => x.status === 'unresolved').length} unresolved, ${(newText.length / 1024).toFixed(0)} KB, ${ms.toFixed(0)} ms`);
    expect(fuzzy.length).toBe(100); expect(wrong.length).toBe(0);
  });
});
void versionIdOf;
