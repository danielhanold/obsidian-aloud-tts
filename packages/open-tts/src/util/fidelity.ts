export type FidelityVerdict = "ok" | "warning" | "mismatch";

export interface FidelityResult {
  verdict: FidelityVerdict;
  score: number;
}

export const FIDELITY_OK_THRESHOLD = 0.9;
export const FIDELITY_MISMATCH_THRESHOLD = 0.5;

const IGNORED_WORDS = new Set<string>([
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
  "hundred",
  "thousand",
  "million",
  "billion",
  "trillion",
  "point",
  "percent",
  "dollar",
  "dollars",
]);

const UNSPACED_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;

function tokens(text: string): string[] {
  const words = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
  return words
    .flatMap((w) => (UNSPACED_SCRIPT.test(w) ? Array.from(w) : [w]))
    .filter((w) => !/\p{N}/u.test(w) && !IGNORED_WORDS.has(w));
}

function lcsLength(a: string[], b: string[]): number {
  let prev = new Array<number>(b.length + 1).fill(0);
  let curr = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1] + 1
          : Math.max(prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

export function checkFidelity(
  sourceText: string,
  transcript: string | undefined,
): FidelityResult {
  if (transcript === undefined) return { verdict: "warning", score: 0 };
  const src = tokens(sourceText);
  const tr = tokens(transcript);
  if (src.length === 0) {
    return tr.length <= 3
      ? { verdict: "ok", score: 1 }
      : { verdict: "warning", score: 0 };
  }
  const lcs = lcsLength(src, tr);
  const longest = Math.max(src.length, tr.length);
  const score = lcs / longest;
  if (score >= FIDELITY_OK_THRESHOLD || longest - lcs <= 1) {
    return { verdict: "ok", score };
  }
  if (score >= FIDELITY_MISMATCH_THRESHOLD || longest < 4) {
    return { verdict: "warning", score };
  }
  return { verdict: "mismatch", score };
}
