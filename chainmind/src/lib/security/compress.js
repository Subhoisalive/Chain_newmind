// Chain Mind — Made by Suvhankar Dutta
// Smart compression. Instead of keeping the head and tail and dropping the
// middle, build a structured memory: the goal, decisions, constraints, open
// items, the latest version of every code block, and the last few messages
// verbatim. Heuristic and extractive — it selects sentences the conversation
// already contains, it does not summarise or rewrite them.

import { msgText, splitFences } from './textutil.js';

const DECISION = /\b(let'?s|we'll|we will|i'll go with|going with|decided|we chose|settled on|agreed|switch(?:ed)? to|use .{1,40} instead)\b/i;
const CONSTRAINT = /\b(must|must not|should not|shouldn'?t|don'?t|do not|never|only|without|required?|at least|at most|no more than|avoid|prefer)\b/i;
const OPEN = /\b(todo|to-do|next step|still need|remaining|not yet|unresolved|open question|need to|later)\b/i;

const sentences = (t) => t.replace(/```[\s\S]*?```/g, ' ').split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 15 && s.length < 400);
const est = (s) => (typeof countText === 'function' ? countText(s) : Math.ceil(s.length / 4));

function dedupe(list, cap) {
  const seen = new Set();
  const out = [];
  for (const s of list) {
    const k = s.toLowerCase().slice(0, 80);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  }
  return out.slice(-cap);
}

export function compactStructured(conv, budgetTokens) {
  const msgs = conv.messages;
  const goal = (msgs.find((m) => m.role === 'user') ? msgText(msgs.find((m) => m.role === 'user')) : '').slice(0, 600);
  const decisions = [];
  const constraints = [];
  const open = [];
  const code = new Map();

  msgs.forEach((m) => {
    const t = msgText(m);
    for (const p of splitFences(t)) {
      if (!p.code) continue;
      const lines = p.text.split('\n');
      const key = (lines[0] + '|' + (lines.find((l, i) => i > 0 && l.trim()) || '').trim()).slice(0, 120);
      code.delete(key);
      code.set(key, p.text);
    }
    for (const s of sentences(t)) {
      if (DECISION.test(s)) decisions.push(s);
      if (m.role === 'user' && CONSTRAINT.test(s)) constraints.push(s);
      if (OPEN.test(s)) open.push(s);
    }
  });
  msgs.slice(-6).forEach((m) => {
    if (m.role === 'user') for (const s of sentences(msgText(m))) if (s.endsWith('?')) open.push(s);
  });

  let tailN = Math.min(4, msgs.length);
  let codeList = [...code.values()];
  let lists = { decisions: dedupe(decisions, 12), constraints: dedupe(constraints, 12), open: dedupe(open, 10) };

  const build = () => {
    const tail = msgs.slice(-tailN).map((m) => `${m.role.toUpperCase()}: ${msgText(m).slice(0, 1500)}`);
    const sec = (title, items) => (items.length ? `## ${title}\n${items.map((i) => `- ${i}`).join('\n')}\n\n` : '');
    return (
      `Continuing a conversation from ${conv.source.provider}. Title: ${conv.title}.\n` +
      `Structured memory (selected from ${msgs.length} messages; not a rewrite):\n\n` +
      `## Goal\n${goal}\n\n` +
      sec('Decisions', lists.decisions) +
      sec('Constraints from the user', lists.constraints) +
      sec('Open items', lists.open) +
      (codeList.length ? `## Latest code\n${codeList.join('\n\n')}\n\n` : '') +
      `## Most recent messages\n${tail.join('\n\n')}`
    );
  };

  let text = build();
  while (est(text) > budgetTokens) {
    if (codeList.length > 1) codeList = codeList.slice(1);
    else if (tailN > 1) tailN--;
    else if (lists.decisions.length > 3 || lists.constraints.length > 3 || lists.open.length > 3) {
      lists = { decisions: lists.decisions.slice(-3), constraints: lists.constraints.slice(-3), open: lists.open.slice(-3) };
    } else break;
    text = build();
  }
  return {
    text,
    tokens: est(text),
    dropped: Math.max(0, msgs.length - tailN),
    mode: 'structured',
    sections: { decisions: lists.decisions.length, constraints: lists.constraints.length, open: lists.open.length, code: codeList.length, verbatim: tailN }
  };
}

// Whole thing fits: send it whole. Otherwise build the structured memory.
export function compactSmart(conv, budgetTokens) {
  if (conv.stats.tokens <= budgetTokens) {
    const r = compactExtractive(conv, budgetTokens);
    return { ...r, mode: 'full' };
  }
  return compactStructured(conv, budgetTokens);
}
