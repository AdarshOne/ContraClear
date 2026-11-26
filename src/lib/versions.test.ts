import 'fake-indexeddb/auto';
import { expect, test } from 'vitest';
import { AnchorStore, type Codec } from '../anchor';
import { anchorContract } from './versions';
import { processInput } from './pipeline';
import type { RawPage } from './rules';
import type { Contract } from './types';
const plain: Codec = { seal: async c => ({ iv: '', ct: JSON.stringify(c) }), open: async s => JSON.parse(s.ct) };
const page = (n: number, paras: string[]): RawPage => ({ n, file: 'msa.pdf', h: '', paras });
const V1 = [page(1, ['MASTER SERVICES AGREEMENT', 'This Agreement is between Halcyon Ltd. ("Client") and Northwind Inc. ("Provider").', '1.1 The Term begins on March 1, 2026 and ends on February 28, 2027.', '1.2 Client shall pay Provider a monthly fee of $2,000.00 on the first day of each month.']),
  page(2, ['2.1 Amounts not paid when due bear interest at 1.5% per month.', '2.2 Any notice must be sent by email and by courier.', '2.3 Each party shall keep the other party’s confidential information secret.'])];
const read = (raw: RawPage[]) => processInput({ name: 'msa.pdf', src: 't', raw }, { prov: 'Ontario', rem: '', lock: '', copies: false, eng: 'rules' }, () => {}, async () => {});
test('a new version keeps reviews on unchanged clauses and asks again where a clause changed', async () => {
  const store = await AnchorStore.open({ name: 'versions-test', codec: plain });
  const a1 = await anchorContract(await read(V1), store, []); expect(a1.replaces).toBeUndefined();
  const c1: Contract = a1.contract; expect(c1.version).toBe(1); expect(c1.items.every(i => i.anchor)).toBe(true);
  const fee = c1.items.find(i => /\$2,000/.test(i.sentence))!, late = c1.items.find(i => /1\.5%/.test(i.sentence))!, term = c1.items.find(i => /runs until/.test(i.sentence))!;
  c1.conf = { [fee.id]: { v: '$2,000', how: 'confirmed' }, [late.id]: { v: '1.5%', how: 'confirmed' }, [term.id]: { v: 'Feb 28, 2027', how: 'confirmed' } };
  // Version 2: the fee changes, a clause is added, the rest is the same (pages re-flowed, file renamed).
  const V2 = [page(1, ['MASTER SERVICES AGREEMENT', 'This Agreement is between Halcyon Ltd. ("Client") and Northwind Inc. ("Provider").', '1.1 The Term begins on March 1, 2026 and ends on February 28, 2027.']),
    page(2, ['1.2 Client shall pay Provider a monthly fee of $2,250.00 on the first day of each month.', '2.1 Amounts not paid when due bear interest at 1.5% per month.', '2.2 Any notice must be sent by email and by courier.', '2.3 Each party shall keep the other party’s confidential information secret.', '2.4 Client shall maintain liability insurance of not less than $1,000,000.'])].map(p => ({ ...p, file: 'MSA v2 FINAL.pdf' }));
  const a2 = await anchorContract(await read(V2), store, [c1]);
  expect(a2.replaces?.id).toBe(c1.id); expect(a2.contract.docId).toBe(c1.docId); expect(a2.contract.version).toBe(2);
  const c2 = a2.contract, by = (re: RegExp) => c2.items.find(i => re.test(i.sentence))!;
  expect(c2.conf[by(/1\.5%/).id]).toEqual({ v: '1.5%', how: 'confirmed' });            // unchanged clause: kept
  expect(c2.conf[by(/runs until/).id]).toEqual({ v: 'Feb 28, 2027', how: 'confirmed' });
  expect(c2.conf[by(/\$2,250/).id]).toBeUndefined();                                    // changed clause: check again
  expect(c2.hist[by(/\$2,250/).id].at(-1)).toMatch(/this clause changed\. You had confirmed \$2,000/);
  expect(a2.report).toMatchObject({ version: 2, edited: 1, kept: 2, recheck: 1 }); expect(a2.report!.added).toBeGreaterThanOrEqual(1);
  // Re-adding the very same file is recognised as the same version, and nothing is lost.
  const a3 = await anchorContract(await read(V2), store, [c2]); expect(a3.contract.version).toBe(2); expect(a3.replaces?.id).toBe(c2.id);
});
test('only clauses with items keep their text in the anchor store', async () => {
  const store = await AnchorStore.open({ name: 'versions-test-2', codec: plain }), c = (await anchorContract(await read(V1), store, [])).contract;
  const saved = store.latest(c.docId!); expect(saved.some(x => /confidential information/.test(x.exact))).toBe(false); expect(saved.some(x => /\$2,000/.test(x.exact))).toBe(true);
  expect(saved.length).toBeGreaterThan(saved.filter(x => x.exact).length);
});
