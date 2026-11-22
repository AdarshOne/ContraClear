// Runs IBM's Granite-Docling (258M) in a background worker with WebGPU, so the page stays responsive.
// The model is downloaded once from Hugging Face and cached by the browser. Page images never leave this worker.
import { AutoProcessor, AutoModelForVision2Seq, RawImage, env } from '@huggingface/transformers';
env.allowLocalModels = false;
declare const __ORT_VERSION__: string;
(env.backends.onnx as any).wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${__ORT_VERSION__}/dist/`;
const ID = 'onnx-community/granite-docling-258M-ONNX';
let proc: any, model: any;
const files: Record<string, { loaded: number; total: number }> = {};
self.onmessage = async (e: MessageEvent) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      proc ??= await AutoProcessor.from_pretrained(ID);
      model ??= await AutoModelForVision2Seq.from_pretrained(ID, {
        device: 'webgpu',
        // Half-precision where the GPU supports it (~396 MB); otherwise a 4-bit vision encoder and decoder (~400 MB).
        dtype: ((await (navigator as any).gpu?.requestAdapter())?.features?.has('shader-f16') ? { embed_tokens: 'fp16', vision_encoder: 'fp16', decoder_model_merged: 'q4f16' } : { embed_tokens: 'fp32', vision_encoder: 'q4', decoder_model_merged: 'q4' }) as any,
        progress_callback: (p: any) => { if (p.status !== 'progress' || !p.total) return; files[p.file] = { loaded: p.loaded, total: p.total }; const v = Object.values(files); postMessage({ type: 'progress', loaded: v.reduce((n, f) => n + f.loaded, 0), total: v.reduce((n, f) => n + f.total, 0) }); },
      });
      postMessage({ type: 'ready', id: m.id });
    } else if (m.type === 'page') {
      const img = new RawImage(new Uint8ClampedArray(m.data), m.w, m.h, 4).rgb();
      const prompt = proc.apply_chat_template([{ role: 'user', content: [{ type: 'image' }, { type: 'text', text: 'Convert this page to docling.' }] }], { add_generation_prompt: true });
      const inputs = await proc(prompt, [img], { do_image_splitting: true });
      const out = await model.generate({ ...inputs, max_new_tokens: 4096 });
      const text = proc.batch_decode(out.slice(null, [inputs.input_ids.dims.at(-1), null]), { skip_special_tokens: false })[0];
      postMessage({ type: 'page', id: m.id, text });
    }
  } catch (err: any) { postMessage({ type: 'error', id: m.id, message: String(err?.message || err) }); }
};
