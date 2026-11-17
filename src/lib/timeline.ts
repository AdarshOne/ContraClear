// What is due and when, across contracts. Feeds the 90-day strip, Next 30 days, the library and the portfolio.
import type { Contract, Item, K } from './types';
import { eff, isNeed } from './types';
import { daysBetween, fmtShort, iso, occurrences, today } from './dates';
import { valueOf } from './exporters';
export const money = (n: number) => '$' + Math.round(n).toLocaleString('en-CA');
const amtOf = (c: Contract, it: Item) => { const m = valueOf(c, it).match(/\$\s?(\d[\d,]*(?:\.\d+)?)/); return m ? +m[1].replace(/,/g, '') : it.amt || 0; };
const live = (c: Contract) => c.items.filter(i => !c.dis[i.id]);
const dateLabel = (it: Item) => /renew|notice/i.test(it.sentence) ? 'Cancel by' : /until|ends/i.test(it.sentence) ? 'Ends' : 'Due';
interface Ev { iso: string; c: Contract; it: Item; amt: number }
function events(cs: Contract[], days: number): Ev[] { const now = today(), out: Ev[] = []; for (const c of cs) for (const it of live(c)) if (it.iso) for (const d of occurrences(it.iso, it.recur, now, days)) out.push({ iso: iso(d), c, it, amt: it.kind === 'money' ? amtOf(c, it) : 0 }); return out.sort((a, b) => a.iso.localeCompare(b.iso)); }
export interface Mark { key: string; l: string; d: string; a: string; cid: string; id: number; warn: boolean; up: boolean; tip: string }
export function strip(cs: Contract[], days = 90) {
  const now = today(), ev = events(cs, days), groups = new Map<string, Ev[]>();
  for (const e of ev) { const k = e.it.kind === 'money' ? e.iso + '|m' : `${e.iso}|${e.c.id}|${e.it.id}`; groups.set(k, [...(groups.get(k) || []), e]); }
  const marks: Mark[] = []; const last = { up: -99, dn: -99 };
  for (const [key, g] of groups) {
    const e = g[0], isM = e.it.kind === 'money', pct = Math.min(96, Math.max(4, (daysBetween(now, new Date(e.iso + 'T12:00')) / days) * 100)), side = isM ? 'dn' : 'up';
    if (pct - last[side] < 7) continue; last[side] = pct;
    const needy = g.find(x => isNeed(x.c, x.it.id));
    marks.push({ key, l: pct.toFixed(1) + '%', d: fmtShort(new Date(e.iso + 'T12:00')), a: isM ? money(g.reduce((n, x) => n + x.amt, 0)) : dateLabel(e.it), cid: (needy || e).c.id, id: (needy || e).it.id, warn: !!needy, up: !isM,
      tip: g.slice(0, 3).map(x => x.it.sentence).join(' ') + (g.length > 3 ? ` And ${g.length - 3} more.` : '') + (needy ? ' Needs your check.' : '') });
  }
  const pays = ev.filter(e => e.it.kind === 'money'), cancel = ev.find(e => dateLabel(e.it) === 'Cancel by');
  return { marks, total: money(pays.reduce((n, e) => n + e.amt, 0)), payDays: new Set(pays.map(e => e.iso)).size, cancel: cancel ? fmtShort(new Date(cancel.iso + 'T12:00')) : '' };
}
export interface Row30 { key: string; d: string; t: string; a: string; c: string; cid: string; id: number; k: K; act: string }
export function next30(cs: Contract[], days = 30): Row30[] {
  const groups = new Map<string, Ev[]>();
  for (const e of events(cs, days)) { const k = e.it.kind === 'money' ? `${e.iso}|${e.c.id}|m` : `${e.iso}|${e.c.id}|${e.it.id}`; groups.set(k, [...(groups.get(k) || []), e]); }
  return [...groups].map(([key, g]) => { const e = g[0], isM = e.it.kind === 'money', needy = g.filter(x => isNeed(x.c, x.it.id)), worst: K = needy.some(x => eff(x.it) === 'r') ? 'r' : needy.length ? 'y' : 'g';
    return { key, d: fmtShort(new Date(e.iso + 'T12:00')), t: g.length === 1 ? e.it.sentence : `${e.c.cp}: ${g.length} payments`, a: isM ? money(g.reduce((n, x) => n + x.amt, 0)) : dateLabel(e.it), c: e.c.name, cid: e.c.id, id: (needy[0] || e).it.id, k: worst, act: needy.length ? `${needy.length} to check` : '' }; });
}
export function status(c: Contract): { k: K; label: string; next: string } {
  const need = c.items.filter(i => isNeed(c, i.id)), r = need.filter(i => eff(i) === 'r').length, e = events([c], 400)[0];
  return { k: r ? 'r' : need.length ? 'y' : 'g', label: r ? `${r} couldn’t verify` : need.length ? `${need.length} to check` : c.items.length ? 'All confirmed' : 'Nothing found', next: e ? `${fmtShort(new Date(e.iso + 'T12:00'))} · ${e.it.kind === 'money' ? money(e.amt) : dateLabel(e.it)}` : 'No dated items' };
}
export const perYear = (c: Contract) => live(c).reduce((n, it) => n + (it.kind === 'money' && it.recur ? amtOf(c, it) * (it.recur === 'monthly' ? 12 : 1) : 0), 0);
export function portfolio(cs: Contract[]) {
  const due = (n: number) => { const ev = events(cs, n), m = ev.filter(e => e.it.kind === 'money'), cb = ev.filter(e => dateLabel(e.it) === 'Cancel by'); return { total: money(m.reduce((s, e) => s + e.amt, 0)), sub: `${m.length} ${m.length === 1 ? 'payment' : 'payments'}, ${cb.length} cancel-by` }; };
  const renew = events(cs, 150).filter(e => dateLabel(e.it) === 'Cancel by');
  return { year: money(cs.reduce((n, c) => n + perYear(c), 0)), d30: due(30), d60: due(60), d90: due(90), renewN: renew.length, renewSub: renew.slice(0, 2).map(e => `${e.c.cp.split(' ')[0]} ${fmtShort(new Date(e.iso + 'T12:00'))}`).join(' · ') || 'Nothing in the next 5 months' };
}
