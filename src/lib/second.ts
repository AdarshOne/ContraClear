// The on-device AI check: a second, independent reading of each clause, done entirely in this browser.
// No download and nothing sent. It uses different methods from the rules check on purpose:
//   1. A Naive Bayes clause classifier (trained on generated sentences) says what KIND of clause it is.
//   2. Values are re-read from the WORDS ("sixty (60) days", "six hundred fifty dollars ($650.00)"),
//      which contracts state twice, and by token proximity rather than patterns.
//   3. Amendments are resolved: "Section 9.2 is changed to ..." is matched to the item from Section 9.2.
// "Both checks agree" needs three things: the same kind of clause, the same value, and separate evidence
// for that value (the written-out words). Anything else waits for the user.
import type { Cls, Contract, Fact, Item } from './types';
import { corpus } from './corpus';
import { D, fmt, fromIso, iso, monthIndex } from './dates';

// ---------- 1. Clause classifier (multinomial Naive Bayes over word unigrams and bigrams) ----------
const MONTHS = /^(january|february|march|april|may|june|july|august|september|october|november|december)$/;
export function features(text: string): string[] {
  const t = text.toLowerCase().replace(/\$\s?[\d,]+(?:\.\d+)?/g, ' <amt> ').replace(/\d+(?:\.\d+)?\s?%/g, ' <pct> ').replace(/\b\d{4}\b/g, ' <year> ').replace(/\d[\d,.]*/g, ' <num> ').split(/[^a-z<>]+/).filter(Boolean).map(w => MONTHS.test(w) ? '<month>' : w);
  const out = [...t]; for (let i = 0; i < t.length - 1; i++) out.push(t[i] + '_' + t[i + 1]); return out;
}
interface Model { classes: Cls[]; prior: number[]; logp: Map<string, Float64Array>; unk: Float64Array }
let model: Model | null = null;
function train(): Model {
  const data = corpus(), classes = [...new Set(data.map(d => d.y))], idx = new Map(classes.map((c, i) => [c, i]));
  const counts = new Map<string, Float64Array>(), total = new Float64Array(classes.length), docs = new Float64Array(classes.length);
  for (const d of data) { const c = idx.get(d.y)!; docs[c]++; for (const f of features(d.x)) { let a = counts.get(f); if (!a) counts.set(f, a = new Float64Array(classes.length)); a[c]++; total[c]++; } }
  const Vn = counts.size, logp = new Map<string, Float64Array>();
  for (const [f, a] of counts) logp.set(f, a.map((n, c) => Math.log((n + 0.5) / (total[c] + 0.5 * Vn))));
  return { classes, prior: [...docs].map(n => Math.log(n / data.length)), logp, unk: total.map(t => Math.log(0.5 / (t + 0.5 * Vn))) };
}
/** Ranked clause kinds with probabilities. Unknown words are ignored rather than punished. */
export function classify(text: string): { cls: Cls; p: number }[] {
  model ??= train(); const m = model, s = Float64Array.from(m.prior); let n = 0;
  for (const f of features(text)) { const a = m.logp.get(f); if (a) { n++; for (let c = 0; c < s.length; c++) s[c] += a[c]; } }
  // Naive Bayes is overconfident on long sentences; temper it by the number of features used.
  const t = Math.max(1, Math.sqrt(n)), mx = Math.max(...s), e = [...s].map(v => Math.exp((v - mx) / t)), z = e.reduce((a, b) => a + b, 0);
  return m.classes.map((cls, i) => ({ cls, p: e[i] / z })).sort((a, b) => b.p - a.p);
}
export const CLS_LABEL: Record<Cls, string> = { payment: 'a payment', late: 'a late-payment', tax: 'a tax', term: 'a term', renewal: 'a renewal', cancel: 'a cancellation', deadline: 'a deadline', notice: 'a notices', insurance: 'an insurance', other: 'a general' };

// ---------- 2. Re-reading the values a second way ----------
const UNIT: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, first: 1, second: 2, third: 3, fifth: 5, tenth: 10, fifteenth: 15 };
const NW = '(?:' + Object.keys(UNIT).join('|') + '|hundred|thousand|million|half|and)';
/** "four thousand five hundred" → 4500; "one and one-half" → 1.5. NaN when there are no number words. */
export function wordsToNumber(text: string): number {
  let total = 0, cur = 0, seen = false, prev = '';
  for (const w of text.toLowerCase().split(/[^a-z]+/).filter(Boolean)) {
    if (w in UNIT) { cur += UNIT[w]; seen = true; }
    else if (w === 'hundred') cur = (cur || 1) * 100;
    else if (w === 'thousand' || w === 'million') { total += (cur || 1) * (w === 'thousand' ? 1e3 : 1e6); cur = 0; }
    else if (w === 'half') { cur += prev === 'one' ? -0.5 : 0.5; seen = true; }
    else if (w !== 'and') continue;
    prev = w;
  }
  return seen ? total + cur : NaN;
}
const wordsBefore = (s: string, anchor: RegExp) => { const m = s.match(new RegExp(`((?:${NW}[\\s-]+)+)${anchor.source}`, 'i')); return m ? wordsToNumber(m[1]) : NaN; };
const toks = (s: string) => s.toLowerCase().split(/[^a-z0-9$.%]+/).map(x => x.replace(/\.+$/, '')).filter(Boolean);
const money = (n: number) => '$' + n.toLocaleString('en-CA', { maximumFractionDigits: 2 });
/** Dates in several written forms, read token by token. */
export function datesIn(s: string): string[] {
  const out: [number, string][] = [];
  for (const m of s.matchAll(/\b([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g)) if (monthIndex(m[1]) >= 0) out.push([m.index!, iso(D(+m[3], monthIndex(m[1]), +m[2]))]);
  for (const m of s.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:day of\s+)?([A-Z][a-z]+),?\s+(\d{4})\b/g)) if (monthIndex(m[2]) >= 0) out.push([m.index!, iso(D(+m[3], monthIndex(m[2]), +m[1]))]);
  for (const m of s.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) out.push([m.index!, `${m[1]}-${m[2]}-${m[3]}`]);
  return out.sort((a, b) => a[0] - b[0]).map(x => x[1]);
}
/** `strong` means the reading rested on separate evidence in the text (the written-out words, or a full word list), not just the same figures again. */
export interface Second { agree: boolean; v: string; note: string; strong?: boolean }
/** Read the fact a second way from the quoted sentence. `evidence` says what the reading rested on. */
export function reread(f: Fact, q: string): Second {
  const t = toks(q);
  if (f.amt !== undefined) {
    const w = wordsBefore(q, /dollars/), digits = [...q.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)/g)].map(m => +m[1].replace(/,/g, ''));
    const amt = !isNaN(w) ? w : digits[0];
    // Frequency by proximity: the period word closest to the amount wins.
    const at = t.findIndex(x => x.startsWith('$')), near = (ws: string[]) => Math.min(...t.map((x, i) => ws.includes(x) ? Math.abs(i - at) : 99));
    const dm = near(['month', 'monthly']), dy = near(['year', 'yearly', 'annual', 'annually', 'annum']), fr = dm === 99 && dy === 99 ? 'once' : dm <= dy ? 'monthly' : 'yearly';
    const v = amt === undefined ? 'no amount read' : money(amt) + (fr === 'monthly' ? ' a month' : fr === 'yearly' ? ' a year' : '');
    if (!isNaN(w) && digits.length && !digits.includes(w)) return { agree: false, v: money(w), note: `The words say ${money(w)} but the figures say ${money(digits[0])}` };
    return { agree: amt === f.amt && fr === f.freq, v, note: amt !== f.amt ? 'Read a different amount' : fr !== f.freq ? `Reads as ${fr === 'once' ? 'a one-time amount' : fr}` : !isNaN(w) ? 'Words and figures match' : 'Re-read from the figures', strong: !isNaN(w) };
  }
  if (f.iso !== undefined) { const ds = datesIn(q), d = ds[ds.length - 1]; return { agree: d === f.iso, v: d ? fmt(fromIso(d)) : 'no date read', note: d ? 'Last date in the sentence' : 'No date found' }; }
  if (f.days !== undefined) {
    const w = wordsBefore(q, /\(?\d*\)?\s*(?:business\s+|working\s+|calendar\s+)?days/), dg = q.match(/\(?(\d{1,3})\)?\s*(?:business\s+|working\s+|calendar\s+)?days/i), n = !isNaN(w) ? w : dg ? +dg[1] : NaN;
    const di = t.findIndex(x => x === 'days' || x === 'day'), biz = di > 0 && ['business', 'working'].includes(t[di - 1]);
    if (!isNaN(w) && dg && +dg[1] !== w) return { agree: false, v: `${w} days`, note: `The words say ${w} but the figures say ${dg[1]}` };
    return { agree: n === f.days && (f.biz === undefined || biz === f.biz), v: isNaN(n) ? 'no period read' : `${n} ${biz ? 'business ' : ''}days`, note: n !== f.days ? 'Read a different period' : f.biz !== undefined && biz !== f.biz ? (biz ? 'Reads as business days' : 'Reads as calendar days') : !isNaN(w) ? 'Words and figures match' : 'Re-read from the figures', strong: !isNaN(w) };
  }
  if (f.pct !== undefined) { const w = wordsBefore(q, /per\s?cent/), dg = q.match(/(\d+(?:\.\d+)?)\s?%/), n = !isNaN(w) ? w : dg ? +dg[1] : NaN; if (!isNaN(w) && dg && +dg[1] !== w) return { agree: false, v: `${w}%`, note: `The words say ${w}% but the figures say ${dg[1]}%` }; return { agree: n === f.pct, v: isNaN(n) ? 'no rate read' : `${n}%`, note: !isNaN(w) ? 'Words and figures match' : 'Re-read from the figures', strong: !isNaN(w) }; }
  if (f.tax) { const ok = t.some(x => /^(gst|hst|pst|qst|tax|taxes)/.test(x)) && t.some(x => ['exclusive', 'plus', 'addition', 'additional', 'added', 'before'].includes(x)); return { agree: ok, v: ok ? 'exclusive of tax' : 'tax wording unclear', note: 'Looked for tax words', strong: true }; }
  if (f.methods) { const got = [['email', 'email'], ['courier', 'courier'], ['registered', 'registered mail'], ['fax', 'fax'], ['hand', 'hand delivery']].filter(([k]) => t.includes(k)).map(x => x[1]); return { agree: got.length === f.methods.length && f.methods.every(m => got.includes(m)), v: got.join(' and ') || 'no method read', note: 'Listed every delivery word', strong: true }; }
  return { agree: false, v: 'not read', note: '' };
}

// ---------- 3. Amendments: "Section 9.2 is changed to ..." ----------
const AMEND = /\b(?:Section|Clause|Article)\s+(\d+(?:\.\d+)*)\b[^.]{0,80}?\b(?:is|are|shall be)\s+(?:hereby\s+)?(?:changed|amended|replaced|revised|increased|reduced)\b/i;
const secOf = (it: Item) => (it.ref.match(/§(\d+(?:\.\d+)*)/) || [])[1];

/** Run the on-device check over every unchecked item. Pure and instant. */
export function secondCheck(c: Contract): { contract: Contract; agreed: number; differ: number } {
  let agreed = 0, differ = 0;
  const todo = (it: Item) => it.ai === undefined && it.fact && c.conf[it.id] === undefined && !c.dis[it.id];
  const amends = c.items.map(it => ({ it, m: it.quote.match(AMEND) })).filter(x => x.m && x.it.fact?.amt !== undefined);
  const items = c.items.map(it => {
    if (!todo(it)) return it; const f = it.fact!, r = reread(f, it.quote), kinds = classify(it.quote), top = kinds[0];
    // An amendment naming this item's section overrides it: show both, newest marked.
    const am = amends.find(a => a.m![1] === secOf(it) && a.it.id !== it.id && a.it.page > it.page);
    if (am && f.amt !== undefined && am.it.fact!.amt !== f.amt) { differ++; const v = money(am.it.fact!.amt!); return { ...it, k: 'y' as const, ai: `${v} (${am.it.ref})`, value: `${it.value} or ${v}`, conf: [{ by: 'Rules check', v: it.value, quote: it.quote, ref: it.ref, qid: it.qid, note: 'Original wording' }, { by: 'On-device AI', v, quote: am.it.quote, ref: am.it.ref, qid: am.it.qid, note: `From ${c.pages.find(p => p.n === am.it.page)?.file || 'a later page'}, which changes §${secOf(it)}` }] }; }
    if (it.k === 'r') { differ++; return { ...it, ai: r.v }; }
    if (!r.agree) { differ++; return { ...it, k: 'y' as const, ai: r.v, conf: [{ by: 'Rules check', v: it.value, quote: it.quote, ref: it.ref, qid: it.qid, note: 'Read by pattern' }, { by: 'On-device AI', v: r.v, quote: it.quote, ref: it.ref, qid: it.qid, note: r.note }] }; }
    // The value matches. It only counts as agreed if the classifier also sees the same kind of clause.
    const kindOk = top.cls === f.cls || (kinds[1].cls === f.cls && kinds[1].p > 0.25);
    if (!kindOk) { differ++; return { ...it, k: 'y' as const, ai: `${r.v}, but it reads like ${CLS_LABEL[top.cls]} clause` }; }
    // Same figures read twice is not two checks. Without separate evidence the item stays with the user.
    if (!r.strong) { differ++; return { ...it, aiNote: `Read two ways. Both found ${r.v}, but ${f.iso !== undefined ? 'dates are written only once' : 'the clause doesn’t spell it out in words'}, so one check had nothing to compare against.` }; }
    agreed++; return { ...it, k: 'g' as const, ai: it.rules, aiNote: undefined };
  });
  return { contract: { ...c, items }, agreed, differ };
}
/** Back to Rules only: unreviewed items lose their second reading and wait for the user again. */
export const clearSecond = (c: Contract): Contract => c.sample ? c : { ...c, items: c.items.map(it => it.fact && c.conf[it.id] === undefined ? { ...it, ai: undefined, aiNote: undefined, conf: undefined, k: it.k === 'r' ? 'r' as const : 'o' as const, value: it.conf ? it.conf[0].v : it.value } : it) };
