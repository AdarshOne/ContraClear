// The parts of diff-match-patch this module uses, typed strictly (instead of adding @types/diff-match-patch).
declare module 'diff-match-patch' {
  export type Diff = [number, string];
  export class diff_match_patch {
    Match_Threshold: number;
    Match_Distance: number;
    Match_MaxBits: number;
    Diff_Timeout: number;
    match_main(text: string, pattern: string, loc: number): number;
    diff_main(text1: string, text2: string, checklines?: boolean): Diff[];
    diff_levenshtein(diffs: Diff[]): number;
  }
  export default diff_match_patch;
}
