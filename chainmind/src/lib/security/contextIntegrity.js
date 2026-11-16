// Chain Mind — Made by Suvhankar Dutta
// Context integrity. Classifies where a piece of context came from and how
// much weight it should get, and records a short provenance entry so the
// dashboard can show why. The rule of thumb: text the user typed themselves
// is trusted; text pulled in from a page, PDF, or tool result is sensitive by
// default and untrusted the moment it also looks like it is trying to give
// the model instructions.

export const TRUST_LEVELS = ['trusted', 'sensitive', 'untrusted'];

export function classify({ origin, containsInjection }) {
  // origin: 'user' | 'assistant' | 'tool' | 'fetched'
  if (containsInjection && (origin === 'fetched' || origin === 'tool')) return 'untrusted';
  if (origin === 'fetched' || origin === 'tool') return 'sensitive';
  return 'trusted'; // the user's own typed input, or the model's own reply
}

export function provenanceEntry({ origin, url, label }) {
  return { origin, url: url || null, label: label || null, at: Date.now() };
}

// Builds a short human-readable chain for a conversation's messages — used by
// the dashboard's context-integrity panel rather than for any live decision.
export function summarizeProvenance(entries = []) {
  const counts = { trusted: 0, sensitive: 0, untrusted: 0 };
  for (const e of entries) counts[e.level] = (counts[e.level] || 0) + 1;
  return counts;
}
