// Chain Mind — Made by Suvhankar Dutta
// AI agent action monitor. Chain Mind reads a chat's transcript text, not the
// model's live tool-call stream, so this works one step removed: it looks for
// the shapes an action takes once it is written down — a shell fence, a
// fetch/curl call, a file write, a SQL statement — and runs each one past the
// least-privilege policy. Text-pattern extraction, not a sandbox: it catches
// what the model said it would do, not what actually ran.

import { evaluate } from './policy.js';

const EXTRACTORS = [
  { action: 'shell', re: /```(?:bash|sh|shell|zsh)\n([\s\S]*?)```/g, pick: (m) => m[1] },
  { action: 'shell', re: /\b(?:os\.system|subprocess\.(?:run|call|Popen))\(\s*['"]([^'"]+)['"]/g, pick: (m) => m[1] },
  { action: 'file_write', re: /\bfs\.writeFile(?:Sync)?\(\s*['"]([^'"]+)['"]/gi, pick: (m) => m[1] },
  { action: 'file_write', re: /\bopen\(\s*['"]([^'"]+)['"]\s*,\s*['"]w/gi, pick: (m) => m[1] },
  { action: 'network', re: /\b(?:fetch|axios\.(?:get|post|put|delete)|requests\.(?:get|post|put|delete))\(\s*['"]([^'"]+)['"]/gi, pick: (m) => m[1] },
  { action: 'network', re: /\bcurl\s+[^\n]*?(https?:\/\/[^\s'"]+)/gi, pick: (m) => m[1] },
  { action: 'database', re: /\b(SELECT|INSERT|UPDATE|DELETE|DROP|TRUNCATE|CREATE\s+TABLE|ALTER\s+TABLE)\b[^\n;]{0,240}/gi, pick: (m) => m[0] }
];

export function extractActions(text) {
  if (!text) return [];
  const found = [];
  for (const { action, re, pick } of EXTRACTORS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const value = pick(m)?.trim();
      if (value) found.push({ action, value: value.slice(0, 300) });
    }
  }
  return found;
}

// policy: the rule list from policy.js's getPolicy(), passed in rather than
// loaded here so a caller scanning many messages only reads storage once.
export function monitorAgentActions(text, policy) {
  return extractActions(text).map((a) => ({ ...a, ...evaluate(policy, a.action, a.value) }));
}
