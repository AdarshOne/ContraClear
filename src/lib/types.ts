export type K = 'g' | 'y' | 'o' | 'r';
export interface Seg { x: string; q: number; qid: string }
export interface Para { lead: string; segs: Seg[] }
export interface Page { n: number; file: string; h: string; paras: Para[] }
export interface Side { by: string; v: string; quote: string; ref: string; qid: string; note: string }
export interface Item {
  id: number; k: K; kind: 'money' | 'date' | 'duty';
  sentence: string; value: string; who: string; due: string;
  rules: string; ai?: string; quote: string; ref: string; qid: string; page: number; cal: 0 | 1;
  formula?: string[]; conf?: Side[];
  iso?: string; recur?: 'monthly' | 'yearly'; amt?: number;
  /** What the rules check read, in a form the AI check can be compared against. */
  fact?: Fact;
  /** Why the on-device check could not vouch for this item, when it couldn't. */
  aiNote?: string;
}
export type Cls = 'payment' | 'late' | 'tax' | 'term' | 'renewal' | 'cancel' | 'deadline' | 'notice' | 'insurance' | 'other';
export interface Fact { cls: Cls; amt?: number; freq?: 'monthly' | 'yearly' | 'once'; iso?: string; days?: number; biz?: boolean; pct?: number; tax?: boolean; methods?: string[] }
export interface NotFound { t: string; d: string; s: string }
export interface Tracked { id: number; kind: string; title: string; who: string; rem: string; txt: string; page: number }
export interface Contract {
  id: string; name: string; cp: string; type: string; year: string; src: string; files: string[];
  pages: Page[]; items: Item[]; nf: NotFound[]; added: string; sample?: boolean; lines?: boolean;
  conf: Record<number, { v: string; how: 'confirmed' | 'edited' }>; dis: Record<number, boolean>;
  hist: Record<number, string[]>; pick: Record<number, number>; accepted: boolean; tracked: Tracked[];
}
export interface Settings { prov: string; rem: string; lock: string; copies: boolean; eng: 'rules' | 'device' | 'cloud' }
export interface Db { contracts: Contract[]; settings: Settings; cpo: Record<string, string>; calPrompt: boolean; recent: string[] }
export const emptyDb = (): Db => ({ contracts: [], settings: { prov: 'Ontario', rem: '2 weeks and 2 days before', lock: '15 minutes', copies: false, eng: 'device' }, cpo: {}, calPrompt: true, recent: [] });
export const COL: Record<K, [string, string, string]> = {
  g: ['#1E7B3A', '#EAF5EE', 'Both checks agree'], y: ['#A66F00', '#FFF4D6', 'Checks disagree: please confirm'],
  o: ['#A66F00', '#FFF4D6', 'Rules check only: please confirm'], r: ['#C62828', '#FCE9E8', 'Couldn’t verify'],
};
/** Status that drives the UI. One check alone never counts as agreed. */
export const eff = (it: Item): K => (it.ai === undefined ? (it.k === 'r' ? 'r' : 'o') : it.k);
export const isNeed = (c: Contract, id: number) => { const it = c.items.find(i => i.id === id)!; return c.conf[id] === undefined && !c.dis[id] && !(eff(it) === 'g'); };
