// Flow 1 (welcome and sign-in) and Flow 12 (vault setup, recovery key, unlock, problems).
import { useEffect, useState, type ReactNode } from 'react';
import { Lock, Check, TriangleAlert } from 'lucide-react';
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
export function Welcome({ hasVault, onDone, onOpenVault }: { hasVault: boolean; onDone: () => void; onOpenVault: () => void }) {
  const [mode, setMode] = useState<'ready' | 'email' | 'gna' | 'ok'>('ready'); const [email, setEmail] = useState(''); const [bad, setBad] = useState(false); const [upd, setUpd] = useState(false);
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => { const f = () => setOn(navigator.onLine); addEventListener('online', f); addEventListener('offline', f); return () => { removeEventListener('online', f); removeEventListener('offline', f); }; }, []);
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (!EMAIL.test(email.trim())) { setBad(true); return; } auth.set(email.trim(), upd); setMode('ok'); };
  return <Full>
    <h1 className="big">See what your contracts ask of you, and when.</h1>
    <p className="pp">Your contracts never leave your device. We only keep your email.</p>
    {!on && hasVault ? <><p className="pp"><b>You’re offline.</b> Signing in needs a connection. If you already have a vault here, it still opens.</p><div className="acts"><button className="b pri" onClick={onOpenVault}>Open my vault</button></div></>
      : mode === 'ready' ? <div className="acts" style={{ flexDirection: 'column' }}><button className="b pri" style={{ minHeight: 52, minWidth: 280 }} onClick={() => setMode('gna')}>Continue with Google</button><button className="lk" onClick={() => setMode('email')}>Use my email instead</button></div>
      : mode === 'gna' ? <><p className="pp" role="status"><b>Google sign-in isn’t set up on this copy of ContraClear yet.</b> Nothing was saved. Your email works the same way.</p><div className="acts"><button className="b pri" onClick={() => setMode('email')}>Use my email instead</button></div></>
      : mode === 'email' ? <form onSubmit={submit} style={{ display: 'contents' }} noValidate><div className="fld"><label htmlFor="em">Email</label><input id="em" type="email" autoFocus autoComplete="email" placeholder="you@example.com" value={email} className={bad ? 'bad' : ''} aria-invalid={bad} aria-describedby={bad ? 'emerr' : undefined} onChange={e => { setEmail(e.target.value); setBad(false); }} />{bad && <span className="err" id="emerr" role="alert"><TriangleAlert size={16} aria-hidden />That doesn’t look like an email. Check for a typo.</span>}</div><div className="acts" style={{ flexDirection: 'column' }}><button className="b pri" style={{ minHeight: 52, minWidth: 280 }}>Continue</button><button type="button" className="lk" onClick={() => setMode('ready')}>Use Google instead</button></div></form>
      : <><p className="pp" role="status" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Check size={18} aria-hidden />Signed in as {auth.email()}</p><p className="pp">{hasVault ? 'Straight to your contracts.' : 'First time here: set up your vault. Next time: straight to your contracts.'}</p><div className="acts"><button className="b pri" autoFocus onClick={onDone}>{hasVault ? 'Open my vault' : 'Set up your vault'}</button></div></>}
    {mode !== 'ok' && <div><label className="cbx"><input type="checkbox" checked={upd} onChange={e => setUpd(e.target.checked)} /><span>Email me occasional updates about ContraClear and new tools from Adarsh Sharma. I can unsubscribe anytime.</span></label><p className="faint" style={{ margin: '8px 0 0', fontSize: 14 }}>Optional. ContraClear works exactly the same either way.</p></div>}
  </Full>;
}
const strong = (p: string) => p.trim().split(/\s+/).length >= 4 || p.trim().length >= 14;
function NewPass({ title, lead, cta, onSet }: { title: string; lead: ReactNode; cta: string; onSet: (p: string) => Promise<void> }) {
  const [a, setA] = useState(''), [b, setB] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => { e.preventDefault(); if (!strong(a)) return setErr('Use at least 4 words, or 14 characters.'); if (a !== b) return setErr('The two passphrases don’t match.'); setBusy(true); try { await onSet(a); } catch { setErr('This browser couldn’t save the vault. Allow site data for this page and try again.'); setBusy(false); } };
  return <Full><h1 className="big">{title}</h1><p className="pp" style={{ maxWidth: 520 }}>{lead}</p>
    <form onSubmit={go} style={{ display: 'contents' }}><div className="fld"><label htmlFor="p1">Passphrase</label><input id="p1" type="password" autoFocus autoComplete="new-password" placeholder="At least 4 words" value={a} onChange={e => { setA(e.target.value); setErr(''); }} /></div>
      <div className="fld"><label htmlFor="p2">Type it again</label><input id="p2" type="password" autoComplete="new-password" value={b} onChange={e => { setB(e.target.value); setErr(''); }} aria-describedby="ph" />{err ? <span className="err" role="alert"><TriangleAlert size={16} aria-hidden />{err}</span> : <span className="faint" id="ph" style={{ fontSize: 14 }}>Four random words are strong and easy to remember.</span>}</div>
      <div className="acts"><button className="b pri" disabled={busy} style={{ minWidth: 200 }}>{busy ? 'Locking it up…' : cta}</button></div></form></Full>;
}
export function RecoveryKey({ rk, onDone }: { rk: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  return <Full><h1 className="big">Save your recovery key</h1><p className="pp" style={{ maxWidth: 560 }}>This is shown once. If you lose your passphrase <b>and</b> this key, your data is gone. Nobody can recover it, including us.</p>
    <div className="keyb num" aria-label="Recovery key">{rk}</div>
    <div className="acts noprint"><button className="b" onClick={() => window.print()}>Print</button><button className="b" onClick={() => download('ContraClear-recovery-key.txt', `ContraClear recovery key\n\n${rk}\n\nKeep this somewhere safe. It opens your vault if you forget your passphrase.\n`, 'text/plain')}>Download</button></div>
    <label className="cbx noprint"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} /><span>I have saved this somewhere safe</span></label>
    <div className="acts noprint"><button className="b pri" disabled={!saved} onClick={onDone} style={{ minWidth: 200 }}>Continue</button></div></Full>;
}
export function Setup({ onReady }: { onReady: () => void }) {
  const [rk, setRk] = useState('');
  if (rk) return <RecoveryKey rk={rk} onDone={onReady} />;
  return <NewPass title="Set up your vault" cta="Continue" lead="Your vault is an encrypted box on this device that holds your contracts and results. Only you can open it. Choose a passphrase to lock it." onSet={async p => setRk(await vault.create(p))} />;
}
export function Locked({ onOpen, onCorrupt }: { onOpen: () => void; onCorrupt: () => void }) {
  const [mode, setMode] = useState<'pp' | 'rk' | 'new'>('pp'); const [v, setV] = useState(''), [wrong, setWrong] = useState(false), [busy, setBusy] = useState(false), [rk, setRk] = useState('');
  if (rk) return <RecoveryKey rk={rk} onDone={onOpen} />;
  if (mode === 'new') return <NewPass title="Recovery key accepted" cta="Save and show new key" lead="Choose a new passphrase now. Your old recovery key stops working, and you’ll get a new one." onSet={async p => setRk(await vault.rekey(p))} />;
  const go = async (e: React.FormEvent) => { e.preventDefault(); if (!v) return; setBusy(true); try { await vault.unlock(v, mode === 'rk'); mode === 'rk' ? setMode('new') : onOpen(); } catch (x: any) { if (x.message === 'corrupt') onCorrupt(); else setWrong(true); } setBusy(false); };
  return <Full><span className="lockic"><Lock size={32} aria-hidden /></span><h1 className="big">{mode === 'pp' ? 'Your contracts are locked.' : 'Unlock with your recovery key'}</h1>
    <form onSubmit={go} style={{ display: 'contents' }}><div className="fld"><label htmlFor="up">{mode === 'pp' ? 'Passphrase' : 'Recovery key'}</label><input id="up" key={mode} type={mode === 'pp' ? 'password' : 'text'} autoFocus autoComplete={mode === 'pp' ? 'current-password' : 'off'} value={v} className={wrong ? 'bad' : ''} aria-invalid={wrong} onChange={e => { setV(e.target.value); setWrong(false); }} />
      {wrong && <span className="err" role="alert"><TriangleAlert size={16} aria-hidden />{mode === 'pp' ? 'That passphrase didn’t open the vault. Nothing changed. There’s no lockout.' : 'That key didn’t open the vault. Check each group of four.'}</span>}</div>
      <div className="acts" style={{ flexDirection: 'column' }}><button className="b pri" disabled={busy} style={{ minHeight: 52, minWidth: 280 }}>{busy ? 'Unlocking…' : 'Unlock'}</button><button type="button" className="lk" onClick={() => { setMode(mode === 'pp' ? 'rk' : 'pp'); setV(''); setWrong(false); }}>{mode === 'pp' ? 'Use recovery key' : 'Use passphrase'}</button></div></form></Full>;
}
export const Notice = ({ title, body, children }: { title: string; body: ReactNode; children?: ReactNode }) => <Full><h1 className="big">{title}</h1><p className="pp" style={{ maxWidth: 560 }}>{body}</p>{children && <div className="acts">{children}</div>}</Full>;
