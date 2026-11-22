// Scanned PDFs: render each page to an image with PDF.js, then read it with Granite-Docling on the GPU.
// Granite-Docling answers in "DocTags" (<text>…</text>, <section_header_level_1>…, tables as cells);
// docTagsToParas turns that into the plain paragraphs the rest of the pipeline already understands.
export const OCR_MB = 396;
export async function canOcr(): Promise<boolean> { try { const g = (navigator as any).gpu; return !!(g && await g.requestAdapter()); } catch { return false; } }
export function docTagsToParas(t: string): string[] {
  return t.replace(/<(page_header|page_footer)>[\s\S]*?<\/\1>/g, '').replace(/<loc_\d+>/g, '')
    .replace(/<\/(text|title|section_header_level_\d+|list_item|caption|footnote|formula|code|paragraph|otsl)>/g, '\n\n')
    .replace(/<(fcel|ecel|lcel|ucel|xcel|ched|rhed|srow|nl)>/g, ' ').replace(/<[^>]+>/g, ' ')
    .split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(p => p.length > 1);
}
let w: Worker | null = null, seq = 0; const waiting = new Map<number, (m: any) => void>(); let onLoad: ((mb: number, of: number) => void) | null = null;
function worker() {
  if (w) return w;
  w = new Worker(new URL('./ocr.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = e => { const m = e.data; if (m.type === 'progress') return onLoad?.(m.loaded / 1e6, m.total / 1e6); waiting.get(m.id)?.(m); waiting.delete(m.id); };
  return w;
}
const ask = (msg: any, transfer: Transferable[] = []) => new Promise<any>((res, rej) => { const id = ++seq; waiting.set(id, m => m.type === 'error' ? rej(new Error(m.message)) : res(m)); worker().postMessage({ ...msg, id }, transfer); });
/** Read every page of an open PDF.js document. `note` reports what is happening, for the progress screen. */
export async function ocrPages(doc: any, note: (s: string) => void): Promise<string[][]> {
  onLoad = (mb, of) => note(`Getting the scan reader ready: ${Math.round(mb)} of ${Math.round(of)} MB. This happens once.`);
  note('Getting the scan reader ready…'); await ask({ type: 'load' }); onLoad = null;
  const out: string[][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    note(`Reading scanned page ${n} of ${doc.numPages} on this device…`);
    const page = await doc.getPage(n), vp = page.getViewport({ scale: Math.min(2.5, 1600 / page.getViewport({ scale: 1 }).width) });
    const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    const ctx = cv.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport: vp, canvas: cv } as any).promise;
    const img = ctx.getImageData(0, 0, cv.width, cv.height);
    const r = await ask({ type: 'page', data: img.data.buffer, w: img.width, h: img.height }, [img.data.buffer]);
    out.push(docTagsToParas(r.text));
  }
  return out;
}
