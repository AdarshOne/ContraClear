import 'fake-indexeddb/auto';
import { describe, expect, test } from 'vitest';
import { openDB } from 'idb';
import { AnchorStore, buildClauses, normalizeDoc, type Codec } from './index';
import { vault } from '../lib/vault';

const TEXT = ['1.1 Client shall pay Provider a fixed monthly retainer of $4,500.00 CAD.', '1.2 Amounts not paid when due bear interest at 1.5% per month.', '1.3 Any notice must be sent by email and by courier.'].join('\n\n');
const clauses = (docId: string, text = TEXT) => buildClauses(normalizeDoc(text), docId);
async function aesCodec(): Promise<Codec> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']), te = new TextEncoder(), td = new TextDecoder();
  const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))), unb64 = (s: string) => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
  return {
    async seal(c) { const iv = crypto.getRandomValues(new Uint8Array(12)); return { iv: b64(iv.buffer), ct: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(c)))) }; },
    async open(s) { return JSON.parse(td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(s.iv) }, key, unb64(s.ct)))); },
  };
}
let n = 0; const fresh = () => `anchors-test-${++n}`;

describe('AnchorStore', () => {
  test('saves, survives reopening, and looks clauses up from memory', async () => {
    const name = fresh(), codec = await aesCodec(), cs = clauses('doc-a');
    await (await AnchorStore.open({ name, codec })).saveVersion(cs);
    const s = await AnchorStore.open({ name, codec });
    expect(s.lookup('doc-a', cs[1].clauseId)?.[0].exact).toBe(cs[1].exact);
    expect(s.latest('doc-a').map(c => c.clauseId)).toEqual(cs.map(c => c.clauseId));
    expect(s.identify(cs.map(c => c.clauseId), 0.7, () => 'new')).toMatchObject({ docId: 'doc-a', isNew: false });
  });
  test('nothing readable is stored: clause text is encrypted, only IDs and hashes are plain', async () => {
    const name = fresh(), cs = clauses('doc-a'); await (await AnchorStore.open({ name, codec: await aesCodec() })).saveVersion(cs);
    const db = await openDB(name), dump = JSON.stringify(await Promise.all(['docs', 'versions', 'clauses', 'postings'].map(t => db.getAll(t)))); db.close();
    expect(dump).not.toMatch(/retainer|4,500|courier|interest/); expect(dump).toContain(cs[0].clauseId);
  });
  test('a new version replaces the latest; superseded links and deletion persist', async () => {
    const name = fresh(), codec = await aesCodec(), s = await AnchorStore.open({ name, codec }), v1 = clauses('doc-a'); await s.saveVersion(v1);
    const v2 = clauses('doc-a', TEXT.replace('$4,500.00', '$4,750.00')); await s.saveVersion(v2);
    expect(s.lookup('doc-a', v1[0].clauseId)).toBeUndefined(); expect(s.lookup('doc-a', v2[0].clauseId)).toBeDefined();
    await s.markSuperseded(v1[0], v2[0].clauseId);
    const db = await openDB(name), row = await db.get('clauses', [v1[0].docId, v1[0].versionId, v1[0].clauseId, 0]); db.close();
    expect((await codec.open(row.box)).supersededBy).toBe(v2[0].clauseId);
    await s.deleteDoc('doc-a'); expect(s.latest('doc-a')).toEqual([]); expect((await AnchorStore.open({ name, codec })).latest('doc-a')).toEqual([]);
  });
  test('with no codec it uses the open vault, named after it, and is gone after Delete everything', async () => {
    vault.useDb('contraclear-dev'); await vault.create('Testing', true); // testing mode's device-key vault
    const s = await AnchorStore.open(), cs = clauses('doc-a'); await s.saveVersion(cs);
    expect((await indexedDB.databases()).map(d => d.name)).toContain('contraclear-dev-anchors');
    vault.lock(); await expect(AnchorStore.open()).rejects.toThrow('locked');
    await vault.destroy(); expect((await indexedDB.databases()).map(d => d.name)).not.toContain('contraclear-dev-anchors');
  });
});
