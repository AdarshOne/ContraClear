// Fuzzy re-anchoring off the main thread. Exact lookups stay on the main thread (AnchorStore.lookup).
import { resolveMany } from './anchor';
import type { AnchorOptions, Clause, Resolution } from './types';
export interface ResolveRequest { type: 'resolveMany'; id: number; oldClauses: Clause[]; newText: string; opts?: Partial<AnchorOptions> }
export type ResolveResponse = { type: 'result'; id: number; results: Resolution[]; ms: number } | { type: 'error'; id: number; message: string };
const post = (m: ResolveResponse) => (self as unknown as { postMessage: (m: ResolveResponse) => void }).postMessage(m);
self.onmessage = (e: MessageEvent<ResolveRequest>) => {
  const m = e.data; if (m.type !== 'resolveMany') return;
  try { const t0 = performance.now(); const results = resolveMany(m.oldClauses, m.newText, m.opts); post({ type: 'result', id: m.id, results, ms: performance.now() - t0 }); }
  catch (err) { post({ type: 'error', id: m.id, message: err instanceof Error ? err.message : String(err) }); }
};
