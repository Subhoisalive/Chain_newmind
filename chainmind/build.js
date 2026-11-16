#!/usr/bin/env node
// Chain Mind — Made by Suvhankar Dutta
// Flattens the ES modules into one plain content script.
//
// Why this exists: a content script cannot be type="module", and dynamic
// import() from a content script is evaluated against the HOST page's Content
// Security Policy rather than the extension's. ChatGPT, Claude, Gemini, and
// Grok all ship strict policies, so the import is refused and takes the whole
// script down with it. Concatenating sidesteps CSP entirely.
//
// The modules stay the source of truth: the popup is a real extension page and
// imports them normally, so there is one copy of every function.
//
// Run: node build.js   (no dependencies, no install)

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'src/content/content.bundle.js');

// Order matters: each file may use names defined above it.
const SOURCES = [
  'src/lib/providers.js',
  'src/lib/tokens.js',
  'src/lib/catalog.js',
  'src/lib/quota.js',
  'src/lib/schema.js',
  'src/lib/recommend.js',
  // Security suite. events.js and policy.js first — everything else in this
  // group calls into one or both of them.
  'src/lib/security/textutil.js',
  'src/lib/security/settings.js',
  'src/lib/security/events.js',
  'src/lib/security/policy.js',
  'src/lib/security/injection.js',
  'src/lib/security/dlp.js',
  'src/lib/security/codeScanner.js',
  'src/lib/security/agentMonitor.js',
  'src/lib/security/contextIntegrity.js',
  'src/lib/security/originality.js',
  'src/lib/security/cleaner.js',
  'src/lib/security/hidden.js',
  'src/lib/security/encoding.js',
  'src/lib/security/links.js',
  'src/lib/security/deps.js',
  'src/lib/security/entropy.js',
  'src/lib/security/sanitize.js',
  'src/lib/security/compress.js',
  'src/lib/security/handoff.js',
  'src/lib/security/archive.js',
  'src/lib/security/firewall.js',
  'src/content/adapters.js',
  'src/ui/hud.js',
  'src/content/guards.js',
  'src/content/bridge-core.js'
];

function strip(source, file) {
  const out = [];
  let dropping = false;

  for (const line of source.split('\n')) {
    if (dropping) {
      if (/from\s+['"].*['"];?\s*$/.test(line)) dropping = false;
      continue;
    }
    // Whole-line import, single or multi-line.
    if (/^\s*import\s/.test(line)) {
      if (!/from\s+['"].*['"];?\s*$/.test(line)) dropping = true;
      continue;
    }
    // Re-export blocks have no meaning once flattened.
    if (/^\s*export\s*\{/.test(line)) continue;
    // `export const x` -> `const x`
    out.push(line.replace(/^(\s*)export\s+(const|let|var|function|class|async)\b/, '$1$2'));
  }

  return `// ---- ${file} ${'-'.repeat(Math.max(0, 66 - file.length))}\n${out.join('\n')}`;
}

const parts = SOURCES.map((rel) => {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) throw new Error(`Missing source file: ${rel}`);
  return strip(fs.readFileSync(full, 'utf8'), rel);
});

const banner = `// GENERATED FILE - do not edit.
// Built from the modules in src/ by build.js. Edit those, then re-run:
//   node build.js
// Built ${new Date().toISOString()}
`;

const bundle = `${banner}
(function () {
'use strict';

${parts.join('\n\n')}

})();
`;

fs.writeFileSync(OUT, bundle);

// Fail loudly if anything survived that would break at load time.
const leftovers = bundle.split('\n').filter((l) => /^\s*(import|export)\s/.test(l));
if (leftovers.length) {
  console.error('Bundle still contains module syntax:\n' + leftovers.join('\n'));
  process.exit(1);
}

// Two top-level `const x` with the same name is a syntax error that only shows
// up when the browser loads the bundle, which is a long way from here. Catch it
// at build time instead.
const declared = new Map();
for (const line of bundle.split('\n')) {
  const m = line.match(/^(?:const|let|function|class|async function)\s+([A-Za-z_$][\w$]*)/);
  if (!m) continue;
  const count = (declared.get(m[1]) || 0) + 1;
  declared.set(m[1], count);
}
const clashes = [...declared].filter(([, n]) => n > 1).map(([name]) => name);
if (clashes.length) {
  console.error('Duplicate top-level declarations in bundle: ' + clashes.join(', '));
  process.exit(1);
}

console.log(`Wrote ${path.relative(ROOT, OUT)} — ${SOURCES.length} modules, ${(bundle.length / 1024).toFixed(1)} kB`);
