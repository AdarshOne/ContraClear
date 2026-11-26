export * from './types';
export { NORMALIZER_VERSION, normalizeDoc, splitLabel } from './normalize';
export { segment } from './segment';
export { buildClauses, clauseIdOf, versionIdOf, publicId, hash96 } from './ids';
export { DocIndex, identifyDoc } from './match';
export { prepare, resolve, resolveMany } from './anchor';
export { AnchorStore, vaultCodec, type Codec, type Sealed } from './store';
export { extract, pagesToText } from './extract';
