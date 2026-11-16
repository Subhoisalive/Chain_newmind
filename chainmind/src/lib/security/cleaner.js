// Chain Mind — Made by Suvhankar Dutta
// AI output cleaner. Strips the small set of things that make AI text read as
// AI text: throat-clearing openers, a handful of stock phrases that show up
// in almost every model's output, and sentences repeated verbatim later in
// the same reply. Rewrites the surface, never the substance — it does not
// touch code blocks, and it never invents or removes a claim.

const FILLER_OPENERS = [
  /^(?:certainly|sure|absolutely|of course)[!,.]?\s+/i,
  /^(?:i'd be happy to|i'm happy to|great question[!.]?)\s+/i,
  /^as an ai(?: language model)?,?\s+/i,
  /^in (?:today's|this) (?:fast-paced|ever-evolving|rapidly changing) world,?\s+/i
];

const GENERIC_PHRASES = [
  [/\bit'?s important to note that\b\s*/gi, ''],
  [/\bin conclusion,?\s*/gi, ''],
  [/\bat the end of the day,?\s*/gi, ''],
  [/\bdelve into\b/gi, 'look at'],
  [/\bleverage\b/gi, 'use'],
  [/\bin today's digital age,?\s*/gi, ''],
  [/\bit goes without saying that\b\s*/gi, '']
];

// Code blocks are off-limits: a repeated line of code is often correct (a
// closing brace, a repeated import) and stock phrases inside a string literal
// are the user's data, not the model's prose.
function splitCodeFences(text) {
  const parts = [];
  let last = 0;
  const re = /```[\s\S]*?```/g;
  let m;
  while ((m = re.exec(text))) {
    parts.push({ code: false, text: text.slice(last, m.index) });
    parts.push({ code: true, text: m[0] });
    last = m.index + m[0].length;
  }
  parts.push({ code: false, text: text.slice(last) });
  return parts;
}

function dedupeSentences(text) {
  const seen = new Set();
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => {
      const key = s.trim().toLowerCase();
      if (!key) return s.trim().length === 0;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(' ');
}

function cleanProse(text) {
  const changes = [];
  let out = text;

  for (const re of FILLER_OPENERS) {
    if (re.test(out)) {
      out = out.replace(re, '');
      changes.push('Removed filler opener');
    }
  }
  for (const [re, replacement] of GENERIC_PHRASES) {
    if (re.test(out)) {
      out = out.replace(re, replacement);
      changes.push('Replaced generic AI phrasing');
    }
  }
  const before = out.split(/(?<=[.!?])\s+/).length;
  out = dedupeSentences(out);
  if (out.split(/(?<=[.!?])\s+/).length < before) changes.push('Removed repeated sentence(s)');

  return { text: out, changes };
}

export function cleanOutput(text) {
  if (!text) return { text, changes: [] };
  const parts = splitCodeFences(text);
  const allChanges = [];
  const out = parts
    .map((p) => {
      if (p.code) return p.text;
      const { text: cleaned, changes } = cleanProse(p.text);
      allChanges.push(...changes);
      return cleaned;
    })
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim();

  return { text: out, changes: [...new Set(allChanges)] };
}
