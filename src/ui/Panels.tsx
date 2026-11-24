// Panels layered on the workspace: calendar (Flow 9), portfolio (4.10), settings (15), vault help (12), engines (11).
import { useState } from 'react';
import type { Contract, Db, Settings } from '../lib/types';
import { isNeed } from '../lib/types';
import { calEvents, download, toIcs } from '../lib/exporters';
import { fmt, fromIso } from '../lib/dates';
import { perYear, portfolio, status, money } from '../lib/timeline';
import { vault } from '../lib/vault';
import { Chip, Modal, Nla, Steps } from './kit';
type Close = { onClose: () => void };
export function CalendarPanel({ cs, rem, onClose, say }: { cs: Contract[]; rem: string; say: (m: string) => void } & Close) {
  const evs = calEvents(cs); const [off, setOff] = useState<Record<string, boolean>>({}); const pick = evs.filter(e => !off[e.uid]);
  return <Modal label="Add dates to my calendar" onClose={onClose} cls="pan" style={{ width: 720 }}>
    <h2 style={{ margin: 0, fontSize: 22 }}>These {pick.length} events will be created</h2>
    <div className="mute">Untick anything you don’t want. Each event includes the quote, clause, page and how the date was worked out. Changing an item later and downloading again updates its event instead of duplicating it.</div>
    <div>{evs.map(e => <div className="ev" key={e.uid}><input type="checkbox" id={e.uid} checked={!off[e.uid]} onChange={x => setOff({ ...off, [e.uid]: !x.target.checked })} /><label htmlFor={e.uid}><b style={{ fontWeight: 600 }}>{e.title}</b><span className="mute num" style={{ display: 'block' }}>{fmt(fromIso(e.date))}{e.recur ? ` · repeats ${e.recur}` : ''} · reminders {rem.replace(' before', '')} before</span><pre>{e.desc}</pre></label></div>)}</div>
    <Nla>Not legal advice. Check each clause before you rely on these dates.</Nla>
    <div className="mute" style={{ fontSize: 14 }}>Google Calendar isn’t connected on this copy yet, so this is one .ics file. It works with any calendar app.</div>
    <div className="acts"><button className="b pri" autoFocus disabled={!pick.length} onClick={() => { download('ContraClear-dates.ics', toIcs(pick, rem), 'text/calendar'); onClose(); say(`${pick.length} dates saved as one .ics file. Open it to add them to your calendar.`); }}>Download {pick.length} events (.ics)</button><button className="b q" onClick={onClose}>Cancel</button></div>
  </Modal>;
}
export function PortfolioPanel({ cs, onClose, onOpen }: { cs: Contract[]; onOpen: (id: string) => void } & Close) {
  const p = portfolio(cs);
  return <Modal label="Portfolio at a glance" onClose={onClose} cls="pan" style={{ gap: 20 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ margin: 0, fontSize: 22 }}>Portfolio at a glance</h2><button className="b q" onClick={onClose}>Close <kbd>Esc</kbd></button></div>
    <div className="pg2 num"><div className="pbx"><span className="faint">Committed per year</span><b>{p.year}</b><span className="mute">{cs.length} {cs.length === 1 ? 'contract' : 'contracts'}, before renewals</span></div><div className="pbx"><span className="faint">Renews soon</span><b>{p.renewN}</b><span className="mute">{p.renewSub}</span></div><div className="pbx"><span className="faint">Due in 30 days</span><b>{p.d30.total}</b><span className="mute">{p.d30.sub}</span></div></div>
    <div className="pg2 num"><div className="pbx"><span className="faint">Due in 60 days</span><b>{p.d60.total}</b><span className="mute">{p.d60.sub}</span></div><div className="pbx"><span className="faint">Due in 90 days</span><b>{p.d90.total}</b><span className="mute">{p.d90.sub}</span></div><div className="pbx" style={{ borderStyle: 'dashed' }}><span className="faint">Items waiting for you</span><b>{cs.reduce((n, c) => n + c.items.filter(i => isNeed(c, i.id)).length, 0)}</b><span className="mute">across all contracts</span></div></div>
    <table className="lt"><thead><tr><th>Contract</th><th>Per year</th><th>Next</th><th>Status</th></tr></thead><tbody className="num">{cs.map(c => { const s = status(c); return <tr key={c.id} className="r" tabIndex={0} onClick={() => onOpen(c.id)} onKeyDown={e => e.key === 'Enter' && onOpen(c.id)}><td>{c.name}</td><td>{money(perYear(c))}</td><td>{s.next}</td><td><Chip k={s.k} label={s.k === 'g' ? s.label : `${s.label}`} /></td></tr>; })}</tbody></table>
    <Nla>Totals add confirmed and unconfirmed amounts. Not legal advice.</Nla>
  </Modal>;
}
const PROV = ['Ontario', 'Quebec', 'British Columbia', 'Alberta', 'Manitoba', 'Saskatchewan', 'Nova Scotia', 'New Brunswick', 'Newfoundland and Labrador', 'Prince Edward Island'];
export function SettingsPanel({ s, set, onClose, onEngine, onSignOut, onDelete }: { s: Settings; set: (p: Partial<Settings>) => void; onEngine: () => void; onSignOut: () => void; onDelete: () => void } & Close) {
  const sel = (id: string, label: string, k: 'prov' | 'rem' | 'lock', opts: string[]) => <><label htmlFor={id}>{label}</label><select id={id} value={s[k]} onChange={e => set({ [k]: e.target.value })}>{opts.map(o => <option key={o}>{o}</option>)}</select></>;
  return <Modal label="Settings" onClose={onClose} style={{ width: 560, gap: 20 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ margin: 0, fontSize: 22 }}>Settings</h2><button className="b q" onClick={onClose}>Done</button></div>
    <div className="set">{sel('s1', 'Province, for holidays', 'prov', PROV)}{sel('s2', 'Default reminders', 'rem', ['2 weeks and 2 days before', '1 week before', '1 day before'])}{sel('s3', 'Auto-lock after', 'lock', ['15 minutes', '5 minutes', '1 hour'])}
      <span>Engine</span><button className="b" onClick={onEngine} style={{ justifySelf: 'start' }}>{s.eng === 'llm' ? 'On-device AI model (free)' : s.eng === 'device' ? 'Quick check (free)' : 'Rules only (free)'}</button>
      <span id="cpl">Keep encrypted copies of files</span><button className="b" role="switch" aria-checked={s.copies} aria-labelledby="cpl" onClick={() => set({ copies: !s.copies })} style={{ justifySelf: 'start' }}>{s.copies ? 'On' : 'Off'}</button></div>
    <div className="mute" style={{ fontSize: 14 }}>The province applies to contracts you add from now on.</div>
    <div className="acts" style={{ borderTop: '1px solid #E3E3E3', paddingTop: 16 }}><button className="b" onClick={onSignOut}>Sign out</button><button className="b q" onClick={onDelete}>Delete everything</button></div>
  </Modal>;
}
export const FilesPanel = ({ onClose }: Close) => <Modal label="What happens to my files?" onClose={onClose}><h2 className="ph">What happens to my files?</h2><Steps items={['You add a file. It opens in this browser and is not uploaded.', 'The rules check reads it here, on this device.', 'With on-device AI, a small model in this browser reads each clause a second way. That also happens here; nothing is sent.', 'Results, and the contract’s text, go into your encrypted vault on this device.', 'The original file is closed when reading ends. ContraClear does not keep it.', 'We keep only your email. Delete everything removes it.']} /><div className="acts"><button className="b pri" autoFocus onClick={onClose}>Done</button></div></Modal>;
export const EnginePanel = ({ onClose }: Close) => <Modal label="How items are checked" onClose={onClose}><h2 className="ph">Cloud AI isn’t in this version</h2><p className="pp">It would send masked clauses to a provider using your own key. ContraClear doesn’t do that today: nothing leaves this device.</p><p className="pp"><b>On-device AI</b> gives every item a second check here in the browser, free, with no download.</p><div className="acts"><button className="b pri" autoFocus onClick={onClose}>Done</button></div></Modal>;
export function DeletePanel({ n, onClose, onDelete }: { n: number; onDelete: () => void } & Close) {
  const [w, setW] = useState('');
  return <Modal label="Delete everything" onClose={onClose}><h2 className="ph">Delete everything</h2><div>This removes:</div><ul className="lst"><li><span className="x">The vault on this device<small>{n} {n === 1 ? 'contract' : 'contracts'}, results, edits, tracked items</small></span></li><li><span className="x">Your email record<small>The only thing ContraClear keeps</small></span></li></ul><div className="mute">Calendar files you already downloaded, and events made from them, stay where they are.</div>
    <div className="fld"><label htmlFor="dw">Type DELETE to confirm</label><input id="dw" autoFocus autoComplete="off" value={w} onChange={e => setW(e.target.value)} /></div><div className="acts"><button className="b pri" disabled={w.trim() !== 'DELETE'} onClick={onDelete}>Delete everything</button><button className="b q" onClick={onClose}>Cancel</button></div></Modal>;
}
export function SharePanel({ onClose, say, onImport }: { say: (m: string) => void; onImport: (d: Db, mode: 'merge' | 'replace') => void } & Close) {
  const [file, setFile] = useState<File | null>(null), [pp, setPp] = useState(''), [err, setErr] = useState(''), [data, setData] = useState<Db | null>(null), [mode, setMode] = useState<'merge' | 'replace'>('merge'), [code, setCode] = useState('');
  const open = async (e: React.FormEvent) => { e.preventDefault(); try { setData(await vault.readFile<Db>(file!, pp)); } catch (x: any) { setErr(x.message === 'wrong' ? 'That share code didn’t open this file.' : 'This isn’t a ContraClear vault file, or it is damaged.'); } };
  const exp = async () => { const r = await vault.exportFile(); download('ContraClear.ccvault', r.blob, 'application/octet-stream'); setCode(r.code); say('Vault file saved. Send the share code separately.'); };
  return <Modal label="Share with a teammate" onClose={onClose}>
    {code ? <><h2 className="ph">Share code for this file</h2><p className="pp">Shown once. Tell your teammate this code separately, by phone or in person. Never in the same email as the file.</p><div className="keyb num" aria-label="Share code">{code}</div><div className="acts"><button className="b pri" autoFocus onClick={onClose}>Done</button></div></>
      : !file ? <><h2 className="ph">Share with a teammate</h2><Steps items={['Export the vault file and send it however you like.', 'Tell them the share code separately, by phone or in person. Never in the same email.', 'They open it in ContraClear with Import vault.']} /><div className="acts"><button className="b pri" autoFocus onClick={exp}>Export vault file</button><label className="b" style={{ cursor: 'pointer' }}>Import a vault file<input type="file" hidden accept=".ccvault" onChange={e => setFile(e.target.files?.[0] || null)} /></label></div><span className="faint">No accounts, no roles, no seats.</span></>
      : !data ? <form onSubmit={open} style={{ display: 'contents' }}><h2 className="ph">{file.name}</h2><div className="fld"><label htmlFor="ip">Share code for this file</label><input id="ip" autoFocus autoComplete="off" value={pp} onChange={e => { setPp(e.target.value); setErr(''); }} />{err && <span className="err" role="alert">{err}</span>}</div><div className="acts"><button className="b pri">Unlock</button><button type="button" className="b q" onClick={onClose}>Cancel</button></div></form>
      : <><h2 className="ph">{data.contracts.length} {data.contracts.length === 1 ? 'contract' : 'contracts'} in this file</h2><label className="cbx"><input type="radio" name="m" checked={mode === 'merge'} onChange={() => setMode('merge')} /><span><b>Merge</b> with my vault. Contracts already here are kept as they are, with your edits.</span></label><label className="cbx"><input type="radio" name="m" checked={mode === 'replace'} onChange={() => setMode('replace')} /><span><b>Replace</b> my vault with this file.</span></label><div className="acts"><button className="b pri" onClick={() => { onImport(data, mode); onClose(); }}>Import</button><button className="b q" onClick={onClose}>Cancel</button></div></>}
  </Modal>;
}

