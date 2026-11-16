// Chain Mind — Made by Suvhankar Dutta
// AI data loss prevention. Detects and redacts the shapes of secret and PII
// that most often end up pasted into a chat by accident — a stack trace with
// a key still in it, a .env dumped for debugging, a connection string copied
// along with everything around it. Pattern-based, so it catches known shapes
// well and unusual ones not at all; treat it as a net under the user, not a
// substitute for a real secrets scanner in CI.

function luhnValid(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export const DLP_RULES = [
  { name: 'AWS Access Key', re: /\bAKIA[0-9A-Z]{16}\b/g, severity: 'critical' },
  { name: 'AWS Secret Key', re: /\baws_secret_access_key\s*[:=]\s*['"]?[A-Za-z0-9/+=]{40}['"]?/gi, severity: 'critical' },
  { name: 'Private Key Block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----/g, severity: 'critical' },
  { name: 'Stripe Key', re: /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g, severity: 'critical' },
  { name: 'GitHub Token', re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, severity: 'high' },
  { name: 'Slack Token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, severity: 'high' },
  { name: 'JSON Web Token', re: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, severity: 'high' },
  { name: 'Database Connection String', re: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s'"]+/gi, severity: 'high' },
  { name: 'Generic API Key / Token', re: /\b(?:api[_-]?key|apikey|secret[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}['"]?/gi, severity: 'high' },
  { name: 'Password Assignment', re: /\b(?:password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"]{6,}['"]?/gi, severity: 'high' },
  { name: 'US Social Security Number', re: /\b\d{3}-\d{2}-\d{4}\b/g, severity: 'high' },
  { name: 'Credit Card Number', re: /\b(?:\d[ -]*?){13,16}\b/g, severity: 'high', validate: luhnValid },
  { name: 'Email Address', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, severity: 'low' },
  { name: 'Phone Number', re: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, severity: 'low' }
];

function mask(value) {
  const v = value.trim();
  if (v.length <= 8) return '*'.repeat(v.length);
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

export function scanForSecrets(text) {
  if (!text) return [];
  const findings = [];
  for (const rule of DLP_RULES) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(text))) {
      if (rule.validate && !rule.validate(m[0])) continue;
      findings.push({ name: rule.name, severity: rule.severity, sample: mask(m[0]), index: m.index });
    }
  }
  return findings;
}

export function redact(text) {
  if (!text) return { text, redactions: 0 };
  let redactions = 0;
  let out = text;
  for (const rule of DLP_RULES) {
    rule.re.lastIndex = 0;
    out = out.replace(rule.re, (m) => {
      if (rule.validate && !rule.validate(m)) return m;
      redactions++;
      return `[REDACTED:${rule.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}]`;
    });
  }
  return { text: out, redactions };
}
