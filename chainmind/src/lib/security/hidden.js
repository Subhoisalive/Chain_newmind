// Chain Mind — Made by Suvhankar Dutta
// Hidden-text detection. Indirect prompt injection often rides in text a
// person cannot see: invisible Unicode "tag" characters that spell out an
// ASCII message, zero-width runs, bidi controls, HTML comments, alt text, or
// inline-styled invisible spans. This reads the transcript text, so it sees
// what survived into the text — not CSS applied by the page itself.

const TAG_RE = /[\u{E0000}-\u{E007F}]/gu;
const ZERO_WIDTH_RE = /[\u200B\u2060\uFEFF\u180E]/g;
const BIDI_RE = /[\u202A-\u202E\u2066-\u2069]/g;
const MARK_RE = /[\u200E\u200F]/g;
const MISC_INVISIBLE_RE = /[\u00AD\u2061-\u2064]/g;
const CITE_PUA_RE = /[\uE200-\uE202]/g;
const RTL_RE = /[\u0590-\u08FF]/;

export function decodeTagChars(text) {
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp >= 0xe0020 && cp <= 0xe007e) out += String.fromCharCode(cp - 0xe0000);
  }
  return out;
}

// Joiners (ZWNJ/ZWJ) are load-bearing in emoji sequences and in Bengali,
// Devanagari, Persian and others, so they are removed only when both
// neighbours are plain Latin text — where they carry nothing.
export function stripInvisible(text) {
  if (!text) return text;
  let out = text
    .replace(TAG_RE, '')
    .replace(ZERO_WIDTH_RE, '')
    .replace(BIDI_RE, '')
    .replace(MISC_INVISIBLE_RE, '')
    .replace(CITE_PUA_RE, '');
  if (!RTL_RE.test(out)) out = out.replace(MARK_RE, '');
  return out.replace(/[\u200C\u200D]/g, (m, i, s) => {
    const prev = s[i - 1];
    const next = s[i + 1];
    const latin = (c) => c === undefined || c.charCodeAt(0) <= 0x24f;
    return latin(prev) && latin(next) ? '' : m;
  });
}

const LOOKALIKES = {
  '\u0430': 'a', '\u0435': 'e', '\u043e': 'o', '\u0440': 'p', '\u0441': 'c', '\u0443': 'y', '\u0445': 'x',
  '\u0456': 'i', '\u0458': 'j', '\u0501': 'd', '\u0455': 's', '\u04bb': 'h',
  '\u0410': 'A', '\u0412': 'B', '\u0415': 'E', '\u041a': 'K', '\u041c': 'M', '\u041d': 'H', '\u041e': 'O',
  '\u0420': 'P', '\u0421': 'C', '\u0422': 'T', '\u0425': 'X', '\u0406': 'I', '\u0408': 'J', '\u0405': 'S',
  '\u03b1': 'a', '\u03bf': 'o', '\u03c1': 'p', '\u03bd': 'v', '\u03b9': 'i', '\u0391': 'A', '\u0392': 'B',
  '\u0395': 'E', '\u0397': 'H', '\u0399': 'I', '\u039a': 'K', '\u039c': 'M', '\u039d': 'N', '\u039f': 'O',
  '\u03a1': 'P', '\u03a4': 'T', '\u03a7': 'X', '\u0396': 'Z'
};

export function foldHomoglyphs(text) {
  if (!text) return text;
  const normalized = stripInvisible(text.normalize('NFKC'));
  let out = '';
  for (const ch of normalized) out += LOOKALIKES[ch] || ch;
  return out;
}

const count = (re, s) => (s.match(re) || []).length;

// Returns { findings, hiddenText }. hiddenText is every string that was
// hidden from view, so the caller can run injection detection on it.
export function scanHidden(text) {
  const findings = [];
  const hiddenText = [];
  if (!text) return { findings, hiddenText };

  const tags = count(TAG_RE, text);
  if (tags) {
    const decoded = decodeTagChars(text);
    if (decoded) hiddenText.push(decoded);
    findings.push({
      label: 'Invisible Unicode tag characters (hidden message)',
      severity: 'critical',
      match: decoded ? `decodes to: ${decoded.slice(0, 120)}` : `${tags} invisible characters`
    });
  }

  const zw = count(ZERO_WIDTH_RE, text);
  if (zw >= 3) findings.push({ label: 'Zero-width characters', severity: 'medium', match: `${zw} invisible characters` });

  const bidi = count(BIDI_RE, text);
  if (bidi) findings.push({ label: 'Bidirectional control characters (can disguise displayed text)', severity: 'high', match: `${bidi} control characters` });

  for (const m of text.matchAll(/<!--([\s\S]{8,}?)-->/g)) {
    hiddenText.push(m[1]);
    findings.push({ label: 'HTML comment in content', severity: 'medium', match: m[1].trim().slice(0, 120) });
  }

  const hiddenStyle = /<[^>]+style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0|color\s*:\s*(?:white|#fff(?:fff)?)\b)[^"']*["'][^>]*>([^<]{4,})/gi;
  for (const m of text.matchAll(hiddenStyle)) {
    hiddenText.push(m[1]);
    findings.push({ label: 'Text styled to be invisible', severity: 'high', match: m[1].trim().slice(0, 120) });
  }

  for (const m of text.matchAll(/!\[([^\]]{12,})\]\(/g)) hiddenText.push(m[1]);
  for (const m of text.matchAll(/\b(?:alt|title)\s*=\s*["']([^"']{12,})["']/gi)) hiddenText.push(m[1]);

  const mixed = [];
  for (const m of text.matchAll(/[\p{L}]{3,}/gu)) {
    const w = m[0];
    if (/[A-Za-z]/.test(w) && /[\u0400-\u04FF\u0370-\u03FF]/.test(w)) mixed.push(w);
  }
  if (mixed.length) findings.push({ label: 'Mixed-script word (possible homoglyph spoofing)', severity: 'medium', match: mixed.slice(0, 3).join(', ') });

  return { findings, hiddenText };
}
