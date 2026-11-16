// Chain Mind — Made by Suvhankar Dutta
import { toMarkdown, validate, compactExtractive, HANDOFF_PROMPT } from '../lib/schema.js';
import { prepareHandoff } from '../lib/security/handoff.js';
import { getSettings, setSettings } from '../lib/security/settings.js';
import { sanitizeHandoff } from '../lib/security/sanitize.js';
import { contextWindowFor } from '../lib/providers.js';
import { availability, describeReset } from '../lib/quota.js';
import { rankProviders, profileConversation, suggestTools, handoffToolPrompt } from '../lib/recommend.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const status = (text, tone = '') => {
  const el = $('[data-status]');
  el.textContent = text;
  el.dataset.tone = tone;
};

let incoming = null; // conversation loaded from a file
let tabId = null;
let lastQuery = '';

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function ask(type, payload = {}) {
  return chrome.tabs.sendMessage(tabId, { type, ...payload }).catch(() => null);
}

function download(name, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  chrome.downloads?.download
    ? chrome.downloads.download({ url, filename: name })
    : Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const safe = (s) => (s || 'conversation').replace(/[^\w\s-]/g, '').trim().slice(0, 60).replace(/\s+/g, '-');

// Storage is only populated after a successful read. If the popup opens first,
// or a read failed, ask the tab directly rather than reporting "nothing here".
async function liveState() {
  const { lastState } = await chrome.storage.local.get('lastState');
  if (lastState && Date.now() - lastState.updatedAt < 60_000) return lastState;
  const res = await ask('chainmind:get');
  if (!res) return lastState || null;
  // Give the content script a beat to write what it just scraped.
  await new Promise((r) => setTimeout(r, 250));
  return (await chrome.storage.local.get('lastState')).lastState || lastState || null;
}

async function render() {
  const tab = await activeTab();
  tabId = tab?.id;

  const supported = /chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com|grok\.com/.test(tab?.url || '');
  if (!supported) {
    $('[data-sub]').textContent = 'This page is not one of the supported assistants.';
    // The advisor does not need a conversation, so leave it usable here.
    return;
  }

  const alive = await ask('chainmind:ping');
  if (!alive) {
    $('[data-title]').textContent = 'Not running on this tab';
    $('[data-sub]').textContent = 'Reload the page, then open this again.';
    return status('The content script has not loaded here yet.', 'bad');
  }

  const lastState = await liveState();
  if (!lastState) {
    $('[data-title]').textContent = 'Still reading this chat';
    $('[data-sub]').textContent = 'Scroll the thread once so the messages render.';
    return;
  }

  $('[data-title]').textContent = lastState.title;
  $('[data-sub]').textContent = `${lastState.providerLabel}${lastState.model ? ` · ${lastState.model}` : ''}`;

  const meter = $('[data-meter]');
  meter.hidden = false;
  const pct = lastState.limit ? Math.min(1, lastState.used / lastState.limit) : 0;
  const signal = pct >= 0.9 ? '#ff4d6d' : pct >= 0.7 ? '#ffc53d' : '#39ff14';
  document.documentElement.style.setProperty('--signal', signal);

  $('[data-remaining]').textContent =
    lastState.remaining == null ? '—' : lastState.remaining.toLocaleString();
  $('[data-fill]').style.width = `${pct * 100}%`;
  $('[data-used]').textContent = `~${lastState.used.toLocaleString()} of ${
    lastState.limit ? lastState.limit.toLocaleString() : '?'
  }`;
  $('[data-messages]').textContent = lastState.messages;
  $('[data-media]').textContent = lastState.media.limit
    ? `${lastState.media.used} of ~${lastState.media.limit}`
    : String(lastState.media.used);

  renderHops(lastState, pct);
  renderSecurity();
}

// --- firewall summary --------------------------------------------------
// Always visible, like the other consoles: green when clear, amber when
// something needs a look, red when something was blocked.
async function renderSecurity() {
  const res = await ask('chainmind:get');
  const security = res?.security;
  const group = $('[data-security-group]');
  const total = security ? security.blocked + security.requireApproval + security.flagged : 0;
  if (!total) {
    group.dataset.level = 'clear';
    $('[data-security-summary]').textContent = 'All clear · firewall active';
    return;
  }
  group.dataset.level = security.blocked ? 'block' : security.requireApproval ? 'warn' : 'warn';
  const parts = [];
  if (security.blocked) parts.push(`${security.blocked} blocked`);
  if (security.requireApproval) parts.push(`${security.requireApproval} approvals pending`);
  if (security.flagged) parts.push(`${security.flagged} flagged`);
  $('[data-security-summary]').textContent = parts.join(' · ');
}

const openDashboard = (tab) => chrome.runtime.sendMessage({ type: 'chainmind:openDashboard', tab });
$('[data-open-dashboard]').addEventListener('click', () => openDashboard());
$$('[data-open-tab]').forEach((b) => b.addEventListener('click', () => openDashboard(b.dataset.openTab)));

// --- protections ---------------------------------------------------------
async function renderProtections() {
  const cfg = await getSettings();
  $$('[data-set]').forEach((el) => {
    el.checked = el.dataset.set === 'preSend' ? cfg.preSend !== 'off' : !!cfg[el.dataset.set];
  });
}
$$('[data-set]').forEach((el) =>
  el.addEventListener('change', async () => {
    const key = el.dataset.set;
    await setSettings({ [key]: key === 'preSend' ? (el.checked ? 'warn' : 'off') : el.checked });
  })
);
renderProtections();

// --- where to go next ------------------------------------------------------

async function renderHops(state, pct) {
  const conv = await currentConversation();
  const rows = rankProviders({
    from: state.provider,
    profile: profileConversation(conv),
    avail: await availability()
  });
  if (!rows.length) return;

  const list = $('[data-hops]');
  list.textContent = '';

  for (const row of rows.slice(0, 3)) {
    const li = document.createElement('li');

    const button = document.createElement('button');
    button.type = 'button';
    button.disabled = row.blocked;
    button.textContent = row.blocked
      ? `${row.label} — locked for ${describeReset(row.blockedUntil)}`
      : `Open ${row.label} with this on the clipboard`;
    button.addEventListener('click', () => carryTo(row, conv));

    const why = document.createElement('p');
    why.className = 'why';
    why.textContent = row.reasons.slice(0, 2).join(' · ');

    li.append(button, why);
    list.appendChild(li);
  }

  // Only worth the user's attention once room is actually short. Below that it
  // is a list of places they did not ask to go.
  $('[data-hops-group]').hidden = !(pct >= 0.7 || state.notice);
}

async function carryTo(row, conv) {
  if (!conv) return status('Nothing captured yet to carry.', 'bad');
  const limit = contextWindowFor(row.provider) || 128000;
  const { text, dropped, report } = await prepareHandoff(conv, Math.floor(limit * 0.5), row.provider);
  await navigator.clipboard.writeText(text);
  const lost = report.diff.lostCode.length + report.diff.lostKeyCount;
  chrome.tabs.create({ url: row.url });
  status(
    (dropped ? `Copied as structured memory, ${dropped} older messages condensed.` : 'Copied in full.') +
      (report.redactions ? ` ${report.redactions} secret(s) redacted.` : '') +
      (lost ? ` ${lost} item(s) did not make the trip — see the dashboard's Handoff tab.` : ''),
    'good'
  );
}

// --- the advisor -----------------------------------------------------------

function renderPicks(picks) {
  const list = $('[data-picks]');
  list.textContent = '';

  for (const pick of picks) {
    const li = document.createElement('li');

    const link = document.createElement('a');
    link.href = pick.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = pick.name;

    const what = document.createElement('p');
    what.className = 'why';
    what.textContent = pick.what;

    li.append(link, what);

    // An unverified entry is still worth showing, but not worth implying we
    // checked it. Say which it is rather than letting the user assume.
    if (!pick.verified) {
      const flag = document.createElement('span');
      flag.className = 'flag';
      flag.textContent = 'unverified listing';
      li.appendChild(flag);
    }
    list.appendChild(li);
  }
}

$('[data-advise]').addEventListener('click', () => {
  const query = $('[data-advisor-input]').value.trim();
  lastQuery = query;
  if (!query) return status('Say what you are trying to do first.');

  const { picks, weak } = suggestTools(query);
  renderPicks(picks);
  $('[data-advise-chat]').hidden = false;

  // A weak match means the catalog found something adjacent rather than
  // something right. Saying so is more useful than presenting four near-misses
  // with the same confidence as a direct hit.
  if (!picks.length) status('Nothing in the list does that job. Ask the chat instead.');
  else if (weak) status('Nothing fits closely. These are adjacent, and the chat itself may be the better answer.');
  else status(`${picks.length} from the built-in list.`, 'good');
});

// The catalog is small and local by design, so it will miss. When it does, the
// assistant already open in the tab is a better answer than a bigger catalog.
$('[data-advise-chat]').addEventListener('click', async () => {
  const query = lastQuery || $('[data-advisor-input]').value.trim();
  if (!query) return;
  const res = await ask('chainmind:insert', { text: handoffToolPrompt(query) });
  status(
    res?.ok ? 'Question is in the message box. Send it.' : 'Could not find the message box.',
    res?.ok ? 'good' : 'bad'
  );
});

// --- export and import (unchanged behaviour) -------------------------------

async function currentConversation() {
  const state = await liveState();
  if (state) {
    const store = await chrome.storage.local.get(`conv:${state.key}`);
    if (store[`conv:${state.key}`]) return store[`conv:${state.key}`];
  }
  const res = await ask('chainmind:get');
  return res?.conversation || null;
}

$('[data-export-json]').addEventListener('click', async () => {
  const conv = await currentConversation();
  if (!conv) return status('Nothing captured yet. Scroll the chat once and try again.', 'bad');
  download(`${safe(conv.title)}.chainmind.json`, JSON.stringify(conv, null, 2), 'application/json');
  status(`Saved ${conv.stats.messages} messages.`, 'good');
});

$('[data-export-md]').addEventListener('click', async () => {
  const conv = await currentConversation();
  if (!conv) return status('Nothing captured yet. Scroll the chat once and try again.', 'bad');
  download(`${safe(conv.title)}.md`, toMarkdown(conv), 'text/markdown');
  status('Saved as Markdown.', 'good');
});

$('[data-handoff]').addEventListener('click', async () => {
  const res = await ask('chainmind:insert', { text: HANDOFF_PROMPT });
  status(
    res?.ok ? 'Prompt is in the message box. Send it, then export the reply.' : 'Could not find the message box.',
    res?.ok ? 'good' : 'bad'
  );
});

$('[data-pick]').addEventListener('click', () => $('#file').click());

$('#file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();

  if (file.name.endsWith('.md')) {
    incoming = { title: file.name, markdown: text, stats: { tokens: Math.ceil(text.length / 4) } };
    $('[data-insert]').disabled = false;
    return status('Markdown loaded. It will be pasted as plain text.');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return status('That file is not valid JSON.', 'bad');
  }
  const check = validate(parsed);
  if (!check.ok) return status(check.errors[0], 'bad');

  incoming = parsed;
  $('[data-insert]').disabled = false;
  status(`${parsed.stats.messages} messages from ${parsed.source.provider}, ~${parsed.stats.tokens.toLocaleString()} tokens.`);
});

$('[data-insert]').addEventListener('click', async () => {
  if (!incoming) return;
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const { lastState } = await chrome.storage.local.get('lastState');
  const limit = lastState ? contextWindowFor(lastState.provider, lastState.model) : 128000;

  let text;
  if (incoming.markdown) {
    text = incoming.markdown;
  } else if (mode === 'full') {
    text = toMarkdown(incoming);
  } else {
    // Leave room for the reply and for the rest of the session.
    const { text: compacted, dropped } = compactExtractive(incoming, Math.floor(limit * 0.5));
    text = compacted;
    if (dropped) status(`Trimmed ${dropped} messages from the middle to fit.`);
  }

  text = sanitizeHandoff(text).text;
  const res = await ask('chainmind:insert', { text });
  if (res?.ok) status('Dropped into the message box. Check it, then send.', 'good');
  else {
    await navigator.clipboard.writeText(text);
    status('Could not reach the message box, so it is on your clipboard instead.', 'bad');
  }
});

render();
