// Chain Mind — Made by Suvhankar Dutta
// Prompt injection detection. Offline, pattern-based, and honest about the
// limits of that: a determined rewrite of any of these phrasings can slip
// past a regex. What this buys is the common, high-signal shapes — the ones
// copy-pasted between jailbreak lists — caught for free, with enough detail
// logged to tell a false positive from a real one and tune later.

// Direct: the text itself, whoever typed it, is trying to override rules.
const DIRECT_PATTERNS = [
  [/ignore (all|any|the)? ?(previous|prior|above|earlier) (instructions|prompts|rules)/i, 'Direct override attempt', 'high'],
  [/disregard (all|any|the)? ?(previous|prior|above|earlier)/i, 'Direct override attempt', 'high'],
  [/forget (everything|all) (you were|i) (told|said)/i, 'Instruction reset attempt', 'high'],
  [/you are now (?!a helpful)[a-z0-9 _-]{2,40}(?:,| —| -|\.|$)/i, 'Persona hijack attempt', 'medium'],
  [/(reveal|print|show|output|leak) (your|the) (system prompt|hidden (instructions|prompt))/i, 'System prompt exfiltration attempt', 'high'],
  [/act as (?:if you have |)no (restrictions|rules|filters|guardrails)/i, 'Guardrail bypass attempt', 'high'],
  [/enter (developer|debug|god|admin) mode/i, 'Privileged-mode bypass attempt', 'high'],
  [/\bdo anything now\b|\bDAN mode\b/i, 'Known jailbreak pattern (DAN)', 'high'],
  [/\bsudo\b[^\n]{0,20}\b(unlock|override|bypass)\b/i, 'Fake privilege escalation', 'medium'],
  [/pretend (?:the|any|all) (?:safety|content) (?:polic(?:y|ies)|guidelines?) (?:do not|don't) apply/i, 'Policy-bypass framing', 'high']
];

// Indirect: an imperative addressed to "the AI" sitting inside content that
// was not the user's own turn — a scraped page, a PDF, a tool result. This is
// the shape that matters most, because the user never saw it and never typed
// it; it rode in on data the assistant was asked to read.
const INDIRECT_MARKERS = [
  [/\b(assistant|ai|model)[,:]\s*(please |you must |you should |from now on )?(ignore|disregard|now do|now output|do not tell)/i, 'Instruction addressed to the AI, embedded in fetched content', 'critical'],
  [/<!--\s*(assistant|system)[\s\S]{0,200}-->/i, 'Hidden HTML-comment instruction', 'critical'],
  [/\[(system|instruction)s?\]\s*:?/i, 'Fake system/instruction tag embedded in content', 'high'],
  [/when (?:the |a |an )?(?:ai|assistant|model|llm) reads this/i, 'Content addressed directly to an AI reader', 'high'],
  [/if you are an ai (?:reading|processing|summarizing) this/i, 'Content addressed directly to an AI reader', 'high']
];

// origin: 'user' (typed live), 'assistant' (model's own reply), 'tool'
// (function/tool result), 'fetched' (webpage/PDF pulled in verbatim).
export function scanForInjection(text, { origin = 'user' } = {}) {
  if (!text) return [];
  const hits = [];

  for (const [re, label, severity] of DIRECT_PATTERNS) {
    const m = text.match(re);
    if (m) hits.push({ kind: 'direct', label, match: m[0].slice(0, 140), severity });
  }

  for (const [re, label, severity] of INDIRECT_MARKERS) {
    const m = text.match(re);
    if (!m) continue;
    // Same marker, different stakes: it is critical when it arrived in
    // content the user never authored, and merely worth a flag when it shows
    // up inside something the user typed or pasted themselves.
    const scoped = origin === 'fetched' || origin === 'tool' ? severity : 'medium';
    const kind = origin === 'fetched' || origin === 'tool' ? 'indirect' : 'indirect-pasted';
    hits.push({ kind, label, match: m[0].slice(0, 140), severity: scoped });
  }

  return hits;
}
