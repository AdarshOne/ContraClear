// Masks names, amounts and addresses before anything goes to a cloud AI.
// The user sees the exact masked text and must approve it; that review is the real safeguard.
export interface Masker { mask: (t: string) => string; unmask: (t: string) => string }
const NUMW = '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|and)';
const COMPANY = /\b(?:[A-Z][\w&'’.-]*\s+){1,4}(?:Inc|Ltd|LLC|LLP|Corp|Corporation|Limited|Incorporated|Company|Co)\b\.?/g;
const STOP = new Set(['The', 'This', 'That', 'Client', 'Provider', 'Customer', 'Supplier', 'Landlord', 'Tenant', 'Vendor', 'Company', 'Agreement', 'Statement', 'Master', 'Services', 'Service', 'Between', 'And']);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Build one masker per contract so the same name or amount always gets the same placeholder. */
export function makeMasker(fullText: string, extraNames: string[] = []): Masker {
  const map = new Map<string, string>(), back = new Map<string, string>(), count: Record<string, number> = {};
  const tok = (kind: string, orig: string, letters = false) => { const k = kind + '|' + orig.toLowerCase(); let t = map.get(k); if (!t) { count[kind] = (count[kind] || 0) + 1; t = `[${kind} ${letters ? String.fromCharCode(64 + Math.min(26, count[kind])) : count[kind]}]`; map.set(k, t); back.set(t, orig); } return t; };
  // Names: companies found anywhere in the contract, plus their distinctive first word ("Brightwell").
  const names = new Map<string, string>();
  for (const full of [...(fullText.match(COMPANY) || []).map(s => s.trim().replace(/^(?:between|and|by|to|from|with|of)\s+/i, '')), ...extraNames.filter(n => n && !/^unknown/i.test(n))]) {
    const t = tok('PARTY', full.replace(/[.,]$/, ''), true); names.set(full.replace(/[.,]$/, ''), t);
    const first = full.split(/\s+/)[0]; if (first.length >= 4 && !STOP.has(first)) names.set(first, t);
  }
  const nameRe = names.size ? new RegExp('\\b(?:' + [...names.keys()].sort((a, b) => b.length - a.length).map(escapeRe).join('|') + ')\\b\\.?', 'g') : null;
  const mask = (t: string) => {
    let s = t;
    if (nameRe) s = s.replace(nameRe, m => names.get(m.replace(/\.$/, '')) || names.get(m) || m);
    s = s.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, m => tok('EMAIL', m));
    s = s.replace(/\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Way|Court|Crescent|Place|Parkway)\b\.?(?:,?\s+(?:Suite|Unit|Floor)\s+\w+)?/g, m => tok('ADDRESS', m));
    s = s.replace(/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/g, m => tok('ADDRESS', m));
    s = s.replace(new RegExp(`\\b(?:${NUMW}[\\s-]+)+dollars\\b`, 'gi'), '[AMOUNT IN WORDS]');
    s = s.replace(/(?:\b(?:CAD|USD|US|C)\s?)?\$\s?\d[\d,]*(?:\.\d{1,2})?(?:\s?(?:CAD|USD)\b)?/g, m => tok('AMOUNT', m.trim()));
    s = s.replace(/\+?\d[\d\s().-]{8,}\d/g, m => m.replace(/\D/g, '').length >= 10 ? tok('PHONE', m) : m);
    s = s.replace(/\b(Attention|Attn|Name|By|Signed by)(:\s*)([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+){1,2})/g, (_m, a, b, n) => a + b + tok('PERSON', n));
    return s;
  };
  const unmask = (t: string) => t.replace(/\[(?:PARTY|AMOUNT|ADDRESS|EMAIL|PHONE|PERSON) [A-Z0-9]+\]/g, m => back.get(m) ?? m);
  return { mask, unmask };
}
