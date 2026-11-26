# Clause anchoring (`src/anchor`)

Gives every clause a stable ID so its data (obligations, notes) can be found again after the file is renamed,
re-saved, updated or reordered. Never stores the original file or the whole document: only normalized clauses
with ~32 characters of context either side (the W3C Web Annotation TextQuoteSelector pattern).

## Public API
```ts
import { extract, normalizeDoc, buildClauses, identifyDoc, resolveMany, AnchorStore, publicId } from './anchor';

const text = normalizeDoc(await extract(file));          // pages joined by \f, then normalized
const store = await AnchorStore.open();                    // IndexedDB + in-memory Maps
const draft = buildClauses(text, 'pending');               // segment + hash
const { docId, isNew } = store.identify(draft.map(c => c.clauseId)); // ≥ 0.7 Jaccard overlap → same document family
const clauses = buildClauses(text, docId);
if (!isNew) {                                              // a new version: carry data over from the old clauses
  const results = resolveMany(store.latest(docId), text);  // or new AnchorWorker().resolveMany(...) off the main thread
  // 'exact' → same clause; 'fuzzy' → edited, with successor {from, to} and a confidence; 'unresolved' → ask a person
}
await store.saveVersion(clauses);
store.lookup(docId, clauseId);                             // instant exact lookup (Map get)
```
Options (`AnchorOptions`): `orderSensitive` (default true), `docThreshold` (0.7), `resolveThreshold` (0.85), `contextChars` (32).

## ID format
- `clauseId`: BLAKE3 of the normalized clause text **without its label**, truncated to 96 bits, 20 base32 characters
  (`a–z2–7`). Hash input is domain-tagged with the normalizer version. Unique **within a document only**:
  boilerplate clauses share a clauseId across documents, so always scope by `docId`.
- `versionId`: BLAKE3 of the ordered clauseIds (sorted instead if `orderSensitive: false`).
- `docId`: a random UUID, minted once per document family and reused for its later versions.
- Public ID: `${docId}:${versionId.slice(0,8)}:${clauseId.slice(0,12)}`.
- `occurrence` tells apart identical clauses in one document; `position` is a hint only.
- Every record carries `normalizerVersion`. Bump `NORMALIZER_VERSION` whenever normalization could change output.

## What normalization does
NFKC (also expands ligatures), curly quotes → straight, all dashes → `-`, odd spaces → space, soft hyphens and
zero-width characters removed, whitespace collapsed, end-of-line hyphenation joined. Short lines that repeat at the
top or bottom of most pages (3+ pages) are removed as running headers/footers, as are bare page numbers.
Leading numbering ("4.2", "(a)", "Section 7") is kept in `exact` and `label` but left out of the hash.
Headings such as "ARTICLE 2 FEES" belong to no clause (they appear only in the context).

## Known limitations
- **Scanned / OCR'd PDFs** produce noisy text: a single misread character changes the hash, so exact matches miss
  and fuzzy matching carries the load. Expect more `unresolved` results there.
- Header/footer detection needs at least 3 pages, and only removes short lines (≤ 70 characters) in the first or
  last two lines of a page. Word files have no real pages, so their headers usually aren't seen at all.
- Segmentation relies on numbering or headings; unnumbered contracts fall back to paragraphs, merging ones under 40
  characters into the next. Clauses split or merged by an edit show up as `unresolved`.
- Fuzzy matching compares text with diff-match-patch (edit distance). A clause that keeps its meaning but changes
  most of its words is reported `unresolved`, by design.
- `store.ts` saves clause text **unencrypted** in its own IndexedDB database. It is not yet wired to the app's
  encrypted vault, and it has no automated test yet (Node has no IndexedDB).
