// Flow 2 (Drop state and its sources) and Flow 3 (processing, queue, results).
import { useRef, useState, type ReactNode } from 'react';
import { FolderOpen, HardDrive, ClipboardPaste, Check, Minus } from 'lucide-react';
import { STAGES, type Input, type Progress } from '../lib/pipeline';
import { looksReadable, MAX_MB, MAX_PAGES, type ReadCode } from '../lib/read';
import { Badge, Steps } from './kit';
export interface Job { id: string; input: Input; state: 'waiting' | 'reading' | 'done' | 'failed' | 'cancelled'; progress?: Progress; code?: ReadCode | 'other'; detail?: string; contractId?: string; items?: number; need?: number }
type Found = { file: File; path: string; on: boolean };
const toInputs = (files: File[], src: string): Input[] => files.map(f => ({ name: f.name, file: f, src }));
async function walk(dir: any, path: string, out: Found[]) { for await (const [name, h] of dir.entries()) { if (h.kind === 'directory') { if (out.length < 500) await walk(h, path + '/' + name, out); } else if (/\.(pdf|docx)$/i.test(name)) out.push({ file: await h.getFile(), path, on: true }); } }

export function Drop({ over, hasContracts, onAdd, onBack }: { over: boolean; hasContracts: boolean; onAdd: (i: Input[]) => void; onBack: () => void }) {
  const [panel, setPanel] = useState<'' | 'folder' | 'list' | 'drive' | 'paste'>(''); const [found, setFound] = useState<Found[]>([]); const [dir, setDir] = useState(''); const [busy, setBusy] = useState(false); const [text, setText] = useState('');
  const pick = useRef<HTMLInputElement>(null), pickDir = useRef<HTMLInputElement>(null);
  const chooseFolder = async () => {
    const sdp = (window as any).showDirectoryPicker; if (!sdp) { pickDir.current?.click(); return; }
    try { const d = await sdp.call(window, { mode: 'read' }); setBusy(true); setDir(d.name); const out: Found[] = []; await walk(d, d.name, out); setFound(out); setPanel('list'); } catch { /* the user closed the chooser */ } setBusy(false);
  };
  const n = found.filter(f => f.on).length;
  const sheet = (label: string, body: ReactNode) => <div className="center" role="dialog" aria-label={label}>{body}</div>;
  return <div className="stage">
    <input ref={pick} type="file" hidden multiple accept=".pdf,.docx,.doc,.txt" onChange={e => { const f = [...(e.target.files || [])]; e.target.value = ''; if (f.length) onAdd(toInputs(f, 'This device')); }} />
    <input ref={pickDir} type="file" hidden multiple {...{ webkitdirectory: '' } as any} onChange={e => { const f = [...(e.target.files || [])].filter(x => /\.(pdf|docx)$/i.test(x.name)); e.target.value = ''; setDir('Chosen folder'); setFound(f.map(file => ({ file, path: (file as any).webkitRelativePath?.replace(/\/[^/]*$/, '') || '', on: true }))); setPanel('list'); }} />
    {panel === '' ? <main className="full" style={over ? { outline: '2px dashed #111', outlineOffset: -24, borderRadius: 24 } : undefined}>
      <span className="wm" style={{ fontSize: 20 }}>ContraClear</span>
      {over ? <><h1 className="big">Let go to add it.</h1><p className="pp">The whole window takes the file.</p></> : <>
        <h1 className="big">Drop signed contracts anywhere.</h1>
        <button className="b pri" style={{ minHeight: 52, minWidth: 200 }} onClick={() => pick.current?.click()}>Choose files</button>
        <p className="pp">Read on this device. Nothing is uploaded. PDF or Word, up to {MAX_MB} MB and {MAX_PAGES} pages.</p>
        <div className="acts"><span className="faint">Or add from:</span><button className="b q" onClick={() => setPanel('folder')}><FolderOpen size={18} aria-hidden />Folder on this computer</button><button className="b q" onClick={() => setPanel('drive')}><HardDrive size={18} aria-hidden />Google Drive</button><button className="b q" onClick={() => setPanel('paste')}><ClipboardPaste size={18} aria-hidden />Paste text</button></div>
        {hasContracts && <button className="lk" onClick={onBack}>Back to my contracts</button>}</>}
    </main> : <><div className="bd drop" aria-hidden>Drop a signed contract anywhere.</div><div className="veil" onClick={() => setPanel('')} />
      {panel === 'folder' && sheet('Add a folder from this computer', <><h2 className="ph">Add a folder from this computer</h2><p className="pp">Your browser will ask to let ContraClear read one folder. It reads only that folder, only on this device. Nothing is uploaded.</p><div className="acts"><button className="b pri" autoFocus disabled={busy} onClick={chooseFolder}>{busy ? `Looking in ${dir}…` : 'Choose a folder'}</button><button className="b q" onClick={() => setPanel('')}>Cancel</button></div></>)}
      {panel === 'list' && sheet('Files found', <><h2 className="ph">{found.length} {found.length === 1 ? 'file' : 'files'} found</h2><p className="pp">{found.length ? 'All are selected. Untick anything that isn’t a contract.' : `No PDF or Word files in ${dir}.`}</p>
        <ul className="lst" style={{ maxHeight: 320, overflow: 'auto' }}>{found.map((f, i) => <li key={i}><input type="checkbox" id={'ff' + i} checked={f.on} onChange={e => setFound(found.map((x, j) => j === i ? { ...x, on: e.target.checked } : x))} style={{ width: 22, height: 22, accentColor: '#111' }} /><label className="x" htmlFor={'ff' + i}>{f.file.name}<small>{f.path}</small></label></li>)}</ul>
        <div className="acts"><button className="b pri" disabled={!n} onClick={() => onAdd(toInputs(found.filter(f => f.on).map(f => f.file), 'This device'))}>Add {n} {n === 1 ? 'file' : 'files'}</button><button className="b q" onClick={() => setPanel('')}>Cancel</button></div></>)}
      {panel === 'drive' && sheet('Add from Google Drive', <><h2 className="ph">Add from Google Drive</h2><p className="pp">Choose folders or files in Drive to add them.</p><Steps items={['Google asks you to allow access. ContraClear sees only the files you pick.', 'Picked files are copied to this device and read here.', 'You can remove access any time in your Google Account.']} /><p className="pp" role="status"><b>Google isn’t connected on this copy of ContraClear yet.</b> Download the files from Drive, then add them from a folder.</p><div className="acts"><button className="b pri" autoFocus onClick={() => setPanel('folder')}>Use a folder instead</button><button className="b q" onClick={() => setPanel('')}>Cancel</button></div></>)}
      {panel === 'paste' && sheet('Paste contract text', <><h2 className="ph">Paste contract text</h2><div className="fld" style={{ maxWidth: 'none' }}><label htmlFor="pt">Contract text</label><textarea id="pt" autoFocus placeholder="Paste the full text here" value={text} onChange={e => setText(e.target.value)} /><span className="faint" style={{ fontSize: 14 }}>Pasted text has no pages, so quotes show line numbers instead.</span></div><div className="acts"><button className="b pri" disabled={text.trim().length < 40} onClick={() => onAdd([{ name: 'Pasted text', text, src: 'Dropped' }])}>Add</button><button className="b q" onClick={() => setPanel('')}>Cancel</button></div></>)}
    </>}
    <Badge />
  </div>;
}
const ERR: Record<string, (j: Job) => [string, string]> = {
  doc: () => ['This is an old Word file (.doc).', 'ContraClear reads .docx and PDF. Open it in Word or Google Docs, choose Save As, pick .docx or PDF, then add it again.'],
  type: j => [`ContraClear can’t read ${j.detail} files.`, 'Add the contract itself, as a PDF or Word (.docx) file.'],
  big: j => [`This file is ${j.detail} MB. The limit is ${MAX_MB} MB.`, 'Save it as a smaller PDF, or keep only the pages with prices and terms.'],
  pages: j => [`This file has ${j.detail} pages. The limit is ${MAX_PAGES}.`, 'Add just the contract part, or split it into smaller files.'],
  scan: () => ['This is a scan, with no text layer.', 'Reading scans isn’t in this version yet, and we won’t guess. Add a copy where you can select the text, or paste the text.'],
  damaged: j => [`Couldn’t read ${j.input.name}.`, 'The file is damaged or empty and won’t open. Nothing was kept.'],
  other: j => [`Couldn’t read ${j.input.name}.`, 'Something went wrong while reading it. Nothing was kept.'],
};
export function Processing({ jobs, paused, onSkip, onCancel, onOpen, onRetry, onChoose, onPause }: { jobs: Job[]; paused: boolean; onSkip: () => void; onCancel: () => void; onOpen: (id?: string) => void; onRetry: (j: Job, patch: Partial<Input>) => void; onChoose: () => void; onPause: () => void }) {
  const [pw, setPw] = useState('');
  const wrap = (kids: ReactNode) => <div className="stage"><main className="full"><span className="wm" style={{ fontSize: 20 }}>ContraClear</span>{kids}</main><Badge /></div>;
  if (jobs.length > 1) {
    const active = jobs.some(j => j.state === 'waiting' || j.state === 'reading'), done = jobs.filter(j => j.state === 'done');
    const label = (j: Job) => j.state === 'done' ? `Done · ${j.items} ${j.items === 1 ? 'item' : 'items'}` : j.state === 'failed' ? 'Needs attention: ' + (ERR[j.code || 'other'] || ERR.other)(j)[0] : j.state === 'cancelled' ? 'Not read' : j.state === 'reading' ? (paused ? 'Paused' : (STAGES[j.progress?.stage ?? 0] + '…')) : 'Waiting';
    return wrap(<><h1 className="big">{active ? `Adding ${jobs.length} files` : jobs.some(j => j.state === 'cancelled') ? 'Stopped the queue' : `${done.length} of ${jobs.length} files read`}</h1><p className="pp">{active ? 'Open any finished file while the rest keep going.' : `${done.length} ${done.length === 1 ? 'file is' : 'files are'} in your library.${jobs.length - done.length ? ` ${jobs.length - done.length} were not read and nothing of them was kept.` : ''}`}</p>
      <ul className="lst" style={{ maxWidth: 600 }} aria-live="polite">{jobs.map(j => <li key={j.id}><span className="x">{j.input.name}<small>{label(j)}</small></span>{j.state === 'done' && <button className="b" onClick={() => onOpen(j.contractId)}>Open</button>}{j.state === 'reading' && !paused && <span className="spin" style={{ width: 20, height: 20 }} aria-hidden />}</li>)}</ul>
      <div className="acts">{active ? <><button className="b pri" onClick={onPause}>{paused ? 'Resume' : 'Pause'}</button><button className="b q" onClick={onCancel}>Cancel the rest</button></> : done.length ? <button className="b pri" autoFocus onClick={() => onOpen()}>Open the library</button> : <button className="b pri" autoFocus onClick={onChoose}>Choose files</button>}</div></>);
  }
  const j = jobs[0]; if (!j) return null;
  if (j.state === 'done') return wrap(<><h1 className="big" role="status">Done. {j.items} {j.items === 1 ? 'item' : 'items'} found.</h1><p className="pp">{j.items ? `${j.need} need your check.${j.items! - j.need! ? ` ${j.items! - j.need!} are confirmed by both checks.` : j.progress?.aiOff ? ' With Rules only, every item waits for you.' : ''}` : 'The rules check found no amounts, dates or deadlines. You can still read it and track wording yourself.'}</p><div className="acts"><button className="b pri" autoFocus style={{ minHeight: 52 }} onClick={() => onOpen(j.contractId)}>Open the workspace</button></div></>);
  if (j.state === 'cancelled') return wrap(<><h1 className="big" role="status">Stopped. Nothing was saved.</h1><p className="pp">Your file was closed and not kept.</p><div className="acts"><button className="b pri" autoFocus onClick={onChoose}>Choose files</button></div></>);
  if (j.state === 'failed' && j.code === 'pw') return wrap(<><h1 className="big">This PDF has a password.</h1><p className="pp">Type it to open the file. It is used once, in memory, and never saved.</p><form style={{ display: 'contents' }} onSubmit={e => { e.preventDefault(); onRetry(j, { password: pw }); setPw(''); }}><div className="fld"><label htmlFor="ppw">PDF password</label><input id="ppw" type="password" autoFocus value={pw} onChange={e => setPw(e.target.value)} />{j.input.password !== undefined && <span className="err" role="alert">That password didn’t open it.</span>}</div><div className="acts"><button className="b pri">Unlock and read</button><button type="button" className="b" onClick={onChoose}>Choose a different file</button></div></form></>);
  if (j.state === 'failed' && j.code === 'fr') return wrap(<><h1 className="big">This contract is in French. English only for now.</h1><p className="pp">You can still preview it. We won’t guess at its terms.</p><div className="acts"><button className="b pri" autoFocus onClick={() => onRetry(j, { preview: true } as any)}>Preview it</button><button className="b" onClick={onChoose}>Choose another file</button></div></>);
  if (j.state === 'failed') { const [t, d] = (ERR[j.code || 'other'] || ERR.other)(j); return wrap(<><h1 className="big" role="alert">{t}</h1><p className="pp" style={{ maxWidth: 560 }}>{d}</p><div className="acts"><button className="b pri" autoFocus onClick={onChoose}>Choose another file</button></div></>); }
  const p = j.progress || { stage: 0 }, cur = p.stage;
  return wrap(<div className="pv">
    <div style={{ display: 'grid', gap: 20 }}>
      <h1 className="ph" aria-live="polite">{STAGES[cur]}…</h1>
      <ol className="stg">{STAGES.map((n, i) => { const st = i < cur ? 2 : i === cur ? 1 : 0, off = p.aiOff && (i === 3 || i === 4) && st > 0; return <li key={i} style={{ color: st === 0 ? '#6B6B6B' : '#111', fontWeight: st === 1 ? 600 : 400 }}><span className="d num" style={{ borderColor: st === 0 ? '#BDBDBD' : '#111', background: st === 2 && !off ? '#111' : '#fff', color: st === 2 && !off ? '#fff' : 'inherit' }}>{off ? <Minus size={14} aria-hidden /> : st === 2 ? <Check size={14} aria-hidden /> : i + 1}</span><span>{n}{off && <span className="faint" style={{ fontWeight: 400 }}> · off in Rules only</span>}<span className="vh">{st === 2 ? (off ? 'skipped' : 'done') : st === 1 ? 'in progress' : 'waiting'}</span></span></li>; })}</ol>
      <div className="acts"><button className="b" onClick={onSkip}>Skip to results</button><button className="b q" onClick={onCancel}>Cancel</button></div>
      <span className="faint num" style={{ fontSize: 14 }}>{j.input.name}{p.pages ? ` · ${p.pages} ${j.input.text !== undefined ? 'lines' : p.pages === 1 ? 'page' : 'pages'}` : ''}</span>
    </div>
    <div className="viz" aria-hidden>
      <div className="sh b3" /><div className="sh b2" /><div className="sh">{cur < 1 ? [0, 1, 2, 3, 4, 5, 6, 7].map(i => <div key={i} className="ln2" style={{ width: `${70 + (i * 37) % 30}%` }} />) : [0, 1, 2, 3, 4].map(i => <div key={i} className={'blk' + (cur >= 2 && i < 3 ? ' on' : '')} />)}</div>
      <div className="trays num">{([['Money', p.money], ['Dates', p.dates], ['Duties', p.duties]] as const).map(([t, v]) => <div className="tray" key={t}><span>{t}</span><b>{v ?? 0}</b></div>)}<span className="faint" style={{ fontSize: 14 }}>These trays become the sections of your workspace.</span></div>
      {p.formula && <div className="fml num">{p.formula}<span className="faint">, business-day checked</span></div>}
    </div>
  </div>);
}
