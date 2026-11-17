// The rules check: deterministic patterns for money, dates, durations and notices.
// It never guesses. If it can't work something out, the item is "Couldn't verify".
import type { Item, NotFound, Page } from './types';
import { DATE_RE, MD_RE, D, addDays, businessOnOrBefore, dow, fmt, iso, monthIndex, nextOccurrence, parseDate, today } from './dates';

export interface RawPage { n: number; file: string; h: string; paras: string[] }
export interface RulesResult { pages: Page[]; items: Item[]; nf: NotFound[]; cp: string; type: string; year: string }

const WORDNUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10, fifteen: 15, thirty: 30, sixty: 60, ninety: 90 };
const money = (n: number) => '$' + n.toLocaleString('en-CA', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const sentences = (t: string) => t.split(/(?<=[.;])\s+(?=[A-Z(“"])/).map(s => s.trim()).filter(s => s.length > 12);
const subject = (s: string) => { const m = s.match(/\b((?:The\s+)?[A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)?)\s+(?:shall|must|will|agrees?\s+to|may|is\s+responsible)\b/); return m ? m[1].replace(/^The\s+/, '') : ''; };
const daysIn = (s: string): { n: number; biz: boolean } | null => {
  const m = s.match(/(?:\b([a-z-]+)\s+)?\(?(\d{1,3})\)?\s+(business\s+|calendar\s+|working\s+)?days?\b/i) || s.match(/\b(one|two|three|four|five|six|seven|ten|fifteen|thirty|sixty|ninety)\s+()(business\s+|calendar\s+|working\s+)?days?\b/i);
  if (!m) return null; const n = m[2] ? +m[2] : WORDNUM[m[1].toLowerCase()]; return n ? { n, biz: /business|working/i.test(m[3] || '') } : null;
};
export const splitLead = (t: string): [string, string] => { const m = t.match(/^((?:Section\s+)?\d+(?:\.\d+)*\.?\s+[A-Z][^.:]{0,48}[.:])\s+(.+)$/s); return m ? [m[1], m[2]] : ['', t]; };

export function runRules(raw: RawPage[], prov: string, lines = false): RulesResult {
  const now = today(), items: Item[] = []; let id = 0;
  const all = raw.map(p => p.paras.join('\n')).join('\n');
  const loc = (n: number, sec: string) => (lines ? `line ${n}` : `p. ${n}`) + (sec ? ` · §${sec}` : '');
  // Pass 1: the term, which the renewal maths depends on.
  let termEnd: Date | null = null, termRef = '';
  const add = (p: RawPage, sec: string, quote: string, f: Partial<Item> & Pick<Item, 'kind' | 'sentence' | 'value' | 'who' | 'due' | 'rules'>) => {
    id++; items.push({ id, k: 'o', cal: 0, quote, ref: loc(p.n, sec), qid: 'q' + id, page: p.n, ...f });
  };
  for (const p of raw) for (const para of p.paras) {
    const [lead, body] = splitLead(para); const sec = (lead.match(/\d+(?:\.\d+)*/) || [''])[0];
    for (const s of sentences(body)) {
      const who = subject(s);
      // Term: "begins on X and ends on Y"
      const tm = s.match(/(?:begins?|commences?|starts?|effective)\b[^.]{0,60}?\b(?:ends?|expires?|until|through|terminates?)\s+(?:on\s+)?/i);
      const dates = [...s.matchAll(DATE_RE)];
      if (tm && dates.length >= 2 && !termEnd) {
        const end = D(+dates[1][3], monthIndex(dates[1][1]), +dates[1][2]); termEnd = end; termRef = loc(p.n, sec);
        add(p, sec, s.replace(/,?\s*unless.*$/i, '').replace(/[.;]$/, ''), { kind: 'date', sentence: `The contract runs until ${fmt(end)}.`, value: fmt(end), who: 'Both parties', due: fmt(end), rules: fmt(end), iso: iso(end), cal: 1, fact: { cls: 'term', iso: iso(end) } });
        continue;
      }
      // Renewal notice: "at least sixty (60) days before the renewal date"
      const dn = daysIn(s);
      if (dn && /\b(?:before|prior to)\b/i.test(s) && /renew|extend|anniversary/i.test(s + ' ' + body) && /notice|cancel|terminat|writing/i.test(s)) {
        add(p, sec, s.replace(/[.;]$/, ''), { kind: 'date', sentence: '', value: '', who: who ? `${who} gives notice` : 'Either party gives notice', due: '', rules: `${dn.n} days before renewal`, formula: ['__renew__', String(dn.n)], fact: { cls: 'renewal', days: dn.n } });
        continue;
      }
      // Late interest
      const pct = s.match(/(\d+(?:\.\d+)?)\s*%\)?\s*(?:per|a|each)\s+(month|annum|year)/i);
      if (pct && /late|not paid|overdue|unpaid|interest/i.test(s)) {
        const per = /month/i.test(pct[2]) ? 'month' : 'year';
        add(p, sec, s, { kind: 'money', sentence: `Pay late and you owe ${pct[1]}% more each ${per}.`, value: `${pct[1]}% a ${per}`, who: 'Whoever pays late', due: 'When a payment is late', rules: `${pct[1]}%`, fact: { cls: 'late', pct: +pct[1] } }); continue;
      }
      // Amounts
      const am = s.match(/\$\s?(\d[\d,]*(?:\.\d{2})?)/);
      if (am) {
        const amt = +am[1].replace(/,/g, ''); const monthly = /per month|monthly|each (?:calendar )?month|a month/i.test(s), yearly = !monthly && /annual|per year|each year|yearly|per annum/i.test(s);
        const pm = s.match(/\b((?:The\s+)?[A-Z][A-Za-z]+)\s+(?:shall|must|will|agrees?\s+to)\s+pay\s+(?:to\s+)?((?:the\s+)?[A-Z][A-Za-z]+)?/);
        const payer = pm ? pm[1].replace(/^The\s+/, '') : '', payee = pm?.[2];
        const what = /late fee/i.test(s) ? 'late fee' : /insurance/i.test(s) ? 'insurance cover' : /\brent\b/i.test(s) ? 'rent' : /hosting|\bhost\b/i.test(s) ? 'hosting' : /licen[cs]e/i.test(s) ? 'licence fee' : /lease/i.test(s) ? 'lease charge' : /retainer/i.test(s) ? 'retainer' : /deposit/i.test(s) ? 'deposit' : 'amount';
        let anchor: Date | null = null, recur: Item['recur'];
        if (monthly) { recur = 'monthly'; anchor = nextOccurrence(iso(D(2000, 0, /first|1st/i.test(s) ? 1 : 1)), 'monthly', now); }
        const md = s.match(MD_RE); const full = parseDate(s);
        if (yearly) { recur = 'yearly'; if (md) anchor = nextOccurrence(iso(D(2000, monthIndex(md[1]), +md[2])), 'yearly', now); }
        if (!recur && full) anchor = full;
        const dayKnown = monthly ? /first|1st|\bday of each/i.test(s) : !!anchor;
        const every = monthly ? ' every month' : yearly ? ' every year' : '';
        const isFee = what === 'late fee' || what === 'insurance cover';
        add(p, sec, s.replace(/[.;]$/, ''), {
          fact: { cls: what === 'insurance cover' ? 'insurance' : what === 'late fee' ? 'late' : 'payment', amt, freq: monthly ? 'monthly' : yearly ? 'yearly' : 'once' },
          kind: 'money', amt: isFee ? undefined : amt, recur: isFee ? undefined : recur, iso: !isFee && anchor && dayKnown ? iso(anchor) : undefined, cal: !isFee && anchor && dayKnown ? 1 : 0,
          sentence: what === 'insurance cover' ? `${who || 'A party'} must carry ${money(amt)} of insurance.` : payer ? `${payer} pays ${money(amt)}${every}${what !== 'amount' ? ` (${what})` : ''}.` : `${money(amt)}${every}${what !== 'amount' ? ` for the ${what}` : ''}. The clause doesn’t say who pays.`,
          value: money(amt), who: payer ? `${payer} pays${payee ? ' ' + payee.replace(/^the\s+/i, '') : ''}` : 'Not stated in this clause', rules: money(amt),
          due: isFee ? 'When it applies' : anchor && dayKnown ? fmt(anchor) + (recur ? `, then ${recur}` : '') : recur ? `${recur === 'monthly' ? 'Monthly' : 'Yearly'}, day not stated` : 'Date not stated',
          formula: recur && anchor && dayKnown ? [`${recur === 'monthly' ? 'The 1st of each month' : 'The same date each year'} (${loc(p.n, sec)})`, `Today is ${fmt(now)}`, `Next one = ${fmt(anchor)}, a ${dow(anchor)}`] : undefined,
        }); continue;
      }
      if (/exclusive of[^.]*\b(GST|HST|PST|QST|tax)/i.test(s)) { add(p, sec, s, { kind: 'money', sentence: 'Sales tax is added to every fee.', value: '+ tax', who: 'Whoever pays the fees', due: 'With every invoice', rules: 'exclusive of tax', fact: { cls: 'tax', tax: true } }); continue; }
      // Cancel with notice
      if (dn && /\b(?:cancel|terminat)/i.test(s) && /notice/i.test(s)) { add(p, sec, s, { kind: 'duty', sentence: `${who || 'A party'} can cancel with ${dn.n} ${dn.biz ? 'business ' : ''}days’ notice.`, value: `${dn.n} days’ notice`, who: `${who || 'A party'} gives notice`, due: `Any time, ${dn.n} days ahead`, rules: `${dn.n} days`, fact: { cls: 'cancel', days: dn.n, biz: dn.biz } }); continue; }
      // A duty with a clock on it
      if (dn && /\bwithin\b/i.test(s)) { add(p, sec, s, { kind: 'duty', sentence: `${who || 'A party'} must act within ${dn.n} ${dn.biz ? 'business ' : ''}days here.`, value: `${dn.n} ${dn.biz ? 'business ' : ''}days`, who: who || 'A party', due: `${dn.n} ${dn.biz ? 'business ' : ''}days after the trigger`, rules: `${dn.n} ${dn.biz ? 'business ' : ''}days`, fact: { cls: 'deadline', days: dn.n, biz: dn.biz } }); continue; }
      // How notices must be sent
      if (/\bnotices?\b/i.test(s) && /\b(?:must|shall)\b/i.test(s) && /email|courier|registered mail|in writing|mail\b/i.test(s)) {
        const how = ['email', 'courier', 'registered mail'].filter(w => new RegExp(w, 'i').test(s)).join(' and ') || 'in writing';
        add(p, sec, s.replace(/[.;]$/, ''), { kind: 'duty', sentence: `Any notice must go by ${how}.`, value: how[0].toUpperCase() + how.slice(1), who: 'Both parties', due: 'Whenever you send notice', rules: how, fact: { cls: 'notice', methods: how.split(' and ') } }); continue;
      }
    }
  }
  // Pass 2: work out the real cancel-by date now that the term is known.
  for (const it of items) if (it.formula && it.formula[0] === '__renew__') {
    const n = +it.formula[1];
    if (!termEnd) { it.k = 'r'; it.sentence = `Notice is needed ${n} days before renewal, but the renewal date wasn’t found.`; it.value = 'Not clear'; it.due = 'Renewal date not found'; it.rules = 'not found'; it.formula = undefined; continue; }
    const renew = addDays(termEnd, 1), rawDay = addDays(renew, -n), b = businessOnOrBefore(rawDay, prov);
    it.sentence = `To stop it renewing, send written notice by ${fmt(b.date)}.`; it.value = fmt(b.date); it.due = fmt(b.date); it.rules = fmt(b.date); it.iso = iso(b.date); it.cal = 1;
    it.formula = [`Term ends ${fmt(termEnd)} (${termRef}), so it renews ${fmt(renew)}`, `Notice needed: ${n} days before (${it.ref})`, `${fmt(renew)} minus ${n} days = ${fmt(rawDay)}`, b.note];
  }
  // "Not found" is a real result: say so, with what was searched.
  const pagesWord = `${raw.length} ${lines ? 'lines' : raw.length === 1 ? 'page' : 'pages'}`;
  const NF: [RegExp, string, string, string][] = [
    [/renew/i, 'Automatic renewal', 'No renewal wording on any page.', 'renew'],
    [/increase|escalat|adjust(?:ed|ment)? .{0,30}(?:price|fee|rate)/i, 'Renewal price increase', 'No clause lets them raise the price.', 'price increase'],
    [/insurance/i, 'Insurance you must carry', 'No insurance wording on any page.', 'insurance'],
    [/late fee|interest|overdue/i, 'A charge for paying late', 'No late fee or interest wording.', 'late'],
    [/terminat\w*\s+fee|early\s+terminat/i, 'A fee for leaving early', 'No early termination fee found.', 'termination fee'],
  ];
  const nf = NF.filter(x => !x[0].test(all)).map(x => ({ t: x[1], d: `${x[2]} Searched all ${pagesWord}.`, s: x[3] }));
  // Mark the quotes inside the page text so the preview can trace them.
  const pages: Page[] = raw.map(p => ({ n: p.n, file: p.file, h: p.h, paras: p.paras.map(para => {
    const [lead, body] = splitLead(para); const hits = items.filter(i => i.page === p.n).map(i => ({ i, at: body.indexOf(i.quote) })).filter(h => h.at >= 0).sort((a, b) => a.at - b.at);
    const segs = []; let pos = 0;
    for (const h of hits) { if (h.at < pos) continue; if (h.at > pos) segs.push({ x: body.slice(pos, h.at), q: 0, qid: '' }); segs.push({ x: h.i.quote, q: h.i.id, qid: h.i.qid }); pos = h.at + h.i.quote.length; }
    if (pos < body.length) segs.push({ x: body.slice(pos), q: 0, qid: '' });
    return { lead, segs };
  }) }));
  const cpm = all.match(/\bbetween\s+(.{2,60}?)\s*(?:\(|,|\band\b)/i);
  const type = /\blease\b|\btenant\b|\blandlord\b/i.test(all) && !/statement of work|services/i.test(all.slice(0, 600)) ? 'Lease' : /non-?disclosure|confidentiality agreement/i.test(all.slice(0, 600)) ? 'NDA' : /licen[cs]e agreement/i.test(all.slice(0, 600)) ? 'Licence' : 'Services';
  const first = parseDate(all);
  return { pages, items, nf, cp: cpm ? cpm[1].replace(/\s+(Inc|Ltd|LLC|Corp)\.?$/i, '').trim() : 'Unknown counterparty', type, year: String((first || now).getFullYear()) };
}
