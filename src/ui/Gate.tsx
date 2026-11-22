// Flow 1 (welcome and sign-in) and Flow 12 (vault setup, recovery key, unlock, problems).
// Sign in with a passkey, Google or email. The vault itself is locked by the passkey; there is no passphrase.
import { useEffect, useState, type ReactNode } from 'react';
import { Lock, Check, TriangleAlert, KeyRound } from 'lucide-react';
import { vault } from '../lib/vault';
import { download } from '../lib/exporters';
import { Badge } from './kit';
export const Full = ({ children }: { children: ReactNode }) => <main className="full"><span className="wm" style={{ fontSize: 20 }}>ContraClear</span>{children}<Badge /></main>;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const auth = {
  email: () => localStorage.getItem('cc.email') || '',
  set(email: string, updates: boolean) { localStorage.setItem('cc.email', email); localStorage.setItem('cc.updates', updates ? '1' : '0'); },
  clear() { localStorage.removeItem('cc.email'); localStorage.removeItem('cc.updates'); },
};
const Err = ({ children }: { children: ReactNode }) => <p className="pp" role="alert" style={{ maxWidth: 540, display: 'inline-flex', gap: 8, alignItems: 'flex-start' }}><TriangleAlert size={18} aria-hidden style={{ flex: 'none', marginTop: 3 }} />{children}</p>;
const NOPK = 'Continue without a passkey: your vault is still encrypted, but it opens on this browser without a check, so anyone using this computer account could open it.';
const pkMsg = (e: any) => e?.message === 'unsupported' ? `This device can’t make a passkey that can lock a vault. ${NOPK}` : e?.message === 'cancelled' ? 'The passkey wasn’t made. Nothing was saved. Try again, or continue without a passkey.' : 'This browser couldn’t save the vault. Allow site data for this page and try again.';

/** onPasskey returns an error message to show, or nothing when it moved on. */
export function Welcome({ hasVault, onDone, onPasskey, onBypass }: { onBypass?: () => void; hasVault: boolean; onDone: () => void; onPasskey: () => Promise<string | void> }) {
  const [mode, setMode] = useState<'ready' | 'email' | 'gna' | 'ok'>('ready'); const [email, setEmail] = useState(''); const [bad, setBad] = useState(false); const [upd, setUpd] = useState(false);
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false); const [on, setOn] = useState(navigator.onLine);
  useEffect(() => { const f = () => setOn(navigator.onLine); addEventListener('online', f); addEventListener('offline', f); return () => { removeEventListener('online', f); removeEventListener('offline', f); }; }, []);
  const pk = async () => { setBusy(true); setErr(''); setErr((await onPasskey()) || ''); setBusy(false); };
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (!EMAIL.test(email.trim())) { setBad(true); return; } auth.set(email.trim(), upd); setMode('ok'); };
  const pkBtn = <button className="b pri" style={{ minHeight: 52, minWidth: 280 }} disabled={busy} onClick={pk}><KeyRound size={18} aria-hidden />{busy ? 'Waiting for your passkey…' : hasVault ? 'Unlock with passkey' : 'Continue with a passkey'}</button>;
  return <Full>
    <h1 className="big">See what your contracts ask of you, and when.</h1>
    <p className="pp">Your contracts never leave your device. We only keep your email.</p>
    {!on ? <><p className="pp"><b>You’re offline.</b> Google and email sign-in need a connection.{hasVault ? ' Your vault still opens with your passkey.' : ''}</p>{hasVault && <div className="acts">{pkBtn}</div>}</>
      : mode === 'ready' ? <div className="acts" style={{ flexDirection: 'column' }}>{pkBtn}<button className="b" style={{ minHeight: 52, minWidth: 280 }} onClick={() => setMode('gna')}>Continue with Google</button><button className="lk" onClick={() => setMode('email')}>Use my email instead</button>{onBypass && <button className="lk" onClick={onBypass}>Skip sign-in (testing)</button>}</div>
      : mode === 'gna' ? <><p className="pp" role="status"><b>Google sign-in isn’t set up on this copy of ContraClear yet.</b> Nothing was saved. A passkey or your email works the same way.</p><div className="acts" style={{ flexDirection: 'column' }}>{pkBtn}<button className="lk" onClick={() => setMode('email')}>Use my email instead</button></div></>
      : mode === 'email' ? <form onSubmit={submit} style={{ display: 'contents' }} noValidate><div className="fld"><label htmlFor="em">Email</label><input id="em" type="email" autoFocus autoComplete="email" placeholder="you@example.com" value={email} className={bad ? 'bad' : ''} aria-invalid={bad} aria-describedby={bad ? 'emerr' : undefined} onChange={e => { setEmail(e.target.value); setBad(false); }} />{bad && <span className="err" id="emerr" role="alert"><TriangleAlert size={16} aria-hidden />That doesn’t look like an email. Check for a typo.</span>}</div><div className="acts" style={{ flexDirection: 'column' }}><button className="b pri" style={{ minHeight: 52, minWidth: 280 }}>Continue</button><button type="button" className="lk" onClick={() => setMode('ready')}>Use a passkey or Google instead</button></div></form>
      : <><p className="pp" role="status" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Check size={18} aria-hidden />Signed in as {auth.email()}</p><p className="pp">{hasVault ? 'Next, open your vault with your passkey.' : 'First time here: set up your vault. Next time: straight to your contracts.'}</p><div className="acts"><button className="b pri" autoFocus onClick={onDone}>{hasVault ? 'Open my vault' : 'Set up your vault'}</button></div></>}
    {err && <Err>{err}</Err>}
    {(mode === 'email' || mode === 'ready') && <div><label className="cbx"><input type="checkbox" checked={upd} onChange={e => setUpd(e.target.checked)} /><span>Email me occasional updates about ContraClear and new tools from Adarsh Sharma. I can unsubscribe anytime.</span></label><p className="faint" style={{ margin: '8px 0 0', fontSize: 14 }}>Optional. ContraClear works exactly the same either way.</p></div>}
  </Full>;
}
export function RecoveryKey({ rk, onDone }: { rk: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  return <Full><h1 className="big">Save your recovery key</h1><p className="pp" style={{ maxWidth: 560 }}>This is shown once. If you lose your passkey <b>and</b> this key, your data is gone. Nobody can recover it, including us.</p>
    <div className="keyb num" aria-label="Recovery key">{rk}</div>
    <div className="acts noprint"><button className="b" onClick={() => window.print()}>Print</button><button className="b" onClick={() => download('ContraClear-recovery-key.txt', `ContraClear recovery key\n\n${rk}\n\nKeep this somewhere safe. It opens your vault if you lose your passkey.\n`, 'text/plain')}>Download</button></div>
    <label className="cbx noprint"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} /><span>I have saved this somewhere safe</span></label>
    <div className="acts noprint"><button className="b pri" disabled={!saved} onClick={onDone} style={{ minWidth: 200 }}>Continue</button></div></Full>;
}
/** One screen for making a passkey: first-time setup, or a new one after the recovery key. */
function MakePasskey({ title, lead, cta, make, onDone }: { title: string; lead: ReactNode; cta: string; make: (device: boolean) => Promise<{ rk: string }>; onDone: () => void }) {
  const [rk, setRk] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [fallback, setFallback] = useState(false);
  const go = async (device = false) => { setBusy(true); setErr(''); try { setRk((await make(device)).rk); } catch (e: any) { setErr(pkMsg(e)); setFallback(e?.message === 'unsupported' || e?.message === 'cancelled'); } setBusy(false); };
  if (rk) return <RecoveryKey rk={rk} onDone={onDone} />;
  return <Full><span className="lockic"><KeyRound size={32} aria-hidden /></span><h1 className="big">{title}</h1><p className="pp" style={{ maxWidth: 560 }}>{lead}</p>
    <div className="acts" style={{ flexDirection: 'column' }}><button className="b pri" autoFocus disabled={busy} style={{ minHeight: 52, minWidth: 280 }} onClick={() => go()}>{busy ? 'Waiting for your passkey…' : err ? 'Try again' : cta}</button>{fallback && <button className="lk" disabled={busy} onClick={() => go(true)}>Continue without a passkey</button>}</div>
    {err && <Err>{err}</Err>}</Full>;
}
export const Setup = ({ onReady }: { onReady: () => void }) => <MakePasskey title="Set up your vault" cta="Create my passkey" onDone={onReady} make={d => vault.create(auth.email(), d)}
  lead="Your vault is an encrypted box on this device that holds your contracts and results. Your passkey locks it: your fingerprint, face, device PIN or phone. Only you can open it." />;
export function Locked({ onOpen, onCorrupt }: { onOpen: () => void; onCorrupt: () => void }) {
  const [info, setInfo] = useState<{ kind: string; cred: boolean; legacy: boolean } | null>(null);
  const [mode, setMode] = useState<'main' | 'rk' | 'new'>('main'); const [v, setV] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { vault.info().then(i => { setInfo(i); if (i.legacy) setMode('rk'); }, onCorrupt); }, []);
  if (!info) return <main className="full" aria-busy="true"><span className="spin" role="status" aria-label="Opening your vault" /></main>;
  if (mode === 'new') return <MakePasskey title="Recovery key accepted" cta="Create a new passkey" onDone={onOpen} make={d => vault.rekey(auth.email(), d)} lead="Make a new passkey now. Your old recovery key stops working, and you’ll get a new one." />;
  const unlock = async () => { setBusy(true); setErr(''); try { await vault.unlock(); onOpen(); } catch (e: any) { if (e.message === 'corrupt') return onCorrupt(); setErr(e.message === 'wrong' ? 'That passkey didn’t open this vault. Use the passkey you made for ContraClear, or your recovery key.' : 'The passkey check was cancelled. Nothing changed. There’s no lockout.'); } setBusy(false); };
  const rec = async (e: React.FormEvent) => { e.preventDefault(); if (!v) return; setBusy(true); setErr(''); try { await vault.unlockRecovery(v); setMode('new'); } catch (x: any) { if (x.message === 'corrupt') return onCorrupt(); setErr('That key didn’t open the vault. Check each group of four.'); } setBusy(false); };
  const plain = info.kind === 'device' && !info.cred;
  return <Full><span className="lockic"><Lock size={32} aria-hidden /></span>
    {mode === 'main' ? <><h1 className="big">Your contracts are locked.</h1><div className="acts" style={{ flexDirection: 'column' }}><button className="b pri" autoFocus disabled={busy} style={{ minHeight: 52, minWidth: 280 }} onClick={unlock}>{busy ? 'Waiting for your passkey…' : plain ? 'Unlock' : 'Unlock with passkey'}</button><button className="lk" onClick={() => { setMode('rk'); setErr(''); }}>Use recovery key</button></div></>
      : <><h1 className="big">Unlock with your recovery key</h1>{info.legacy && <p className="pp" style={{ maxWidth: 560 }}>This vault was made with a passphrase, which ContraClear no longer uses. Open it once with your recovery key, then make a passkey.</p>}
        <form onSubmit={rec} style={{ display: 'contents' }}><div className="fld"><label htmlFor="rkin">Recovery key</label><input id="rkin" autoFocus autoComplete="off" value={v} className={err ? 'bad' : ''} aria-invalid={!!err} onChange={e => { setV(e.target.value); setErr(''); }} /></div>
          <div className="acts" style={{ flexDirection: 'column' }}><button className="b pri" disabled={busy} style={{ minHeight: 52, minWidth: 280 }}>{busy ? 'Unlocking…' : 'Unlock'}</button>{!info.legacy && <button type="button" className="lk" onClick={() => { setMode('main'); setErr(''); }}>Use passkey</button>}</div></form></>}
    {err && <Err>{err}</Err>}</Full>;
}
export const Notice = ({ title, body, children }: { title: string; body: ReactNode; children?: ReactNode }) => <Full><h1 className="big">{title}</h1><p className="pp" style={{ maxWidth: 560 }}>{body}</p>{children && <div className="acts">{children}</div>}</Full>;
