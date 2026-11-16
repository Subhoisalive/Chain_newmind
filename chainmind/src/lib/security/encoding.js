// Chain Mind — Made by Suvhankar Dutta
// Encoding-trick detection. Re-runs injection detection on text after undoing
// the obfuscations attackers use to get past a plain pattern match: base64
// blobs, rot13, and homoglyph/invisible-character substitution.

import { scanForInjection } from './injection.js';
import { foldHomoglyphs } from './hidden.js';

function rot13(s) {
  return s.replace(/[a-z]/gi, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function tryBase64(s) {
  try {
    const bin = atob(s);
    if (bin.length < 12) return null;
    let printable = 0;
    for (let i = 0; i < bin.length; i++) {
      const c = bin.charCodeAt(i);
      if ((c >= 32 && c < 127) || c === 10 || c === 13 || c === 9) printable++;
    }
    return printable / bin.length > 0.92 ? bin : null;
  } catch {
    return null;
  }
}

export function scanEncoded(text) {
  if (!text) return [];
  const hits = [];
  const plain = new Set(scanForInjection(text, { origin: 'fetched' }).map((h) => h.label));

  for (const m of text.matchAll(/[A-Za-z0-9+/]{24,}={0,2}/g)) {
    const decoded = tryBase64(m[0]);
    if (!decoded) continue;
    const inner = scanForInjection(decoded, { origin: 'fetched' });
    if (inner.length) hits.push({ kind: 'encoded', label: 'Base64-encoded instruction', severity: 'critical', match: decoded.slice(0, 120) });
  }

  const unrot = scanForInjection(rot13(text), { origin: 'fetched' });
  if (unrot.length) hits.push({ kind: 'encoded', label: 'ROT13-encoded instruction', severity: 'high', match: unrot[0].match });

  const folded = foldHomoglyphs(text);
  if (folded !== text) {
    const inner = scanForInjection(folded, { origin: 'fetched' }).filter((h) => !plain.has(h.label));
    if (inner.length) hits.push({ kind: 'encoded', label: 'Obfuscated instruction (lookalike or invisible characters)', severity: 'high', match: inner[0].match });
  }
  return hits;
}
