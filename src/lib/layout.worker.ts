// PP-DocLayout_plus-L, the layout model PP-StructureV3 uses: finds titles, text blocks, tables, headers and footers.
// Runs with ONNX Runtime Web (WebGPU when available, else WebAssembly). The model (~130 MB) is downloaded once
// from Hugging Face and kept in the browser's cache. Page images never leave this worker.
import * as ort from 'onnxruntime-web';
declare const __ORT_VERSION__: string;
ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${__ORT_VERSION__}/dist/`;
ort.env.wasm.numThreads = 1;
const URL_ = 'https://huggingface.co/PaddlePaddle/PP-DocLayout_plus-L_onnx/resolve/main/inference.onnx';
export const LABELS = ['paragraph_title', 'image', 'text', 'number', 'abstract', 'content', 'figure_title', 'formula', 'table', 'reference', 'doc_title', 'footnote', 'header', 'algorithm', 'footer', 'seal', 'chart', 'formula_number', 'aside_text', 'reference_content'];
let session: ort.InferenceSession | null = null, model: Uint8Array | null = null, onGpu = false;
async function load(progress: (mb: number, of: number) => void): Promise<Uint8Array> {
  const cache = await caches.open('contraclear-models').catch(() => null);
  const hit = await cache?.match(URL_); if (hit) return new Uint8Array(await hit.arrayBuffer());
  const r = await fetch(URL_); if (!r.ok || !r.body) throw new Error(`layout model download failed (HTTP ${r.status})`);
  const total = +(r.headers.get('content-length') || 130e6), parts: Uint8Array[] = []; let got = 0; const rd = r.body.getReader();
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; progress(got / 1e6, total / 1e6); }
  const buf = new Uint8Array(got); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
  await cache?.put(URL_, new Response(buf.slice().buffer)).catch(() => {}); return buf;
}
self.onmessage = async (e: MessageEvent) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      if (!session) { model = await load((mb, of) => postMessage({ type: 'progress', mb, of }));
        onGpu = !!((navigator as any).gpu && await (navigator as any).gpu.requestAdapter().catch(() => null));
        session = await ort.InferenceSession.create(model, { executionProviders: onGpu ? ['webgpu', 'wasm'] : ['wasm'] }).catch(async () => { onGpu = false; return ort.InferenceSession.create(model!, { executionProviders: ['wasm'] }); }); }
      postMessage({ type: 'ready', id: m.id });
    } else if (m.type === 'page') {
      // Resize to 800×800 (no aspect ratio kept), scale 0–1, channels first: the model's own preprocessing.
      const S = 800, { w, h } = m, src = new Uint8ClampedArray(m.data), img = new Float32Array(3 * S * S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const sx = Math.min(w - 1, Math.floor(x * w / S)), sy = Math.min(h - 1, Math.floor(y * h / S)), i = (sy * w + sx) * 4, o = y * S + x; img[o] = src[i] / 255; img[S * S + o] = src[i + 1] / 255; img[2 * S * S + o] = src[i + 2] / 255; }
      const feeds: Record<string, ort.Tensor> = {};
      for (const n of session!.inputNames) feeds[n] = n === 'image' ? new ort.Tensor('float32', img, [1, 3, S, S]) : n === 'im_shape' ? new ort.Tensor('float32', new Float32Array([S, S]), [1, 2]) : new ort.Tensor('float32', new Float32Array([S / h, S / w]), [1, 2]);
      // If WebGPU can't run a layer, switch to WebAssembly for good and try again.
      const out = await session!.run(feeds).catch(async e => { if (!onGpu) throw e; onGpu = false; session = await ort.InferenceSession.create(model!, { executionProviders: ['wasm'] }); return session.run(feeds); }), t = Object.values(out).find(v => v.dims.length === 2 && (v.dims[1] === 6 || v.dims[1] === 7))!, d = t.data as Float32Array, k = t.dims[1];
      const regions = []; for (let i = 0; i < t.dims[0]; i++) { const r = d.subarray(i * k, i * k + k); if (r[1] >= 0.5) regions.push({ label: LABELS[r[0]] || 'text', score: r[1], x1: r[2], y1: r[3], x2: r[4], y2: r[5] }); }
      postMessage({ type: 'page', id: m.id, regions });
    }
  } catch (err: any) { postMessage({ type: 'error', id: m.id, message: String(err?.message || err) }); }
};
