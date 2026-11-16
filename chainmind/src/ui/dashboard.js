// Chain Mind — Made by Suvhankar Dutta
import { getEvents, clearEvents, getCounters } from '../lib/security/events.js';
import { getPolicy, setPolicy, resetPolicy, ACTIONS, DEFAULT_POLICY } from '../lib/security/policy.js';
import { runTestSuite, liveStats } from '../lib/security/analytics.js';
import { scanForSecrets, redact } from '../lib/security/dlp.js';
import { analyzeOriginality } from '../lib/security/originality.js';
import { cleanOutput } from '../lib/security/cleaner.js';
import { sanitizeCopy } from '../lib/security/sanitize.js';
import { getSettings, setSettings } from '../lib/security/settings.js';
import { searchArchive, clearArchive, archiveStats } from '../lib/security/archive.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const fmtPct = (n) => `${Math.round(n * 100)}%`;
const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// --- tabs --------------------------------------------------------------
$$('[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('[data-tab]').forEach((b) => b.classList.toggle('is-active', b === btn));
    $$('main > section').forEach((s) => (s.hidden = s.dataset.panel !== btn.dataset.tab));
    if (btn.dataset.tab === 'events') renderEvents();
    if (btn.dataset.tab === 'policy') renderPolicy();
    if (btn.dataset.tab === 'analytics') renderLiveMetrics();
    if (btn.dataset.tab === 'handoff') renderHandoff();
    if (btn.dataset.tab === 'settings') renderSettings();
    if (btn.dataset.tab === 'search') renderSearchStatus();
  });
});

// --- overview ------------------------------------------------------------
async function renderOverview() {
  const [events, counters] = await Promise.all([getEvents(), getCounters()]);

  $('[data-c-scanned]').textContent = (counters.scanned || 0).toLocaleString();
  $('[data-c-flagged]').textContent = events.filter((e) => e.verdict === 'flag').length.toLocaleString();
  $('[data-c-approval]').textContent = events.filter((e) => e.verdict === 'require_approval').length.toLocaleString();
  $('[data-c-blocked]').textContent = events.filter((e) => e.verdict === 'block').length.toLocaleString();

  renderBars('[data-severity-bars]', events, 'severity', ['critical', 'high', 'medium', 'low', 'info']);
  renderBars('[data-type-bars]', events, 'type', ['injection', 'dlp', 'code', 'agent', 'hidden', 'link', 'dependency']);
  renderChain(events);
}

function renderBars(sel, events, field, order) {
  const counts = {};
  for (const e of events) counts[e[field]] = (counts[e[field]] || 0) + 1;
  const max = Math.max(1, ...Object.values(counts));
  const container = $(sel);
  container.textContent = '';
  for (const key of order) {
    const n = counts[key] || 0;
    if (!n && !events.length) continue;
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.dataset.sev = key;
    row.innerHTML = `<span>${key}</span><span class="bar-track"><span class="bar-fill" style="width:${(n / max) * 100}%"></span></span><span>${n}</span>`;
    container.appendChild(row);
  }
  if (!container.children.length) container.innerHTML = '<p class="empty">Nothing yet.</p>';
}

function renderChain(events) {
  const container = $('[data-chain]');
  if (!events.length) {
    container.innerHTML = '<p class="empty">Nothing flagged yet. This fills in as the firewall sees something across a supported chat tab.</p>';
    return;
  }
  // Most recent conversation that has at least one event, oldest-first within it.
  const latestTitle = events[0]?.meta?.conversationTitle;
  const chain = events
    .filter((e) => e.meta?.conversationTitle === latestTitle)
    .slice()
    .reverse();

  container.textContent = '';
  const heading = document.createElement('p');
  heading.className = 'fine';
  heading.textContent = latestTitle ? `"${latestTitle}"` : 'Untitled conversation';
  container.appendChild(heading);

  for (const e of chain) {
    const row = document.createElement('div');
    row.className = 'chain-item';
    row.innerHTML = `
      <span class="chain-time">${fmtTime(e.ts)}</span>
      <span>
        <span class="chain-badge ${e.verdict}">${e.verdict.replace('_', ' ')}</span>
        <strong>${escapeHtml(e.title)}</strong>
        ${e.detail ? `<br><span class="fine" style="margin:2px 0 0">${escapeHtml(e.detail)}</span>` : ''}
      </span>`;
    container.appendChild(row);
  }
}

// --- events table ----------------------------------------------------------
async function renderEvents() {
  const events = await getEvents();
  const type = $('[data-filter-type]').value;
  const rows = (type ? events.filter((e) => e.type === type) : events).slice().reverse();
  const body = $('[data-events-body]');
  body.textContent = '';

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty">No events yet.</td></tr>';
    return;
  }

  for (const e of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(e.ts).toLocaleString()}</td>
      <td>${e.type}</td>
      <td><span class="sev sev-${e.severity}">${e.severity}</span></td>
      <td>${e.verdict.replace('_', ' ')}</td>
      <td>${escapeHtml(e.title)}</td>
      <td>${escapeHtml(e.detail || '')}</td>
      <td>${e.provider || '—'}</td>`;
    body.appendChild(tr);
  }
}
$('[data-filter-type]').addEventListener('change', renderEvents);
$('[data-clear-events]').addEventListener('click', async () => {
  if (!confirm('Clear the entire security event log? This cannot be undone.')) return;
  await clearEvents();
  renderEvents();
  renderOverview();
});

// --- policy editor -----------------------------------------------------
async function renderPolicy() {
  const policy = await getPolicy();
  const body = $('[data-policy-body]');
  body.textContent = '';

  policy.forEach((rule, i) => body.appendChild(policyRow(rule, i)));
  $('[data-policy-status]').textContent = `${policy.length} rules · evaluated top to bottom, first match wins.`;
}

function policyRow(rule, index) {
  const tr = document.createElement('tr');
  tr.dataset.index = index;

  const actionSel = document.createElement('select');
  ACTIONS.forEach((a) => {
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = a;
    opt.selected = a === rule.action;
    actionSel.appendChild(opt);
  });

  const patternInput = document.createElement('input');
  patternInput.type = 'text';
  patternInput.value = rule.pattern;

  const effectSel = document.createElement('select');
  ['ALLOW', 'BLOCK', 'REQUIRE_APPROVAL'].forEach((eff) => {
    const opt = document.createElement('option');
    opt.value = eff;
    opt.textContent = eff;
    opt.selected = eff === rule.effect;
    effectSel.appendChild(opt);
  });

  const reasonInput = document.createElement('input');
  reasonInput.type = 'text';
  reasonInput.value = rule.reason || '';

  const del = document.createElement('button');
  del.type = 'button';
  del.textContent = 'Remove';
  del.addEventListener('click', async () => {
    const policy = await getPolicy();
    policy.splice(index, 1);
    await setPolicy(policy);
    renderPolicy();
  });

  [actionSel, patternInput, effectSel, reasonInput].forEach((el) =>
    el.addEventListener('change', async () => {
      const policy = await getPolicy();
      policy[index] = {
        id: rule.id || `rule-${Date.now()}`,
        action: actionSel.value,
        pattern: patternInput.value,
        effect: effectSel.value,
        reason: reasonInput.value
      };
      await setPolicy(policy);
      $('[data-policy-status]').textContent = 'Saved.';
    })
  );

  [actionSel, patternInput, effectSel, reasonInput, del].forEach((el) => {
    const td = document.createElement('td');
    td.appendChild(el);
    tr.appendChild(td);
  });
  return tr;
}

$('[data-add-rule]').addEventListener('click', async () => {
  const policy = await getPolicy();
  policy.push({ id: `rule-${Date.now()}`, action: 'shell', pattern: '.*', effect: 'REQUIRE_APPROVAL', reason: 'New rule' });
  await setPolicy(policy);
  renderPolicy();
});
$('[data-reset-policy]').addEventListener('click', async () => {
  if (!confirm(`Reset to the ${DEFAULT_POLICY.length} default rules? Custom rules will be lost.`)) return;
  await resetPolicy();
  renderPolicy();
});

// --- analytics ---------------------------------------------------------
const SUITE_TITLES = {
  injection: 'Prompt injection',
  dlp: 'Data loss prevention',
  encoding: 'Encoding tricks',
  links: 'Link reputation',
  dependencies: 'Dependency check',
  entropy: 'Entropy secrets',
  hidden: 'Hidden text'
};
$('[data-run-suite]').addEventListener('click', () => {
  const results = runTestSuite();
  const wrap = $('[data-suite-results]');
  wrap.hidden = false;
  wrap.textContent = '';
  for (const [key, m] of Object.entries(results)) {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `<h3>${SUITE_TITLES[key] || key}</h3><dl class="metrics" data-metrics="${key}"></dl>`;
    wrap.appendChild(panel);
    renderMetrics(key, m);
  }
});

function renderMetrics(key, m) {
  const dl = $(`[data-metrics="${key}"]`);
  dl.innerHTML = `
    <dt>Precision</dt><dd>${fmtPct(m.precision)}</dd>
    <dt>Recall</dt><dd>${fmtPct(m.recall)}</dd>
    <dt>F1 score</dt><dd>${fmtPct(m.f1)}</dd>
    <dt>True positives</dt><dd>${m.tp}</dd>
    <dt>False positives</dt><dd>${m.fp}</dd>
    <dt>False negatives</dt><dd>${m.fn}</dd>
    <dt>Avg. latency</dt><dd>${m.avgLatencyMs.toFixed(2)} ms</dd>`;
}

async function renderLiveMetrics() {
  const stats = await liveStats();
  $('[data-live-metrics]').innerHTML = `
    <dt>Messages scanned</dt><dd>${stats.scanned.toLocaleString()}</dd>
    <dt>Events logged</dt><dd>${stats.totalEvents.toLocaleString()}</dd>
    <dt>Detection rate</dt><dd>${fmtPct(stats.detectionRate)}</dd>
    <dt>Blocked</dt><dd>${stats.blocked}</dd>
    <dt>Required approval</dt><dd>${stats.approvalsRequired}</dd>`;
}

// --- tools ---------------------------------------------------------------
$('[data-dlp-scan]').addEventListener('click', () => {
  const text = $('[data-dlp-input]').value;
  const findings = scanForSecrets(text);
  const { text: redacted, redactions } = redact(text);
  const results = $('[data-dlp-results]');
  if (!findings.length) {
    results.innerHTML = '<p class="empty">Nothing matched.</p>';
    return;
  }
  results.innerHTML =
    findings.map((f) => `<div class="finding"><span class="sev sev-${f.severity}">${f.severity}</span> <strong>${escapeHtml(f.name)}</strong> — ${escapeHtml(f.sample)}</div>`).join('') +
    `<div class="finding"><strong>Redacted (${redactions}):</strong><br><pre style="white-space:pre-wrap">${escapeHtml(redacted)}</pre></div>`;
});

$('[data-orig-scan]').addEventListener('click', () => {
  const text = $('[data-orig-text]').value;
  const source = $('[data-orig-source]').value;
  const result = analyzeOriginality(text, source ? [{ label: 'pasted source', text: source }] : []);
  const results = $('[data-orig-results]');
  const parts = [];
  if (result.duplicateMatches.length) {
    parts.push(...result.duplicateMatches.map((m) => `<div class="finding">Overlap with ${escapeHtml(m.label)}: <strong>${fmtPct(m.score)}</strong></div>`));
  } else if (source) {
    parts.push('<div class="finding">No significant overlap found.</div>');
  }
  if (result.unsupportedClaims.length) {
    parts.push(...result.unsupportedClaims.map((c) => `<div class="finding">Unsupported claim: “${escapeHtml(c.claim)}” — ${escapeHtml(c.note)}</div>`));
  } else {
    parts.push('<div class="finding">No unsupported-claim patterns found.</div>');
  }
  parts.push(`<p class="fine" style="margin-top:8px">${escapeHtml(result.note)}</p>`);
  results.innerHTML = parts.join('');
});

$('[data-clean-run]').addEventListener('click', () => {
  const text = $('[data-clean-input]').value;
  const { text: cleaned, changes } = cleanOutput(text);
  $('[data-clean-results]').innerHTML = `
    ${changes.length ? `<div class="finding">Changes: ${changes.map(escapeHtml).join(', ')}</div>` : '<div class="finding">Nothing to change.</div>'}
    <div class="finding"><strong>Result:</strong><br><pre style="white-space:pre-wrap">${escapeHtml(cleaned)}</pre></div>`;
});

// --- settings -------------------------------------------------------------
async function renderSettings() {
  const cfg = await getSettings();
  $$('[data-set]').forEach((el) => {
    if (el.type === 'checkbox') el.checked = !!cfg[el.dataset.set];
    else el.value = cfg[el.dataset.set];
  });
}
$$('[data-set]').forEach((el) =>
  el.addEventListener('change', async () => {
    await setSettings({ [el.dataset.set]: el.type === 'checkbox' ? el.checked : el.value });
    $('[data-settings-status]').textContent = 'Saved.';
  })
);

// --- search -----------------------------------------------------------------
async function renderSearchStatus() {
  const st = await archiveStats();
  $('[data-search-status]').textContent = `${st.conversations} saved conversations · ${st.messages} messages`;
}
async function runSearch() {
  const q = $('[data-search-input]').value;
  const hits = await searchArchive(q);
  const out = $('[data-search-results]');
  out.textContent = '';
  if (!hits.length) {
    out.innerHTML = '<p class="empty">No matches.</p>';
    return;
  }
  for (const h of hits) {
    const d = document.createElement('div');
    d.className = 'hit';
    d.innerHTML = `<strong>${escapeHtml(h.title)}</strong> <small>${escapeHtml(h.provider)} · ${escapeHtml(h.role)} · ${new Date(h.updated).toLocaleDateString()}</small><br>${escapeHtml(h.snippet)}`;
    out.appendChild(d);
  }
}
$('[data-search-run]').addEventListener('click', runSearch);
$('[data-search-input]').addEventListener('keydown', (e) => e.key === 'Enter' && runSearch());
$('[data-search-clear]').addEventListener('click', async () => {
  if (!confirm('Delete every saved conversation?')) return;
  await clearArchive();
  renderSearchStatus();
  $('[data-search-results]').textContent = '';
});

// --- handoff report ----------------------------------------------------------
async function renderHandoff() {
  const { lastHandoffReport: r } = await chrome.storage.local.get('lastHandoffReport');
  const out = $('[data-handoff-report]');
  if (!r) return;
  const d = r.diff;
  out.innerHTML = `
    <div class="finding"><strong>${escapeHtml(r.title)}</strong> — ${escapeHtml(r.from)} → ${escapeHtml(r.to || 'clipboard')} · ${new Date(r.at).toLocaleString()}</div>
    <div class="finding">Mode: ${r.mode === 'full' ? 'full transcript (fit in the window)' : 'structured memory'} · ${r.messages} messages${r.dropped ? `, ${r.dropped} condensed` : ''}</div>
    <div class="finding">Cleaned: ${r.redactions} secret(s) redacted · ${r.invisibleRemoved} invisible character(s) removed${r.injections.length ? ` · <strong>suspected injected instructions:</strong> ${r.injections.map(escapeHtml).join(', ')}` : ''}</div>
    <div class="finding">Key statements kept: ${fmtPct(d.coverage)} (${d.keyTotal - d.lostKeyCount} of ${d.keyTotal})</div>
    ${d.lostCode.length ? `<div class="finding"><strong>Code blocks not carried:</strong>${d.lostCode.map((c) => `<br>${escapeHtml(c.lang)} — ${escapeHtml(c.preview)} (${c.lines} lines)`).join('')}</div>` : ''}
    ${d.lostKey.length ? `<div class="finding"><strong>Statements that did not make the trip${d.lostKeyCount > d.lostKey.length ? ` (first ${d.lostKey.length} of ${d.lostKeyCount})` : ''}:</strong>${d.lostKey.map((k) => `<br>• ${escapeHtml(k)}`).join('')}</div>` : ''}`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- live refresh ----------------------------------------------------------
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.secEvents || changes.secCounters) {
    renderOverview();
    if (!$('[data-panel="events"]').hidden) renderEvents();
  }
});

$('[data-copyclean-run]').addEventListener('click', () => {
  const { text, changes } = sanitizeCopy($('[data-copyclean-input]').value);
  $('[data-copyclean-results]').innerHTML = `
    ${changes.length ? `<div class="finding">Changes: ${changes.map(escapeHtml).join(', ')}</div>` : '<div class="finding">Nothing to change.</div>'}
    <div class="finding"><strong>Result:</strong><br><pre style="white-space:pre-wrap">${escapeHtml(text)}</pre></div>`;
});

renderOverview();
const startTab = location.hash.slice(1);
if (startTab) document.querySelector(`[data-tab="${startTab}"]`)?.click();
