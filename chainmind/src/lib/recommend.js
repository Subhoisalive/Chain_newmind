// Chain Mind — Made by Suvhankar Dutta
// Two recommenders, both deterministic and both offline.
//
//   rankProviders()  — you are out of room here, where should you go
//   suggestTools()   — describe a job, get tools that do that job
//
// Neither calls a model. That is a deliberate constraint: a recommender that
// needs a key is a recommender most people never switch on, and a local one
// cannot invent a tool that does not exist. `handoffToolPrompt()` covers the
// case where you do want a model's judgement, by asking the assistant already
// open in the tab instead of paying for a second one.

import { PROVIDERS } from './providers.js';
import { CATALOG, SYNONYMS } from './catalog.js';
import { describeReset } from './quota.js';

// --- where to go next ------------------------------------------------------

// What the thread is made of changes the answer more than free space does.
export function profileConversation(conv) {
  if (!conv) return { tokens: 0, images: 0, files: 0, code: false, messages: 0 };
  let images = 0;
  let files = 0;
  let fenced = 0;
  for (const m of conv.messages || []) {
    for (const part of m.content || []) {
      if (part.type === 'image') images++;
      else if (part.type === 'file') files++;
      else if (part.type === 'text' && /```/.test(part.text || '')) fenced++;
    }
  }
  return {
    tokens: conv.stats?.tokens || 0,
    messages: conv.stats?.messages || 0,
    images,
    files,
    code: fenced >= 2
  };
}

const STALE_MS = 6 * 3600e3;

export function rankProviders({ from, profile = {}, avail = [], now = Date.now() }) {
  const byId = Object.fromEntries(avail.map((a) => [a.provider, a]));
  const rows = [];

  for (const [id, p] of Object.entries(PROVIDERS)) {
    if (id === from) continue;
    const a = byId[id];
    const window = p.models?.default?.context || null;

    // Half the window, because the brief has to land AND be replied to.
    const usable = window ? Math.floor(window * 0.5) : null;
    const carry = profile.tokens || 0;

    let score = 0;
    const reasons = [];
    let blocked = false;

    if (a?.blocked) {
      blocked = true;
      reasons.push(`limit hit, clears in ${describeReset(a.blockedUntil)}`);
      score -= 100;
    }

    if (usable) {
      if (carry && carry <= usable) {
        score += 30;
        reasons.push(`room for the whole thread (${Math.round(usable / 1000)}k usable)`);
      } else if (carry) {
        score += 10;
        reasons.push(`${Math.round(usable / 1000)}k usable, so the thread needs trimming`);
      } else {
        score += 15;
        reasons.push(`${Math.round(usable / 1000)}k usable`);
      }
    }

    // An open thread there that is already loaded up is not a fresh start.
    if (a && a.limit && a.used) {
      const free = 1 - a.used / a.limit;
      if (free < 0.25) {
        score -= 25;
        reasons.push('the open chat there is nearly full too');
      } else if (a.staleMs < STALE_MS) {
        score += 5;
      }
    }

    if (profile.images > 0) {
      reasons.push(`${profile.images} image${profile.images > 1 ? 's' : ''} will not carry over`);
    }

    if (profile.code && (id === 'claude' || id === 'chatgpt')) {
      score += 8;
      reasons.push('handles code well');
    }
    if (carry > 150000 && id === 'gemini') {
      score += 12;
      reasons.push('biggest window of the four');
    }

    if (a && a.staleMs >= STALE_MS) reasons.push('reading is stale, from an older session');
    if (!a) reasons.push('never seen in this browser, so this is the published window only');

    rows.push({ provider: id, label: p.label, url: `https://${p.hosts[0]}`, score, blocked, reasons });
  }

  return rows.sort((a, b) => b.score - a.score);
}

// --- what tool for this job ------------------------------------------------

const STOP = new Set([
  'a','an','the','i','me','my','to','for','of','and','or','is','are','it','this','that','with','want',
  'need','how','do','can','you','some','something','help','make','get','best','tool','ai','app','please'
]);

function terms(query) {
  const words = String(query || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));

  const expanded = new Set(words);
  for (const w of words) {
    for (const tag of SYNONYMS[w] || []) expanded.add(tag);
    // crude singular, so "images" reaches "image"
    if (w.endsWith('s') && w.length > 3) {
      const singular = w.slice(0, -1);
      expanded.add(singular);
      for (const tag of SYNONYMS[singular] || []) expanded.add(tag);
    }
  }
  return { words, expanded };
}

// Matching notes, each one a bug found by running real queries through it:
//
//   "look up a value across sheets" returned Looka, because a four-letter
//   query word was allowed to substring-match a product name. Name matching
//   now needs five characters.
//   "a blog post that ranks on google" returned Fronty, on "on". Same fix.
//   "debug my python script" returned three tools that merely carry a code
//   tag, and hid the obvious answer, which is the assistant already open in
//   front of you. General assistants are now excluded from the catalog search
//   and handled by the weak-match path instead.
export function suggestTools(query, { limit = 4 } = {}) {
  const { words, expanded } = terms(query);
  if (!expanded.size) return { picks: [], weak: true };

  const scored = CATALOG.filter((tool) => !tool.tags.includes('assistant'))
    .map((tool) => {
      let score = 0;
      const hits = [];

      for (const tag of tool.tags) {
        if (expanded.has(tag)) {
          score += 3;
          hits.push(tag);
        }
      }

      const name = tool.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const w of words) {
        if (w.length >= 5 && name.includes(w)) score += 6;
        if (tool.what.toLowerCase().includes(w)) score += 1;
      }
      // A verified entry beats an unverified one on an otherwise equal match.
      if (tool.checked) score += 0.5;

      return { tool, score, hits };
    })
    .filter((r) => r.score >= 3)
    .sort((a, b) => b.score - a.score);

  const picks = scored.slice(0, limit).map(({ tool, score, hits }) => ({
    ...tool,
    score,
    why: hits.length ? `matches ${hits.slice(0, 3).join(', ')}` : 'name match',
    verified: Boolean(tool.checked)
  }));

  // One thin tag hit is not a recommendation. Below this line the honest answer
  // is usually "no specialised tool, just ask the assistant you are in".
  const weak = !picks.length || picks[0].score < 6;
  return { picks, weak };
}

// When the catalog comes up empty, or the job is a judgement call, hand the
// question to the assistant already open in the tab. Costs one turn and no key.
export function handoffToolPrompt(query) {
  return `I need to pick a tool for this task:

"${String(query || '').trim()}"

Recommend at most three, and for each give the name, one line on why it fits this specific task, and the rough cost. Say plainly if a general assistant like yourself is the better answer and a specialised tool would be overkill. If you are not confident a tool still exists or still has a free tier, say so instead of guessing. No preamble.`;
}
