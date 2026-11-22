// The vault: one AES-GCM encrypted record in IndexedDB. A random data key encrypts everything.
// That data key is locked by a passkey (WebAuthn PRF: the passkey itself produces the secret, nothing is typed)
// and, separately, by a one-time recovery key (PBKDF2). There is no passphrase.
// If a device can't make a PRF passkey, the user may continue with a device key: still encrypted at rest,
// but it opens on this browser profile without a secret. The UI says so plainly.
let DBN = 'contraclear'; const ST = 'vault', ITER = 600_000, DK = 'devicekey';
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer)));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n));
function idb(): Promise<IDBDatabase> { return new Promise((res, rej) => { const r = indexedDB.open(DBN, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> { const db = await idb(); return new Promise((res, rej) => { const r = f(db.transaction(ST, mode).objectStore(ST)); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
const get = <T,>(k: string) => tx<T>('readonly', s => s.get(k)); const put = (k: string, v: unknown) => tx('readwrite', s => s.put(v, k)); const del = (k: string) => tx('readwrite', s => s.delete(k));

interface Wrap { salt: string; iv: string; ct: string }
interface Blob1 { iv: string; ct: string }
type Kind = 'passkey' | 'device';
interface Meta { v: 2; kind: Kind; cred?: string; salt: string; key: Blob1; rec: Wrap }
let dek: CryptoKey | null = null;
const kek = async (secret: string, salt: Uint8Array<ArrayBuffer>) => crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, await crypto.subtle.importKey('raw', enc.encode(secret.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
async function wrap(raw: Uint8Array<ArrayBuffer>, secret: string): Promise<Wrap> { const salt = rnd(16), iv = rnd(12); return { salt: b64(salt), iv: b64(iv), ct: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await kek(secret, salt), raw)) }; }
async function unwrap(w: Wrap, secret: string) { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(w.iv) }, await kek(secret, unb64(w.salt)), unb64(w.ct))); }
const seal = async (k: CryptoKey, raw: Uint8Array<ArrayBuffer>): Promise<Blob1> => { const iv = rnd(12); return { iv: b64(iv), ct: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, raw)) }; };
const unseal = async (k: CryptoKey, b: Blob1) => new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(b.iv) }, k, unb64(b.ct)));
const prfKey = async (prf: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>) => crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('ContraClear vault key') }, await crypto.subtle.importKey('raw', prf, 'HKDF', false, ['deriveKey']), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
const use = async (raw: Uint8Array<ArrayBuffer>) => { dek = await crypto.subtle.importKey('raw', raw, 'AES-GCM', true, ['encrypt', 'decrypt']); };
const rawDek = async () => new Uint8Array(await crypto.subtle.exportKey('raw', dek!));
const normKey = (k: string) => k.toUpperCase().replace(/[^A-Z0-9]/g, '');
function newRecoveryKey() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const c = [...rnd(24)].map(b => A[b % 32]).join(''); return c.match(/.{4}/g)!.join('-'); }

// ---- Passkeys ----
const pkErr = (e: any) => new Error(e?.name === 'NotSupportedError' || e?.name === 'SecurityError' ? 'unsupported' : 'cancelled');
async function pkGet(cred: string, salt: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer> | undefined> {
  let a: PublicKeyCredential | null;
  try { a = await navigator.credentials.get({ publicKey: { challenge: rnd(32), rpId: location.hostname, allowCredentials: [{ type: 'public-key', id: unb64(cred) }], userVerification: 'required', timeout: 120000, extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs } }) as PublicKeyCredential | null; } catch (e) { throw pkErr(e); }
  if (!a) throw new Error('cancelled');
  const r = (a.getClientExtensionResults() as any).prf?.results?.first; return r ? new Uint8Array(r) : undefined;
}
async function pkCreate(name: string, salt: Uint8Array<ArrayBuffer>): Promise<{ cred: string; prf?: Uint8Array<ArrayBuffer> }> {
  if (!window.PublicKeyCredential || !isSecureContext) throw new Error('unsupported');
  let c: PublicKeyCredential | null;
  try { c = await navigator.credentials.create({ publicKey: { rp: { name: 'ContraClear', id: location.hostname }, user: { id: rnd(16), name, displayName: name }, challenge: rnd(32), pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' }, timeout: 120000, extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs } }) as PublicKeyCredential | null; } catch (e) { throw pkErr(e); }
  if (!c) throw new Error('cancelled');
  const cred = b64(c.rawId), ext = (c.getClientExtensionResults() as any).prf;
  if (ext?.results?.first) return { cred, prf: new Uint8Array(ext.results.first) };
  // Some authenticators only produce the PRF secret at sign-in, which asks once more.
  if (ext?.enabled) return { cred, prf: await pkGet(cred, salt) };
  return { cred };
}
async function setup(raw: Uint8Array<ArrayBuffer>, name: string, device: boolean): Promise<{ rk: string; kind: Kind }> {
  const salt = rnd(32); let cred: string | undefined, prf: Uint8Array<ArrayBuffer> | undefined;
  if (!device) ({ cred, prf } = await pkCreate(name, salt));
  const kind: Kind = prf ? 'passkey' : 'device'; let k: CryptoKey;
  if (prf) { k = await prfKey(prf, salt); await del(DK); }
  else { k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); await put(DK, k); }
  const rk = newRecoveryKey();
  await put('meta', { v: 2, kind, cred, salt: b64(salt), key: await seal(k, raw), rec: await wrap(raw, normKey(rk)) } satisfies Meta);
  await use(raw); return { rk, kind };
}

export const vault = {
  supported: () => typeof indexedDB !== 'undefined' && !!globalThis.crypto?.subtle,
  /** 'none' | 'locked' | 'blocked' (storage refused) */
  async status(): Promise<'none' | 'locked' | 'blocked'> { try { return (await get<Meta>('meta')) ? 'locked' : 'none'; } catch { return 'blocked'; } },
  /** How this vault opens. `legacy` is a vault from the passphrase version: it opens once with the recovery key. */
  async info(): Promise<{ kind: Kind; cred: boolean; legacy: boolean }> { const m = await get<any>('meta'); if (!m?.rec) throw new Error('corrupt'); return { kind: m.kind || 'passkey', cred: !!m.cred, legacy: m.v !== 2 }; },
  isOpen: () => !!dek,
  /** Testing mode keeps its own vault, separate from the real one. */
  useDb(name: string) { DBN = name; dek = null; },
  /** New vault. Throws 'cancelled' or 'unsupported' if no passkey was made; `device` skips the passkey. */
  create: (name: string, device = false) => setup(rnd(32), name || 'ContraClear vault', device),
  /** Throws 'cancelled', 'wrong' (a different passkey), 'legacy' or 'corrupt'. */
  async unlock(): Promise<void> {
    const m = await get<any>('meta'); if (!m?.rec) throw new Error('corrupt'); if (m.v !== 2) throw new Error('legacy');
    let k: CryptoKey | undefined;
    if (m.kind === 'passkey') { const prf = await pkGet(m.cred, unb64(m.salt)); if (!prf) throw new Error('wrong'); k = await prfKey(prf, unb64(m.salt)); }
    else { if (m.cred) await pkGet(m.cred, unb64(m.salt)); k = await get<CryptoKey>(DK); if (!k) throw new Error('corrupt'); }
    try { await use(await unseal(k, m.key)); } catch { throw new Error(m.kind === 'passkey' ? 'wrong' : 'corrupt'); }
  },
  async unlockRecovery(rk: string): Promise<void> { const m = await get<any>('meta'); if (!m?.rec) throw new Error('corrupt'); try { await use(await unwrap(m.rec, normKey(rk))); } catch { throw new Error('wrong'); } },
  /** After a recovery-key unlock: a new passkey and a new recovery key, same data. */
  rekey: async (name: string, device = false) => setup(await rawDek(), name || 'ContraClear vault', device),
  lock() { dek = null; },
  async save(data: unknown) { if (!dek) return; await put('data', await seal(dek, enc.encode(JSON.stringify(data)))); },
  async load<T>(): Promise<T | null> { const b = await get<Blob1>('data'); if (!b) return null; try { return JSON.parse(dec.decode(await unseal(dek!, b))); } catch { throw new Error('corrupt'); } },
  async destroy() { dek = null; await new Promise<void>(res => { const r = indexedDB.deleteDatabase(DBN); r.onsuccess = r.onerror = r.onblocked = () => res(); }); },
  /** The vault as a file, locked with a new one-time share code. Send the code separately. */
  async exportFile(): Promise<{ blob: Blob; code: string }> { const code = newRecoveryKey(); return { code, blob: new Blob([JSON.stringify({ app: 'ContraClear', meta: { pass: await wrap(await rawDek(), normKey(code)) }, data: await get<Blob1>('data') })], { type: 'application/octet-stream' }) }; },
  /** Decrypts a vault file with its share code and returns its contents. Nothing is written. */
  async readFile<T>(file: File, code: string): Promise<T> {
    let j: any; try { j = JSON.parse(await file.text()); } catch { throw new Error('corrupt'); } if (!j?.meta?.pass || !j.data) throw new Error('corrupt');
    let raw: Uint8Array<ArrayBuffer>; try { raw = await unwrap(j.meta.pass, normKey(code)); } catch { try { raw = await unwrap(j.meta.pass, code); } catch { throw new Error('wrong'); } }
    const k = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']); return JSON.parse(dec.decode(await unseal(k, j.data)));
  },
  async usage(): Promise<number> { try { const e = await navigator.storage.estimate(); return e.quota ? (e.usage || 0) / e.quota : 0; } catch { return 0; } },
};
