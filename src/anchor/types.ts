/** A clause anchored with the W3C Web Annotation TextQuoteSelector pattern (exact + prefix + suffix). */
export interface Clause {
  /** blake3(normalized clause text, label stripped), 96-bit, base32. Unique only within a docId. */
  clauseId: string;
  /** Stable UUID per document family. */
  docId: string;
  /** blake3 of the ordered clauseIds of this version. */
  versionId: string;
  /** Normalized clause text, label included as it appears. */
  exact: string;
  /** Up to ~32 characters of normalized text before the clause. */
  prefix: string;
  /** Up to ~32 characters of normalized text after the clause. */
  suffix: string;
  /** Character offset into the normalized document. A hint only, never identity. */
  position: number;
  /** Display label such as "4.2" or "(a)". Never hashed. */
  label?: string;
  /** Index among clauses with the same clauseId in this version (0 for the first). */
  occurrence: number;
  /** clauseId of the edited successor, set when a later version resolves this clause by fuzzy match. */
  supersededBy?: string;
  /** The normalizer that produced this record. IDs are only comparable within one version of it. */
  normalizerVersion: number;
}
export interface Segment { text: string; start: number; end: number }
export interface AnchorOptions {
  /** When true (default), reordering clauses produces a new versionId. */
  orderSensitive: boolean;
  /** Minimum Jaccard overlap to treat a document as a new version of a known one. Default 0.7. */
  docThreshold: number;
  /** Minimum confidence to accept a fuzzy re-anchoring. Default 0.85. */
  resolveThreshold: number;
  /** Context length for prefix and suffix. Default 32. */
  contextChars: number;
}
export const DEFAULTS: AnchorOptions = { orderSensitive: true, docThreshold: 0.7, resolveThreshold: 0.85, contextChars: 32 };
export type Resolution =
  | { status: 'exact'; old: Clause; match: Clause; confidence: 1 }
  | { status: 'fuzzy'; old: Clause; match: Clause; confidence: number; successor: { from: string; to: string } }
  | { status: 'unresolved'; old: Clause; best?: Clause; confidence: number };
