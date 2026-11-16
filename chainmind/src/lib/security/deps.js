// Chain Mind — Made by Suvhankar Dutta
// Dependency check for AI-generated install commands. Models invent package
// names and attackers register the invented names ("slopsquatting"), or
// register near-misses of popular ones. Offline, this can catch the second
// kind by comparing against a list of popular packages. It cannot tell
// whether an unfamiliar name exists on a registry — that needs a lookup, so
// unfamiliar names are not judged either way.

import { editDistance } from './textutil.js';

const POPULAR_NPM = [
  'react', 'react-dom', 'express', 'lodash', 'axios', 'typescript', 'webpack', 'vite', 'next', 'vue', 'angular',
  'jquery', 'moment', 'dayjs', 'chalk', 'commander', 'dotenv', 'eslint', 'prettier', 'jest', 'mocha', 'babel',
  'mongoose', 'redux', 'rxjs', 'socket.io', 'cors', 'body-parser', 'jsonwebtoken', 'bcrypt', 'uuid', 'yargs',
  'request', 'async', 'underscore', 'tailwindcss', 'postcss', 'nodemon', 'passport', 'sequelize', 'prisma',
  'zod', 'openai', 'puppeteer', 'cheerio', 'inquirer', 'glob', 'rimraf', 'debug', 'semver', 'colors', 'cross-env',
  'node-fetch', 'ws', 'pg', 'mysql2', 'redis', 'svelte', 'three', 'd3', 'chart.js', 'firebase', 'stripe'
];
const POPULAR_PIP = [
  'requests', 'numpy', 'pandas', 'flask', 'django', 'scipy', 'matplotlib', 'pytest', 'boto3', 'tensorflow', 'torch',
  'scikit-learn', 'beautifulsoup4', 'sqlalchemy', 'pillow', 'pyyaml', 'urllib3', 'cryptography', 'fastapi',
  'uvicorn', 'pydantic', 'selenium', 'opencv-python', 'jinja2', 'click', 'setuptools', 'wheel', 'httpx',
  'aiohttp', 'celery', 'redis', 'psycopg2', 'pymongo', 'openai', 'anthropic', 'transformers', 'keras', 'lxml',
  'paramiko', 'gunicorn', 'black', 'flake8', 'mypy', 'tqdm', 'rich', 'python-dotenv', 'certifi', 'six', 'attrs',
  'colorama', 'pycryptodome', 'scrapy', 'seaborn', 'plotly', 'streamlit', 'langchain'
];

function tokens(args, valueFlags) {
  const out = [];
  const parts = args.trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.startsWith('-')) {
      if (valueFlags.includes(p)) i++;
      continue;
    }
    out.push(p.replace(/^['"]|['"]$/g, ''));
  }
  return out;
}

export function extractPackages(text) {
  const found = [];
  for (const m of text.matchAll(/\b(?:npm|pnpm|yarn|bun)\s+(?:i|install|add)\b([^\n`;&|]*)/g)) {
    for (const t of tokens(m[1], ['--registry', '--prefix'])) {
      if (/^(?:https?:|git\+|file:|\.|\/)/.test(t)) {
        found.push({ eco: 'npm', name: t, special: 'url' });
        continue;
      }
      const name = t.replace(/^(@[^/]+\/[^@]+|[^@]+)@.*$/, '$1');
      if (name) found.push({ eco: 'npm', name });
    }
    if (/--registry\s+https?:\/\/(?!registry\.npmjs\.org)/.test(m[1])) found.push({ eco: 'npm', name: 'custom registry', special: 'index' });
  }
  for (const m of text.matchAll(/\bpip3?\s+install\b([^\n`;&|]*)/g)) {
    for (const t of tokens(m[1], ['-r', '-e', '-c', '-i', '--index-url', '--extra-index-url', '-f', '--find-links', '-t'])) {
      if (/^(?:https?:|git\+|file:|\.|\/)/.test(t)) {
        found.push({ eco: 'pip', name: t, special: 'url' });
        continue;
      }
      const name = t.split(/[=<>!~;[]/)[0].toLowerCase().replace(/_/g, '-');
      if (name) found.push({ eco: 'pip', name });
    }
    if (/--(?:extra-)?index-url|\s-i\s/.test(m[1])) found.push({ eco: 'pip', name: 'custom index', special: 'index' });
  }
  return found;
}

export function scanDependencies(text) {
  if (!text) return [];
  const hits = [];
  const seen = new Set();
  for (const pkg of extractPackages(text)) {
    const key = `${pkg.eco}:${pkg.name}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (pkg.special === 'url') {
      hits.push({ label: `${pkg.eco} install from a URL or path, not the registry`, severity: 'medium', match: pkg.name.slice(0, 100) });
      continue;
    }
    if (pkg.special === 'index') {
      hits.push({ label: `${pkg.eco} install from a non-default package index`, severity: 'medium', match: pkg.name });
      continue;
    }
    const list = pkg.eco === 'npm' ? POPULAR_NPM : POPULAR_PIP;
    if (list.includes(pkg.name) || pkg.name.startsWith('@types/')) continue;
    if (pkg.name.startsWith('@')) continue;
    for (const known of list) {
      if (known.length < 5) continue;
      const d = editDistance(pkg.name, known);
      const limit = known.length >= 9 ? 2 : 1;
      if (d >= 1 && d <= limit) {
        hits.push({ label: `Possible typosquat of "${known}" (${pkg.eco})`, severity: 'high', match: `${pkg.name} — check the registry before installing` });
        break;
      }
    }
  }
  return hits;
}
