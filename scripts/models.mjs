// Downloads the PP-OCRv6 small text models once and puts them in public/ocr-models, so ContraClear serves them
// itself (no third-party request for them at run time). Runs before `npm run dev` and `npm run build`,
// including on Cloudflare's build machines. The files are not committed to git.
import { mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
const SRC = 'https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/';
const FILES = ['PP-OCRv6_small_det_onnx_infer.tar', 'PP-OCRv6_small_rec_onnx_infer.tar'];
mkdirSync('public/ocr-models', { recursive: true });
for (const f of FILES) {
  const out = `public/ocr-models/${f}`;
  if (existsSync(out) && statSync(out).size > 1e6) continue;
  const r = await fetch(SRC + f); if (!r.ok) throw new Error(`Could not download ${f}: HTTP ${r.status}`);
  writeFileSync(out, Buffer.from(await r.arrayBuffer())); console.log(`Downloaded ${f}`);
}
