// Which document is this? An inverted index from clauseId to documents, and Jaccard overlap of clause sets.
// Boilerplate clauses are shared across contracts, so a single shared clause never decides it: overlap does.
export class DocIndex {
  private byClause = new Map<string, Set<string>>();
  private byDoc = new Map<string, Set<string>>();
  /** Record (or replace) the latest clause set for a document. */
  set(docId: string, clauseIds: Iterable<string>): void {
    const next = new Set(clauseIds), prev = this.byDoc.get(docId);
    if (prev) for (const id of prev) if (!next.has(id)) { const s = this.byClause.get(id); s?.delete(docId); if (s && !s.size) this.byClause.delete(id); }
    for (const id of next) { let s = this.byClause.get(id); if (!s) this.byClause.set(id, s = new Set()); s.add(docId); }
    this.byDoc.set(docId, next);
  }
  remove(docId: string): void { this.set(docId, []); this.byDoc.delete(docId); }
  docsWith(clauseId: string): ReadonlySet<string> { return this.byClause.get(clauseId) ?? new Set(); }
  /** Best known document for these clauses, by Jaccard overlap, among documents sharing at least one clause. */
  best(clauseIds: Iterable<string>): { docId: string; overlap: number } | null {
    const mine = new Set(clauseIds), shared = new Map<string, number>();
    for (const id of mine) for (const d of this.docsWith(id)) shared.set(d, (shared.get(d) ?? 0) + 1);
    let best: { docId: string; overlap: number } | null = null;
    for (const [d, n] of shared) { const theirs = this.byDoc.get(d)?.size ?? 0, j = n / (mine.size + theirs - n); if (!best || j > best.overlap || (j === best.overlap && d < best.docId)) best = { docId: d, overlap: j }; }
    return best;
  }
}
/** A new version of a known document (same docId) if overlap ≥ threshold, otherwise a new document. */
export function identifyDoc(index: DocIndex, clauseIds: Iterable<string>, threshold = 0.7, mint: () => string = () => crypto.randomUUID()): { docId: string; isNew: boolean; overlap: number } {
  const b = index.best(clauseIds);
  return b && b.overlap >= threshold ? { docId: b.docId, isNew: false, overlap: b.overlap } : { docId: mint(), isNew: true, overlap: b?.overlap ?? 0 };
}
