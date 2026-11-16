// Chain Mind — Made by Suvhankar Dutta
// Entropy-based secret detection. Catches key formats no regex knows about:
// long, random-looking strings that mix letters and digits. Tuned to ignore
// URLs, pure hex (commit hashes, checksums), and ordinary identifiers.

import { shannon, maskToken } from './textutil.js';

const TOKEN_RE = /[A-Za-z0-9_\-+/=]{20,}/g;

function looksSecret(tok) {
  if (/^[0-9a-f]+$/i.test(tok)) return false;
  if (!/\d/.test(tok) || !/[A-Za-z]/.test(tok)) return false;
  if (new Set(tok).size < 12) return false;
  if (/^[A-Z0-9_]+$/.test(tok) && tok.includes('_')) return false;
  return shannon(tok) >= 4.0;
}

function withoutUrls(text) {
  return text.replace(/https?:\/\/\S+/g, (u) => ' '.repeat(u.length));
}

export function scanEntropy(text) {
  if (!text) return [];
  const hits = [];
  const scrubbed = withoutUrls(text);
  for (const m of scrubbed.matchAll(TOKEN_RE)) {
    if (looksSecret(m[0])) {
      hits.push({ name: 'High-entropy string (possible secret)', severity: 'medium', sample: maskToken(m[0]), index: m.index });
    }
  }
  return hits;
}

export function redactEntropy(text) {
  if (!text) return { text, redactions: 0 };
  const scrubbed = withoutUrls(text);
  let redactions = 0;
  let out = '';
  let last = 0;
  for (const m of scrubbed.matchAll(TOKEN_RE)) {
    if (!looksSecret(m[0])) continue;
    out += text.slice(last, m.index) + '[REDACTED:HIGH_ENTROPY_STRING]';
    last = m.index + m[0].length;
    redactions++;
  }
  return { text: out + text.slice(last), redactions };
}
