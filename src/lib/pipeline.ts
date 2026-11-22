// The Flow 3 pipeline. The progress view listens to these stage events; it shows nothing that didn't happen.
import type { Contract, Settings } from './types';
import { readFile, linesFromText, ReadError } from './read';
import { runRules, type RawPage } from './rules';
import { today, iso } from './dates';
import { secondCheck } from './second';
export const STAGES = ['Reading the pages', 'Finding the clauses', 'Checking dates and amounts (rules)', 'Asking the AI about the important clauses only', 'Comparing both checks', 'Working out the real deadlines'];
export interface Progress { stage: number; pages?: number; money?: number; dates?: number; duties?: number; formula?: string; aiOff?: boolean; note?: string; agreed?: number }
export interface Input { name: string; file?: File; text?: string; src: string; password?: string; raw?: RawPage[]; ocr?: boolean }
const uid = () => crypto.randomUUID();
export const blankState = () => ({ conf: {}, dis: {}, hist: {}, pick: {}, accepted: false, tracked: [] });
export async function processInput(inp: Input, s: Settings, on: (p: Progress) => void, pace: () => Promise<void>, signal?: AbortSignal): Promise<Contract> {
  const step = async (p: Progress) => { if (signal?.aborted) throw new DOMException('cancelled', 'AbortError'); on(p); await pace(); };
  await step({ stage: 0 });
  const lines = inp.text !== undefined;
  const raw = inp.raw ?? (lines ? linesFromText(inp.text!) : await readFile(inp.file!, inp.password, inp.ocr ? note => on({ stage: 0, note }) : undefined));
  if (!raw.length) throw new ReadError('damaged');
  await step({ stage: 1, pages: raw.length });
  const r = runRules(raw, s.prov, lines);
  const count = { money: r.items.filter(i => i.kind === 'money').length, dates: r.items.filter(i => i.kind === 'date').length, duties: r.items.filter(i => i.kind === 'duty').length };
  await step({ stage: 2, pages: raw.length, ...count });
  // The AI check runs only with the on-device engine. In Rules only these two stages report themselves as off.
  const aiOff = s.eng !== 'device';
  let c: Contract = { id: uid(), name: '', cp: r.cp, type: r.type, year: r.year, src: inp.src, files: [inp.name], pages: r.pages, items: r.items, nf: r.nf, added: iso(today()), lines, ocr: inp.ocr || undefined, ...blankState() };
  await step({ stage: 3, pages: raw.length, ...count, aiOff });
  let agreed: number | undefined;
  if (!aiOff) { const out = secondCheck(c); c = out.contract; agreed = out.agreed; }
  await step({ stage: 4, pages: raw.length, ...count, aiOff, agreed });
  const f = r.items.find(i => i.formula && i.kind === 'date');
  await step({ stage: 5, pages: raw.length, ...count, aiOff, agreed, formula: f?.formula?.[2] });
  const title = raw[0].h && raw[0].h.length > 3 && !lines ? raw[0].h : inp.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ');
  return { ...c, name: title.slice(0, 60) };
}
