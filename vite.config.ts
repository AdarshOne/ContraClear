import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
// The ONNX Runtime engine (~27 MB) is over Cloudflare Pages' 25 MB file limit, so the scan reader loads it
// from jsDelivr at this exact version, and scripts/pages.mjs drops the bundled copy.
const ORT = JSON.parse(readFileSync('node_modules/onnxruntime-web/package.json', 'utf8')).version;
// The shipped app may only talk to its own origin: that is what keeps the network badge honest.
// Scan reading (opt-in, src/lib/ocr.ts) is the only exception: OpenCV.js inside the PaddleOCR worker builds functions
// from text ('unsafe-eval'), ONNX Runtime loads its engine from jsDelivr, and the layout model comes from Hugging Face.
// Workers here inherit this policy, so those are allowed explicitly. No user data is sent to any of them.
const CSP = "default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self' data: https://cdn.jsdelivr.net https://huggingface.co https://*.huggingface.co https://*.hf.co";
export default defineConfig(({ command }) => ({
  plugins: [react(), { name: 'csp', transformIndexHtml: (html: string) => command === 'build' ? html.replace('<title>', `<meta http-equiv="Content-Security-Policy" content="${CSP}">\n<title>`) : html }],
  // Served at adarshsharma.ca/contraclear/ (proxied to Cloudflare Pages), so the build lives in dist/contraclear.
  worker: { format: 'es' }, define: { __ORT_VERSION__: JSON.stringify(ORT) },
  base: '/contraclear/', build: { target: 'es2022', chunkSizeWarningLimit: 1500, outDir: 'dist/contraclear', emptyOutDir: true },
}));
