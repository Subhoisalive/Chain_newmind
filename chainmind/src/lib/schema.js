// Chain Mind — Made by Suvhankar Dutta
// The portable format. Every adapter normalizes into this shape, and every
// export and import reads only this shape. Adding a fifth assistant means
// writing one adapter, not touching anything else.

import { countConversation, countMessage } from './tokens.js';

export const SCHEMA_VERSION = 1;

export function makeConversation({ provider, id, title, model, url, system }) {
  return {
    chainmind: SCHEMA_VERSION,
    id: id || crypto.randomUUID(),
    title: title || 'Untitled conversation',
    system: system || null,
    source: {
      provider,
      model: model || null,
      url: url || null,
      exported_at: new Date().toISOString()
    },
    messages: [],
    attachments: [],
    stats: { tokens: 0, messages: 0 }
  };
}

export function textPart(text) {
  return { type: 'text', text: String(text ?? '') };
}

export function imagePart({ name, width, height, mime }) {
  // Deliberately reference-only. Chain Mind does not copy image bytes between
  // vendors: the file lives in the source account and the URL will not resolve
  // anywhere else. The import writes a placeholder the user can re-upload to.
  return { type: 'image', name: name || 'image', width, height, mime, transferable: false };
}

export function addMessage(conv, role, parts, meta = {}) {
  const message = {
    role,
    content: Array.isArray(parts) ? parts : [textPart(parts)],
    created_at: meta.created_at || null,
    model: meta.model || null
  };
  message.tokens = countMessage(message, conv.source.provider);
  conv.messages.push(message);
  return message;
}

export function finalize(conv) {
  conv.stats.messages = conv.messages.length;
  conv.stats.tokens = countConversation(conv);
  conv.attachments = conv.messages
    .flatMap((m) => m.content.filter((c) => c.type === 'image' || c.type === 'file'))
    .map((c) => ({ name: c.name, type: c.type, transferable: false }));
  return conv;
}

export function validate(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') errors.push('Not an object.');
  else {
    if (obj.chainmind !== SCHEMA_VERSION) errors.push(`Expected chainmind version ${SCHEMA_VERSION}.`);
    if (!Array.isArray(obj.messages)) errors.push('Missing messages array.');
    else
      obj.messages.forEach((m, i) => {
        if (!['user', 'assistant', 'system', 'tool'].includes(m.role))
          errors.push(`Message ${i} has an unknown role: ${m.role}`);
        if (!Array.isArray(m.content)) errors.push(`Message ${i} has no content array.`);
      });
  }
  return { ok: errors.length === 0, errors };
}

function plain(message) {
  return message.content
    .map((c) => {
      if (c.type === 'text') return c.text;
      if (c.type === 'image') return `[image: ${c.name} — not carried over, re-upload if needed]`;
      if (c.type === 'file') return `[file: ${c.name} — not carried over]`;
      return '';
    })
    .join('\n')
    .trim();
}

export function toMarkdown(conv) {
  const head = [
    `# ${conv.title}`,
    '',
    `From ${conv.source.provider}${conv.source.model ? ` (${conv.source.model})` : ''} · ` +
      `${conv.stats.messages} messages · ~${conv.stats.tokens.toLocaleString()} tokens`,
    ''
  ];
  const body = conv.messages.map((m) => {
    const who = m.role === 'user' ? 'You' : m.role === 'assistant' ? 'Assistant' : m.role;
    return `**${who}**\n\n${plain(m)}\n`;
  });
  return head.concat(body).join('\n');
}

// A full transcript is usually the wrong thing to paste into a fresh chat: if
// it overflowed one context window it will overflow the next. The useful move
// is a handoff brief — a compact restatement the new assistant can act on.
//
// Local code cannot summarize. So Chain Mind writes the prompt and lets the
// model you are already talking to produce the brief, then packages its reply.
export const HANDOFF_PROMPT = `Write a handoff brief so a different AI assistant can continue this work with no other context. Use these sections:

1. Goal — what I am ultimately trying to produce or decide.
2. Current state — what is settled and done so far.
3. Open threads — what is unresolved, and the options still on the table.
4. Constraints and preferences — requirements, style, tools, things I ruled out and why.
5. Key artifacts — code, names, numbers, quotes, or decisions that must survive verbatim. Reproduce them in full.
6. Next step — what the new assistant should do first.

Be specific over brief in sections 5 and 6. Do not thank me or add commentary outside the brief.`;

// Extractive fallback: keeps the head and tail verbatim, drops the middle.
// Lossy and clearly labelled as such, but it works with no model call.
export function compactExtractive(conv, budgetTokens) {
  const keep = [];
  let used = 0;
  const head = conv.messages.slice(0, 2);
  const tail = conv.messages.slice(-12);

  for (const m of head) {
    if (used + m.tokens > budgetTokens * 0.25) break;
    keep.push(m);
    used += m.tokens;
  }
  const tailKept = [];
  for (let i = tail.length - 1; i >= 0; i--) {
    if (used + tail[i].tokens > budgetTokens) break;
    tailKept.unshift(tail[i]);
    used += tail[i].tokens;
  }
  const dropped = conv.messages.length - keep.length - tailKept.length;
  return {
    text:
      `Continuing a conversation from ${conv.source.provider}. ` +
      `Title: ${conv.title}.\n\n` +
      keep.map((m) => `${m.role.toUpperCase()}: ${plain(m)}`).join('\n\n') +
      (dropped > 0 ? `\n\n[... ${dropped} messages omitted to fit the context window ...]\n\n` : '\n\n') +
      tailKept.map((m) => `${m.role.toUpperCase()}: ${plain(m)}`).join('\n\n'),
    tokens: used,
    dropped
  };
}
