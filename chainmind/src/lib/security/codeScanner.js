// Chain Mind — Made by Suvhankar Dutta
// AI code security scanner. Regex against common vulnerability shapes in
// AI-generated code, each mapped to an OWASP Top 10 category and a CWE id so
// a finding is checkable against something outside this file. Pattern
// matching cannot prove a vulnerability — only point at code worth a human's
// attention — so findings are worded as "looks like", not "is".

export const CODE_RULES = [
  { id: 'sqli-concat', name: 'SQL query built by string concatenation', owasp: 'A03:2021 – Injection', cwe: 'CWE-89', severity: 'high',
    re: /\b(SELECT|INSERT|UPDATE|DELETE)\b[^\n;]{0,120}['"]\s*\+\s*\w+/gi },
  { id: 'sqli-template', name: 'SQL query built from a template literal', owasp: 'A03:2021 – Injection', cwe: 'CWE-89', severity: 'high',
    re: /`[^`]*\b(SELECT|INSERT|UPDATE|DELETE)\b[^`]*\$\{[^}]+\}[^`]*`/gi },
  { id: 'xss-innerhtml', name: 'Untrusted value written via innerHTML', owasp: 'A03:2021 – Injection', cwe: 'CWE-79', severity: 'medium',
    re: /\.innerHTML\s*=\s*(?!['"`]\s*['"`]?\s*;?\s*$)[^;]+/g },
  { id: 'cmd-injection', name: 'Shell command built from a variable', owasp: 'A03:2021 – Injection', cwe: 'CWE-78', severity: 'high',
    re: /\b(?:exec|system|popen|os\.system|subprocess\.(?:call|run|Popen))\([^)]*\+[^)]*\)/gi },
  { id: 'ssrf-user-url', name: 'Outbound request built from unvalidated request input', owasp: 'A10:2021 – SSRF', cwe: 'CWE-918', severity: 'high',
    re: /\b(?:fetch|requests\.get|axios\.get)\(\s*(?:req\.(?:query|body|params)|request\.(?:args|form|json))/gi },
  { id: 'hardcoded-secret', name: 'Hardcoded credential in source', owasp: 'A07:2021 – Identification & Auth Failures', cwe: 'CWE-798', severity: 'high',
    re: /\b(?:password|api_key|secret)\s*=\s*['"][^'"]{6,}['"]/gi },
  { id: 'insecure-hash', name: 'Weak hash (MD5/SHA1) used where security matters', owasp: 'A02:2021 – Cryptographic Failures', cwe: 'CWE-327', severity: 'medium',
    re: /\b(?:hashlib\.md5|hashlib\.sha1|crypto\.createHash\(['"]md5['"]\))\s*\(/g },
  { id: 'eval-usage', name: 'Dynamic code execution via eval/exec', owasp: 'A03:2021 – Injection', cwe: 'CWE-95', severity: 'high',
    re: /\b(?:eval|exec)\s*\(/g },
  { id: 'insecure-random', name: 'Non-cryptographic RNG used for a token/secret', owasp: 'A02:2021 – Cryptographic Failures', cwe: 'CWE-330', severity: 'medium',
    re: /\bMath\.random\(\)[^\n]{0,40}\b(token|password|secret|key)\b/gi },
  { id: 'disabled-tls-verify', name: 'TLS certificate verification disabled', owasp: 'A02:2021 – Cryptographic Failures', cwe: 'CWE-295', severity: 'high',
    re: /\b(?:verify\s*=\s*False|rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0)/gi },
  { id: 'path-traversal', name: 'File path built from unvalidated request input', owasp: 'A01:2021 – Broken Access Control', cwe: 'CWE-22', severity: 'medium',
    re: /\b(?:open|readFile(?:Sync)?)\([^)]*(?:req\.|request\.|params\.)[^)]*\)/gi }
];

export function scanCode(text) {
  if (!text) return [];
  const findings = [];
  const blocks = [...text.matchAll(/```[a-z0-9]*\n([\s\S]*?)```/gi)].map((m) => m[1]);
  const targets = blocks.length ? blocks : [text];

  for (const code of targets) {
    for (const rule of CODE_RULES) {
      rule.re.lastIndex = 0;
      const m = rule.re.exec(code);
      if (m) {
        findings.push({
          id: rule.id,
          name: rule.name,
          owasp: rule.owasp,
          cwe: rule.cwe,
          severity: rule.severity,
          sample: m[0].trim().slice(0, 160)
        });
      }
    }
  }
  return findings;
}
