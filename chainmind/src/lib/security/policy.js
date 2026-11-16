// Chain Mind — Made by Suvhankar Dutta
// Least-privilege policy engine. A short, ordered list of rules — first match
// wins — deciding whether an action an agent describes taking is allowed
// outright, blocked outright, or needs a human to say yes first. Ships with a
// conservative default; edit it from the dashboard, stored under
// 'policyRules' so a change survives a reload.

export const ACTIONS = ['shell', 'file_write', 'file_read', 'network', 'database'];

export const DEFAULT_POLICY = [
  { id: 'block-rm-rf', action: 'shell', pattern: '\\brm\\s+-rf\\s+/(?!\\w)', effect: 'BLOCK', reason: 'Recursive delete from filesystem root' },
  { id: 'block-curl-pipe-sh', action: 'shell', pattern: '\\b(curl|wget)\\b[^\\n]*\\|\\s*(sh|bash)\\b', effect: 'BLOCK', reason: 'Piping a remote script straight into a shell' },
  { id: 'block-fork-bomb', action: 'shell', pattern: ':\\(\\)\\s*\\{\\s*:\\|:', effect: 'BLOCK', reason: 'Fork bomb pattern' },
  { id: 'approve-shell', action: 'shell', pattern: '.*', effect: 'REQUIRE_APPROVAL', reason: 'Any shell command needs a human to confirm' },

  { id: 'block-write-system', action: 'file_write', pattern: '^/(etc|boot|sys|proc|bin|sbin)(/|$)', effect: 'BLOCK', reason: 'Write target is a system path' },
  { id: 'approve-write', action: 'file_write', pattern: '.*', effect: 'REQUIRE_APPROVAL', reason: 'Any file write needs a human to confirm' },

  { id: 'block-network-internal', action: 'network', pattern: '169\\.254\\.169\\.254|localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0|::1|\\b10\\.\\d+\\.\\d+\\.\\d+\\b|192\\.168\\.', effect: 'BLOCK', reason: 'Request targets a local or cloud-metadata address (possible SSRF)' },
  { id: 'approve-network', action: 'network', pattern: '.*', effect: 'REQUIRE_APPROVAL', reason: 'Outbound network request needs a human to confirm' },

  { id: 'block-db-destructive', action: 'database', pattern: '\\b(DROP|TRUNCATE|DELETE\\s+FROM\\s+\\w+\\s*(;|$))\\b', effect: 'BLOCK', reason: 'Destructive statement with no visible WHERE clause' },
  { id: 'approve-db', action: 'database', pattern: '.*', effect: 'REQUIRE_APPROVAL', reason: 'Any database write needs a human to confirm' },

  { id: 'allow-read', action: 'file_read', pattern: '.*', effect: 'ALLOW', reason: 'Reads are low-risk by default' }
];

export async function getPolicy() {
  const store = await chrome.storage.local.get('policyRules');
  return store.policyRules && store.policyRules.length ? store.policyRules : DEFAULT_POLICY;
}

export async function setPolicy(rules) {
  await chrome.storage.local.set({ policyRules: rules });
}

export async function resetPolicy() {
  await chrome.storage.local.remove('policyRules');
}

export function evaluate(policy, action, value) {
  const text = value || '';
  for (const rule of policy) {
    if (rule.action !== action) continue;
    let re;
    try {
      re = new RegExp(rule.pattern, 'i');
    } catch {
      continue; // a hand-edited bad pattern should not crash the scan
    }
    if (re.test(text)) return { effect: rule.effect, reason: rule.reason, ruleId: rule.id };
  }
  return { effect: 'ALLOW', reason: 'No matching rule — default allow', ruleId: null };
}
