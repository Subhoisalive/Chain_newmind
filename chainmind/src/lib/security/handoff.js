// Chain Mind — Made by Suvhankar Dutta
// Handoff pipeline: compress, sanitize, then diff the result against the
// original so you can see what did not make the trip.

import { msgText, splitFences } from './textutil.js';
import { compactSmart } from './compress.js';
import { sanitizeHandoff } from './sanitize.js';
import { getSettings } from './settings.js';

const KEY_SENTENCE = /\b(let'?s|we'll|decided|going with|settled on|must|must not|never|only|without|required?|at least|at most|prefer|avoid|deadline|budget)\b|\d/i;
const words = (s) => s.toLowerCase().match(/[a-z0-9_]{4,}/g) || [];

export function diffHandoff(conv, handoffText) {
  const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const H = norm(handoffText);
  const Hwords = new Set(words(handoffText));

  const lostCode = [];
  const seenCode = new Set();
  const keyAll = [];
  for (const m of conv.messages) {
    const t = msgText(m);
    for (const p of splitFences(t)) {
      if (p.code) {
        const k = norm(p.text);
        if (seenCode.has(k)) continue;
        seenCode.add(k);
        if (!H.includes(k)) {
          const lines = p.text.split('\n');
          lostCode.push({ lang: lines[0].replace(/`/g, '').trim() || 'code', preview: (lines[1] || '').trim().slice(0, 80), lines: lines.length - 2 });
        }
      } else {
        for (const s of p.text.split(/(?<=[.!?])\s+|\n+/)) {
          const st = s.trim();
          if (st.length > 20 && st.length < 300 && KEY_SENTENCE.test(st)) keyAll.push(st);
        }
      }
    }
  }
  const lostKey = [];
  let kept = 0;
  for (const s of new Set(keyAll)) {
    const w = words(s);
    const hit = w.length ? w.filter((x) => Hwords.has(x)).length / w.length : 1;
    if (hit >= 0.6) kept++;
    else lostKey.push(s);
  }
  const total = kept + lostKey.length;
  return { lostCode, lostKey: lostKey.slice(0, 15), lostKeyCount: lostKey.length, keyTotal: total, coverage: total ? kept / total : 1 };
}

// Used by the HUD and the popup. Always records a report for the dashboard.
export async function prepareHandoff(conv, budgetTokens, targetId) {
  const settings = await getSettings();
  const packed = compactSmart(conv, budgetTokens);
  let text = packed.text;
  let sanitized = null;
  if (settings.sanitizeHandoff) {
    sanitized = sanitizeHandoff(text);
    text = sanitized.text;
  }
  const diff = diffHandoff(conv, text);
  const report = {
    at: Date.now(),
    from: conv.source.provider,
    to: targetId || null,
    title: conv.title,
    mode: packed.mode,
    messages: conv.messages.length,
    dropped: packed.dropped,
    sections: packed.sections || null,
    redactions: sanitized ? sanitized.redactions : 0,
    invisibleRemoved: sanitized ? sanitized.invisibleRemoved : 0,
    injections: sanitized ? sanitized.injections : [],
    diff
  };
  try {
    await chrome.storage.local.set({ lastHandoffReport: report });
  } catch {}
  return { text, dropped: packed.dropped, report };
}
