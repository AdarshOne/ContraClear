// IndexedDB storage (via idb) with in-memory Maps in front, so exact lookups never touch the disk or iterate.
// Only normalized clauses and their context are stored: there is no field for a file or a whole document.
// Clause records are encrypted with the vault's key (vaultCodec). Only their keys stay readable: the docId,
// versionId, clauseId and occurrence, which are random IDs and hashes, needed for lookups and indexes.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Clause } from './types';
import { NORMALIZER_VERSION } from './normalize';
import { DocIndex, identifyDoc } from './match';
export interface Sealed { iv: string; ct: string }
/** How clause records are protected at rest. */
export interface Codec { seal(c: Clause): Promise<Sealed>; open(s: Sealed): Promise<Clause> }
/** Encrypts with the open vault (AES-GCM, the vault's own key). The default in the app. */
export async function vaultCodec(): Promise<{ codec: Codec; dbName: string }> {
  const { vault } = await import('../lib/vault');
  return { dbName: `${vault.dbName()}-anchors`, codec: { seal: c => vault.sealJson(c), open: s => vault.openJson<Clause>(s) } };
}
/** Stored form of a clause: readable keys, sealed contents. */
interface ClauseRow { docId: string; versionId: string; clauseId: string; occurrence: number; box: Sealed }
interface DocRec { docId: string; latestVersionId: string; normalizerVersion: number }
interface VersionRec { docId: string; versionId: string; clauseIds: string[]; normalizerVersion: number }
interface PostingRec { clauseId: string; docIds: string[] }
interface Schema extends DBSchema {
  docs: { key: string; value: DocRec };
  versions: { key: [string, string]; value: VersionRec; indexes: { byDoc: string } };
  clauses: { key: [string, string, string, number]; value: ClauseRow; indexes: { byVersion: [string, string]; byDoc: string } };
  postings: { key: string; value: PostingRec };
}
export class AnchorStore {
  private mem = new Map<string, Map<string, Clause[]>>(); // docId → clauseId → clauses (latest version)
  readonly index = new DocIndex();
  private constructor(private db: IDBPDatabase<Schema>, private codec: Codec) { }
  /** Open the store. With no codec, it encrypts with the open vault and lives next to it (testing mode included). */
  static async open(opts: { name?: string; codec?: Codec } = {}): Promise<AnchorStore> {
    const v = opts.codec ? null : await vaultCodec(), name = opts.name ?? v?.dbName ?? 'contraclear-anchors', codec = opts.codec ?? v!.codec;
    // blocking(): when the database is being deleted (Delete everything) or upgraded elsewhere, let go of it.
    const db: IDBPDatabase<Schema> = await openDB<Schema>(name, 1, { blocking() { db.close(); }, upgrade(d) {
      d.createObjectStore('docs', { keyPath: 'docId' });
      d.createObjectStore('versions', { keyPath: ['docId', 'versionId'] }).createIndex('byDoc', 'docId');
      const c = d.createObjectStore('clauses', { keyPath: ['docId', 'versionId', 'clauseId', 'occurrence'] }); c.createIndex('byVersion', ['docId', 'versionId']); c.createIndex('byDoc', 'docId');
      d.createObjectStore('postings', { keyPath: 'clauseId' });
    } });
    const s = new AnchorStore(db, codec); await s.warm(); return s;
  }
  /** Load the latest version of every document into memory. */
  private async warm(): Promise<void> {
    for (const d of await this.db.getAll('docs')) this.remember(d.docId, await Promise.all((await this.db.getAllFromIndex('clauses', 'byVersion', [d.docId, d.latestVersionId])).map(r => this.codec.open(r.box))));
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
    const rows: ClauseRow[] = await Promise.all(clauses.map(async c => ({ docId, versionId, clauseId: c.clauseId, occurrence: c.occurrence, box: await this.codec.seal(c) }))); // encrypt before the transaction: IndexedDB transactions close across awaits on other work
    const tx = this.db.transaction(['docs', 'versions', 'clauses', 'postings'], 'readwrite');
    await tx.objectStore('versions').put({ docId, versionId, clauseIds: clauses.map(c => c.clauseId), normalizerVersion: NORMALIZER_VERSION });
    for (const r of rows) await tx.objectStore('clauses').put(r);
    await tx.objectStore('docs').put({ docId, latestVersionId: versionId, normalizerVersion: NORMALIZER_VERSION });
    const ps = tx.objectStore('postings');
    for (const id of new Set([...before, ...after])) { const p = (await ps.get(id)) ?? { clauseId: id, docIds: [] }; const set = new Set(p.docIds); if (after.has(id)) set.add(docId); else set.delete(docId); if (set.size) await ps.put({ clauseId: id, docIds: [...set].sort() }); else await ps.delete(id); }
    await tx.done; this.remember(docId, clauses);
  }
  /** Record that a clause was edited into a successor (from a fuzzy resolution). */
  async markSuperseded(c: Clause, successorClauseId: string): Promise<void> {
    const next = { ...c, supersededBy: successorClauseId };
    await this.db.put('clauses', { docId: c.docId, versionId: c.versionId, clauseId: c.clauseId, occurrence: c.occurrence, box: await this.codec.seal(next) });
    const l = this.mem.get(c.docId)?.get(c.clauseId); if (l) { const i = l.findIndex(x => x.versionId === c.versionId && x.occurrence === c.occurrence); if (i >= 0) l[i] = next; }
  }
  close(): void { this.db.close(); }
  async deleteDoc(docId: string): Promise<void> {
    const tx = this.db.transaction(['docs', 'versions', 'clauses', 'postings'], 'readwrite');
    for (const k of await tx.objectStore('clauses').index('byDoc').getAllKeys(docId)) await tx.objectStore('clauses').delete(k);
    for (const v of await tx.objectStore('versions').index('byDoc').getAll(docId)) await tx.objectStore('versions').delete([v.docId, v.versionId]);
    for (const id of this.mem.get(docId)?.keys() ?? []) { const p = await tx.objectStore('postings').get(id); if (!p) continue; const rest = p.docIds.filter(d => d !== docId); if (rest.length) await tx.objectStore('postings').put({ clauseId: id, docIds: rest }); else await tx.objectStore('postings').delete(id); }
    await tx.objectStore('docs').delete(docId); await tx.done; this.mem.delete(docId); this.index.remove(docId);
  }
}
