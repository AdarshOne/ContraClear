import { expect, test, vi } from 'vitest';
import pages from '../data/brightwell-pages.json';
import { runRules } from './rules';
import { businessOnOrBefore, D, fmt, addBusinessDays } from './dates';
import { toIcs, toCsv, calEvents } from './exporters';
import { sampleContract } from './sample';
vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 16, 12));
const raw = (pages as any[]).map(p => ({ n: p.n, file: p.file, h: p.h, paras: p.paras.map((x: any) => (x.lead + ' ' + x.segs.map((s: any) => s.x).join('')).trim()) }));
test('rules check reads the Brightwell contract', () => {
  const r = runRules(raw, 'Ontario'); const by = (re: RegExp) => r.items.find(i => re.test(i.sentence));
  const ret = by(/\$4,500/)!; expect(ret.recur).toBe('monthly'); expect(ret.due).toBe('Dec 1, 2026, then monthly'); expect(ret.ref).toBe('p. 4 · §7.3');
  const cancel = by(/stop it renewing/)!; expect(cancel.value).toBe('Dec 31, 2026'); expect(cancel.formula![2]).toBe('Mar 1, 2027 minus 60 days = Dec 31, 2026');
  expect(by(/runs until/)!.value).toBe('Feb 28, 2027'); expect(by(/1\.5%/)).toBeTruthy(); expect(by(/\$1,800/)!.due).toContain('Jun 1, 2027');
  expect(r.items.every(i => i.k === 'o' || i.k === 'r')).toBe(true);
  expect(r.items.every(i => r.pages[i.page - 1].paras.some(p => p.segs.some(s => s.q === i.id)))).toBe(true);
  expect(r.nf.map(n => n.s)).toContain('insurance'); expect(r.cp).toBe('Brightwell Marketing');
});
test('business days', () => {
  expect(fmt(businessOnOrBefore(D(2026, 11, 26), 'Ontario').date)).toBe('Dec 24, 2026');
  expect(fmt(addBusinessDays(D(2026, 11, 31), 5, 'Ontario'))).toBe('Jan 8, 2027');
});
test('exports', () => {
  const c = sampleContract(); expect(calEvents([c]).length).toBe(5); c.conf[13] = { v: '$620', how: 'confirmed' }; c.conf[14] = { v: '5 business days', how: 'confirmed' }; c.conf[15] = { v: '$0', how: 'edited' };
  const ev = calEvents([c]); expect(ev.length).toBe(6); const ics = toIcs(ev, '2 weeks and 2 days before');
  expect(ics).toContain('RRULE:FREQ=MONTHLY'); expect(ics.match(/BEGIN:VALARM/g)!.length).toBe(12); expect(toCsv([c]).split('\r\n').length).toBe(16);
});
import { classify, reread, secondCheck, wordsToNumber, datesIn } from './second';
import { processInput } from './pipeline';
test('number words', () => {
  expect(wordsToNumber('four thousand five hundred')).toBe(4500); expect(wordsToNumber('six hundred twenty')).toBe(620); expect(wordsToNumber('one and one-half')).toBe(1.5); expect(wordsToNumber('seventy-five')).toBe(75);
  expect(datesIn('from 1 March 2026 until 2027-02-28')).toEqual(['2026-03-01', '2027-02-28']);
});
test('re-reading catches what patterns miss', () => {
  expect(reread({ cls: 'payment', amt: 650, freq: 'monthly' }, 'Client shall pay a monthly lease charge of six hundred fifteen dollars ($650.00)').note).toContain('words say $615');
  expect(reread({ cls: 'deadline', days: 5, biz: false }, 'within five (5) business days').agree).toBe(false);
  expect(reread({ cls: 'payment', amt: 1200, freq: 'monthly' }, 'an annual fee of $1,200 payable in the first month').agree).toBe(false);
  expect(reread({ cls: 'late', pct: 1.5 }, 'interest at one and one-half percent (1.5%) per month').agree).toBe(true);
});
test('classifier on held-out clauses, and the full on-device check', async () => {
  const c = await processInput({ name: 'x.pdf', src: 't', raw }, { prov: 'Ontario', rem: '', lock: '', copies: false, eng: 'rules' }, () => {}, async () => {});
  const hit = c.items.filter(i => classify(i.quote)[0].cls === i.fact!.cls).length; console.log(`classifier top-1 on Brightwell: ${hit}/${c.items.length}`, c.items.filter(i => classify(i.quote)[0].cls !== i.fact!.cls).map(i => `${i.fact!.cls}->${classify(i.quote)[0].cls}: ${i.quote.slice(0, 50)}`));
  expect(hit / c.items.length).toBeGreaterThan(0.8);
  expect(classify('This Agreement is governed by the laws of Ontario.')[0].cls).toBe('other');
  const out = secondCheck(c); const lease = out.contract.items.find(i => /\$650/.test(i.sentence))!;
  console.log(`on-device check: ${out.agreed} agree, ${out.differ} differ`, out.contract.items.filter(i => i.k !== 'g').map(i => `${i.sentence.slice(0, 40)} | ai: ${i.ai}`));
  expect(lease.k).toBe('y'); expect(lease.conf![1].v).toBe('$620'); expect(lease.conf![1].ref).toContain('p. 18');
  expect(out.contract.items.find(i => /stop it renewing/.test(i.sentence))!.k).toBe('g'); expect(out.agreed).toBeGreaterThan(10);
});
