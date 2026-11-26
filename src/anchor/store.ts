// IndexedDB storage (via idb) with in-memory Maps in front, so exact lookups never touch the disk or iterate.
// Only normalized clauses and their context are stored: there is no field for a file or a whole document.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Clause } from './types';
import { NORMALIZER_VERSION } from './normalize';
import { DocIndex, identifyDoc } from './match';
interface DocRec { docId: string; latestVersionId: string; normalizerVersion: number }
interface VersionRec { docId: string; versionId: string; clauseIds: string[]; normalizerVersion: number }
interface PostingRec { clauseId: string; docIds: string[] }
interface Schema extends DBSchema {
  docs: { key: string; value: DocRec };
  versions: { key: [string, string]; value: VersionRec; indexes: { byDoc: string } };
  clauses: { key: [string, string, string, number]; value: Clause; indexes: { byVersion: [string, string]; byDoc: string } };
  postings: { key: string; value: PostingRec };
}
export class AnchorStore {
  private mem = new Map<string, Map<string, Clause[]>>(); // docId → clauseId → clauses (latest version)
  readonly index = new DocIndex();
  private constructor(private db: IDBPDatabase<Schema>) { }
  static async open(name = 'contraclear-anchors'): Promise<AnchorStore> {
    const db = await openDB<Schema>(name, 1, { upgrade(d) {
      d.createObjectStore('docs', { keyPath: 'docId' });
      d.createObjectStore('versions', { keyPath: ['docId', 'versionId'] }).createIndex('byDoc', 'docId');
      const c = d.createObjectStore('clauses', { keyPath: ['docId', 'versionId', 'clauseId', 'occurrence'] }); c.createIndex('byVersion', ['docId', 'versionId']); c.createIndex('byDoc', 'docId');
      d.createObjectStore('postings', { keyPath: 'clauseId' });
    } });
    const s = new AnchorStore(db); await s.warm(); return s;
  }
  /** Load the latest version of every document into memory. */
  private async warm(): Promise<void> {
    for (const d of await this.db.getAll('docs')) this.remember(d.docId, await this.db.getAllFromIndex('clauses', 'byVersion', [d.docId, d.latestVersionId]));
  }
  private remember(docId: string, clauses: Clause[]): void {
    const m = new Map<string, Clause[]>(); for (const c of clauses) { const l = m.get(c.clauseId); if (l) l.push(c); else m.set(c.clauseId, [c]); }
    this.mem.set(docId, m); this.index.set(docId, m.keys());
  }
  /** Instant exact lookup (a Map get). */
  lookup(docId: string, clauseId: string): readonly Clause[] | undefined { return this.mem.get(docId)?.get(clauseId); }
  latest(docId: string): Clause[] { return [...(this.mem.get(docId)?.values() ?? [])].flat().sort((a, b) => a.position - b.position); }
  identify(clauseIds: Iterable<string>, threshold = 0.7, mint?: () => string) { return identifyDoc(this.index, clauseIds, threshold, mint); }
  /** Save one version of a document: all clauses must share its docId and versionId. Becomes the latest. */
  async saveVersion(clauses: Clause[]): Promise<void> {
    if (!clauses.length) return; const { docId, versionId } = clauses[0];
    if (clauses.some(c => c.docId !== docId || c.versionId !== versionId)) throw new Error('saveVersion: clauses must share one docId and versionId');
    const before = new Set(this.mem.get(docId)?.keys() ?? []), after = new Set(clauses.map(c => c.clauseId));
    const tx = this.db.transaction(['docs', 'versions', 'clauses', 'postings'], 'readwrite');
    await tx.objectStore('versions').put({ docId, versionId, clauseIds: clauses.map(c => c.clauseId), normalizerVersion: NORMALIZER_VERSION });
    for (const c of clauses) await tx.objectStore('clauses').put(c);
    await tx.objectStore('docs').put({ docId, latestVersionId: versionId, normalizerVersion: NORMALIZER_VERSION });
    const ps = tx.objectStore('postings');
    for (const id of new Set([...before, ...after])) { const p = (await ps.get(id)) ?? { clauseId: id, docIds: [] }; const set = new Set(p.docIds); if (after.has(id)) set.add(docId); else set.delete(docId); if (set.size) await ps.put({ clauseId: id, docIds: [...set].sort() }); else await ps.delete(id); }
    await tx.done; this.remember(docId, clauses);
  }
  /** Record that a clause was edited into a successor (from a fuzzy resolution). */
  async markSuperseded(c: Clause, successorClauseId: string): Promise<void> { await this.db.put('clauses', { ...c, supersededBy: successorClauseId }); }
  async deleteDoc(docId: string): Promise<void> {
    const tx = this.db.transaction(['docs', 'versions', 'clauses', 'postings'], 'readwrite');
    for (const k of await tx.objectStore('clauses').index('byDoc').getAllKeys(docId)) await tx.objectStore('clauses').delete(k);
    for (const v of await tx.objectStore('versions').index('byDoc').getAll(docId)) await tx.objectStore('versions').delete([v.docId, v.versionId]);
    for (const id of this.mem.get(docId)?.keys() ?? []) { const p = await tx.objectStore('postings').get(id); if (!p) continue; const rest = p.docIds.filter(d => d !== docId); if (rest.length) await tx.objectStore('postings').put({ clauseId: id, docIds: rest }); else await tx.objectStore('postings').delete(id); }
    await tx.objectStore('docs').delete(docId); await tx.done; this.mem.delete(docId); this.index.remove(docId);
  }
}
