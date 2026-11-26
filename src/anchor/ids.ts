// Deterministic IDs: BLAKE3, truncated to 96 bits, base32 (RFC 4648 alphabet, lowercase, no padding).
import { blake3 } from '@noble/hashes/blake3.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import type { AnchorOptions, Clause } from './types';
import { DEFAULTS } from './types';
import { NORMALIZER_VERSION, splitLabel } from './normalize';
import { segment } from './segment';
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
function base32(bytes: Uint8Array): string { let out = '', bits = 0, val = 0; for (const b of bytes) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } val &= 0xff; } if (bits > 0) out += B32[(val << (5 - bits)) & 31]; return out; }
/** 96-bit BLAKE3 → 20 base32 characters. A domain tag keeps clause and version hashes apart. */
export const hash96 = (domain: string, s: string) => base32(blake3(utf8ToBytes(`contraclear:${domain}:n${NORMALIZER_VERSION}\u0000${s}`), { dkLen: 12 }));
/** The clause's identity: its normalized text without the leading label. Unique only within a docId. */
export const clauseIdOf = (exact: string) => hash96('clause', splitLabel(exact).body);
/** The version's identity: the ordered (or, if order doesn't count, sorted) list of clauseIds. */
export const versionIdOf = (clauseIds: string[], orderSensitive = true) => hash96('version', (orderSensitive ? clauseIds : [...clauseIds].sort()).join('\n'));
export const publicId = (c: Pick<Clause, 'docId' | 'versionId' | 'clauseId'>) => `${c.docId}:${c.versionId.slice(0, 8)}:${c.clauseId.slice(0, 12)}`;
/** Segment a normalized document and give every clause its ID, context, occurrence and label. */
export function buildClauses(normText: string, docId: string, opts: Partial<AnchorOptions> = {}): Clause[] {
  const o = { ...DEFAULTS, ...opts }, segs = segment(normText), ids = segs.map(s => clauseIdOf(s.text)), versionId = versionIdOf(ids, o.orderSensitive), seen = new Map<string, number>();
  return segs.map((s, i) => { const occurrence = seen.get(ids[i]) ?? 0; seen.set(ids[i], occurrence + 1); const { label } = splitLabel(s.text);
    return { clauseId: ids[i], docId, versionId, exact: s.text, prefix: normText.slice(Math.max(0, s.start - o.contextChars), s.start), suffix: normText.slice(s.end, s.end + o.contextChars), position: s.start, ...(label ? { label } : {}), occurrence, normalizerVersion: NORMALIZER_VERSION }; });
}
