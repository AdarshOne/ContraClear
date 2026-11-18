// Cloudflare Pages extras, written at the root of dist/ (the app itself is in dist/contraclear/).
import { writeFileSync } from 'node:fs';
writeFileSync('dist/_redirects', '/  /contraclear/  302\n/contraclear  /contraclear/  301\n');
writeFileSync('dist/_headers', `/contraclear/assets/*
  Cache-Control: public, max-age=31536000, immutable
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
`);
console.log('Wrote dist/_redirects and dist/_headers');
