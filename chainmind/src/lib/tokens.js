// Chain Mind — Made by Suvhankar Dutta
// Token estimation.
//
// No vendor exposes a "tokens used" counter to the browser, so every number
// Chain Mind shows is an estimate. This module keeps the estimate honest by
// being script-aware instead of using the usual chars/4 shortcut, which is
// wrong by 40%+ on code and by 3x on Chinese or Japanese.
//
// To upgrade to exact counts for OpenAI models, bundle `gpt-tokenizer` and
// swap `countText` for its `encode(text).length`. The rest of the extension
// only talks to this module's exported functions.

const RE_CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/gu;
const RE_WORD = /[A-Za-z\u00c0-\u024f]+/g;
const RE_DIGIT = /\d+/g;
// CJK is handled on its own line below, so it must be excluded here or every
// character gets counted twice.
const RE_SYMBOL =
  /[^\s A-Za-z\u00c0-\u024f\d\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/gu;

// Code is punctuation-dense and full of subword identifiers, so it tokenizes
// noticeably worse than prose. Detect it rather than pretending it's the same.
function codeDensity(text) {
  if (!text) return 0;
  const fenced = (text.match(/```/g) || []).length >= 2;
  const symbols = (text.match(/[{}()[\];<>=|&/\\_$#@]/g) || []).length;
  const ratio = symbols / Math.max(text.length, 1);
  if (fenced) return Math.min(1, 0.6 + ratio * 4);
  return Math.min(1, ratio * 6);
}

export function countText(text) {
  if (!text) return 0;

  const cjk = (text.match(RE_CJK) || []).length;
  const words = (text.match(RE_WORD) || []).length;
  const digits = (text.match(RE_DIGIT) || []).join('').length;
  const symbols = (text.match(RE_SYMBOL) || []).length;

  // Latin prose runs about 1.15 tokens per word once punctuation is counted on
  // its own line. CJK is close to one token per character. Digits split into
  // short runs. Symbols are mostly one token each.
  const prose = words * 1.15 + cjk * 1.0 + digits * 0.5 + symbols * 0.85;

  // Under heavy code, blend toward a chars/3.1 model.
  const d = codeDensity(text);
  const codey = text.length / 3.1;

  return Math.ceil(prose * (1 - d) + codey * d);
}

// Images are not free. These are rough vendor-shaped approximations.
export function countImage({ width, height, provider } = {}) {
  if (!width || !height) return provider === 'claude' ? 1400 : 800;
  if (provider === 'claude') {
    // Roughly (w * h) / 750, capped near the 1568px long-edge resize.
    const scale = Math.min(1, 1568 / Math.max(width, height));
    return Math.ceil((width * scale * (height * scale)) / 750);
  }
  // OpenAI-style tiling: a base cost plus 512px tiles.
  const tiles = Math.ceil(width / 512) * Math.ceil(height / 512);
  return 85 + tiles * 170;
}

export function countMessage(message, provider) {
  let total = 4; // per-message role and delimiter overhead
  for (const part of message.content || []) {
    if (part.type === 'text') total += countText(part.text);
    else if (part.type === 'image') total += countImage({ ...part, provider });
    else if (part.type === 'file') total += countText(part.text || '') || 750;
  }
  return total;
}

export function countConversation(conversation) {
  const provider = conversation.source?.provider;
  let total = conversation.system ? countText(conversation.system) : 0;
  for (const m of conversation.messages || []) total += countMessage(m, provider);
  return total;
}

// Estimates are directional, so say so in the UI. Error grows with length.
export function confidenceBand(tokens) {
  const pct = tokens > 50000 ? 0.08 : tokens > 5000 ? 0.12 : 0.2;
  return { low: Math.round(tokens * (1 - pct)), high: Math.round(tokens * (1 + pct)), pct };
}
