import { useEffect, useRef, useSyncExternalStore, type ReactNode, type CSSProperties } from 'react';
import { CircleCheck, TriangleAlert, OctagonX, UserCheck, Info } from 'lucide-react';
import { COL, type K } from '../lib/types';
import { net } from '../lib/net';
export const I = { size: 18, 'aria-hidden': true } as const;
export const KIcon = ({ k, size = 18 }: { k: K; size?: number }) => k === 'g' ? <CircleCheck size={size} color={COL.g[0]} aria-hidden /> : k === 'r' ? <OctagonX size={size} color={COL.r[0]} aria-hidden /> : <TriangleAlert size={size} color={COL.y[0]} aria-hidden />;
/** Confidence chip: colour is never alone, there is always an icon and the words. */
export function Chip({ k, user, label }: { k: K; user?: string; label?: string }) {
  if (user) return <span className="chip" style={{ borderColor: '#111', background: '#fff' }}><UserCheck size={16} aria-hidden />{user}</span>;
  return <span className="chip" style={{ borderColor: COL[k][0], background: COL[k][1] }}><KIcon k={k} size={16} />{label ?? COL[k][2]}</span>;
}
export const Nla = ({ children = 'Not legal advice. Check the clause before you act.' }: { children?: ReactNode }) => <span className="nla"><Info size={16} aria-hidden />{children}</span>;
/** Live network badge. The number is the real count of bytes this app has sent. */
export function Badge() {
  const sent = useSyncExternalStore(net.subscribe, net.sent);
  return <div className={sent ? 'badge pulse' : 'badge'} role="status" aria-live="polite"><i /><span>{sent ? 'Masked text sent to your provider' : 'Nothing leaves this device'}</span><b className="num">{sent.toLocaleString('en-CA')} bytes sent</b></div>;
}
export function Modal({ label, onClose, children, cls = '', style }: { label: string; onClose: () => void; children: ReactNode; cls?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const prev = document.activeElement as HTMLElement | null; const el = ref.current?.querySelector<HTMLElement>('[autofocus],input,select,textarea,button,a[href]'); el?.focus(); return () => prev?.focus?.(); }, []);
  const trap = (e: React.KeyboardEvent) => { if (e.key !== 'Tab') return; const f = [...ref.current!.querySelectorAll<HTMLElement>('input,select,textarea,button:not(:disabled),a[href],[tabindex="0"]')]; if (!f.length) return; const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } };
  return <div className="ov" onClick={onClose}><div ref={ref} className={'modal ' + cls} role="dialog" aria-modal="true" aria-label={label} onClick={e => e.stopPropagation()} onKeyDown={trap} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxHeight: 'calc(100vh - 120px)', overflow: 'auto', ...style }}>{children}</div></div>;
}
export const Steps = ({ items }: { items: ReactNode[] }) => <ol className="steps">{items.map((t, i) => <li key={i}><span className="sn num">{i + 1}</span><span>{t}</span></li>)}</ol>;
