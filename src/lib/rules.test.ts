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
