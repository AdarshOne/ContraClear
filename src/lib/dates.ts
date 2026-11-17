// Dates are handled as local calendar days (no time zones): ISO "YYYY-MM-DD".
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const D = (y: number, m: number, d: number) => new Date(y, m, d, 12);
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fromIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return D(y, m - 1, d); };
export const today = () => { const n = new Date(); return D(n.getFullYear(), n.getMonth(), n.getDate()); };
export const addDays = (d: Date, n: number) => D(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 864e5);
export const fmt = (d: Date) => `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
export const fmtShort = (d: Date) => `${MON[d.getMonth()]} ${d.getDate()}`;
export const dow = (d: Date) => DOW[d.getDay()];
export const DATE_RE = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi;
export const MD_RE = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\b(?!,?\s+\d{4})/i;
export const parseDate = (s: string): Date | null => { DATE_RE.lastIndex = 0; const m = DATE_RE.exec(s); return m ? D(+m[3], FULL.indexOf(m[1].toLowerCase()), +m[2]) : null; };
export const monthIndex = (name: string) => FULL.indexOf(name.toLowerCase());

const nthMon = (y: number, m: number, n: number) => { const f = D(y, m, 1); return D(y, m, 1 + ((8 - f.getDay()) % 7) + (n - 1) * 7); };
function easter(y: number) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31) - 1, da = ((h + l - 7 * m + 114) % 31) + 1; return D(y, mo, da); }
/** Statutory holidays by province. General guide only; settings choose the province. */
export function holidays(y: number, prov: string): Record<string, string> {
  const h: Record<string, string> = {}; const add = (d: Date, n: string) => { h[iso(d)] = n; };
  add(D(y, 0, 1), "New Year's Day"); add(addDays(easter(y), -2), 'Good Friday'); add(D(y, 6, 1), 'Canada Day');
  add(nthMon(y, 8, 1), 'Labour Day'); add(D(y, 11, 25), 'Christmas Day');
  const vic = D(y, 4, 24); add(addDays(vic, -((vic.getDay() + 6) % 7)), prov === 'Quebec' ? "National Patriots' Day" : 'Victoria Day');
  add(nthMon(y, 9, 2), 'Thanksgiving');
  if (['Ontario', 'Alberta', 'British Columbia', 'Saskatchewan', 'New Brunswick', 'Manitoba', 'Nova Scotia', 'Prince Edward Island'].includes(prov)) add(nthMon(y, 1, 3), 'Family Day');
  if (prov === 'Ontario') add(D(y, 11, 26), 'Boxing Day');
  if (prov === 'Quebec') add(D(y, 5, 24), 'Fête nationale');
  if (['British Columbia', 'Manitoba', 'Prince Edward Island'].includes(prov)) add(D(y, 8, 30), 'National Day for Truth and Reconciliation');
  if (['British Columbia', 'Alberta', 'Saskatchewan', 'Manitoba', 'New Brunswick', 'Nova Scotia', 'Prince Edward Island', 'Newfoundland and Labrador'].includes(prov)) add(D(y, 10, 11), 'Remembrance Day');
  return h;
}
export const offDay = (d: Date, prov: string): string | null => d.getDay() === 0 ? 'Sunday' : d.getDay() === 6 ? 'Saturday' : holidays(d.getFullYear(), prov)[iso(d)] ?? null;
/** A last-day-to-act date moves EARLIER to the nearest business day, so the user is never late. */
export function businessOnOrBefore(d: Date, prov: string): { date: Date; note: string } {
  let x = d; const why = offDay(d, prov);
  while (offDay(x, prov)) x = addDays(x, -1);
  return { date: x, note: why ? `Business-day check: ${fmt(d)} is ${why}. Moved back to ${dow(x)}, ${fmt(x)}.` : `Business-day check: ${dow(d)}, not a holiday in ${prov}. No change.` };
}
export function addBusinessDays(d: Date, n: number, prov: string) { let x = d; while (n > 0) { x = addDays(x, 1); if (!offDay(x, prov)) n--; } return x; }
/** Next occurrence on or after `from` of a monthly (day of month) or yearly (ISO anchor) date. */
export function nextOccurrence(anchorIso: string, recur: 'monthly' | 'yearly' | undefined, from: Date): Date {
  const a = fromIso(anchorIso); if (!recur || a >= from) return a;
  if (recur === 'monthly') { let x = D(from.getFullYear(), from.getMonth(), a.getDate()); if (x < from) x = D(from.getFullYear(), from.getMonth() + 1, a.getDate()); return x; }
  let x = D(from.getFullYear(), a.getMonth(), a.getDate()); if (x < from) x = D(from.getFullYear() + 1, a.getMonth(), a.getDate()); return x;
}
export function occurrences(anchorIso: string, recur: 'monthly' | 'yearly' | undefined, from: Date, days: number): Date[] {
  const end = addDays(from, days), out: Date[] = []; let x = nextOccurrence(anchorIso, recur, from);
  while (x <= end && out.length < 40) { if (x >= from) out.push(x); if (!recur) break; x = recur === 'monthly' ? D(x.getFullYear(), x.getMonth() + 1, x.getDate()) : D(x.getFullYear() + 1, x.getMonth(), x.getDate()); }
  return out;
}
