// The Workspace: library (left), document preview (centre), "What needs you" (right), 90-day strip (top).
// Ported from design/boards/Workspace1440.dc.html. Everything else is a panel layered on top.
import { useEffect, useMemo, useRef, useState } from 'react';
import { File as FileIcon, ScanText, Trash2 } from 'lucide-react';
import { Search, ChevronDown, Download, Lock, Settings as Cog, Check, Circle, CircleCheck, UserCheck, SearchX, CalendarPlus, X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, LayoutGrid, Printer, PanelLeftClose, PanelLeftOpen, CalendarDays, Files, PieChart, Plus, Pencil, Calendar, DollarSign, ListChecks, Copy, TextSelect, FileSpreadsheet, FileText, KeyRound, HelpCircle, Library, TriangleAlert, Sheet } from 'lucide-react';
import type { Contract, Db, Item, K } from '../lib/types';
import { COL, eff, isNeed } from '../lib/types';
import { download, toCsv, calEvents } from '../lib/exporters';
import { fmtShort, today } from '../lib/dates';
import { next30, status, strip } from '../lib/timeline';
import { Badge, Chip, KIcon, Nla } from './kit';
import { clearSecond, secondCheck, classify } from '../lib/second';
import { CalendarPanel, EnginePanel, FilesPanel, PortfolioPanel, SettingsPanel, SharePanel } from './Panels';

interface Props { db: Db; setDb: (f: (d: Db) => Db) => void; active: string; setActive: (id: string) => void; startHome: boolean; focus?: boolean; onRemove: (id: string) => void; onAdd: () => void; onLock: () => void; onSample: () => void; onDelete: () => void; onSignOut: () => void }
type Track = { step: 'menu' | 'form'; txt: string; x: number; y: number; page: number; kind?: string; title?: string; who?: string; rem?: string };
const narrow = () => matchMedia('(max-width:900px)').matches;
const stamp = () => fmtShort(today());
const paraText = (pa: { lead: string; segs: { x: string }[] }) => (pa.lead + ' ' + pa.segs.map(x => x.x).join('')).trim();

export function Workspace({ onRemove, focus = false, db, setDb, active, setActive, startHome, onAdd, onLock, onSample, onDelete, onSignOut }: Props) {
  const cs = db.contracts, c = cs.find(x => x.id === active) || cs[0];
  const [s, setS] = useState({ sel: 0, hov: 0, hq: '', edit: null as null | { id: number; kind: 'edit' | 'wrong' }, editVal: '', cmd: false, q: '', ci: 0, fl: { c: false, d: false }, pop: '' as '' | 'eng' | 'exp', left: true, page: 1, view: (startHome ? 'home' : 'doc') as 'doc' | 'list' | 'home', node: 'all', panel: '' as '' | 'portfolio' | 'settings' | 'cal' | 'files' | 'share' | 'cloud', formula: 0, track: null as Track | null, hint: false, find: false, fq: '', thumbs: false, zoom: 100, sheet: false, showAgreed: false, showNF: false, drag: '', merged: {} as Record<string, boolean> });
  const set = (p: Partial<typeof s>) => setS(o => ({ ...o, ...p }));
  const [toast, setToast] = useState<{ m: string; undo?: () => void } | null>(null); const tt = useRef(0);
  const say = (m: string, undo?: () => void) => { clearTimeout(tt.current); setToast({ m, undo }); tt.current = window.setTimeout(() => setToast(null), 5200); };
  const upd = (f: (c: Contract) => Contract, id = c.id) => setDb(d => ({ ...d, contracts: d.contracts.map(x => x.id === id ? f(x) : x) }));
  const IT = (id: number) => c.items.find(i => i.id === id);
  const order = c.items.map(i => i.id);
  const need = (id: number, x: Contract = c) => isNeed(x, id);
  const needIds = order.filter(id => need(id)), doneIds = order.filter(id => !need(id) && !c.dis[id]), disIds = order.filter(id => c.dis[id]);
  const sel = order.includes(s.sel) ? s.sel : (needIds[0] ?? order[0] ?? 0);
  const nav = () => needIds.concat(doneIds);
  const hk = useRef('');

  const trace = (id: number, qid?: string) => requestAnimationFrame(() => { const it = IT(id); if (!it) return; const el = document.getElementById(qid || it.qid), pane = document.getElementById('doc'); if (el && pane) { pane.scrollTop += el.getBoundingClientRect().top - pane.getBoundingClientRect().top - pane.clientHeight * 0.3; } });
  const select = (id: number, cid?: string) => { if (cid && cid !== c.id) setActive(cid); set({ sel: id, edit: null, view: 'doc', sheet: narrow() }); setTimeout(() => trace(id), 30); };
  const hover = (id: number, qid = '') => { const k = id + ':' + qid; if (hk.current !== k) { hk.current = k; set({ hov: id, hq: qid }); trace(id, qid || undefined); } };
  const log = (x: Contract, id: number, t: string) => ({ ...x.hist, [id]: [...(x.hist[id] || []), `${stamp()} · ${t}`] });
  const done = (id: number, v: string, how: 'confirmed' | 'edited', msg: string) => {
    const nc = { ...c, conf: { ...c.conf, [id]: { v, how } } }, left = order.filter(x => need(x, nc)), next = left[0] ?? id;
    upd(x => ({ ...x, conf: nc.conf, hist: log(x, id, msg) })); set({ edit: null, sel: next }); setTimeout(() => trace(next), 30);
    say(left.length ? `Saved. ${left.length} left to check.` : 'All checked. You can add your dates to a calendar now.');
  };
  const startEdit = (id: number, kind: 'edit' | 'wrong' = 'edit') => { const it = IT(id); if (!it) return; set({ sel: id, edit: { id, kind }, editVal: c.conf[id]?.v ?? (eff(it) === 'r' ? '' : it.value) }); setTimeout(() => document.getElementById('editbox')?.focus(), 40); };
  const confirm = (id: number) => { const it = IT(id); if (!it || c.conf[id] !== undefined || c.dis[id]) return; if (eff(it) === 'r') return startEdit(id, 'wrong'); let v = it.value; if (it.conf && it.ai !== undefined) { const p = c.pick[id]; if (p === undefined) return say('Pick the right reading first: press 1 or 2.'); v = it.conf[p].v; } done(id, v, 'confirmed', 'You confirmed ' + v); };
  const saveEdit = () => { const v = s.editVal.trim(); if (!v || !s.edit) return; const id = s.edit.id, old = c.conf[id]?.v ?? IT(id)!.value; done(id, v, 'edited', `You changed ${old} → ${v}`); };
  const dismiss = (id: number) => { upd(x => ({ ...x, dis: { ...x.dis, [id]: true }, hist: log(x, id, 'You dismissed it') })); set({ sel: order.find(x => x !== id && need(x)) ?? order.find(x => x !== id && !c.dis[x]) ?? 0 }); say('Dismissed. It stays out of your calendar.', () => { upd(x => { const d = { ...x.dis }; delete d[id]; return { ...x, dis: d }; }); setToast(null); }); };
  const acceptAll = () => { const n = order.filter(id => eff(IT(id)!) === 'g' && !c.dis[id]).length; if (n) upd(x => ({ ...x, accepted: true })); say(n ? `Confirmed the ${n} items both checks agree on.` : 'No items have two agreeing checks yet. Confirm each one yourself, or turn on On-device AI.'); };
  const allLeft = cs.reduce((n, x) => n + x.items.filter(i => isNeed(x, i.id)).length, 0);
  const openCal = () => { if (focus) return say('Calendar is hidden in testing mode.'); if (needIds.length) return say(`Check ${needIds.length} more first. Dates go to your calendar after review.`); if (!calEvents([c]).length) return say('This contract has no dated items to add.'); set({ panel: 'cal', pop: '' }); };
  const goPage = (n: number) => { n = Math.max(1, Math.min(c.pages.length, n)); const el = document.getElementById('pg' + n), pane = document.getElementById('doc'); if (el && pane) pane.scrollTop += el.getBoundingClientRect().top - pane.getBoundingClientRect().top - 8; set({ page: n, view: 'doc' }); };
  const onScroll = () => { const pane = document.getElementById('doc'); if (!pane) return; const top = pane.getBoundingClientRect().top + 90; let p = 1; for (const pg of c.pages) { const el = document.getElementById('pg' + pg.n); if (el && el.getBoundingClientRect().top <= top) p = pg.n; } if (p !== s.page) set({ page: p }); if (s.track?.step === 'menu') set({ track: null }); };
  const onUp = () => { try { const g = getSelection(); const txt = (g?.toString() || '').trim(); if (txt.length < 4 || txt.length > 400 || !g) return; const r = g.getRangeAt(0).getBoundingClientRect(), w = document.getElementById('docw')!.getBoundingClientRect(); let n: any = g.anchorNode; while (n && !(n.id && /^pg\d+$/.test(n.id))) n = n.parentNode; set({ track: { step: 'menu', txt, x: Math.max(16, Math.min(w.width - 320, r.left - w.left)), y: r.bottom - w.top + 8, page: n ? +n.id.slice(2) : s.page }, hint: false }); } catch { /* no selection */ } };
  const trackKind = (k: string) => { const t = s.track; if (!t) return; set({ track: { ...t, step: 'form', kind: k, title: `${k}: ${t.txt.split(/\s+/).slice(0, 6).join(' ')}`, who: 'You', rem: '2 weeks before' } }); };
  const trackSave = () => { const t = s.track; if (!t) return; upd(x => ({ ...x, tracked: [...x.tracked, { id: 100 + x.tracked.length, kind: t.kind!, title: t.title!, who: t.who!, rem: t.rem!, txt: t.txt, page: t.page }] })); set({ track: null }); getSelection()?.removeAllRanges(); say('Tracked. You’ll find it under “Tracked by you”.'); };
  const openCmd = (q = '') => { set({ cmd: true, q, ci: 0, pop: '' }); setTimeout(() => document.getElementById('cmdin')?.focus(), 30); };
  const exportCsv = () => { set({ pop: '' }); download('ContraClear.csv', toCsv(cs), 'text/csv'); say(`CSV saved: ${cs.reduce((n, x) => n + x.items.length, 0)} items with quotes and pages.`); };
  const eng = db.settings.eng === 'device' ? 'device' : 'rules';
  // Switching engines re-checks what hasn't been reviewed yet, across every contract. It is instant and local.
  const pickEngine = (e: 'rules' | 'device' | 'cloud') => {
    if (e === 'cloud') return set({ pop: '', panel: 'cloud' });
    set({ pop: '', sel: 0 }); if (e === eng) return;
    let agreed = 0, differ = 0; const next = cs.map(x => { if (e === 'rules') return clearSecond(x); const o = secondCheck(x); agreed += o.agreed; differ += o.differ; return o.contract; });
    setDb(d => ({ ...d, contracts: next, settings: { ...d.settings, eng: e } }));
    say(e === 'rules' ? 'Rules only. Every unreviewed item now waits for your check.' : agreed + differ ? `On-device AI checked ${agreed + differ} items here. Both checks agree on ${agreed}; ${differ} ${differ === 1 ? 'needs' : 'need'} you. Nothing left this device.` : 'On-device AI is on. Nothing leaves this device.');
  };

  // Search: keyword across every contract's wording and items.
  const results = useMemo(() => {
    const q = s.q.trim().toLowerCase(); if (q.length < 2 || !s.cmd) return [];
    const out: { cid: string; cn: string; page: number; x: string; sum: string; id: number; soon: boolean }[] = [];
    for (const x of cs) { if (s.fl.c && x.id !== c.id) continue; for (const p of x.pages) for (const pa of p.paras) { const full = paraText(pa); const it = x.items.find(i => pa.segs.some(sg => sg.q === i.id && (sg.x.toLowerCase().includes(q) || i.sentence.toLowerCase().includes(q)))) || (full.toLowerCase().includes(q) ? x.items.find(i => pa.segs.some(sg => sg.q === i.id)) : undefined); if (!full.toLowerCase().includes(q) && !it) continue; out.push({ cid: x.id, cn: x.name, page: p.n, x: full.length > 220 ? full.slice(0, 220) + '…' : full, sum: it ? it.sentence : `Wording on ${x.lines ? 'line' : 'page'} ${p.n} of ${p.file}`, id: it ? it.id : 0, soon: !!it?.cal }); } }
    return out.filter(r => !s.fl.d || r.soon).slice(0, 6);
  }, [s.q, s.cmd, s.fl, cs, c.id]);
  const cmdList = () => {
    const q = s.q.trim().toLowerCase();
    const A: [string, string, () => void][] = [['Add files', '', onAdd], ['Confirm the selected item', '↵', () => confirm(sel)], ['Edit the selected item', 'E', () => startEdit(sel)], ['Confirm all items both checks agree on', '⇧↵', acceptAll], ['Add dates to my calendar', 'C', openCal], ['Export: CSV', '', exportCsv], ['Export: calendar file (.ics)', '', openCal], ['Export: encrypted vault file, or import one', '', () => set({ panel: 'share' })], ['Engine: Rules only (free)', '', () => pickEngine('rules')], ['Engine: On-device AI (free)', '', () => pickEngine('device')], ['Engine: Cloud AI with your own key (pennies)', '', () => pickEngine('cloud')], ['Next 30 days', '', () => set({ view: 'home' })], ['Portfolio at a glance', '', () => set({ panel: 'portfolio' })], ['Settings', '', () => set({ panel: 'settings' })], ['What happens to my files?', '', () => set({ panel: 'files' })], ['Lock vault', '', onLock]];
    if (!cs.some(x => x.sample)) A.push(['Open the sample contract', '', onSample]);
    if (focus) for (const t of ['Add dates to my calendar', 'Export: calendar file (.ics)', 'Next 30 days', 'Portfolio at a glance', 'Settings', 'Lock vault']) { const i = A.findIndex(a => a[0] === t); if (i >= 0) A.splice(i, 1); }
    const L = (q ? A.filter(a => a[0].toLowerCase().includes(q)) : A).map(a => ({ t: a[0], k: a[1], run: a[2] }));
    const m = q.match(/^(?:p|page)?\s*\.?\s*(\d{1,3})$/); if (m && +m[1] >= 1 && +m[1] <= c.pages.length) L.unshift({ t: 'Go to page ' + m[1], k: '', run: () => goPage(+m[1]) });
    return L;
  };
  const L = s.cmd ? cmdList() : [];
  const rows = [...results.map(r => ({ run: () => { rememberQ(); if (r.cid !== c.id) setActive(r.cid); if (r.id) select(r.id, r.cid); else { set({ view: 'doc' }); setTimeout(() => goPage(r.page), 60); } } })), ...L];
  const rememberQ = () => { const q = s.q.trim(); if (q.length > 1) setDb(d => ({ ...d, recent: [q, ...d.recent.filter(x => x !== q)].slice(0, 3) })); };
  const ci = Math.min(s.ci, Math.max(0, rows.length - 1));
  const runRow = (i: number) => { const a = rows[i]; set({ cmd: false }); a?.run(); };

  const key = useRef<(e: KeyboardEvent) => void>(() => { });
  key.current = e => {
    const k = e.key, mod = e.metaKey || e.ctrlKey, t = e.target as HTMLElement, tag = t?.tagName || '';
    if (mod && (k === 'k' || k === 'K')) { e.preventDefault(); s.cmd ? set({ cmd: false }) : openCmd(); return; }
    if (k === 'Escape') { if (s.cmd || s.pop || s.panel || s.edit || s.track || s.sheet || s.find) { e.preventDefault(); set({ cmd: false, pop: '', panel: '', edit: null, track: null, sheet: false, find: false }); } return; }
    if (s.cmd) { if (k === 'ArrowDown') { e.preventDefault(); set({ ci: Math.min(rows.length - 1, ci + 1) }); } else if (k === 'ArrowUp') { e.preventDefault(); set({ ci: Math.max(0, ci - 1) }); } else if (k === 'Enter') { e.preventDefault(); runRow(ci); } return; }
    if (t?.id === 'editbox') { if (k === 'Enter') { e.preventDefault(); saveEdit(); } return; }
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || s.panel || s.track || mod || e.altKey || s.view !== 'doc') return;
    if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); const o = nav(); let i = o.indexOf(sel); i = k === 'ArrowDown' ? Math.min(o.length - 1, i + 1) : Math.max(0, i - 1); if (o.length) select(o[Math.max(0, i)]); return; }
    if ((tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') && (k === 'Enter' || k === ' ')) return;
    if (k === 'Enter' && e.shiftKey) { e.preventDefault(); acceptAll(); return; }
    if (k === 'Enter') { e.preventDefault(); confirm(sel); return; }
    if (k === 'e' || k === 'E') { e.preventDefault(); startEdit(sel); return; }
    if (k === 'c' || k === 'C') { e.preventDefault(); openCal(); return; }
    const it = IT(sel); if ((k === '1' || k === '2') && it?.conf && it.ai !== undefined && c.conf[sel] === undefined) { upd(x => ({ ...x, pick: { ...x.pick, [sel]: +k - 1 } })); trace(sel, it.conf[+k - 1].qid); }
  };
  useEffect(() => { const f = (e: KeyboardEvent) => key.current(e); addEventListener('keydown', f); return () => removeEventListener('keydown', f); }, []);
  useEffect(() => { if (s.view === 'doc' && sel) trace(sel); }, [c.id, s.view]);

  const act = s.hov || sel, aq = s.hov ? s.hq : '';
  const card = (id: number) => {
    const it = IT(id)!, k = eff(it), cf = c.conf[id], user = cf !== undefined, on = sel === id, pk = c.pick[id], hist = c.hist[id] || [], both = it.ai !== undefined, editing = s.edit?.id === id, isConf = !!it.conf && !user && both;
    return <article key={id} className={on ? 'it on' : 'it'} aria-current={on} aria-labelledby={'h' + id} onClick={() => (on && !narrow()) || select(id)} onMouseEnter={() => hover(id)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><Chip k={k} user={user ? (cf.how === 'edited' ? 'Edited by you' : 'Confirmed by you') : undefined} /><button className="ref num" onClick={() => select(id)}>{it.ref}</button></div>
      <h3 id={'h' + id}>{it.sentence}</h3>
      {focus && (() => { const k = classify(it.quote); const f = it.fact ? Object.entries(it.fact).filter(([x]) => x !== 'cls').map(([x, v]) => `${x} ${Array.isArray(v) ? v.join('+') : v}`).join(', ') : ''; return <dl className="meta" style={{ fontSize: 14, background: '#F4F4F4', borderRadius: 8, padding: '8px 10px' }}><dt>Source</dt><dd className="num">{c.pages.find(p => p.n === it.page)?.file} · {it.ref}</dd><dt>Rules read</dt><dd className="num">{it.fact ? `${it.fact.cls}: ${f}` : 'from the sample data'}</dd><dt>Classifier</dt><dd className="num">{k[0].cls} {Math.round(k[0].p * 100)}% · {k[1].cls} {Math.round(k[1].p * 100)}%</dd><dt>2nd check</dt><dd>{it.aiNote ?? it.ai ?? 'not run (Rules only)'}</dd></dl>; })()}
      <dl className="meta"><dt>Who</dt><dd>{it.who}</dd><dt>{it.kind === 'money' ? 'Amount' : 'What'}</dt><dd className="num">{user ? cf.v : it.value}</dd><dt>When</dt><dd className="num">{it.due}</dd></dl>
      {!isConf && <blockquote className="qt">“{it.quote}”</blockquote>}
      {!isConf && !user && (it.aiNote ? <p className="why">{it.aiNote}</p> : <p className="why num">Rules check: {it.rules} · Second check: {both ? it.ai : 'off'}</p>)}
      {isConf && <div className="side" role="radiogroup" aria-label="The two checks disagree. Pick one.">{it.conf!.map((d, j) => <button key={j} className="sd" role="radio" aria-checked={pk === j} style={{ borderColor: pk === j ? '#111' : '#E3E3E3' }} onClick={e => { e.stopPropagation(); upd(x => ({ ...x, pick: { ...x.pick, [id]: j } })); set({ sel: id }); trace(id, d.qid); }} onMouseEnter={e => { e.stopPropagation(); hover(id, d.qid); }}><span className="faint" style={{ fontSize: 14 }}><kbd>{j + 1}</kbd> {d.by}</span><span className="v num">{d.v}</span><q>{d.quote}</q><span className="num" style={{ fontSize: 14, fontWeight: 600 }}>{d.ref} · {d.note}</span><span style={{ fontSize: 14, fontWeight: 600, textDecoration: 'underline' }}>{pk === j ? 'Chosen' : 'Use this'}</span></button>)}</div>}
      {it.formula && <><button className="ref" aria-expanded={s.formula === id} onClick={e => { e.stopPropagation(); set({ formula: s.formula === id ? 0 : id }); }} style={{ alignSelf: 'flex-start', minHeight: 32 }}>{s.formula === id ? 'Hide how' : 'How was this worked out?'}</button>{s.formula === id && <><ol className="fx num">{it.formula.map((t, j) => <li key={j} style={{ animationDelay: j * 0.18 + 's' }}>{t}</li>)}</ol><Nla>Computed date. Not legal advice. Check the clause before you rely on it.</Nla></>}</>}
      {editing && <div className="edit" onClick={e => e.stopPropagation()}><b>{s.edit!.kind === 'wrong' ? 'What does the contract really say?' : 'Edit this item'}</b><label htmlFor="editbox" className="vh">Correct value</label><input id="editbox" value={s.editVal} onChange={e => set({ editVal: e.target.value })} placeholder="For example, $5,000" /><div className="acts"><button className="b pri" onClick={saveEdit}>Save <kbd>↵</kbd></button><button className="b q" onClick={() => set({ edit: null })}>Cancel</button></div></div>}
      {!user && !editing && <div className="acts" onClick={e => e.stopPropagation()}>{k !== 'r' ? <><button className="b pri" onClick={() => confirm(id)}>Confirm <kbd>↵</kbd></button><button className="b" onClick={() => startEdit(id)}>Edit <kbd>E</kbd></button></> : <button className="b pri" onClick={() => startEdit(id)}>Enter what it says <kbd>E</kbd></button>}<button className="b q" onClick={() => startEdit(id, 'wrong')}>This is wrong</button><button className="b q" onClick={() => dismiss(id)}>Dismiss</button></div>}
      {hist.length > 0 && <details onClick={e => e.stopPropagation()}><summary className="faint" style={{ cursor: 'pointer', minHeight: 32, fontSize: 14 }}>History ({hist.length})</summary><ul className="hist">{hist.map((h, j) => <li key={j}>{h}</li>)}</ul></details>}
    </article>;
  };
  // One item at a time: the selected one if it still needs you (or was picked from the confirmed list), else the first that does.
  const showId = needIds.includes(sel) || (doneIds.includes(sel) && s.showAgreed) ? sel : needIds[0], ni = Math.max(0, needIds.indexOf(showId));
  const agreedN = doneIds.filter(id => c.conf[id] === undefined).length, userN = doneIds.length - agreedN, ready = needIds.length === 0;
  // Strip: this contract while reading it, everything otherwise.
  const st = useMemo(() => strip(s.view === 'doc' ? [c] : cs), [cs, c, s.view]);
  const worst: Record<number, K> = {}; for (const it of c.items) { if (c.dis[it.id]) continue; const k = c.conf[it.id] ? 'g' : eff(it), r = { r: 3, y: 2, o: 2, g: 1 }; if (!worst[it.page] || r[worst[it.page]] < r[k]) worst[it.page] = k; }
  const fq = s.fq.trim().toLowerCase(); let fCount = 0;
  if (fq.length > 1) for (const p of c.pages) for (const pa of p.paras) fCount += paraText(pa).toLowerCase().split(fq).length - 1;
  const mark = (x: string) => { if (fq.length < 2) return x; const i = x.toLowerCase().indexOf(fq); return i < 0 ? x : <>{x.slice(0, i)}<mark className="qf">{x.slice(i, i + fq.length)}</mark>{x.slice(i + fq.length)}</>; };
  // Library
  const lib = cs.map(x => ({ ...x, cp: db.cpo[x.id] || x.cp })), uniq = (k: 'cp' | 'type' | 'year' | 'src') => [...new Set(lib.map(x => x[k]))];
  const nk = s.node, flt = (x: Contract) => nk === 'all' || (nk.startsWith('cp:') && x.cp === nk.slice(3)) || (nk.startsWith('type:') && x.type === nk.slice(5)) || (nk.startsWith('year:') && x.year === nk.slice(5)) || (nk.startsWith('src:') && x.src === nk.slice(4));
  const node = (key: string, label: string, n: number | string, ind = false, icon?: React.ReactNode) => <button key={key} className={(s.view === 'list' && nk === key) || (key === 'home' && s.view === 'home') ? 'tn on' : 'tn'} style={{ paddingLeft: ind ? 28 : 8 }} aria-current={(s.view === 'list' && nk === key) || (key === 'home' && s.view === 'home') ? 'page' : undefined}
    onClick={() => key === 'home' ? set({ view: 'home', sheet: false }) : key === 'portfolio' ? set({ panel: 'portfolio' }) : set({ view: 'list', node: key, sheet: false })}
    onDragOver={e => { if (key.startsWith('cp:')) e.preventDefault(); }} onDrop={e => { e.preventDefault(); const id = s.drag, x = cs.find(y => y.id === id); if (!x || !key.startsWith('cp:')) return; const prev = db.cpo[id]; setDb(d => ({ ...d, cpo: { ...d.cpo, [id]: key.slice(3) } })); set({ drag: '' }); say(`Remembered. ${x.name} now shows under ${key.slice(3)}.`, () => { setDb(d => { const o = { ...d.cpo }; if (prev) o[id] = prev; else delete o[id]; return { ...d, cpo: o }; }); setToast(null); }); }}><span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>{icon}{label}</span><span className="num">{n}</span></button>;
  const dupOf = lib.find((x, i) => !s.merged[x.id] && lib.findIndex(y => y.name === x.name && y.cp === x.cp && y.pages.length === x.pages.length) < i);
  const n30 = useMemo(() => next30(cs), [cs]);
  // Remove a file: its items and kept clauses go. The app shows Undo, which survives even when this was the last file.
  const removeContract = (id: string) => { const rest = cs.filter(y => y.id !== id); if (id === c.id && rest[0]) setActive(rest[0].id); onRemove(id); };
  const open = (id: string) => { setActive(id); set({ view: 'doc', sel: 0, panel: '' }); };
  const pageWord = c.lines ? 'Line' : 'Page';

  return <div className="ws">
    <header className="top">
      <span className="wm">ContraClear</span><span className="ttl">{s.view === 'doc' ? c.name : s.view === 'home' ? 'Next 30 days' : 'Library'}</span>
      <div className="tr">
        <button className="ib" onClick={() => openCmd()} aria-label="Search all contracts or run a command (Control or Command K)" title="Search (⌘K)"><Search size={20} aria-hidden /></button>
        <button className="b" onClick={() => set({ pop: s.pop === 'exp' ? '' : 'exp' })} aria-haspopup="true" aria-expanded={s.pop === 'exp'}><Download size={18} aria-hidden />Export</button>
        {s.pop === 'exp' && <div className="pop" role="menu" aria-label="Export">
          <button className="opt" role="menuitem" onClick={exportCsv}><FileText size={20} aria-hidden /><div><b>CSV</b><span>Every item with its quote and page. Opens in Excel or Sheets.</span></div></button>
          <button className="opt" role="menuitem" onClick={openCal}><Calendar size={20} aria-hidden /><div><b>Calendar file (.ics)</b><span>Confirmed dates only, with a preview first.</span></div></button>
          <button className="opt" role="menuitem" onClick={() => set({ pop: '', panel: 'share' })}><KeyRound size={20} aria-hidden /><div><b>Encrypted vault file</b><span>To share with a teammate, or to import one. Send the share code separately.</span></div></button>
          <button className="opt" role="menuitem" onClick={() => { set({ pop: '' }); say('Google Sheets and the handover pack need Google, which isn’t connected on this copy yet. CSV has the same rows.'); }}><FileSpreadsheet size={20} aria-hidden /><div><b>Google Sheets and handover pack</b><span>Not connected on this copy yet. Use CSV for now.</span></div></button>
        </div>}
        {!focus && <button className="ib" onClick={onLock} aria-label="Lock vault" title="Lock vault"><Lock size={20} aria-hidden /></button>}
        {!focus && <button className="ib" onClick={() => set({ panel: 'settings', pop: '' })} aria-label="Settings" title="Settings"><Cog size={20} aria-hidden /></button>}
      </div>
    </header>
    {!focus && <>
    <section className="tls" aria-label="Next 90 days">
      <div className="tsum"><span className="faint">Next 90 days{s.view === 'doc' ? '' : ' · all contracts'}</span><br /><b className="num">{st.total} due</b><br /><span className="num">{st.payDays} {st.payDays === 1 ? 'payment day' : 'payment days'}{st.cancel ? ` · cancel by ${st.cancel}` : ''}</span></div>
      <div className="track"><div className="ln" /><span className="today">Today</span>
        {st.marks.map(m => <button key={m.key} className={`mk ${m.up ? 'up' : 'dn'}${act === m.id && c.id === m.cid ? ' on' : ''}`} style={{ left: m.l }} onClick={() => select(m.id, m.cid)} onMouseEnter={() => m.cid === c.id && s.view === 'doc' && hover(m.id)} aria-label={`${m.d}, ${m.a}. ${m.tip}`}><span className="tk" /><span className="num">{m.d}</span><b className="num">{m.a}{m.warn && <TriangleAlert size={14} color={COL.y[0]} aria-hidden />}</b><span className="tip">{m.tip}</span></button>)}
      </div>
    </section>
    </>}
    <div className="main" style={{ ['--lw' as any]: s.left ? '272px' : '64px' }}>
      {s.view === 'doc' && <aside className="needs" aria-label="What needs you" onMouseLeave={() => { hk.current = ''; set({ hov: 0, hq: '' }); }}>
        {needIds.length > 0 ? <section className="sec" aria-labelledby="nh"><div className="sech"><h2 id="nh">To confirm</h2><span className="pager"><button className="ib" aria-label="Previous item" disabled={ni <= 0} onClick={() => select(needIds[ni - 1])}><ChevronLeft size={18} aria-hidden /></button><span className="num" aria-live="polite">{ni + 1} of {needIds.length}</span><button className="ib" aria-label="Next item" disabled={ni >= needIds.length - 1} onClick={() => select(needIds[ni + 1])}><ChevronRight size={18} aria-hidden /></button></span></div>{card(showId)}</section>
          : <div className="sec"><div className="sech"><h2>{c.items.length ? 'Nothing needs your check' : 'No amounts, dates or deadlines found'}</h2></div>{!c.items.length && <span className="mute">The rules check found nothing it could be sure of. Select wording in the contract to track it yourself.</span>}</div>}
        {doneIds.length > 0 && <section className="sec" aria-label="Confirmed">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="line" style={{ flex: '1 1 220px' }} onClick={() => set({ showAgreed: !s.showAgreed })} aria-expanded={s.showAgreed}><CircleCheck size={20} color={COL.g[0]} aria-hidden /><span style={{ flex: 1 }} className="num">{[agreedN ? `${agreedN} confirmed by both checks` : '', userN ? `${userN} by you` : ''].filter(Boolean).join(' · ')}</span><span className="faint">{s.showAgreed ? 'Hide' : 'Show'}</span></button>
            {!c.accepted && agreedN > 0 && <button className="b" onClick={acceptAll}>Confirm all <kbd>⇧↵</kbd></button>}{c.accepted && agreedN > 0 && <span className="faint" style={{ alignSelf: 'center' }}>Confirmed by you</span>}</div>
          {s.showAgreed && <div style={{ display: 'grid', gap: 2 }}>{doneIds.map(id => { const it = IT(id)!, cf = c.conf[id]; return <button key={id} className={sel === id ? 'row on' : 'row'} onClick={() => select(id)} onMouseEnter={() => hover(id)} aria-label={`${it.sentence}. ${cf ? cf.v : it.value}. ${cf ? 'Confirmed by you' : 'Both checks agree'}. ${it.ref}`}><span>{cf ? <UserCheck size={18} aria-hidden /> : <CircleCheck size={18} color={COL.g[0]} aria-hidden />}</span><span>{it.sentence}<small className="num">{it.ref} · {cf ? 'by you' : 'both checks'}</small></span><b className="num">{cf ? cf.v : it.value}</b></button>; })}</div>}
        </section>}
        {c.tracked.length > 0 && <section className="sec"><div className="sech"><h2>Tracked by you</h2></div>{c.tracked.map(t => <div className="it" key={t.id} style={{ borderStyle: 'dashed', cursor: 'default' }}><span className="chip" style={{ borderColor: '#111', borderStyle: 'dashed', alignSelf: 'flex-start' }}><TextSelect size={16} aria-hidden />{t.kind} · tracked by you</span><b>{t.title}</b><span className="mute num">{t.who} · reminder {t.rem} · p. {t.page}</span></div>)}</section>}
        <section className="sec" aria-label="Not found in this contract">
          {c.nf.length ? <button className="line" onClick={() => set({ showNF: !s.showNF })} aria-expanded={s.showNF}><SearchX size={20} aria-hidden /><span style={{ flex: 1 }}>Not found in this contract: {c.nf.length}</span><span className="faint">{s.showNF ? 'Hide' : 'Show'}</span></button> : c.items.length > 0 && <span className="faint">We found everything we looked for.</span>}
          {s.showNF && <div style={{ display: 'grid', gap: 12 }}>{c.nf.map(n => <div key={n.t} style={{ padding: '4px 12px', display: 'grid', gap: 6 }}><b style={{ fontWeight: 600 }}>{n.t}</b><span className="mute">{n.d}</span><div className="acts"><button className="b" onClick={() => set({ hint: true, sheet: narrow() })}><Plus size={18} aria-hidden />Track this</button><button className="b q" onClick={() => openCmd(n.s)}>Search “{n.s}”</button></div></div>)}</div>}
        </section>
        {disIds.length > 0 && <section className="sec"><div className="sech"><h2>Dismissed</h2></div>{disIds.map(id => <div key={id} className="row" style={{ gridTemplateColumns: '1fr auto', cursor: 'default' }}><s className="mute">{IT(id)!.sentence}</s><button className="b q" onClick={() => upd(x => { const d = { ...x.dis }; delete d[id]; return { ...x, dis: d }; })}>Restore</button></div>)}</section>}
        {focus ? <div className="calb"><span className="faint" style={{ fontSize: 14 }}>↑ ↓ move · ↵ confirm · E edit · ⌘K search</span></div> : <>
        <div className="calb">
          {ready && calEvents([c]).length > 0 ? <><button className="b pri" onClick={openCal} style={{ minHeight: 52, fontSize: 17 }}><CalendarPlus size={20} aria-hidden />Add dates to my calendar <kbd>C</kbd></button><Nla /></>
            : ready ? <span className="mute">No dated items to add to a calendar.</span>
            : <><span className="mute num">Check {needIds.length} more to add your dates to a calendar.</span><span className="faint" style={{ fontSize: 14 }}>↑ ↓ move · ↵ confirm · E edit · ⌘K everything</span></>}
        </div>
        </>}
      </aside>}
      {s.view === 'doc' && <section className={s.sheet ? 'docw sheet' : 'docw'} id="docw" aria-label="Document preview">
        <div className="doc" id="doc" onScroll={onScroll} onMouseUp={onUp} tabIndex={0} aria-label="Original contract text">
          <div className="tbar" role="toolbar" aria-label="Preview tools">
            <button className="ib closeS" onClick={() => set({ sheet: false })} aria-label="Close preview"><X size={20} aria-hidden /></button>
            <button className="ib" onClick={() => goPage(s.page - 1)} aria-label={`Previous ${pageWord.toLowerCase()}`}><ChevronLeft size={20} aria-hidden /></button><span className="num" style={{ minWidth: 96, textAlign: 'center', whiteSpace: 'nowrap' }}>{pageWord} {s.page} of {c.pages.length}</span><button className="ib" onClick={() => goPage(s.page + 1)} aria-label={`Next ${pageWord.toLowerCase()}`}><ChevronRight size={20} aria-hidden /></button>
            <button className="ib" onClick={() => set({ zoom: Math.max(50, s.zoom - 25) })} aria-label="Zoom out"><ZoomOut size={20} aria-hidden /></button><span className="num faint" style={{ minWidth: 48, textAlign: 'center' }}>{s.zoom}%</span><button className="ib" onClick={() => set({ zoom: Math.min(200, s.zoom + 25) })} aria-label="Zoom in"><ZoomIn size={20} aria-hidden /></button>
            <button className="ib" onClick={() => set({ thumbs: !s.thumbs })} aria-pressed={s.thumbs} aria-label="Thumbnails"><LayoutGrid size={20} aria-hidden /></button>
            <button className="ib" onClick={() => { set({ find: !s.find, fq: '' }); setTimeout(() => document.getElementById('findin')?.focus(), 30); }} aria-pressed={s.find} aria-label="Find in document"><Search size={20} aria-hidden /></button>
            {s.find && <><label htmlFor="findin" className="vh">Find in document</label><input id="findin" value={s.fq} placeholder="Find in document" onChange={e => { const v = e.target.value; set({ fq: v }); const ql = v.trim().toLowerCase(); if (ql.length > 1) { const p = c.pages.find(p => p.paras.some(pa => paraText(pa).toLowerCase().includes(ql))); if (p) goPage(p.n); } }} /><span className="faint num" role="status">{fq.length > 1 ? `${fCount} ${fCount === 1 ? 'match' : 'matches'}` : ''}</span></>}
            <span className="sp" /><span className="faint fn" style={{ fontSize: 14 }}>{(c.pages[s.page - 1] || c.pages[0])?.file}</span>
            <button className="ib" onClick={() => window.print()} aria-label="Print"><Printer size={20} aria-hidden /></button>
            <button className="ib" onClick={() => { download(c.name.replace(/[^\w]+/g, '_') + '.txt', c.pages.map(p => `--- ${pageWord} ${p.n} ---\n` + p.paras.map(paraText).join('\n\n')).join('\n\n'), 'text/plain'); say('Saved the contract’s text. ContraClear doesn’t keep the original file.'); }} aria-label="Download the contract text"><Download size={20} aria-hidden /></button>
          </div>
          {s.thumbs && <div className="thumbs">{c.pages.map(p => <button key={p.n} className={s.page === p.n ? 'thm on num' : 'thm num'} onClick={() => goPage(p.n)} aria-label={`${pageWord} ${p.n}${worst[p.n] ? ', has items' : ''}`} style={worst[p.n] && s.page !== p.n ? { borderColor: COL[worst[p.n]][0] } : undefined}>{p.n}</button>)}</div>}
          {c.ocr && <div className="hintc" style={{ borderStyle: 'solid', borderColor: '#E3E3E3' }}><ScanText size={20} aria-hidden /><span style={{ flex: 1 }}>Scanned file. The text was read by OCR on this device, so check the wording carefully.</span></div>}
          {c.slim && <div className="hintc" style={{ borderStyle: 'solid', borderColor: '#E3E3E3' }}><Library size={20} aria-hidden /><span style={{ flex: 1 }}>Only the clauses ContraClear found are kept, with their file, page and section. The rest of this contract’s text isn’t stored.</span></div>}
          {s.hint && <div className="hintc"><TextSelect size={20} aria-hidden /><span style={{ flex: 1 }}>Select the wording in the contract, then choose Date, Amount or Duty.</span><button className="b q" onClick={() => set({ hint: false })}>Got it</button></div>}
          <div className="col" style={{ zoom: s.zoom / 100 }}>{c.pages.map(p => <section className="pg" id={'pg' + p.n} key={p.n} aria-label={`${pageWord} ${p.n}`}><div className="pgn num">{p.file} · {pageWord.toUpperCase()} {p.n}</div>{p.h && <h2>{p.h}</h2>}{c.slim && !p.paras.length && <p className="faint" style={{ margin: 0 }}>Nothing on this page was kept.</p>}
            {p.paras.map((pa, i) => <p className="cp" key={i}>{pa.lead && <><b>{pa.lead}</b>{' '}</>}{pa.segs.flatMap((sg, j) => {
              const it = sg.q ? IT(sg.q) : undefined, on = !!it && sg.q === act && (!aq || aq === sg.qid), hl = on ? (c.conf[sg.q] ? '#E3E3E3' : COL[eff(it!)][1]) : 'transparent';
              const tr = c.tracked.find(t => t.page === p.n && sg.x.includes(t.txt)), base = { className: it ? (on ? 'q on' : 'q') : undefined, style: { ['--hl' as any]: hl, background: hl }, onClick: it ? () => select(sg.q) : undefined };
              if (!tr) return [<span key={j} id={sg.qid || undefined} {...base}>{mark(sg.x)}</span>];
              const k = sg.x.indexOf(tr.txt); return [<span key={j + 'a'} id={sg.qid || undefined} {...base}>{sg.x.slice(0, k)}</span>, <span key={j + 'b'} className="tq">{tr.txt}</span>, <span key={j + 'c'} {...base}>{sg.x.slice(k + tr.txt.length)}</span>];
            })}</p>)}</section>)}</div>
        </div>
        {!s.thumbs && c.pages.length > 1 && c.pages.length <= 60 && <nav className="rail" style={{ top: 72 }} aria-label="Page map">{c.pages.map(p => <button key={p.n} className={s.page === p.n ? 'rt on' : 'rt'} onClick={() => goPage(p.n)} aria-label={`${pageWord} ${p.n}${worst[p.n] ? ', has items' : ''}`}><i style={{ width: s.page === p.n ? 18 : 10 }} />{worst[p.n] && <s style={{ background: COL[worst[p.n]][0] }} />}</button>)}</nav>}
        {s.track?.step === 'menu' && <div className="tmenu" style={{ left: s.track.x, top: s.track.y }} role="menu" aria-label="Track this text"><span className="faint" style={{ alignSelf: 'center', padding: '0 6px', fontSize: 14 }}>Track as</span><button className="b" onClick={() => trackKind('Date')}><Calendar size={18} aria-hidden />Date</button><button className="b" onClick={() => trackKind('Amount')}><DollarSign size={18} aria-hidden />Amount</button><button className="b" onClick={() => trackKind('Duty')}><ListChecks size={18} aria-hidden />Duty</button></div>}
        {s.track?.step === 'form' && <div className="tmenu tform" style={{ left: s.track.x, top: s.track.y }} role="dialog" aria-label={`Track this ${s.track.kind}`}><b>Track this {s.track.kind}</b><span className="faint" style={{ fontSize: 14 }}>“{s.track.txt.length > 90 ? s.track.txt.slice(0, 90) + '…' : s.track.txt}”</span>
          <label htmlFor="trt">Title</label><input id="trt" autoFocus value={s.track.title} onChange={e => set({ track: { ...s.track!, title: e.target.value } })} />
          <label htmlFor="trw">Who owes</label><select id="trw" value={s.track.who} onChange={e => set({ track: { ...s.track!, who: e.target.value } })}><option>You</option><option>The other party</option><option>Both</option></select>
          <label htmlFor="trr">Reminder</label><select id="trr" value={s.track.rem} onChange={e => set({ track: { ...s.track!, rem: e.target.value } })}><option>2 weeks before</option><option>2 days before</option><option>No reminder</option></select>
          <div className="acts"><button className="b pri" onClick={trackSave}>Track</button><button className="b q" onClick={() => set({ track: null })}>Cancel</button></div></div>}
      </section>}
      {s.view === 'list' && <section className="docw lvw" style={{ overflow: 'auto', gridColumn: '2 / 4' }} aria-label="Library list"><div className="lv">
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 500 }}>{nk === 'all' ? 'All contracts' : nk.split(':')[1]}</h1>
        {dupOf && <div className="bn"><Copy size={20} aria-hidden /><span style={{ flex: 1 }}>Same contract found in two places: <b>{dupOf.name}</b>.</span><button className="b" onClick={() => { setDb(d => ({ ...d, contracts: d.contracts.filter(x => x.id !== dupOf.id) })); if (active === dupOf.id) setActive(cs.find(x => x.id !== dupOf.id)!.id); say('Merged. One copy kept.'); }}>Merge</button><button className="b q" onClick={() => set({ merged: { ...s.merged, [dupOf.id]: true } })}>Keep both</button></div>}
        <table className="lt"><thead><tr><th>Name</th><th>Counterparty</th><th>Type</th><th>Next deadline</th><th>Status</th></tr></thead><tbody>
          {lib.filter(flt).map(x => { const z = status(x); return <tr className="r" key={x.id} draggable onDragStart={() => set({ drag: x.id })} onClick={() => open(x.id)} onKeyDown={e => e.key === 'Enter' && open(x.id)} tabIndex={0}><td><b style={{ fontWeight: 600 }}>{x.name}</b>{x.sample && <span className="faint" style={{ display: 'block', fontSize: 14 }}>Sample contract</span>}</td><td>{x.cp}</td><td>{x.type}</td><td className="num">{z.next}</td><td><Chip k={z.k} label={z.label} /></td></tr>; })}
        </tbody></table>
        {lib.filter(flt).length === 1 && <div className="faint">One contract here. Drop more anywhere to add them.</div>}{lib.filter(flt).length === 0 && <div className="faint">Nothing here yet.</div>}
        <div className="faint" style={{ fontSize: 14 }}>Sorted automatically. Drag a row onto a counterparty on the left to move it.</div>
      </div></section>}
      {s.view === 'home' && <section className="docw lvw" style={{ overflow: 'auto', gridColumn: '2 / 4' }} aria-label="Next 30 days"><div className="hv">
        <button className="cbar" style={{ background: '#fff', cursor: 'pointer', font: 'inherit', textAlign: 'left' }} onClick={onAdd}><Plus size={20} aria-hidden />Drop contracts here, or choose files</button>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 500, letterSpacing: '-0.02em' }}>Next 30 days</h1>
        {n30.length ? <div>{n30.map(n => <button className="n30" key={n.key} onClick={() => select(n.id, n.cid)}><b className="num" style={{ fontSize: 20 }}>{n.d}</b><span><b style={{ fontWeight: 600 }}>{n.t}</b><span className="mute" style={{ display: 'block' }}>{n.c}{n.act && ` · ${n.act}`}</span></span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><KIcon k={n.k} /><span className="vh">{n.k === 'g' ? 'Checked' : COL[n.k][2]}</span><b className="num" style={{ fontSize: 20 }}>{n.a}</b></span></button>)}</div>
          : <div style={{ padding: '48px 0', fontSize: 20 }}>Nothing needs you in the next 30 days.{allLeft > 0 && <div className="mute" style={{ fontSize: 16, marginTop: 8 }}>{allLeft} {allLeft === 1 ? 'item is' : 'items are'} still waiting for your check.</div>}</div>}
        {db.calPrompt && allLeft === 0 && calEvents(cs).length > 0 && <div className="bn" style={{ borderColor: '#E3E3E3' }}><CalendarDays size={20} aria-hidden /><span style={{ flex: 1 }}>Your dates aren’t in a calendar yet.</span><button className="b" onClick={() => set({ panel: 'cal' })}>Add them</button><button className="b q" onClick={() => setDb(d => ({ ...d, calPrompt: false }))}>Not now</button></div>}
      </div></section>}
      <nav className="list" aria-label="Library">
        <div className="lh"><span>Files</span><span className="num">{cs.length}</span></div>
        <div style={{ display: 'grid', gap: 4 }}>{lib.map(x => { const z = status(x), ext = (x.files[0] || '').split('.').pop()!.toLowerCase(), on = s.view === 'doc' && x.id === c.id; return <div key={x.id} className="flrow"><button className={on ? 'fl on' : 'fl'} aria-current={on || undefined} onClick={() => open(x.id)}><span className="fi" aria-hidden><FileIcon size={30} strokeWidth={1.3} /><i>{ext === 'pdf' ? 'PDF' : ext === 'docx' ? 'W' : 'TXT'}</i></span><span className="fn2">{x.files[0] || x.name}<small><s style={{ background: COL[z.k][0] }} />{z.label.replace('to check', 'to review')}</small></span></button><button className="ib fdel" aria-label={`Remove ${x.files[0] || x.name}`} title="Remove" onClick={() => removeContract(x.id)}><Trash2 size={18} aria-hidden /></button></div>; })}</div>
        <button className="fl" style={{ marginTop: 8 }} onClick={onAdd}><span className="fi" aria-hidden><Plus size={22} /></span><span className="fn2">Add files</span></button>
        <div className="fnote"><Lock size={16} aria-hidden /><span>Files stay on this device. <button className="ref" onClick={() => set({ panel: 'files' })}>How it works</button></span></div>
      </nav>
    </div>
    <Badge />
    {s.cmd && <div className="ov" onClick={() => set({ cmd: false })}><div className="modal" role="dialog" aria-modal="true" aria-label="Search and commands" onClick={e => e.stopPropagation()}>
      <label htmlFor="cmdin" className="vh">Search all contracts or type a command</label><input id="cmdin" className="cin" value={s.q} onChange={e => set({ q: e.target.value, ci: 0 })} placeholder="Search all contracts, or type a command" autoComplete="off" role="combobox" aria-expanded aria-controls="cmdl" aria-activedescendant={rows.length ? 'cr' + ci : undefined} />
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', flexWrap: 'wrap' }}>{([['c', `${c.name} only`], ['d', 'Dated items only']] as const).map(([k, t]) => <button key={k} className="chip" style={{ borderColor: s.fl[k] ? '#111' : '#E3E3E3', fontWeight: s.fl[k] ? 600 : 400, background: '#fff', cursor: 'pointer', minHeight: 32, paddingLeft: 10 }} aria-pressed={s.fl[k]} onClick={() => set({ fl: { ...s.fl, [k]: !s.fl[k] }, ci: 0 })}>{t}</button>)}</div>
      {s.q.trim().length < 2 && <div style={{ padding: '4px 20px' }} className="faint">{db.recent.length ? <>Recent: {db.recent.map(r => <button key={r} className="ref" style={{ marginRight: 12, fontWeight: 500 }} onClick={() => set({ q: r, ci: 0 })}>{r}</button>)}</> : 'No recent searches.'}</div>}
      <ul className="cl" id="cmdl" role="listbox" aria-label="Results and commands">
        {results.map((x, i) => <li key={'r' + i} role="option" id={'cr' + i} aria-selected={i === ci}><button className="cr" tabIndex={-1} style={{ background: i === ci ? '#F4F4F4' : '#fff', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }} onClick={() => runRow(i)}><b style={{ fontWeight: 600 }}>{x.sum}</b><span style={{ font: "400 15px/1.5 'Source Serif 4 Variable','Source Serif 4',Georgia,serif", color: '#333' }}>“{x.x}”</span><span className="faint num" style={{ fontSize: 14 }}>{x.cn} · {cs.find(y => y.id === x.cid)?.lines ? 'line' : 'p.'} {x.page}</span></button></li>)}
        {L.map((a, i) => <li key={a.t} role="option" id={'cr' + (i + results.length)} aria-selected={i + results.length === ci}><button className="cr" tabIndex={-1} style={{ background: i + results.length === ci ? '#F4F4F4' : '#fff' }} onClick={() => runRow(i + results.length)}><span>{a.t}</span>{a.k && <kbd>{a.k}</kbd>}</button></li>)}
      </ul>
      {s.q.trim().length >= 2 && results.length === 0 && <div style={{ padding: '12px 20px', display: 'grid', gap: 8 }} role="status"><span>No wording matches “{s.q.trim()}” in {cs.length} {cs.length === 1 ? 'contract' : 'contracts'}.</span><div className="acts"><button className="b" onClick={() => set({ cmd: false, hint: true, view: 'doc' })}>Track this yourself</button>{(s.fl.c || s.fl.d) && <button className="b q" onClick={() => set({ fl: { c: false, d: false } })}>Search more broadly</button>}</div></div>}
      <div style={{ padding: '10px 20px', borderTop: '1px solid #E3E3E3' }} className="faint">↑ ↓ move · ↵ open · Esc close · keyword search, on this device</div>
    </div></div>}
    {s.panel === 'cal' && <CalendarPanel cs={s.view === 'doc' ? [c] : cs} rem={db.settings.rem} onClose={() => set({ panel: '' })} say={say} />}
    {s.panel === 'portfolio' && <PortfolioPanel cs={lib} onClose={() => set({ panel: '' })} onOpen={open} />}
    {s.panel === 'settings' && <SettingsPanel s={db.settings} set={p => setDb(d => ({ ...d, settings: { ...d.settings, ...p } }))} onClose={() => set({ panel: '' })} onEngine={() => set({ panel: '', pop: 'eng' })} onSignOut={onSignOut} onDelete={() => { set({ panel: '' }); onDelete(); }} />}
    {s.panel === 'files' && <FilesPanel onClose={() => set({ panel: '' })} />}
    {s.panel === 'cloud' && <EnginePanel onClose={() => set({ panel: '' })} />}
    {s.panel === 'share' && <SharePanel onClose={() => set({ panel: '' })} say={say} onImport={(d, mode) => { setDb(o => mode === 'replace' ? d : { ...o, contracts: [...o.contracts, ...d.contracts.filter(x => !o.contracts.some(y => y.id === x.id))] }); if (mode === 'replace' && d.contracts[0]) setActive(d.contracts[0].id); say(mode === 'replace' ? 'Vault replaced with the file.' : 'Merged. Contracts already here were kept as they are.'); }} />}
    {toast && <div className="toast" role="status">{toast.m}{toast.undo && <button onClick={toast.undo} style={{ marginLeft: 12, background: 'none', border: 0, color: '#fff', textDecoration: 'underline', cursor: 'pointer', fontWeight: 600, minHeight: 32 }}>Undo</button>}</div>}
  </div>;
}
