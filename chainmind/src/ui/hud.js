// Chain Mind — Made by Suvhankar Dutta
// The in-page gauge. Collapsed it is a single pill showing how much room is
// left. Expanded it shows the arithmetic behind that number, because a gauge
// built on estimates has to be legible about being an estimate.
//
// When the gauge goes critical it grows a third job: saying where to go next.
// That list is hidden the rest of the time. A recommendation you did not ask
// for is noise until the moment you need it, and then it is the whole point.

let root = null;
let handlers = {};
let lastLevel = 'idle';
const SEGMENTS = 20;

export function mountHud(h = {}) {
  handlers = h;
  if (root) return root;

  root = document.createElement('div');
  root.id = 'chainmind-hud';
  root.setAttribute('role', 'status');
  root.innerHTML = `
    <button class="cm-pill" type="button" aria-expanded="false">
      <span class="cm-gauge" aria-hidden="true"></span>
      <span class="cm-headline">reading</span>
      <span class="cm-unit">this chat</span>
    </button>
    <div class="cm-panel" hidden>
      <div class="cm-row cm-title">Looking for the conversation</div>
      <dl class="cm-facts">
        <div><dt>Used</dt><dd data-used>&mdash;</dd></div>
        <div><dt>Window</dt><dd data-limit>&mdash;</dd></div>
        <div><dt>Messages</dt><dd data-messages>&mdash;</dd></div>
        <div><dt>Uploads</dt><dd data-media>&mdash;</dd></div>
      </dl>
      <p class="cm-note" data-note>Scroll the thread once if this stays empty.</p>
      <section class="cm-next" data-next hidden>
        <h2>Carry on somewhere else</h2>
        <ul data-routes></ul>
        <p class="cm-fine">Trims to half the target's window and copies it. Write the handoff brief first for a shorter, better paste.</p>
      </section>
      <section class="cm-security" data-security hidden>
        <h2>Firewall</h2>
        <button type="button" class="cm-sec-summary" data-sec-summary></button>
      </section>
      <div class="cm-actions">
        <button type="button" data-handoff>Write handoff brief</button>
        <button type="button" data-open>Export or import</button>
        <button type="button" data-rescan>Read this page again</button>
      </div>
      <p class="cm-sig">Chain Mind \u00b7 Made by Suvhankar Dutta</p>
    </div>`;

  const pill = root.querySelector('.cm-pill');
  const panel = root.querySelector('.cm-panel');
  pill.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    pill.setAttribute('aria-expanded', String(open));
  });
  root.querySelector('[data-handoff]').addEventListener('click', () => handlers.onCopyHandoff?.());
  root.querySelector('[data-open]').addEventListener('click', () => handlers.onOpenPopup?.());
  root.querySelector('[data-rescan]').addEventListener('click', () => handlers.onRescan?.());
  root.querySelector('[data-sec-summary]').addEventListener('click', () => handlers.onOpenDashboard?.());

  (document.body || document.documentElement).appendChild(root);
  return root;
}

const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

export function updateHud(state, emptyMessage) {
  if (!root) return;

  // An empty state is a real state. Say what is happening instead of showing a
  // gauge that reads zero and looks like an answer.
  if (!state) {
    root.dataset.level = 'idle';
    root.querySelector('.cm-headline').textContent = '\u2014';
    root.querySelector('.cm-unit').textContent = 'no reading';
    root.querySelector('.cm-note').textContent =
      emptyMessage || 'Scroll the thread once, then read this page again.';
    return;
  }

  const pct = state.limit ? Math.min(1, state.used / state.limit) : 0;
  root.dataset.level = pct >= 0.9 ? 'critical' : pct >= 0.7 ? 'warn' : 'ok';

  // Open the panel by itself the first time a chat crosses into critical. Once
  // only: reopening it on every publish would fight the user closing it.
  if (root.dataset.level === 'critical' && lastLevel !== 'critical') {
    const panel = root.querySelector('.cm-panel');
    panel.hidden = false;
    root.querySelector('.cm-pill').setAttribute('aria-expanded', 'true');
  }
  lastLevel = root.dataset.level;

  root.querySelector('.cm-headline').textContent = state.remaining == null ? '\u2014' : fmt(state.remaining);
  root.querySelector('.cm-unit').textContent = state.remaining == null ? 'unknown window' : 'tokens left';

  // Discrete segments rather than a smooth bar: a fuel gauge, not a progress
  // bar. Nothing here is precise enough to justify pixel-level resolution.
  const lit = Math.round(pct * SEGMENTS);
  root.querySelector('.cm-gauge').innerHTML = Array.from(
    { length: SEGMENTS },
    (_, i) => `<i class="${i < lit ? 'on' : ''}"></i>`
  ).join('');

  root.querySelector('.cm-title').textContent = state.title || 'Untitled conversation';
  root.querySelector('[data-used]').textContent =
    `~${state.used.toLocaleString()} (\u00b1${Math.round(state.band.pct * 100)}%)`;
  root.querySelector('[data-limit]').textContent = state.limit
    ? `${state.limit.toLocaleString()} \u00b7 ${state.model || state.providerLabel}`
    : 'not published by this site';
  root.querySelector('[data-messages]').textContent = state.messages;
  root.querySelector('[data-media]').textContent = state.media.limit
    ? `${state.media.used} of ~${state.media.limit}`
    : `${state.media.used} this session`;

  // A quota banner scraped off the page outranks anything we estimated.
  root.querySelector('[data-note]').textContent =
    state.notice ||
    (root.dataset.level === 'critical'
      ? 'Close to the limit. Write a handoff brief now, while the model can still read the whole thread.'
      : state.media.note || 'Counts are estimated from what happened in this tab.');

  root.querySelector('[data-next]').hidden =
    !(root.dataset.level === 'critical' || state.notice) || !root.querySelector('[data-routes]').children.length;
}

// Shown only once the firewall has actually found something — a clean thread
// gets no security section at all, rather than a reassuring "0 issues" that
// nobody needed to see.
export function updateHudSecurity(summary) {
  if (!root) return;
  const section = root.querySelector('[data-security]');
  const button = root.querySelector('[data-sec-summary]');
  const total = (summary?.blocked || 0) + (summary?.requireApproval || 0) + (summary?.flagged || 0);

  if (!total) {
    section.hidden = true;
    root.dataset.secLevel = '';
    return;
  }

  section.hidden = false;
  const level = summary.blocked ? 'critical' : summary.requireApproval ? 'warn' : 'ok';
  root.dataset.secLevel = level;

  const parts = [];
  if (summary.blocked) parts.push(`${summary.blocked} blocked`);
  if (summary.requireApproval) parts.push(`${summary.requireApproval} need approval`);
  if (summary.flagged) parts.push(`${summary.flagged} flagged`);
  button.textContent = `\u26A0 ${parts.join(' \u00b7 ')} — open dashboard`;
}

export function updateHudRoutes(rows = []) {
  if (!root) return;
  const list = root.querySelector('[data-routes]');
  list.textContent = '';

  for (const row of rows.slice(0, 3)) {
    const li = document.createElement('li');
    li.className = row.blocked ? 'cm-route is-blocked' : 'cm-route';

    const button = document.createElement('button');
    button.type = 'button';
    button.disabled = row.blocked;
    button.textContent = row.blocked ? `${row.label} (locked)` : `Carry to ${row.label}`;
    button.addEventListener('click', async () => {
      button.disabled = true;
      const res = await handlers.onCarryTo?.(row.provider);
      const note = root.querySelector('[data-note]');
      if (res?.ok) {
        note.textContent = res.dropped
          ? `Copied, ${res.dropped} messages trimmed from the middle. Paste into ${row.label}.`
          : `Copied in full. Paste into ${row.label}.`;
      } else {
        note.textContent = res?.why || 'Could not copy that.';
        button.disabled = false;
      }
    });

    const why = document.createElement('p');
    why.className = 'cm-why';
    why.textContent = row.reasons.slice(0, 2).join(' \u00b7 ') || 'no reading yet';

    li.append(button, why);
    list.appendChild(li);
  }

  if (root.dataset.level === 'critical') root.querySelector('[data-next]').hidden = !rows.length;
}
