// Main-thread handle for the anchoring worker.
import type { AnchorOptions, Clause, Resolution } from './types';
import type { ResolveRequest, ResolveResponse } from './worker';
export class AnchorWorker {
  private w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private seq = 0; private waiting = new Map<number, { ok: (r: { results: Resolution[]; ms: number }) => void; fail: (e: Error) => void }>();
  constructor() { this.w.onmessage = (e: MessageEvent<ResolveResponse>) => { const m = e.data, h = this.waiting.get(m.id); if (!h) return; this.waiting.delete(m.id); if (m.type === 'result') h.ok({ results: m.results, ms: m.ms }); else h.fail(new Error(m.message)); }; }
  resolveMany(oldClauses: Clause[], newText: string, opts?: Partial<AnchorOptions>): Promise<{ results: Resolution[]; ms: number }> {
    const id = ++this.seq; const req: ResolveRequest = { type: 'resolveMany', id, oldClauses, newText, ...(opts ? { opts } : {}) };
    return new Promise((ok, fail) => { this.waiting.set(id, { ok, fail }); this.w.postMessage(req); });
  }
  terminate(): void { this.w.terminate(); }
}
