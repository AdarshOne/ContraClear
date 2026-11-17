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
import { makeMasker } from './redact';
import { applyReadings, buildRequest, type Reading } from './ai';
import { processInput } from './pipeline';
test('redaction masks names, amounts and addresses, and round-trips', () => {
  const m = makeMasker('This is between Brightwell Marketing Inc. (“Provider”) and Northfield Goods Ltd. (“Client”).');
  const t = m.mask('Client shall pay Brightwell four thousand five hundred dollars ($4,500.00) CAD. Notices to 220 King Street, Toronto M5V 1K4 or billing@brightwell.ca.');
  expect(t).not.toMatch(/Brightwell|4,500|King Street|M5V|billing@/); expect(t).toContain('[PARTY A]'); expect(t).toContain('[AMOUNT 1]'); expect(t).toContain('[ADDRESS 1]');
  expect(m.unmask('[AMOUNT 1]')).toContain('$4,500.00');
});
test('AI readings are compared with the rules check', async () => {
  const c = await processInput({ name: 'x.pdf', src: 't', raw }, { prov: 'Ontario', rem: '', lock: '', copies: false, eng: 'cloud' }, () => {}, async () => {});
  const req = buildRequest(c); expect(req.user).not.toMatch(/Brightwell|\$\d/); expect(req.ids.length).toBe(c.items.length);
  const base = { found: true, payer: 'Client', amount: null, frequency: 'none', date: null, days: null, business_days: false, percent: null, tax_extra: false, notice_methods: [], summary: 's' } as Omit<Reading, 'id'>;
  const ret = c.items.find(i => /\$4,500/.test(i.sentence) && i.fact?.freq === 'monthly')!, term = c.items.find(i => /runs until/.test(i.sentence))!, ren = c.items.find(i => /stop it renewing/.test(i.sentence))!;
  const amtTok = req.user.match(new RegExp(`Clause ${ret.id}\\n[^]*?(\\[AMOUNT \\d+\\])`))![1];
  const out = applyReadings(c, req, [{ ...base, id: ret.id, amount: amtTok, frequency: 'monthly' }, { ...base, id: term.id, date: '2027-02-27' }, { ...base, id: ren.id, days: 60 }]);
  const get = (id: number) => out.contract.items.find(i => i.id === id)!;
  expect(get(ret.id).k).toBe('g'); expect(get(ren.id).k).toBe('g'); expect(get(term.id).k).toBe('y'); expect(get(term.id).conf![1].v).toBe('Feb 27, 2027'); expect(out.agreed).toBe(2);
});
