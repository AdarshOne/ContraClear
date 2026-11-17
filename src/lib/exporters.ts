import type { Contract, Item } from './types';
import { eff, isNeed, COL } from './types';
import { addDays, fromIso, iso, nextOccurrence, today } from './dates';
export function download(name: string, data: BlobPart, type: string) { const u = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); }
export const valueOf = (c: Contract, it: Item) => c.conf[it.id]?.v ?? it.value;
export const statusOf = (c: Contract, it: Item) => c.dis[it.id] ? 'Dismissed' : c.conf[it.id] ? (c.conf[it.id].how === 'edited' ? 'Edited by you' : 'Confirmed by you') : COL[eff(it)][2];
export interface CalEvent { uid: string; title: string; date: string; recur?: 'monthly' | 'yearly'; line: string; desc: string }
/** Only reviewed, undismissed items with a real date can become events. */
export function calEvents(cs: Contract[]): CalEvent[] {
  const now = today(), out: CalEvent[] = [];
  for (const c of cs) for (const it of c.items) {
    if (!it.cal || !it.iso || c.dis[it.id] || isNeed(c, it.id)) continue;
    const d = nextOccurrence(it.iso, it.recur, now), v = valueOf(c, it);
    const title = it.kind === 'money' ? `Pay: ${c.cp}, ${v}` : /renew|notice/i.test(it.sentence) ? `Cancel by: ${c.cp}, ${c.name}` : `${/runs until|ends/i.test(it.sentence) ? 'Ends' : 'Due'}: ${c.cp}, ${c.name}`;
    out.push({ uid: `${c.id}-${it.id}@contraclear`, title, date: iso(d), recur: it.recur, line: it.sentence,
      desc: [it.sentence, `“${it.quote}” ${it.ref}`, it.formula ? 'How: ' + it.formula.join('; ') : '', `Contract: ${c.name}`, 'Not legal advice. Check the clause before you act.'].filter(Boolean).join('\n') });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
const REM: Record<string, number[]> = { '2 weeks and 2 days before': [14, 2], '1 week before': [7], '1 day before': [1] };
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const fold = (l: string) => l.replace(/(.{70})(?=.)/g, '$1\r\n ');
export function toIcs(evs: CalEvent[], rem: string): string {
  const stamp = new Date().toISOString().replace(/[-:]|\.\d+/g, ''), L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ContraClear//EN', 'CALSCALE:GREGORIAN'];
  for (const e of evs) {
    const d = e.date.replace(/-/g, ''), end = iso(addDays(fromIso(e.date), 1)).replace(/-/g, '');
    L.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${end}`, fold(`SUMMARY:${esc(e.title)}`), fold(`DESCRIPTION:${esc(e.desc)}`));
    if (e.recur) L.push(`RRULE:FREQ=${e.recur === 'monthly' ? 'MONTHLY' : 'YEARLY'}`);
    for (const n of REM[rem] || [14, 2]) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-P${n}D`, 'END:VALARM');
    L.push('END:VEVENT');
  }
  return L.concat('END:VCALENDAR').join('\r\n') + '\r\n';
}
export function toCsv(cs: Contract[]): string {
  const q = (s: unknown) => { let t = String(s ?? ''); if (/^[=+\-@]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
  const rows = [['Contract', 'Counterparty', 'Item', 'Who', 'Amount or value', 'Due', 'Status', 'Quote', 'Where']];
  for (const c of cs) { for (const it of c.items) rows.push([c.name, c.cp, it.sentence, it.who, valueOf(c, it), it.due, statusOf(c, it), it.quote, it.ref]); for (const t of c.tracked) rows.push([c.name, c.cp, t.title, t.who, '', '', `Tracked by you (${t.kind})`, t.txt, `p. ${t.page}`]); }
  return '\uFEFF' + rows.map(r => r.map(q).join(',')).join('\r\n');
}
