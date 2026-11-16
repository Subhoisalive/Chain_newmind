// Chain Mind — Made by Suvhankar Dutta
// Page guards: hold a risky draft before it is sent, and clean text as it is
// copied out of a chat. Both read their switches from cmSettings, cached
// because a keydown has to be answered synchronously.

function installDraftGuard(provider) {
  let cfg = { ...DEFAULT_SETTINGS };
  getSettings().then((s) => (cfg = s));
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'local' && c.cmSettings) cfg = { ...DEFAULT_SETTINGS, ...c.cmSettings.newValue };
  });

  let bypass = false;
  const SEND = /send|submit/i;
  const composerEl = () => {
    for (const sel of provider.composer) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  };
  const draftOf = (el) => (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' ? el.value : el.innerText);

  function setDraft(el, text) {
    el.focus();
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      document.execCommand('selectAll');
      document.execCommand('insertText', false, text);
    }
  }

  function send(el) {
    bypass = true;
    setTimeout(() => {
      const scope = el.closest('form') || el.parentElement?.parentElement?.parentElement || document;
      const btn = [...scope.querySelectorAll('button')].find((b) => SEND.test(`${b.getAttribute('aria-label') || ''} ${b.dataset.testid || ''}`) && !b.disabled);
      if (btn) btn.click();
      else el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
      setTimeout(() => (bypass = false), 600);
    }, 180);
  }

  function record(result, choice) {
    const top = result.findings.slice().sort((a, b) => ['info', 'low', 'medium', 'high', 'critical'].indexOf(b.severity) - ['info', 'low', 'medium', 'high', 'critical'].indexOf(a.severity))[0];
    logEvent(
      makeEvent({
        type: 'dlp',
        severity: top.severity,
        verdict: choice === 'cancelled' ? 'block' : 'flag',
        provider: provider.id,
        title: `Draft held before sending (${choice})`,
        detail: result.findings.map((f) => f.name).slice(0, 4).join(', '),
        meta: { stage: 'pre-send', choice }
      })
    );
    bumpCounter('preSendHeld');
  }

  function modal(result, el, original) {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(8,17,49,.72);display:flex;align-items:center;justify-content:center;font:14px/1.5 system-ui,sans-serif';
    const box = document.createElement('div');
    box.style.cssText = 'background:#101f4a;color:#dde6ff;border:1px solid #ffc53d;border-radius:12px;padding:20px;max-width:460px;width:calc(100% - 32px)';
    const h = document.createElement('div');
    h.style.cssText = 'font-weight:600;margin-bottom:8px';
    h.textContent = 'Chain Mind held this message';
    const p = document.createElement('div');
    p.style.cssText = 'color:#9fb2e6;margin-bottom:10px';
    p.textContent = 'It looks like it contains something that should not leave your device:';
    const ul = document.createElement('ul');
    ul.style.cssText = 'margin:0 0 14px;padding-left:18px';
    for (const f of result.findings.slice(0, 6)) {
      const li = document.createElement('li');
      li.textContent = `${f.name} — ${f.sample}`;
      ul.appendChild(li);
    }
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    const mk = (label, primary, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = `font:inherit;cursor:pointer;border-radius:7px;padding:7px 12px;border:1px solid ${primary ? '#39ff14' : '#1f3670'};background:${primary ? '#39ff14' : 'transparent'};color:${primary ? '#081131' : '#dde6ff'}`;
      b.addEventListener('click', () => {
        host.remove();
        fn();
      });
      row.appendChild(b);
    };
    mk('Redact and send', true, () => {
      setDraft(el, redactAll(original).text);
      record(result, 'redacted');
      send(el);
    });
    mk('Redact only', false, () => {
      setDraft(el, redactAll(original).text);
      record(result, 'redacted, not sent');
    });
    mk('Send anyway', false, () => {
      record(result, 'sent anyway');
      send(el);
    });
    mk('Cancel', false, () => record(result, 'cancelled'));
    box.append(h, p, ul, row);
    host.appendChild(box);
    document.documentElement.appendChild(host);
  }

  function check(e, el) {
    const text = draftOf(el);
    if (!text || !text.trim()) return;
    const result = scanDraft(text);
    if (!result.findings.length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    modal(result, el, text);
  }

  document.addEventListener(
    'keydown',
    (e) => {
      if (bypass || cfg.preSend === 'off' || e.key !== 'Enter' || e.shiftKey || e.altKey || e.isComposing) return;
      const el = composerEl();
      if (el && (el === e.target || el.contains(e.target))) check(e, el);
    },
    true
  );
  document.addEventListener(
    'click',
    (e) => {
      if (bypass || cfg.preSend === 'off') return;
      const btn = e.target.closest && e.target.closest('button');
      if (!btn || !SEND.test(`${btn.getAttribute('aria-label') || ''} ${btn.dataset.testid || ''}`)) return;
      const el = composerEl();
      if (el) check(e, el);
    },
    true
  );
}

function installCopySanitizer() {
  let cfg = { ...DEFAULT_SETTINGS };
  getSettings().then((s) => (cfg = s));
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'local' && c.cmSettings) cfg = { ...DEFAULT_SETTINGS, ...c.cmSettings.newValue };
  });
  document.addEventListener(
    'copy',
    (e) => {
      if (!cfg.copySanitize) return;
      const a = document.activeElement;
      if (a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT' || a.isContentEditable)) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const raw = sel.toString();
      const { text, changes } = sanitizeCopy(raw);
      if (!changes.length || text === raw) return;
      e.clipboardData.setData('text/plain', text);
      e.preventDefault();
      bumpCounter('copySanitized');
    },
    true
  );
}
