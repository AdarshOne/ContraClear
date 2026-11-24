// Consent, download and first run for the on-device AI model (Flow 11.2).
import { useEffect, useState } from 'react';
import type { Contract } from '../lib/types';
import { canRunLlm, loadLlm, llmCheck, llmReady, MODEL_GB, MODEL_VRAM_GB } from '../lib/llm';
import { Modal } from './kit';
import { clearSecond } from '../lib/second';
export function LlmPanel({ cs, prov, onClose, onDone }: { cs: Contract[]; prov: string; onClose: () => void; onDone: (next: Contract[], msg: string) => void }) {
  const [ok, setOk] = useState<boolean | null>(null), [step, setStep] = useState<'ask' | 'load' | 'read' | 'err'>('ask'), [pct, setPct] = useState(0), [note, setNote] = useState(''), [err, setErr] = useState('');
  useEffect(() => { canRunLlm().then(setOk); }, []);
  const go = async () => {
    try {
      if (!llmReady()) { setStep('load'); await loadLlm((f, t) => { setPct(Math.round(f * 100)); setNote(t); }); }
      setStep('read'); const next: Contract[] = []; let agreed = 0, differ = 0, added = 0;
      for (const [i, c] of cs.filter(c => !c.sample).entries()) { const out = await llmCheck(clearSecond(c), prov, n => setNote(`${c.files[0] || c.name} (${i + 1} of ${cs.filter(c => !c.sample).length}): ${n}`)); next.push(out.contract); agreed += out.agreed; differ += out.differ; added += out.added; }
      onDone(next, `The on-device AI read ${next.length} ${next.length === 1 ? 'file' : 'files'}. Both checks agree on ${agreed}; ${differ} differ; it found ${added} more for you to confirm. Nothing left this device.`);
    } catch (e: any) { setErr(String(e?.message || e).split('\n')[0].slice(0, 200)); setStep('err'); }
  };
  return <Modal label="On-device AI" onClose={step === 'ask' || step === 'err' ? onClose : () => { }}>
    {step === 'ask' && <><h2 className="ph">Check with the on-device AI</h2>
      {ok === false ? <p className="pp">This browser can’t run it: it needs WebGPU and about {MODEL_VRAM_GB} GB of graphics memory. A recent Chrome or Edge on a laptop or desktop usually works. The quick check keeps working meanwhile.</p>
        : <><p className="pp">Qwen3.5 4B, a free open model, reads each important clause a second way: payments, renewals, conditions (“if… then…”) and tricky dates. It runs on this device. Nothing is sent.</p>
          <p className="pp">The first time, your browser downloads the model, about {MODEL_GB} GB, from Hugging Face, and keeps it for next time. It needs about {MODEL_VRAM_GB} GB of graphics memory. Reading takes a few seconds a clause.</p></>}
      <div className="acts">{ok !== false && <button className="b pri" autoFocus disabled={ok === null} onClick={go}>{llmReady() ? 'Check my files' : `Download ${MODEL_GB} GB and check`}</button>}<button className="b q" onClick={onClose}>{ok === false ? 'Close' : 'Not now'}</button></div></>}
    {step === 'load' && <><h2 className="ph" role="status">Getting the AI ready: {pct}%</h2><div className="prog" aria-hidden><i style={{ width: pct + '%' }} /></div><p className="faint" style={{ fontSize: 14, margin: 0 }}>{note || 'Downloading the model. This happens once in this browser.'}</p></>}
    {step === 'read' && <><h2 className="ph" role="status">Reading your files…</h2><p className="pp" style={{ margin: 0 }}>{note}</p></>}
    {step === 'err' && <><h2 className="ph" role="alert">The on-device AI couldn’t run here</h2><p className="pp">{err}. Nothing was sent. The quick check keeps working.</p><div className="acts"><button className="b pri" autoFocus onClick={onClose}>Close</button></div></>}
  </Modal>;
}
