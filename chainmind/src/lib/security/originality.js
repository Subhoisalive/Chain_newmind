// Chain Mind — Made by Suvhankar Dutta
// Originality & integrity analyzer. Two local, offline heuristics:
//
// 1. Shingled overlap against text you supply to compare with (a draft, a
//    source you pasted in) — not a web-wide plagiarism check, because this
//    extension has no crawler and no index. It tells you how close two texts
//    you already have are to each other, nothing more.
// 2. Pattern flags for claims that read as authoritative but carry no nearby
//    citation — "studies show", "experts agree" — worth a second look, not
//    proof of fabrication.
//
// Point of both: help with a genuinely original rewrite. Neither one issues a
// "clean" verdict, because a clean regex result is not the same thing as a
// clean piece of writing.

function shingles(text, n = 8) {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean);
  const set = new Set();
  for (let i = 0; i <= words.length - n; i++) set.add(words.slice(i, i + n).join(' '));
  return set;
}

export function similarity(a, b) {
  const A = shingles(a);
  const B = shingles(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const s of A) if (B.has(s)) shared++;
  return shared / Math.min(A.size, B.size);
}

const UNSUPPORTED_CLAIM_PATTERNS = [
  [/\bstudies show\b/i, 'unattributed "studies show"'],
  [/\bresearch(?:ers)? (?:has|have) (?:proven|shown)\b/i, 'unattributed research claim'],
  [/\bit is (?:well[- ]known|widely accepted) that\b/i, 'appeal to common knowledge'],
  [/\baccording to (?:experts|scientists)\b/i, 'unnamed experts cited'],
  [/\b\d{1,3}% of (?:people|users|doctors|adults)\b/i, 'statistic with no visible source']
];
// A citation nearby (a link, a parenthetical, "et al", a year in parens)
// changes an otherwise-unsupported claim into a sourced one.
const NEARBY_CITATION = /(\(|https?:\/\/|doi\.org|\d{4}\)|et al\.?)/i;

export function flagUnsupportedClaims(text) {
  if (!text) return [];
  const hits = [];
  for (const [re, note] of UNSUPPORTED_CLAIM_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    const windowText = text.slice(Math.max(0, m.index - 10), m.index + m[0].length + 80);
    if (NEARBY_CITATION.test(windowText)) continue;
    hits.push({ claim: m[0], note });
  }
  return hits;
}

export function analyzeOriginality(text, compareAgainst = []) {
  const duplicateMatches = compareAgainst
    .map((src) => ({ label: src.label || 'comparison text', score: similarity(text, src.text) }))
    .filter((r) => r.score > 0.15)
    .sort((a, b) => b.score - a.score);

  return {
    duplicateMatches,
    unsupportedClaims: flagUnsupportedClaims(text),
    note: 'Local heuristic only — not a web-wide plagiarism check. Use this to guide a genuine rewrite, not as a pass/fail verdict.'
  };
}
