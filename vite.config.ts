import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
// The ONNX Runtime engine (~27 MB) is over Cloudflare Pages' 25 MB file limit, so the scan reader loads it
// from jsDelivr at this exact version, and scripts/pages.mjs drops the bundled copy.
const ORT = JSON.parse(readFileSync('node_modules/onnxruntime-web/package.json', 'utf8')).version;
// The shipped app may only talk to its own origin: that is what keeps the network badge honest.
const CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'";
export default defineConfig(({ command }) => ({
  plugins: [react(), { name: 'csp', transformIndexHtml: (html: string) => command === 'build' ? html.replace('<title>', `<meta http-equiv="Content-Security-Policy" content="${CSP}">\n<title>`) : html }],
  // Served at adarshsharma.ca/contraclear/ (proxied to Cloudflare Pages), so the build lives in dist/contraclear.
  worker: { format: 'es' }, define: { __ORT_VERSION__: JSON.stringify(ORT) },
  base: '/contraclear/', build: { target: 'es2022', chunkSizeWarningLimit: 1500, outDir: 'dist/contraclear', emptyOutDir: true },
}));
