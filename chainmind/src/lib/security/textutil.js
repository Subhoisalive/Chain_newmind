// Chain Mind — Made by Suvhankar Dutta
// Small shared helpers for the security modules.

// Optimal-string-alignment distance: edits plus adjacent transpositions, so
// "reqeusts" is distance 1 from "requests", which is how typosquats are made.
export function editDistance(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

export function shannon(s) {
  const counts = new Map();
  for (const ch of s) counts.set(ch, (counts.get(ch) || 0) + 1);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

export function msgText(m) {
  return (m.content || []).map((c) => (c.type === 'text' ? c.text : '')).join('\n');
}

export function splitFences(text) {
  const parts = [];
  let last = 0;
  const re = /```[\s\S]*?```/g;
  let m;
  while ((m = re.exec(text))) {
    parts.push({ code: false, text: text.slice(last, m.index) });
    parts.push({ code: true, text: m[0] });
    last = m.index + m[0].length;
  }
  parts.push({ code: false, text: text.slice(last) });
  return parts;
}

export function maskToken(value) {
  const v = value.trim();
  return v.length <= 8 ? '*'.repeat(v.length) : `${v.slice(0, 4)}…${v.slice(-4)}`;
}
