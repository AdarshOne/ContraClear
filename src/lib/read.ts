// Reads files in the browser. Nothing here touches the network.
import type { RawPage } from './rules';
export type ReadCode = 'doc' | 'type' | 'big' | 'pages' | 'pw' | 'fr' | 'scan' | 'damaged';
export class ReadError extends Error { constructor(public code: ReadCode, public detail = '', public raw?: RawPage[]) { super(code); } }
export const MAX_MB = 50, MAX_PAGES = 300;
const ext = (n: string) => (n.match(/\.([a-z0-9]+)$/i) || ['', ''])[1].toLowerCase();
export const looksReadable = (name: string) => ['pdf', 'docx', 'txt'].includes(ext(name));

const isFrench = (t: string) => { const s = ' ' + t.slice(0, 6000).toLowerCase() + ' '; const c = (w: string[]) => w.reduce((n, x) => n + s.split(x).length - 1, 0); return c([' le ', ' la ', ' les ', ' des ', ' et ', ' du ', ' une ', ' est ']) > 1.5 * c([' the ', ' and ', ' of ', ' to ', ' shall ', ' is ']) + 5; };
const heading = (paras: string[], n: number) => { const h = paras.find(p => p.length < 70 && !/[.;]$/.test(p)); return h || (paras[0] ? paras[0].replace(/^(\d+(?:\.\d+)*\.?\s+[^.]{0,40}).*$/s, '$1') : `Page ${n}`); };

async function readPdf(file: File, password?: string): Promise<RawPage[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  let doc;
  try { doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), password, useSystemFonts: true }).promise; }
  catch (e: any) { throw new ReadError(e?.name === 'PasswordException' ? 'pw' : 'damaged', e?.message || ''); }
  if (doc.numPages > MAX_PAGES) throw new ReadError('pages', String(doc.numPages));
  const out: RawPage[] = []; let chars = 0;
  for (let n = 1; n <= doc.numPages; n++) {
    const tc = await (await doc.getPage(n)).getTextContent();
    const lines: { y: number; h: number; t: string }[] = [];
    for (const it of tc.items as any[]) { if (!('str' in it) || !it.str) continue; const y = it.transform[5], h = it.height || 10; const l = lines[lines.length - 1]; if (l && Math.abs(l.y - y) < h * 0.5) l.t += it.str; else lines.push({ y, h, t: it.str }); }
    const paras: string[] = []; let cur = '', prev: { y: number; h: number } | null = null;
    for (const l of lines) { const t = l.t.replace(/\s+/g, ' ').trim(); if (!t) continue; const gap = prev ? Math.abs(prev.y - l.y) : 0; const brk = !cur || gap > l.h * 1.9 || /^(?:Section\s+)?\d+(?:\.\d+)*\.?\s+[A-Z]/.test(t); if (brk && cur) { paras.push(cur); cur = ''; } cur += (cur ? (cur.endsWith('-') ? '' : ' ') : '') + t; prev = l; }
    if (cur) paras.push(cur); chars += paras.join('').length;
    const h = heading(paras, n); out.push({ n, file: file.name, h, paras: paras.filter(x => x !== h) });
  }
  if (chars < 40 * doc.numPages) throw new ReadError('scan', String(doc.numPages));
  return out;
}
export function pagesFromText(text: string, file: string, per = 2600): RawPage[] {
  const paras = text.replace(/\r/g, '').split(/\n\s*\n|\n(?=(?:Section\s+)?\d+(?:\.\d+)*\.?\s+[A-Z])/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out: RawPage[] = []; let cur: string[] = [], len = 0;
  const flush = () => { if (cur.length) { const h = heading(cur, out.length + 1); out.push({ n: out.length + 1, file, h, paras: cur.filter(x => x !== h) }); cur = []; len = 0; } };
  for (const p of paras) { if (len + p.length > per) flush(); cur.push(p); len += p.length; }
  flush(); return out;
}
/** Pasted text has no pages, so each paragraph is a numbered line. */
export const linesFromText = (text: string): RawPage[] => text.replace(/\r/g, '').split(/\n+/).map(s => s.trim()).filter(Boolean).map((p, i) => ({ n: i + 1, file: 'Pasted text', h: '', paras: [p] }));

export async function readFile(file: File, password?: string): Promise<RawPage[]> {
  const e = ext(file.name);
  if (e === 'doc') throw new ReadError('doc');
  if (!looksReadable(file.name)) throw new ReadError('type', e ? '.' + e : 'this kind of');
  if (file.size > MAX_MB * 1048576) throw new ReadError('big', String(Math.round(file.size / 1048576)));
  let raw: RawPage[];
  if (e === 'pdf') raw = await readPdf(file, password);
  else if (e === 'docx') { try { const mammoth = await import('mammoth'); raw = pagesFromText((await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value, file.name); } catch { throw new ReadError('damaged'); } }
  else raw = pagesFromText(await file.text(), file.name);
  if (!raw.length) throw new ReadError('damaged');
  if (isFrench(raw.map(p => p.paras.join(' ')).join(' '))) throw new ReadError('fr', '', raw);
  return raw;
}
