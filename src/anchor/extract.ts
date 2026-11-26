// The anchoring module's view of text extraction: one string per document, pages separated by form feeds
// (so running headers/footers can be detected), paragraphs by blank lines. Wraps the existing reader.
import { readFile } from '../lib/read';
import type { RawPage } from '../lib/rules';
export const pagesToText = (pages: RawPage[]) => pages.map(p => (p.h && !p.paras.includes(p.h) ? [p.h, ...p.paras] : p.paras).join('\n\n')).join('\n\f\n');
export async function extract(file: File, ocr?: (progress: string) => void): Promise<string> { return pagesToText(await readFile(file, undefined, ocr)); }
