// Cloudflare Pages extras, written at the root of dist/ (the app itself is in dist/contraclear/).
import { writeFileSync, readdirSync, statSync, rmSync } from 'node:fs';
// Cloudflare Pages rejects files over 25 MiB. The only one is the ONNX Runtime engine, which the scan reader
// loads from jsDelivr instead (see vite.config.ts), so the bundled copy is removed.
for (const f of readdirSync('dist/contraclear/assets')) { const p = `dist/contraclear/assets/${f}`; if (statSync(p).size > 25 * 1024 * 1024) { if (!f.endsWith('.wasm')) throw new Error(`${f} is over Cloudflare's 25 MiB limit`); rmSync(p); console.log(`Removed ${f} (loaded from jsDelivr at run time)`); } }
writeFileSync('dist/_redirects', '/  /contraclear/  302\n/contraclear  /contraclear/  301\n');
writeFileSync('dist/_headers', `/contraclear/assets/*
  Cache-Control: public, max-age=31536000, immutable
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
`);
console.log('Wrote dist/_redirects and dist/_headers');
