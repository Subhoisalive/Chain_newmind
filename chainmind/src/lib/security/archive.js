// Chain Mind — Made by Suvhankar Dutta
// Cross-provider search. Off by default: when switched on, each conversation
// Chain Mind reads is kept in this browser (secrets redacted first) so every
// chat, across ChatGPT, Claude, Gemini and Grok, can be searched in one place.

import { msgText } from './textutil.js';
import { redactAll } from './sanitize.js';
import { getSettings } from './settings.js';

const KEY = 'cmArchive';
const MAX_CONVERSATIONS = 150;

export async function archiveConversation(conv) {
  if (!conv || !(await getSettings()).archive) return false;
  const id = conv.__key || `${conv.source.provider}:${conv.title}`;
  const { [KEY]: store = {} } = await chrome.storage.local.get(KEY);
  store[id] = {
    provider: conv.source.provider,
    title: conv.title || 'Untitled',
    updated: Date.now(),
    messages: conv.messages.map((m) => ({ role: m.role, text: redactAll(msgText(m)).text }))
  };
  const ids = Object.keys(store);
  if (ids.length > MAX_CONVERSATIONS) {
    ids.sort((a, b) => store[a].updated - store[b].updated);
    for (const old of ids.slice(0, ids.length - MAX_CONVERSATIONS)) delete store[old];
  }
  await chrome.storage.local.set({ [KEY]: store });
  return true;
}

export async function searchArchive(query, { limit = 25 } = {}) {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  if (!terms.length) return [];
  const { [KEY]: store = {} } = await chrome.storage.local.get(KEY);
  const results = [];
  for (const [id, conv] of Object.entries(store)) {
    const titleHits = terms.filter((t) => conv.title.toLowerCase().includes(t)).length;
    for (const m of conv.messages) {
      const low = m.text.toLowerCase();
      const hits = terms.filter((t) => low.includes(t));
      if (hits.length < Math.min(terms.length, 2) && hits.length !== terms.length) continue;
      const at = low.indexOf(hits[0]);
      results.push({
        id,
        provider: conv.provider,
        title: conv.title,
        role: m.role,
        updated: conv.updated,
        score: hits.length * 2 + titleHits * 3,
        snippet: (at > 60 ? '…' : '') + m.text.slice(Math.max(0, at - 60), at + 140).replace(/\s+/g, ' ') + '…'
      });
    }
  }
  return results.sort((a, b) => b.score - a.score || b.updated - a.updated).slice(0, limit);
}

export async function archiveStats() {
  const { [KEY]: store = {} } = await chrome.storage.local.get(KEY);
  const convs = Object.values(store);
  return { conversations: convs.length, messages: convs.reduce((n, c) => n + c.messages.length, 0) };
}

export async function clearArchive() {
  await chrome.storage.local.remove(KEY);
}
