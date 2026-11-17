// The Brightwell contract from the design fixtures. It carries both checks, so it shows every review state.
import type { Contract, Item } from './types';
import items from '../data/items.json';
import pages from '../data/brightwell-pages.json';
import nf from '../data/not-found.json';
import { blankState } from './pipeline';
import { iso, today } from './dates';
const X: Record<number, Partial<Item>> = { 1: { iso: '2026-12-01', recur: 'monthly', amt: 4500 }, 2: { iso: '2026-12-01', recur: 'monthly', amt: 380 }, 3: { iso: '2027-06-01', recur: 'yearly', amt: 1800 }, 13: { iso: '2026-12-01', recur: 'monthly', amt: 620 }, 6: { iso: '2026-12-31' }, 7: { iso: '2027-02-28' } };
const kind = (id: number): Item['kind'] => [1, 2, 3, 4, 5, 13, 15].includes(id) ? 'money' : [6, 7].includes(id) ? 'date' : 'duty';
export const sampleContract = (): Contract => {
  const its = (items as any[]).map(i => ({ ...i, kind: kind(i.id), ...X[i.id] })) as Item[];
  const order = [13, 14, 15, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  return { id: 'sample-brightwell', name: 'Brightwell SOW No. 3', cp: 'Brightwell Marketing', type: 'Services', year: '2026', src: 'Sample', files: ['Contract_SOW_Brightwell.pdf', 'Rate_Card_2026.pdf', 'Amendment_1.docx'], pages: pages as any, items: order.map(id => its.find(i => i.id === id)!), nf: (nf as any[]).map(n => ({ ...n, d: n.d + ' Searched all 19 pages.' })), added: iso(today()), sample: true, ...blankState() };
};
