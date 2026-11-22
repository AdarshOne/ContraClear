// Scanned PDFs, read on this device with PaddleOCR:
//  - PP-OCRv6 small finds and reads every line of text (official @paddleocr/paddleocr-js SDK, in its own worker).
//    Its two models (~31 MB) are served by ContraClear itself.
//  - PP-DocLayout_plus-L, PP-StructureV3's layout model, marks titles, text blocks, tables, headers and footers
//    (layout.worker.ts, ~130 MB, once, from Hugging Face).
// assemble() joins the two: lines go into their layout blocks, blocks are put in reading order, headers and
// footers are dropped, and table rows keep their cells apart. Each page also gets a confidence score.
export const OCR_MB = 161;
export async function canOcr(): Promise<boolean> { return typeof WebAssembly === 'object'; }
export interface Line { text: string; score: number; x1: number; y1: number; x2: number; y2: number }
export interface Region { label: string; score: number; x1: number; y1: number; x2: number; y2: number }
const DROP = new Set(['header', 'footer', 'number', 'image', 'seal', 'chart', 'formula_number', 'aside_text']);
const overlap = (l: Line, r: Region) => Math.max(0, Math.min(l.x2, r.x2) - Math.max(l.x1, r.x1)) * Math.max(0, Math.min(l.y2, r.y2) - Math.max(l.y1, r.y1)) / Math.max(1, (l.x2 - l.x1) * (l.y2 - l.y1));
/** Group lines into visual rows (same height on the page), each row read left to right. */
function rows(ls: Line[]): Line[][] {
  const out: Line[][] = [];
  for (const l of [...ls].sort((a, b) => (a.y1 + a.y2) - (b.y1 + b.y2))) { const r = out[out.length - 1], mid = (l.y1 + l.y2) / 2; if (r && Math.abs(mid - (r[0].y1 + r[0].y2) / 2) < (l.y2 - l.y1) * 0.5) r.push(l); else out.push([l]); }
  return out.map(r => r.sort((a, b) => a.x1 - b.x1));
}
const joinText = (rs: Line[][]) => rs.map(r => r.map(l => l.text).join(' ')).reduce((s, t) => s ? (s.endsWith('-') ? s.slice(0, -1) + t : s + ' ' + t) : t, '');
export function assemble(lines: Line[], regions: Region[]): string[] {
  const blocks = regions.map(r => ({ r, ls: [] as Line[] })), loose: Line[] = [];
  for (const l of lines) { let best = -1, bv = 0.5; blocks.forEach((b, i) => { const v = overlap(l, b.r); if (v > bv) { bv = v; best = i; } }); if (best >= 0) blocks[best].ls.push(l); else loose.push(l); }
  // Lines outside every block become blocks of their own, split where the vertical gap is large.
  const looseRows = rows(loose); let cur: Line[] = [];
  const pushLoose = () => { if (cur.length) blocks.push({ r: { label: 'text', score: 1, x1: Math.min(...cur.map(l => l.x1)), y1: Math.min(...cur.map(l => l.y1)), x2: Math.max(...cur.map(l => l.x2)), y2: Math.max(...cur.map(l => l.y2)) }, ls: cur }); cur = []; };
  looseRows.forEach((r, i) => { const prev = looseRows[i - 1]; if (prev && r[0].y1 - Math.max(...prev.map(l => l.y2)) > (r[0].y2 - r[0].y1) * 1.2) pushLoose(); cur.push(...r); }); pushLoose();
  // Reading order: top to bottom; blocks side by side at the same height go left to right.
  const keep = blocks.filter(b => b.ls.length && !DROP.has(b.r.label)).sort((a, b) => Math.abs(a.r.y1 - b.r.y1) < 12 ? a.r.x1 - b.r.x1 : a.r.y1 - b.r.y1);
  const out: string[] = [];
  for (const b of keep) {
    const rs = rows(b.ls);
    if (b.r.label === 'table') rs.forEach(r => out.push(r.map(l => l.text).join(' | ')));
    else { // a new paragraph starts wherever a row opens with a section number such as "3.2" or "(a)"
      let para: Line[][] = []; for (const r of rs) { if (para.length && /^(?:Section\s+)?\(?\d+(?:\.\d+)*\)?\.?\s|^\([a-z]\)\s/i.test(r[0].text)) { out.push(joinText(para)); para = []; } para.push(r); } if (para.length) out.push(joinText(para));
    }
  }
  return out.map(p => p.replace(/\s+/g, ' ').trim()).filter(p => p.length > 1);
}
// ---- workers ----
let layout: Worker | null = null, seq = 0; const waiting = new Map<number, (m: any) => void>(); let onLoad: ((mb: number, of: number) => void) | null = null;
function lw() { if (layout) return layout; layout = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' }); layout.onmessage = e => { const m = e.data; if (m.type === 'progress') return onLoad?.(m.mb, m.of); waiting.get(m.id)?.(m); waiting.delete(m.id); }; return layout; }
const ask = (msg: any, transfer: Transferable[] = []) => new Promise<any>((res, rej) => { const id = ++seq; waiting.set(id, m => m.type === 'error' ? rej(new Error(m.message)) : res(m)); lw().postMessage({ ...msg, id }, transfer); });
let paddle: any = null;
async function text() {
  if (paddle) return paddle;
  const { PaddleOCR } = await import('@paddleocr/paddleocr-js'); const base = `${location.origin}${import.meta.env.BASE_URL}ocr-models/`;
  paddle = await PaddleOCR.create({ worker: true, textDetectionModelName: 'PP-OCRv6_small_det', textDetectionModelAsset: { url: base + 'PP-OCRv6_small_det_onnx_infer.tar' }, textRecognitionModelName: 'PP-OCRv6_small_rec', textRecognitionModelAsset: { url: base + 'PP-OCRv6_small_rec_onnx_infer.tar' }, // WebAssembly: ONNX Runtime's WebGPU backend can't yet run these models (MaxPool with ceil_mode).
    ortOptions: { backend: 'wasm', wasmPaths: `https://cdn.jsdelivr.net/npm/onnxruntime-web@${__ORT_VERSION__}/dist/`, numThreads: 1 } } as any);
  return paddle;
}
declare const __ORT_VERSION__: string;
export interface OcrPage { paras: string[]; quality: number; ms: number }
/** Read every page of an open PDF.js document. `note` reports progress for the processing screen. */
export async function ocrPages(doc: any, note: (s: string) => void): Promise<OcrPage[]> {
  onLoad = (mb, of) => note(`Getting the scan reader ready: ${Math.round(mb)} of ${Math.round(of)} MB. This happens once.`);
  note('Getting the scan reader ready…'); const [ocr] = await Promise.all([text(), ask({ type: 'load' })]); onLoad = null;
  const out: OcrPage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    note(`Reading scanned page ${n} of ${doc.numPages} on this device…`); const t0 = performance.now();
    const page = await doc.getPage(n), vp = page.getViewport({ scale: Math.min(3, 1700 / page.getViewport({ scale: 1 }).width) });
    const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    const ctx = cv.getContext('2d', { willReadFrequently: true })!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport: vp, canvas: cv } as any).promise;
    const img = ctx.getImageData(0, 0, cv.width, cv.height), copy = new Uint8ClampedArray(img.data);
    const [res, lay] = await Promise.all([ocr.predict(img), ask({ type: 'page', data: copy.buffer, w: img.width, h: img.height }, [copy.buffer])]);
    const lines: Line[] = (res[0]?.items || []).map((it: any) => { const xs = it.poly.map((p: number[]) => p[0]), ys = it.poly.map((p: number[]) => p[1]); return { text: it.text, score: it.score, x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) }; });
    const chars = lines.reduce((s, l) => s + l.text.length, 0);
    out.push({ paras: assemble(lines, lay.regions), quality: chars ? lines.reduce((s, l) => s + l.score * l.text.length, 0) / chars : 0, ms: Math.round(performance.now() - t0) });
  }
  return out;
}
