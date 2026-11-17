// The vault: one AES-GCM encrypted record in IndexedDB. The data key is wrapped twice,
// once by the passphrase and once by the recovery key (both through PBKDF2).
const DBN = 'contraclear', ST = 'vault', ITER = 600_000;
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer)));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n));
function idb(): Promise<IDBDatabase> { return new Promise((res, rej) => { const r = indexedDB.open(DBN, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> { const db = await idb(); return new Promise((res, rej) => { const r = f(db.transaction(ST, mode).objectStore(ST)); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
const get = <T,>(k: string) => tx<T>('readonly', s => s.get(k)); const put = (k: string, v: unknown) => tx('readwrite', s => s.put(v, k));

interface Wrap { salt: string; iv: string; ct: string }
interface Meta { v: 1; pass: Wrap; rec: Wrap }
interface Blob1 { iv: string; ct: string }
let dek: CryptoKey | null = null;
const kek = async (secret: string, salt: Uint8Array<ArrayBuffer>) => crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, await crypto.subtle.importKey('raw', enc.encode(secret.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
async function wrap(raw: Uint8Array<ArrayBuffer>, secret: string): Promise<Wrap> { const salt = rnd(16), iv = rnd(12); return { salt: b64(salt), iv: b64(iv), ct: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await kek(secret, salt), raw)) }; }
async function unwrap(w: Wrap, secret: string) { const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(w.iv) }, await kek(secret, unb64(w.salt)), unb64(w.ct)); return new Uint8Array(raw); }
const use = async (raw: Uint8Array<ArrayBuffer>) => { dek = await crypto.subtle.importKey('raw', raw, 'AES-GCM', true, ['encrypt', 'decrypt']); };
const normKey = (k: string) => k.toUpperCase().replace(/[^A-Z0-9]/g, '');
function newRecoveryKey() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const c = [...rnd(24)].map(b => A[b % 32]).join(''); return c.match(/.{4}/g)!.join('-'); }

export const vault = {
  supported: () => typeof indexedDB !== 'undefined' && !!globalThis.crypto?.subtle,
  /** 'none' | 'locked' | 'blocked' (storage refused) */
  async status(): Promise<'none' | 'locked' | 'blocked'> { try { return (await get<Meta>('meta')) ? 'locked' : 'none'; } catch { return 'blocked'; } },
  isOpen: () => !!dek,
  async create(passphrase: string): Promise<string> { const raw = rnd(32), rk = newRecoveryKey(); await put('meta', { v: 1, pass: await wrap(raw, passphrase), rec: await wrap(raw, normKey(rk)) } satisfies Meta); await use(raw); return rk; },
  /** Throws 'wrong' on a bad passphrase and 'corrupt' if the vault can't be read at all. */
  async unlock(secret: string, recovery = false): Promise<void> { const m = await get<Meta>('meta'); if (!m?.pass?.ct) throw new Error('corrupt'); try { await use(await unwrap(recovery ? m.rec : m.pass, recovery ? normKey(secret) : secret)); } catch { throw new Error('wrong'); } },
  /** After a recovery-key unlock: set a new passphrase and issue a new recovery key. */
  async rekey(passphrase: string): Promise<string> { const raw = new Uint8Array(await crypto.subtle.exportKey('raw', dek!)), rk = newRecoveryKey(); await put('meta', { v: 1, pass: await wrap(raw, passphrase), rec: await wrap(raw, normKey(rk)) } satisfies Meta); return rk; },
  lock() { dek = null; },
  async save(data: unknown) { if (!dek) return; const iv = rnd(12); await put('data', { iv: b64(iv), ct: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, enc.encode(JSON.stringify(data)))) } satisfies Blob1); },
  async load<T>(): Promise<T | null> { const b = await get<Blob1>('data'); if (!b) return null; try { return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(b.iv) }, dek!, unb64(b.ct)))); } catch { throw new Error('corrupt'); } },
  async destroy() { dek = null; await new Promise<void>(res => { const r = indexedDB.deleteDatabase(DBN); r.onsuccess = r.onerror = r.onblocked = () => res(); }); },
  /** The encrypted vault as a file. It opens only with the passphrase. */
  async exportFile(): Promise<Blob> { return new Blob([JSON.stringify({ app: 'ContraClear', meta: await get<Meta>('meta'), data: await get<Blob1>('data') })], { type: 'application/octet-stream' }); },
  /** Decrypts a vault file with its own passphrase and returns its contents. Nothing is written. */
  async readFile<T>(file: File, passphrase: string): Promise<T> { let j: any; try { j = JSON.parse(await file.text()); } catch { throw new Error('corrupt'); } if (!j?.meta?.pass || !j.data) throw new Error('corrupt'); let raw: Uint8Array<ArrayBuffer>; try { raw = await unwrap(j.meta.pass, passphrase); } catch { throw new Error('wrong'); } const k = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']); return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(j.data.iv) }, k, unb64(j.data.ct)))); },
  async usage(): Promise<number> { try { const e = await navigator.storage.estimate(); return e.quota ? (e.usage || 0) / e.quota : 0; } catch { return 0; } },
};
