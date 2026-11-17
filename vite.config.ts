import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// The shipped app may only talk to its own origin, plus the user's AI provider when they turn cloud AI on.
// Every byte sent there is counted in src/lib/net.ts, which is what keeps the network badge honest.
const CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self' https://api.anthropic.com";
export default defineConfig(({ command }) => ({
  plugins: [react(), { name: 'csp', transformIndexHtml: (html: string) => command === 'build' ? html.replace('<title>', `<meta http-equiv="Content-Security-Policy" content="${CSP}">\n<title>`) : html }],
  base: './', build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
}));
