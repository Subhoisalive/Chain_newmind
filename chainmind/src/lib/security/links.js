// Chain Mind — Made by Suvhankar Dutta
// Link and URL reputation, entirely offline: no lookup, just structure.
// Flags lookalike domains, brand-as-subdomain tricks, punycode, raw IPs,
// user-info tricks, and markdown/HTML images that would send data to a third
// party the moment the page renders them.

import { editDistance } from './textutil.js';
import { foldHomoglyphs } from './hidden.js';

const BRANDS = [
  'google.com', 'github.com', 'openai.com', 'anthropic.com', 'claude.ai', 'chatgpt.com', 'microsoft.com',
  'apple.com', 'amazon.com', 'paypal.com', 'facebook.com', 'instagram.com', 'linkedin.com', 'dropbox.com',
  'stripe.com', 'cloudflare.com', 'netflix.com', 'office.com', 'outlook.com', 'npmjs.com', 'pypi.org',
  'x.com', 'twitter.com', 'whatsapp.com', 'telegram.org', 'binance.com', 'coinbase.com', 'slack.com', 'zoom.us'
];

function registrable(host) {
  const labels = host.toLowerCase().split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const last = labels[labels.length - 1];
  const second = labels[labels.length - 2];
  return last.length === 2 && second.length <= 3 ? labels.slice(-3).join('.') : labels.slice(-2).join('.');
}

const SENSITIVE_PARAM = /^(?:data|d|q|c|token|secret|cookie|session|key|prompt|chat|history|content|payload|msg|message)$/i;

function exfilParams(url) {
  try {
    const u = new URL(url);
    for (const [k, v] of u.searchParams) if (SENSITIVE_PARAM.test(k) && v.length >= 8) return `${k}=${v.slice(0, 24)}…`;
    for (const [, v] of u.searchParams) if (v.length >= 40) return `${v.slice(0, 24)}…`;
    const seg = u.pathname.split('/').find((s) => /^[A-Za-z0-9+/_=-]{40,}$/.test(s));
    if (seg) return `${seg.slice(0, 24)}…`;
  } catch {}
  return null;
}

export function scanLinks(text, { origin = 'user' } = {}) {
  if (!text) return [];
  const hits = [];
  const seen = new Set();
  const auto = origin === 'assistant' || origin === 'fetched' || origin === 'tool';

  for (const m of text.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)|<img[^>]+src\s*=\s*["'](https?:\/\/[^"']+)["']/gi)) {
    const url = m[1] || m[2];
    const param = exfilParams(url);
    if (param) {
      hits.push({
        label: 'Image URL carries data to a third party (exfiltration pattern)',
        severity: auto ? 'critical' : 'high',
        match: `${url.slice(0, 80)}${url.length > 80 ? '…' : ''}`
      });
    }
  }

  for (const m of text.matchAll(/https?:\/\/[^\s)>"'\]]+/gi)) {
    let u;
    try {
      u = new URL(m[0]);
    } catch {
      continue;
    }
    const host = u.hostname.toLowerCase();
    if (seen.has(host)) continue;
    seen.add(host);

    if (u.username) hits.push({ label: 'URL with embedded credentials/user-info (can hide the real host)', severity: 'high', match: host });
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) hits.push({ label: 'URL points at a raw IP address', severity: 'medium', match: host });
    if (host.includes('xn--')) hits.push({ label: 'Punycode domain (may imitate another site)', severity: 'high', match: host });

    const reg = registrable(host);
    if (BRANDS.includes(reg)) continue;
    const folded = foldHomoglyphs(reg);
    for (const brand of BRANDS) {
      const name = brand.split('.')[0];
      const d = editDistance(folded, brand);
      const limit = brand.length >= 10 ? 2 : 1;
      if (folded === brand || (brand.length >= 7 && d <= limit)) {
        hits.push({ label: `Lookalike of ${brand}`, severity: 'high', match: host });
        break;
      }
      if (host.split('.').slice(0, -2).some((l) => l === name || l === brand) || host.startsWith(`${brand}.`)) {
        hits.push({ label: `Brand name used as a subdomain of an unrelated site (${brand})`, severity: 'high', match: host });
        break;
      }
    }
  }
  return hits;
}
