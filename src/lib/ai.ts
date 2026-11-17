// The AI check: a second, independent reading of the important clauses by the user's own provider.
// It never sees the rules check's answers. Only masked clause text is sent, and only after approval.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { Contract, Fact, Item } from './types';
import { makeMasker, type Masker } from './redact';
import { net } from './net';
import { fmt, fromIso } from './dates';

// The app's Content-Security-Policy forbids eval, so tell zod not to probe for it.
z.config({ jitless: true });
export const AI_MODEL = 'claude-opus-5-5';
const Reading = z.object({
  id: z.number().describe('The clause id you were given'),
  found: z.boolean().describe('False if the focus sentence states none of the facts below'),
  payer: z.string().nullable().describe('Who must pay or act, as written (for example "Client"), or null'),
  amount: z.string().nullable().describe('The amount placeholder exactly as written, for example "[AMOUNT 2]", or null'),
  frequency: z.enum(['monthly', 'yearly', 'once', 'none']).describe('How often the amount is paid; "none" if no amount'),
  date: z.string().nullable().describe('For a term, the END date as YYYY-MM-DD. Otherwise a stated calendar date as YYYY-MM-DD, or null'),
  days: z.number().nullable().describe('A notice period or deadline in days, or null'),
  business_days: z.boolean().describe('True only if the days are stated as business or working days'),
  percent: z.number().nullable().describe('An interest or fee percentage, or null'),
  tax_extra: z.boolean().describe('True if the sentence says tax is added on top of the fees'),
  notice_methods: z.array(z.string()).describe('How notices must be sent, for example ["email", "courier"]; empty if not stated'),
  summary: z.string().describe('One plain sentence, grade 8 reading level, saying what the focus sentence requires'),
});
const Out = z.object({ clauses: z.array(Reading) });
export type Reading = z.infer<typeof Reading>;

const SYSTEM = `You are the second of two independent checks in ContraClear, a tool that tells small-business owners what their signed contracts require of them. A deterministic rules check has already read each clause; you never see its answers, because the two readings are compared afterwards and any disagreement is shown to the owner to resolve. Your value is an honest, careful, independent reading.

The clauses come from one contract. Names, amounts and addresses were masked on the owner's device before sending, so you will see placeholders such as [PARTY A], [AMOUNT 1], [AMOUNT IN WORDS] and [ADDRESS 1]. Copy placeholders exactly when you report them; never try to work out what they stand for.

For each clause you get its surrounding paragraph for context and one focus sentence. Report only what the focus sentence itself states. When it does not state a field, use null (or false, "none", an empty list). Do not infer, estimate or fill gaps: a missing value correctly reported as missing is the right answer, and a guess would be shown to the owner as if it were a reading.

Return one entry per clause id, in the same order.`;

export interface AiRequest { masker: Masker; ids: number[]; user: string; bytes: number; cost: number }
const bodyFor = (user: string) => ({ model: AI_MODEL, max_tokens: 16000, thinking: { type: 'adaptive' as const }, output_config: { effort: 'medium' as const, format: zodOutputFormat(Out) }, system: SYSTEM, messages: [{ role: 'user' as const, content: user }] });
const paraOf = (c: Contract, it: Item) => { const p = c.pages.find(x => x.n === it.page)?.paras.find(pa => pa.segs.some(s => s.q === it.id)); return p ? (p.lead + ' ' + p.segs.map(s => s.x).join('')).trim() : it.quote; };
/** Items the rules check read that no AI has checked yet. */
export const pending = (c: Contract) => c.items.filter(i => i.ai === undefined && !c.dis[i.id] && c.conf[i.id] === undefined);
/** Builds the exact request. What `user` holds is what the preview shows and what is sent. */
export function buildRequest(c: Contract): AiRequest {
  const all = c.pages.map(p => p.paras.map(pa => pa.lead + ' ' + pa.segs.map(s => s.x).join('')).join('\n')).join('\n');
  const masker = makeMasker(all, [c.cp]), items = pending(c);
  const user = items.map(it => `Clause ${it.id}\nParagraph: ${masker.mask(paraOf(c, it))}\nFocus sentence: ${masker.mask(it.quote)}`).join('\n\n');
  const bytes = new TextEncoder().encode(JSON.stringify(bodyFor(user))).length;
  // Rough: ~4 bytes a token in at $4 per million, and a generous output allowance at $20 per million.
  const cost = (bytes / 4) * 4e-6 + (items.length * 160 + 1200) * 20e-6;
  return { masker, ids: items.map(i => i.id), user, bytes, cost };
}
export class AiError extends Error { constructor(public code: 'key' | 'down' | 'limit' | 'refused' | 'bad', msg = '') { super(msg || code); } }
export async function runAi(key: string, req: AiRequest): Promise<Reading[]> {
  // The key is the user's own, used from their own browser by their own choice.
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 });
  net.count(req.bytes);
  try {
    const res = await client.messages.parse(bodyFor(req.user));
    if (res.stop_reason === 'refusal') throw new AiError('refused');
    if (!res.parsed_output) throw new AiError('bad');
    return res.parsed_output.clauses;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new AiError('key');
    if (e instanceof Anthropic.RateLimitError) throw new AiError('limit');
    if (e instanceof Anthropic.BadRequestError) throw new AiError('bad', e.message);
    throw new AiError('down');
  }
}
const num = (s: string | null | undefined) => { const m = (s || '').match(/\d[\d,]*(?:\.\d+)?/); return m ? +m[0].replace(/,/g, '') : NaN; };
const freq = (f: string) => (f === 'none' ? 'once' : f);
/** Compare one AI reading with what the rules check read. Returns the AI's value in plain words and whether they agree. */
export function compare(f: Fact, r: Reading, m: Masker): { agree: boolean; ai: string } {
  if (f.amt !== undefined) { const a = num(m.unmask(r.amount || '')), per = freq(r.frequency) === 'monthly' ? ' a month' : freq(r.frequency) === 'yearly' ? ' a year' : ''; return { agree: a === f.amt && freq(r.frequency) === f.freq, ai: isNaN(a) ? 'no amount read' : '$' + a.toLocaleString('en-CA') + per }; }
  if (f.iso !== undefined) return { agree: r.date === f.iso, ai: r.date && /^\d{4}-\d\d-\d\d$/.test(r.date) ? fmt(fromIso(r.date)) : 'no date read' };
  if (f.days !== undefined) return { agree: r.days === f.days && (f.biz === undefined || r.business_days === f.biz), ai: r.days == null ? 'no period read' : `${r.days} ${r.business_days ? 'business ' : ''}days` };
  if (f.pct !== undefined) return { agree: r.percent === f.pct, ai: r.percent == null ? 'no rate read' : `${r.percent}%` };
  if (f.tax) return { agree: r.tax_extra, ai: r.tax_extra ? 'exclusive of tax' : 'tax not mentioned' };
  if (f.methods) { const got = r.notice_methods.map(x => x.toLowerCase()); return { agree: f.methods.every(x => got.some(g => g.includes(x.toLowerCase()))) && got.length === f.methods.length, ai: got.join(' and ') || 'no method read' }; }
  return { agree: false, ai: r.summary };
}
/** Fold the AI readings into the contract. Agreement turns an item green; anything else waits for the user. */
export function applyReadings(c: Contract, req: AiRequest, readings: Reading[]): { contract: Contract; agreed: number; differ: number } {
  let agreed = 0, differ = 0; const by = new Map(readings.map(r => [r.id, r]));
  const items = c.items.map(it => {
    if (!req.ids.includes(it.id)) return it; const r = by.get(it.id);
    if (!r || !r.found || !it.fact) { differ++; return { ...it, ai: r && r.found ? r.summary : 'not found in this clause', k: it.k === 'r' ? 'r' as const : 'y' as const }; }
    const cmp = compare(it.fact, r, req.masker);
    if (it.k === 'r') { differ++; return { ...it, ai: cmp.ai }; }
    if (cmp.agree) { agreed++; return { ...it, ai: it.rules, k: 'g' as const }; }
    differ++;
    return { ...it, ai: cmp.ai, k: 'y' as const, conf: [{ by: 'Rules check', v: it.value, quote: it.quote, ref: it.ref, qid: it.qid, note: 'Read by pattern' }, { by: 'AI check', v: cmp.ai, quote: it.quote, ref: it.ref, qid: it.qid, note: r.summary }] };
  });
  return { contract: { ...c, items }, agreed, differ };
}
