// Two main states: the Drop state and the Workspace. Sign-in and the vault gate sit in front of them.
import { useEffect, useRef, useState } from 'react';
import { emptyDb, isNeed, type Contract, type Db } from './lib/types';
import { vault } from './lib/vault';
import { net } from './lib/net';
import { processInput, blankState, type Input } from './lib/pipeline';
import { ReadError } from './lib/read';
import { splitLead, type RawPage } from './lib/rules';
import { sampleContract } from './lib/sample';
import { iso, today } from './lib/dates';
import { auth, Locked, Notice, Setup, Welcome } from './ui/Gate';
import { Drop, Processing, type Job } from './ui/Add';
import { Workspace } from './ui/Workspace';
import { DeletePanel } from './ui/Panels';
import { SiteChrome } from './ui/SiteChrome';
import { slimDb } from './lib/slim';
// Testing mode: skip sign-in and show only the extraction views. Offered when running locally, or with ?dev in the URL.
const DEV_OK = import.meta.env.DEV || new URLSearchParams(location.search).has('dev') || localStorage.getItem('cc.dev') === '1';
import { ArrowLeft } from 'lucide-react';

type Phase = 'boot' | 'unsupported' | 'blocked' | 'welcome' | 'setup' | 'locked' | 'app' | 'deleted' | 'corrupt' | 'signedout';
const LOCK_MS: Record<string, number> = { '5 minutes': 3e5, '15 minutes': 9e5, '1 hour': 36e5 };
const previewOnly = (name: string, raw: RawPage[], src: string): Contract => ({ id: crypto.randomUUID(), name: name.replace(/\.[a-z0-9]+$/i, ''), cp: 'Unknown counterparty', type: 'Not read (French)', year: String(today().getFullYear()), src, files: [name], items: [], nf: [], added: iso(today()), pages: raw.map(p => ({ n: p.n, file: p.file, h: p.h, paras: p.paras.map(t => { const [lead, body] = splitLead(t); return { lead, segs: [{ x: body, q: 0, qid: '' }] }; }) })), ...blankState() });

export function App() {
  const [phase, setPhase] = useState<Phase>('boot'); const [hasVault, setHasVault] = useState(false);
  const [db, setDbRaw] = useState<Db>(emptyDb()); const dbRef = useRef(db); dbRef.current = db;
  const setDb = (f: (d: Db) => Db) => setDbRaw(f);
  const [active, setActive] = useState(''); const [screen, setScreen] = useState<'drop' | 'run' | 'ws'>('drop'); const [wsKey, setWsKey] = useState({ n: 0, home: false });
  const [jobs, setJobs] = useState<Job[]>([]); const [paused, setPaused] = useState(false); const pausedRef = useRef(false); pausedRef.current = paused; const skip = useRef(false); const abort = useRef<AbortController | null>(null); const raws = useRef<Record<string, RawPage[]>>({});
  const [over, setOver] = useState(false); const [del, setDel] = useState(false); const [count, setCount] = useState(0); const [saveErr, setSaveErr] = useState(false); const last = useRef(Date.now());

  const [focus, setFocus] = useState(false);
  const bypass = async () => { localStorage.setItem('cc.dev', '1'); vault.useDb('contraclear-dev'); try { if ((await vault.status()) === 'none') await vault.create('Testing', true); else await vault.unlock(); setFocus(true); await enter(); } catch { setPhase('corrupt'); } };
  const exitDev = () => { localStorage.removeItem('cc.dev'); vault.lock(); location.reload(); };
  useEffect(() => { (async () => { if (!vault.supported()) return setPhase('unsupported'); if (localStorage.getItem('cc.dev') === '1') return bypass(); const st = await vault.status(); if (st === 'blocked') return setPhase('blocked'); setHasVault(st === 'locked'); setPhase(!auth.email() ? 'welcome' : st === 'none' ? 'setup' : 'locked'); })(); }, []);
  const enter = async () => { try { const d = await vault.load<Db>(); const x = d ? { ...emptyDb(), ...d, settings: { ...emptyDb().settings, ...d.settings } } : emptyDb(); setDbRaw(x); setActive(x.contracts[0]?.id || ''); setScreen(x.contracts.length ? 'ws' : 'drop'); setWsKey(k => ({ n: k.n + 1, home: x.contracts.length > 0 })); setJobs([]); last.current = Date.now(); setHasVault(true); setPhase('app'); } catch { setPhase('corrupt'); } };
  // Save into the vault after every change.
  useEffect(() => { if (phase !== 'app') return; const t = setTimeout(() => vault.save(slimDb(db)).then(() => setSaveErr(false), () => setSaveErr(true)), 250); return () => clearTimeout(t); }, [db, phase]);
  const lock = async () => { abort.current?.abort(); try { await vault.save(dbRef.current); } catch { /* shown by saveErr */ } vault.lock(); setDbRaw(emptyDb()); setJobs([]); setCount(0); setPhase('locked'); };
  // Auto-lock after idle, with a quiet countdown for the last minute.
  useEffect(() => { if (phase !== 'app' || focus) return; const bump = () => { last.current = Date.now(); }; const ev = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const; ev.forEach(e => addEventListener(e, bump, { passive: true })); const t = setInterval(() => { const left = (LOCK_MS[dbRef.current.settings.lock] || 9e5) - (Date.now() - last.current); if (left <= 0) lock(); else setCount(left <= 6e4 ? Math.ceil(left / 1000) : 0); }, 1000); return () => { ev.forEach(e => removeEventListener(e, bump)); clearInterval(t); }; }, [phase, focus]);

  const add = (inputs: Input[]) => { if (!inputs.length) return; skip.current = false; setPaused(false); setJobs(inputs.map(input => ({ id: crypto.randomUUID(), input, state: 'waiting' }))); setScreen('run'); };
  const patch = (id: string, p: Partial<Job>) => setJobs(js => js.map(j => j.id === id ? { ...j, ...p } : j));
  useEffect(() => {
    if (phase !== 'app' || paused || jobs.some(j => j.state === 'reading')) return; const j = jobs.find(x => x.state === 'waiting'); if (!j) return;
    const ac = new AbortController(); abort.current = ac; patch(j.id, { state: 'reading', progress: { stage: 0 } });
    const many = jobs.length > 1, slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 520;
    const pace = () => new Promise<void>(res => { const tick = () => pausedRef.current && !ac.signal.aborted ? setTimeout(tick, 150) : res(); setTimeout(tick, skip.current || many ? 0 : slow); });
    processInput(j.input, dbRef.current.settings, progress => patch(j.id, { progress }), pace, ac.signal).then(c => {
      setDb(d => ({ ...d, contracts: [...d.contracts, c] })); patch(j.id, { state: 'done', contractId: c.id, items: c.items.length, need: c.items.filter(i => isNeed(c, i.id)).length });
    }, (e: any) => { if (e?.name === 'AbortError') return patch(j.id, { state: 'cancelled' }); if (e instanceof ReadError) { if (e.raw) raws.current[j.id] = e.raw; return patch(j.id, { state: 'failed', code: e.code, detail: e.detail }); } console.error(e); patch(j.id, { state: 'failed', code: 'other' }); });
  }, [jobs, paused, phase]);
  const cancel = () => { abort.current?.abort(); setPaused(false); setJobs(js => js.map(j => j.state === 'waiting' || j.state === 'reading' ? { ...j, state: 'cancelled' } : j)); };
  const openWs = (id?: string, home = false) => { const cs = dbRef.current.contracts; if (!cs.length) return setScreen('drop'); setActive(id || active || cs[0].id); setWsKey(k => ({ n: k.n + 1, home })); setScreen('ws'); };
  const retry = (j: Job, p: any) => { if (p.preview) { const c = previewOnly(j.input.name, raws.current[j.id] || [], j.input.src); setDb(d => ({ ...d, contracts: [...d.contracts, c] })); setActive(c.id); setWsKey(k => ({ n: k.n + 1, home: false })); setScreen('ws'); return; } patch(j.id, { state: 'waiting', code: undefined, input: { ...j.input, ...p } }); };

  // The whole window is the drop target, in both main states.
  useEffect(() => { if (phase !== 'app') return; let depth = 0; const has = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const enterD = (e: DragEvent) => { if (has(e)) { depth++; setOver(true); } }, leave = () => { depth = Math.max(0, depth - 1); if (!depth) setOver(false); }, overD = (e: DragEvent) => { if (has(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => { if (!has(e)) return; e.preventDefault(); depth = 0; setOver(false); add([...e.dataTransfer!.files].map(f => ({ name: f.name, file: f, src: 'Dropped' }))); };
    addEventListener('dragenter', enterD); addEventListener('dragleave', leave); addEventListener('dragover', overD); addEventListener('drop', drop);
    return () => { removeEventListener('dragenter', enterD); removeEventListener('dragleave', leave); removeEventListener('dragover', overD); removeEventListener('drop', drop); }; }, [phase]);

  // Keep signed-in screens out of search results; only the landing page is indexable.
  useEffect(() => { let m = document.querySelector<HTMLMetaElement>('meta[name=robots]'); if (phase === 'welcome') { m?.remove(); return; } if (!m) { m = document.createElement('meta'); m.name = 'robots'; document.head.appendChild(m); } m.content = 'noindex'; }, [phase]);
  useEffect(() => { document.body.classList.toggle('has-home', phase === 'app'); }, [phase]);
  const pub = (() => {
    if (phase === 'boot') return <main className="full" aria-busy="true"><span className="spin" role="status" aria-label="Opening ContraClear" /></main>;
    if (phase === 'unsupported') return <Notice title="This browser can’t run ContraClear." body="It needs secure storage that this browser doesn’t have. Try the latest Chrome, Edge, Firefox or Safari." />;
    if (phase === 'blocked') return <Notice title="This browser is blocking storage." body="Private windows and some settings stop ContraClear from saving your vault. Open a normal window, or allow site data for this page."><button className="b pri" onClick={() => location.reload()}>Try again</button></Notice>;
    if (phase === 'corrupt') return <Notice title="This vault can’t be read." body="Its data on this device is damaged. You can start a new vault, then import a vault file if you exported one."><button className="b pri" onClick={async () => { await vault.destroy(); setHasVault(false); setPhase('setup'); }}>Start a new vault</button></Notice>;
    if (phase === 'deleted') return <Notice title="Everything is deleted." body="Your vault and email record are gone."><button className="b pri" autoFocus onClick={() => setPhase('welcome')}>Start again</button></Notice>;
    if (phase === 'signedout') return <Notice title="You’ve been signed out." body="Your vault is safe and still locked on this device."><button className="b pri" autoFocus onClick={() => setPhase('welcome')}>Sign in again</button></Notice>;
    if (phase === 'welcome') return <Welcome onBypass={DEV_OK ? bypass : undefined} hasVault={hasVault} onDone={() => setPhase(hasVault ? 'locked' : 'setup')} onPasskey={async () => { if (!hasVault) return setPhase('setup'); try { await vault.unlock(); await enter(); } catch (e: any) { if (e.message === 'legacy') return setPhase('locked'); if (e.message === 'corrupt') return setPhase('corrupt'); return e.message === 'wrong' ? 'That passkey didn’t open this vault. Use the passkey you made for ContraClear.' : 'The passkey check was cancelled. Nothing changed.'; } }} />;
    if (phase === 'setup') return <Setup onReady={enter} />;
    if (phase === 'locked') return <Locked onOpen={enter} onCorrupt={() => setPhase('corrupt')} />;
    return null;
  })();
  if (pub) return phase === 'boot' ? pub : <SiteChrome>{pub}</SiteChrome>;

  const has = db.contracts.length > 0, showWs = screen === 'ws' && has;
  // Signed in: no site nav or footer, just a small way back to the app's home. It stays inside the app
  // (a full page load would lock the vault), and works as a normal link if opened in a new tab.
  const goHome = (e: React.MouseEvent) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); if (dbRef.current.contracts.length) openWs(undefined, !focus); else setScreen('drop'); };
  return <>
    <a className="cc-home" href={import.meta.env.BASE_URL} aria-label="ContraClear home" onClick={goHome}><ArrowLeft size={18} aria-hidden /><span>ContraClear</span></a>
    {focus && <div className="devpill" role="status">Testing mode: sign-in skipped<button className="lk" onClick={exitDev}>Exit</button></div>}
    {count > 0 && <div className="sbar" role="status" style={{ position: 'fixed', zIndex: 96 }}>Locking in <b className="num">0:{String(count).padStart(2, '0')}</b> because you’ve been away.<button className="b" onClick={() => { last.current = Date.now(); setCount(0); }}>Stay unlocked</button></div>}
    {saveErr && <div className="sbar" role="alert" style={{ position: 'fixed', zIndex: 96 }}>This device is out of space for ContraClear. New changes can’t be saved. Export a vault file, then remove old contracts.</div>}
    {showWs ? <Workspace key={wsKey.n} db={db} setDb={setDb} active={active} setActive={setActive} focus={focus} startHome={wsKey.home && !focus} onAdd={() => setScreen('drop')} onLock={lock} onDelete={() => setDel(true)}
        onSample={() => { const c = sampleContract(); setDb(d => ({ ...d, contracts: [...d.contracts, c] })); setActive(c.id); setWsKey(k => ({ n: k.n + 1, home: false })); }}
        onSignOut={async () => { await lock(); auth.clear(); setPhase('signedout'); }} />
      : screen === 'run' && jobs.length ? <Processing jobs={jobs} paused={paused} onSkip={() => { skip.current = true; }} onCancel={cancel} onPause={() => setPaused(p => !p)} onOpen={id => openWs(id, !id)} onRetry={retry} onChoose={() => { setJobs([]); setScreen('drop'); }} />
      : <Drop over={over} hasContracts={has} onAdd={add} onBack={() => openWs(undefined, true)} />}
    {over && showWs && <div className="ov" style={{ alignItems: 'center', paddingTop: 16, pointerEvents: 'none' }} aria-hidden><div style={{ border: '2px dashed #111', borderRadius: 24, padding: '48px 64px', background: '#fff', fontSize: 32, fontWeight: 500 }}>Let go to add it.</div></div>}
    {del && <DeletePanel n={db.contracts.length} onClose={() => setDel(false)} onDelete={async () => { abort.current?.abort(); await vault.destroy(); auth.clear(); net.reset(); setDel(false); setDbRaw(emptyDb()); setHasVault(false); setPhase('deleted'); }} />}
  </>;
}
