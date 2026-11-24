// The AI check: Qwen3.5 4B running on this device through WebLLM (WebGPU). Free, and nothing is sent.
// It reads each important clause independently of the rules check, at temperature 0 (same answer every time),
// and must answer in a fixed JSON shape. It extracts; it never calculates: dates are worked out by our own
// business-day code from the structure it returns. Every answer must quote the contract word for word, or it is dropped.
import type { Contract, Item, Page } from './types';
import { addDays, businessOnOrBefore, D, fmt, fromIso, iso, nextOccurrence, offDay, today } from './dates';

export const MODEL = 'Qwen3.5-4B-q4f16_1-MLC', MODEL_GB = 2.4, MODEL_VRAM_GB = 3.9;
export async function canRunLlm(): Promise<boolean> { try { const a = await (navigator as any).gpu?.requestAdapter(); return !!a; } catch { return false; } }

// ---------- what we ask ----------
const KINDS = ['payment', 'late_fee', 'tax', 'term', 'renewal', 'termination', 'deadline', 'notice', 'insurance', 'condition'] as const;
type Kind = typeof KINDS[number];
const nul = (t: object) => ({ anyOf: [t, { type: 'null' }] });
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: { items: { type: 'array', maxItems: 4, items: {
    type: 'object', additionalProperties: false,
    required: ['kind', 'quote', 'who', 'to_whom', 'amount', 'percent', 'frequency', 'date', 'renewal', 'trigger', 'consequence', 'methods', 'summary'],
    properties: {
      kind: { enum: KINDS }, quote: { type: 'string' }, who: nul({ type: 'string' }), to_whom: nul({ type: 'string' }),
      amount: nul({ type: 'number' }), percent: nul({ type: 'number' }), frequency: { enum: ['once', 'monthly', 'quarterly', 'yearly', 'none'] },
      date: { type: 'object', additionalProperties: false, required: ['type', 'fixed', 'anchor', 'offset', 'unit', 'direction', 'day_of_period'], properties: {
        type: { enum: ['none', 'fixed', 'relative', 'recurring'] }, fixed: nul({ type: 'string' }), anchor: nul({ type: 'string' }), offset: nul({ type: 'number' }),
        unit: { enum: ['days', 'business_days', 'weeks', 'months', 'years', 'none'] }, direction: { enum: ['before', 'after', 'none'] }, day_of_period: nul({ type: 'number' }) } },
      renewal: nul({ type: 'object', additionalProperties: false, required: ['automatic', 'term_months', 'notice_days'], properties: { automatic: { type: 'boolean' }, term_months: nul({ type: 'number' }), notice_days: nul({ type: 'number' }) } }),
      trigger: nul({ type: 'string' }), consequence: nul({ type: 'string' }), methods: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' },
    } } } },
};
export interface LlmItem { kind: Kind; quote: string; who: string | null; to_whom: string | null; amount: number | null; percent: number | null; frequency: string; date: { type: string; fixed: string | null; anchor: string | null; offset: number | null; unit: string; direction: string; day_of_period: number | null }; renewal: { automatic: boolean; term_months: number | null; notice_days: number | null } | null; trigger: string | null; consequence: string | null; methods: string[]; summary: string }

export const SYSTEM = `You read signed business contracts for small-business owners and pull out what each clause makes someone do, pay or decide, and when. You are one of two independent checks; the other is a rules engine. Accuracy matters more than coverage.

For the clause you are given, return up to 4 items. Use these kinds:
- payment: money someone must pay (fees, rent, deposits, charges).
- late_fee: interest or a fee for paying late.
- tax: who pays sales tax (GST/HST/PST/QST) on top of fees.
- term: when the agreement starts and ends (put the END date in date.fixed).
- renewal: automatic or optional renewal and the notice needed to stop it.
- termination: a right to end the agreement, and the notice or fee it needs.
- deadline: something that must be done within a time limit.
- notice: how formal notices must be sent (methods).
- insurance: insurance someone must carry.
- condition: an "if / when / upon / unless / in the event that" rule: what triggers it and what happens.

Rules:
1. quote: copy the exact words from the clause that support the item, character for character. Never paraphrase it.
2. Only report what the clause states. If something is not stated, use null, "none" or an empty list. Never guess or calculate.
3. amount: the number only (4500 for "$4,500.00"). percent: the number only (1.5 for "1.5%").
4. date.type: "fixed" for a calendar date (YYYY-MM-DD in date.fixed); "relative" for a time counted from an event ("30 days after delivery": anchor "delivery", offset 30, unit "days", direction "after"); "recurring" for a repeating due day ("the first day of each month": day_of_period 1, with frequency "monthly").
5. Use unit "business_days" only when the clause says business or working days.
6. renewal: automatic is true only if it renews without anyone acting. notice_days is the notice needed to stop it.
7. trigger and consequence: short plain phrases taken from the clause, for kind "condition" (and for termination rights that depend on an event).
8. who and to_whom: the party names as the clause uses them ("Client", "Provider", "Tenant").
9. summary: one plain sentence a 13-year-old understands, starting with who must do what.
10. If the clause creates no obligation, deadline, payment, renewal or condition, return {"items": []}.`;
// Two short worked examples teach the shape better than more rules.
const EXAMPLES: [string, string][] = [
  ['Section 9.4. Client may cancel the Equipment Lease by giving thirty (30) days written notice, and shall pay a fee of $500 if it cancels within the first year.',
    JSON.stringify({ items: [
      { kind: 'termination', quote: 'Client may cancel the Equipment Lease by giving thirty (30) days written notice', who: 'Client', to_whom: null, amount: null, percent: null, frequency: 'none', date: { type: 'relative', fixed: null, anchor: 'notice given', offset: 30, unit: 'days', direction: 'after', day_of_period: null }, renewal: null, trigger: 'Client gives 30 days written notice', consequence: 'the Equipment Lease ends', methods: ['written'], summary: 'The client can end the equipment lease by giving 30 days of written notice.' },
      { kind: 'condition', quote: 'shall pay a fee of $500 if it cancels within the first year', who: 'Client', to_whom: null, amount: 500, percent: null, frequency: 'once', date: { type: 'none', fixed: null, anchor: null, offset: null, unit: 'none', direction: 'none', day_of_period: null }, renewal: null, trigger: 'Client cancels within the first year', consequence: 'Client pays a $500 fee', methods: [], summary: 'If the client cancels in the first year, the client pays a $500 fee.' }] })],
  ['Section 12.1. This Agreement renews automatically for successive twelve (12) month terms unless either party gives written notice at least sixty (60) days before the end of the then-current term.',
    JSON.stringify({ items: [
      { kind: 'renewal', quote: 'This Agreement renews automatically for successive twelve (12) month terms unless either party gives written notice at least sixty (60) days before the end of the then-current term', who: 'Either party', to_whom: null, amount: null, percent: null, frequency: 'none', date: { type: 'relative', fixed: null, anchor: 'end of the then-current term', offset: 60, unit: 'days', direction: 'before', day_of_period: null }, renewal: { automatic: true, term_months: 12, notice_days: 60 }, trigger: null, consequence: null, methods: ['written'], summary: 'The agreement renews for 12 months unless someone gives written notice at least 60 days before the term ends.' }] })],
];

// ---------- which clauses to ask about ----------
const SIGNAL = /\$|%|\bdays?\b|\bmonths?\b|\byears?\b|renew|terminat|cancel|notice|\bif\b|\bupon\b|\bunless\b|in the event|provided that|subject to|within|\bafter\b|\bbefore\b|anniversar|quarter|effective date|deadline|\bdue\b|insurance|interest|fee|pay/i;
export interface Clause { page: number; para: number; ref: string; text: string }
export function clausesToAsk(c: Contract, max = 60): Clause[] {
  const out: Clause[] = [];
  c.pages.forEach(p => p.paras.forEach((pa, i) => { const body = pa.segs.map(s => s.x).join(''); const text = (pa.lead + ' ' + body).trim(); if (text.length > 25 && (pa.segs.some(s => s.q) || SIGNAL.test(body))) out.push({ page: p.n, para: i, ref: `${c.lines ? 'line' : 'p.'} ${p.n}${(pa.lead.match(/\d+(?:\.\d+)*/) || [])[0] ? ` · §${pa.lead.match(/\d+(?:\.\d+)*/)![0]}` : ''}`, text: text.slice(0, 2400) }); }));
  return out.slice(0, max);
}

// ---------- the engine ----------
let engine: any = null;
export async function loadLlm(progress: (frac: number, text: string) => void): Promise<void> {
  if (engine) return;
  const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
  const model = new URLSearchParams(location.search).get('llm') || MODEL; // ?llm=<id> lets testing swap in a smaller model
  engine = await CreateWebWorkerMLCEngine(new Worker(new URL('./llm.worker.ts', import.meta.url), { type: 'module' }), model, { initProgressCallback: (r: any) => progress(r.progress ?? 0, r.text ?? '') });
}
export const llmReady = () => !!engine;
export async function askClause(cl: Clause): Promise<LlmItem[]> {
  const messages: any[] = [{ role: 'system', content: SYSTEM }];
  for (const [q, a] of EXAMPLES) messages.push({ role: 'user', content: q }, { role: 'assistant', content: a });
  messages.push({ role: 'user', content: cl.text });
  const r = await engine.chat.completions.create({ messages, temperature: 0, top_p: 1, max_tokens: 900, response_format: { type: 'json_object', schema: JSON.stringify(SCHEMA) }, extra_body: { enable_thinking: false } });
  try { return (JSON.parse(r.choices[0].message.content || '{}').items || []) as LlmItem[]; } catch { return []; }
}

// ---------- comparing with the rules check ----------
const norm = (s: string) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
/** Where the model's quote sits in the clause, or -1 if it isn't really there (then the answer is dropped). */
export function locate(quote: string, text: string): number { const q = norm(quote).replace(/[.;,]$/, ''); return q.length < 8 ? -1 : norm(text).indexOf(q); }
const RULE_KIND: Record<string, Kind[]> = { payment: ['payment'], late: ['late_fee'], tax: ['tax'], term: ['term'], renewal: ['renewal'], cancel: ['termination'], deadline: ['deadline', 'condition'], notice: ['notice'], insurance: ['insurance'] };
const money = (n: number) => '$' + n.toLocaleString('en-CA', { maximumFractionDigits: 2 });
const unitWord = (u: string, n: number) => `${n} ${u === 'business_days' ? 'business day' : u.replace(/s$/, '')}${n === 1 ? '' : 's'}`;
function describe(x: LlmItem): string {
  if (x.amount != null) return money(x.amount) + (x.frequency === 'monthly' ? ' a month' : x.frequency === 'yearly' ? ' a year' : x.frequency === 'quarterly' ? ' a quarter' : '');
  if (x.percent != null) return `${x.percent}%`;
  if (x.date.type === 'fixed' && x.date.fixed) return fmt(fromIso(x.date.fixed));
  if (x.renewal?.notice_days != null) return `${x.renewal.notice_days} days’ notice`;
  if (x.date.type === 'relative' && x.date.offset != null) return `${unitWord(x.date.unit, x.date.offset)} ${x.date.direction} ${x.date.anchor || 'the event'}`;
  if (x.methods.length) return x.methods.join(' and ');
  return x.kind === 'condition' ? 'Condition' : x.summary;
}
/** Does the model's reading match what the rules check read? */
export function agrees(it: Item, x: LlmItem): boolean {
  const f = it.fact; if (!f || !RULE_KIND[f.cls]?.includes(x.kind)) return false;
  if (f.amt !== undefined) return x.amount === f.amt && (f.freq === 'once' ? !['monthly', 'yearly', 'quarterly'].includes(x.frequency) : x.frequency === f.freq);
  if (f.pct !== undefined) return x.percent === f.pct;
  if (f.cls === 'term') return x.date.fixed === f.iso;
  if (f.cls === 'renewal') return (x.renewal?.notice_days ?? x.date.offset) === f.days;
  if (f.days !== undefined) return x.date.offset === f.days && (f.biz === undefined || (x.date.unit === 'business_days') === f.biz);
  if (f.tax) return x.kind === 'tax';
  if (f.methods) { const m = x.methods.map(s => s.toLowerCase()); return f.methods.every(w => m.some(s => s.includes(w))); }
  return false;
}
/** Split the page text so a new AI-found item can be highlighted and traced like any other. */
function mark(pages: Page[], page: number, para: number, quote: string, id: number, qid: string): string | null {
  const pa = pages.find(p => p.n === page)?.paras[para]; if (!pa) return null;
  for (let i = 0; i < pa.segs.length; i++) { const s = pa.segs[i]; if (s.q) continue; const at = norm(s.x).indexOf(norm(quote)); if (at < 0) continue;
    // map the position back onto the original text (whitespace may differ), by searching case-insensitively for the first words
    const raw = s.x.toLowerCase().indexOf(quote.trim().toLowerCase().slice(0, 25)); if (raw < 0) continue;
    const end = Math.min(s.x.length, raw + quote.trim().length), q = s.x.slice(raw, end);
    pa.segs.splice(i, 1, ...[{ x: s.x.slice(0, raw), q: 0, qid: '' }, { x: q, q: id, qid }, { x: s.x.slice(end), q: 0, qid: '' }].filter(z => z.x)); return q; }
  return null;
}
/** Our code, not the model, turns the model's date structure into a real date. */
function dateFor(x: LlmItem, c: Contract, prov: string): Partial<Item> {
  const d = x.date, termEnd = c.items.find(i => i.fact?.cls === 'term')?.iso;
  if (d.type === 'fixed' && d.fixed && /^\d{4}-\d\d-\d\d$/.test(d.fixed)) return { iso: d.fixed, due: fmt(fromIso(d.fixed)), cal: 1 };
  if (d.type === 'recurring' && d.day_of_period && (x.frequency === 'monthly')) { const n = nextOccurrence(iso(D(2000, 0, d.day_of_period)), 'monthly', today()); return { iso: iso(n), recur: 'monthly', due: `${fmt(n)}, then monthly`, cal: 1 }; }
  if (d.type === 'relative' && d.offset != null && termEnd && /end of|expir|renewal|term/i.test(d.anchor || '') && d.direction === 'before') {
    const end = fromIso(termEnd), base = /renewal/i.test(d.anchor || '') ? addDays(end, 1) : end;
    const raw = d.unit === 'business_days' ? (() => { let x = base, n = d.offset!; while (n > 0) { x = addDays(x, -1); if (!offDay(x, prov)) n--; } return x; })() : addDays(base, -d.offset * (d.unit === 'weeks' ? 7 : 1));
    const b = businessOnOrBefore(raw, prov);
    return { iso: iso(b.date), due: fmt(b.date), cal: 1, formula: [`The term ends ${fmt(end)}`, `${unitWord(d.unit, d.offset)} before ${fmt(base)} = ${fmt(raw)}`, b.note] };
  }
  if (d.type === 'relative' && d.offset != null) return { due: `${unitWord(d.unit, d.offset)} ${d.direction} ${d.anchor || 'the event'}` };
  return { due: x.kind === 'condition' ? 'When it happens' : 'Not stated' };
}
const KIND_OF: Record<Kind, Item['kind']> = { payment: 'money', late_fee: 'money', tax: 'money', insurance: 'money', term: 'date', renewal: 'date', termination: 'duty', deadline: 'duty', notice: 'duty', condition: 'duty' };
/**
 * Fold the model's answers into the contract. Items both checks read the same way turn green; disagreements open
 * the side-by-side view; things only the model found are added as "AI check only: please confirm".
 */
export function applyLlm(c: Contract, answers: { cl: Clause; items: LlmItem[] }[], prov: string): { contract: Contract; agreed: number; differ: number; added: number; dropped: number } {
  const pages: Page[] = JSON.parse(JSON.stringify(c.pages)); let items = c.items.map(i => ({ ...i })); let agreed = 0, differ = 0, added = 0, dropped = 0, next = Math.max(0, ...items.map(i => i.id)) + 1;
  const seen = new Set<number>();
  for (const { cl, items: xs } of answers) for (const x of xs) {
    if (locate(x.quote, cl.text) < 0) { dropped++; continue; } // not word for word: don't trust it
    const here = items.filter(i => i.page === cl.page && !seen.has(i.id) && norm(cl.text).includes(norm(i.quote).slice(0, 40)) && RULE_KIND[i.fact?.cls || '']?.includes(x.kind));
    const it = here.find(i => agrees(i, x)) || here[0];
    if (it) { seen.add(it.id); const reviewed = c.conf[it.id] !== undefined || c.dis[it.id];
      if (reviewed) continue;
      if (agrees(it, x)) { agreed++; Object.assign(it, { k: it.k === 'r' ? 'r' : 'g', ai: it.rules, aiNote: undefined, conf: undefined }); }
      else { differ++; const v = describe(x); Object.assign(it, { k: 'y', ai: v, aiNote: undefined, conf: [{ by: 'Rules check', v: it.value, quote: it.quote, ref: it.ref, qid: it.qid, note: 'Read by pattern' }, { by: 'AI check', v, quote: x.quote, ref: it.ref, qid: it.qid, note: x.summary }] }); }
      continue; }
    // Found only by the model: add it, clearly marked, for the user to confirm.
    const id = next++, qid = 'qa' + id, q = mark(pages, cl.page, cl.para, x.quote, id, qid); if (!q) { dropped++; continue; }
    added++;
    items.push({ id, k: 'a', kind: KIND_OF[x.kind], sentence: x.kind === 'condition' && x.trigger && x.consequence ? `If ${x.trigger}, ${x.consequence}.` : x.summary, value: describe(x), who: x.who ? `${x.who}${x.to_whom ? ' → ' + x.to_whom : ''}` : 'Not stated', rules: 'not found', ai: describe(x), quote: q, ref: cl.ref, qid, page: cl.page, cal: 0, ...(x.amount != null && x.kind === 'payment' ? { amt: x.amount } : {}), ...dateFor(x, c, prov) } as Item);
  }
  return { contract: { ...c, pages, items }, agreed, differ, added, dropped };
}
/** Read a whole contract with the model. `note` reports progress. */
export async function llmCheck(c: Contract, prov: string, note: (s: string) => void): Promise<ReturnType<typeof applyLlm>> {
  const cls = clausesToAsk(c), answers: { cl: Clause; items: LlmItem[] }[] = [];
  for (let i = 0; i < cls.length; i++) { note(`The on-device AI is reading clause ${i + 1} of ${cls.length}…`); answers.push({ cl: cls[i], items: await askClause(cls[i]) }); }
  return applyLlm(c, answers, prov);
}
