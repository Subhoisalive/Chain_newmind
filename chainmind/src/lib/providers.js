// Chain Mind — Made by Suvhankar Dutta
// Everything site-specific lives here. When a vendor ships a redesign or a new
// model, this is the only file you should need to touch.
//
// VERIFY BEFORE SHIPPING: context windows and upload caps change often and
// differ by plan. Treat every number below as a starting guess, not a fact.
// See README "Keeping the numbers honest".

export const PROVIDERS = {
  chatgpt: {
    label: 'ChatGPT',
    hosts: ['chatgpt.com', 'chat.openai.com'],
    // Response bodies we care about. Matched as substrings of the request URL.
    capture: [
      { match: '/backend-api/conversation/', kind: 'conversation' },
      { match: '/backend-api/files', kind: 'upload' }
    ],
    streamMatch: '/backend-api/conversation',
    models: {
      default: { context: 32000, label: 'ChatGPT (plan default)' },
      'gpt-5': { context: 196000 },
      'gpt-5-thinking': { context: 196000 },
      'gpt-4o': { context: 128000 }
    },
    media: { window: 'day', limit: 10, note: 'Image uploads per rolling day, Plus tier' },
    composer: [
      '#prompt-textarea',
      'div[contenteditable="true"][data-virtualkeyboard]',
      'textarea[data-testid="prompt-textarea"]'
    ]
  },

  claude: {
    label: 'Claude',
    hosts: ['claude.ai'],
    capture: [
      { match: '/chat_conversations/', kind: 'conversation' },
      { match: '/upload', kind: 'upload' }
    ],
    streamMatch: '/completion',
    models: {
      default: { context: 200000, label: 'Claude' },
      'claude-opus-5': { context: 200000 },
      'claude-sonnet-5': { context: 200000 }
    },
    media: { window: 'conversation', limit: 20, note: 'Attachments per conversation' },
    composer: [
      'div[contenteditable="true"].ProseMirror',
      'div[enterkeyhint="enter"][contenteditable="true"]'
    ]
  },

  gemini: {
    label: 'Gemini',
    hosts: ['gemini.google.com'],
    // Gemini talks over batchexecute RPC with opaque, positional payloads.
    // Network capture is unreliable here, so this adapter reads the DOM.
    capture: [],
    streamMatch: null,
    domOnly: true,
    models: {
      default: { context: 1000000, label: 'Gemini' }
    },
    media: { window: 'conversation', limit: 10, note: 'Files per conversation' },
    composer: ['rich-textarea div[contenteditable="true"]', 'div.ql-editor[contenteditable="true"]']
  },

  grok: {
    label: 'Grok',
    hosts: ['grok.com'],
    capture: [
      { match: '/rest/app-chat/conversations/', kind: 'conversation' },
      { match: '/rest/app-chat/upload-file', kind: 'upload' }
    ],
    streamMatch: '/responses',
    models: {
      default: { context: 128000, label: 'Grok' }
    },
    media: { window: 'day', limit: 20, note: 'Image uploads per day' },
    composer: ['textarea[aria-label]', 'div[contenteditable="true"]']
  }
};

export function providerForHost(hostname = location.hostname) {
  for (const [id, p] of Object.entries(PROVIDERS)) {
    if (p.hosts.some((h) => hostname === h || hostname.endsWith('.' + h))) {
      return { id, ...p };
    }
  }
  return null;
}

export function contextWindowFor(providerId, model) {
  const p = PROVIDERS[providerId];
  if (!p) return null;
  const entry = (model && p.models[model]) || p.models.default;
  return entry?.context ?? null;
}
