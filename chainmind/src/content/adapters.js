// Chain Mind — Made by Suvhankar Dutta
// One adapter per assistant. Each exports:
//   matches(url, body) -> boolean
//   parse(body, url)   -> portable conversation, or null
//   scrape()           -> portable conversation read from the DOM (fallback)
//
// Selectors and response shapes are the parts most likely to break when a
// vendor redesigns. Every adapter falls back to `scrape()` and every scrape
// falls back to role-guessing, so a break degrades to "less accurate" rather
// than "silently empty".

import { makeConversation, addMessage, textPart, imagePart, finalize } from '../lib/schema.js';

const json = (body) => {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};

// innerText is the better read because it respects layout and line breaks, but
// it is undefined on detached nodes and in non-rendering contexts. Falling back
// to textContent keeps a scrape from throwing and taking the whole read down.
function readText(el) {
  if (!el) return '';
  const raw = typeof el.innerText === 'string' ? el.innerText : el.textContent || '';
  return raw.replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// --- ChatGPT ---------------------------------------------------------------
// The conversation endpoint returns a `mapping` — a tree of nodes keyed by id,
// because ChatGPT supports edit branches. The visible thread is the path from
// the current leaf back to the root, so walk parents and reverse.
const chatgpt = {
  id: 'chatgpt',
  matches: (url) => url.includes('/backend-api/conversation/'),
  parse(body, url) {
    const data = json(body);
    if (!data?.mapping) return null;

    const conv = makeConversation({
      provider: 'chatgpt',
      id: data.conversation_id || data.id,
      title: data.title,
      model: data.default_model_slug,
      url
    });

    const nodes = data.mapping;
    let leaf = data.current_node;
    if (!leaf) {
      // No pointer: take the node with the latest timestamp.
      leaf = Object.values(nodes).sort(
        (a, b) => (b.message?.create_time || 0) - (a.message?.create_time || 0)
      )[0]?.id;
    }

    const chain = [];
    let cursor = leaf;
    const seen = new Set();
    while (cursor && nodes[cursor] && !seen.has(cursor)) {
      seen.add(cursor);
      chain.push(nodes[cursor]);
      cursor = nodes[cursor].parent;
    }
    chain.reverse();

    for (const node of chain) {
      const m = node.message;
      if (!m) continue;
      const role = m.author?.role;
      if (!role || role === 'tool') continue;
      if (m.metadata?.is_visually_hidden_from_conversation) continue;

      const parts = [];
      for (const p of m.content?.parts || []) {
        if (typeof p === 'string') {
          if (p.trim()) parts.push(textPart(p));
        } else if (p?.asset_pointer) {
          parts.push(imagePart({ name: p.asset_pointer.split('/').pop(), width: p.width, height: p.height }));
        }
      }
      if (!parts.length) continue;

      if (role === 'system') {
        conv.system = parts.map((p) => p.text).join('\n');
        continue;
      }
      addMessage(conv, role, parts, {
        created_at: m.create_time ? new Date(m.create_time * 1000).toISOString() : null,
        model: m.metadata?.model_slug
      });
    }
    return conv.messages.length ? finalize(conv) : null;
  },
  scrape() {
    const conv = makeConversation({ provider: 'chatgpt', title: document.title, url: location.href });
    for (const el of document.querySelectorAll('[data-message-author-role]')) {
      const role = el.getAttribute('data-message-author-role');
      const text = readText(el);
      if (text) addMessage(conv, role === 'user' ? 'user' : 'assistant', text);
    }
    return conv.messages.length ? finalize(conv) : null;
  }
};

// --- Claude ----------------------------------------------------------------
const claude = {
  id: 'claude',
  matches: (url) => url.includes('/chat_conversations/'),
  parse(body, url) {
    const data = json(body);
    const list = data?.chat_messages;
    if (!Array.isArray(list)) return null;

    const conv = makeConversation({
      provider: 'claude',
      id: data.uuid,
      title: data.name,
      model: data.model,
      url
    });

    for (const m of list) {
      const parts = [];
      // Newer payloads use a `content` array of blocks; older ones a `text`.
      for (const block of m.content || []) {
        if (block.type === 'text' && block.text?.trim()) parts.push(textPart(block.text));
        if (block.type === 'thinking') continue; // not portable, and not the user's words
      }
      if (!parts.length && m.text?.trim()) parts.push(textPart(m.text));
      for (const f of m.attachments || []) parts.push({ type: 'file', name: f.file_name, text: f.extracted_content });
      for (const f of m.files || []) parts.push(imagePart({ name: f.file_name }));
      if (!parts.length) continue;

      addMessage(conv, m.sender === 'human' ? 'user' : 'assistant', parts, { created_at: m.created_at });
    }
    return conv.messages.length ? finalize(conv) : null;
  },
  scrape() {
    const conv = makeConversation({ provider: 'claude', title: document.title, url: location.href });
    for (const el of document.querySelectorAll('[data-testid="user-message"], .font-claude-response')) {
      const isUser = el.getAttribute('data-testid') === 'user-message';
      const text = readText(el);
      if (text) addMessage(conv, isUser ? 'user' : 'assistant', text);
    }
    return conv.messages.length ? finalize(conv) : null;
  }
};

// --- Gemini ----------------------------------------------------------------
// batchexecute payloads are positional arrays with no stable field names, so
// parsing them is a maintenance treadmill. DOM reading is the honest choice.
const gemini = {
  id: 'gemini',
  matches: () => false,
  parse: () => null,
  scrape() {
    const conv = makeConversation({ provider: 'gemini', title: document.title, url: location.href });
    const turns = document.querySelectorAll('user-query, model-response');
    for (const el of turns) {
      const role = el.tagName.toLowerCase() === 'user-query' ? 'user' : 'assistant';
      const text = readText(el);
      if (text) addMessage(conv, role, text);
    }
    return conv.messages.length ? finalize(conv) : null;
  }
};

// --- Grok ------------------------------------------------------------------
const grok = {
  id: 'grok',
  matches: (url) => url.includes('/rest/app-chat/conversations/'),
  parse(body, url) {
    // Grok returns newline-delimited JSON objects on some routes.
    const rows = body
      .split('\n')
      .map((line) => json(line))
      .filter(Boolean);
    const single = json(body);
    const items = single?.responses || rows.flatMap((r) => r.result?.responses || r.responses || []);
    if (!items?.length) return null;

    const conv = makeConversation({ provider: 'grok', id: single?.conversation?.conversationId, title: single?.conversation?.title, url });
    for (const r of items) {
      const node = r.response || r;
      const text = node.message ?? node.content;
      if (!text) continue;
      addMessage(conv, node.sender === 'human' || node.query ? 'user' : 'assistant', String(text), {
        created_at: node.createTime
      });
    }
    return conv.messages.length ? finalize(conv) : null;
  },
  scrape() {
    const conv = makeConversation({ provider: 'grok', title: document.title, url: location.href });
    for (const el of document.querySelectorAll('.message-bubble, [class*="message-row"]')) {
      const text = readText(el);
      if (!text) continue;
      const isUser = el.className.includes('user') || el.closest('[class*="items-end"]');
      addMessage(conv, isUser ? 'user' : 'assistant', text);
    }
    return conv.messages.length ? finalize(conv) : null;
  }
};

export const ADAPTERS = { chatgpt, claude, gemini, grok };

export function adapterFor(providerId) {
  return ADAPTERS[providerId] || null;
}
