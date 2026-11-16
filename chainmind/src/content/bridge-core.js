// Chain Mind — Made by Suvhankar Dutta
// Bridge core. Deliberately has no import statements: this file gets
// concatenated into content.bundle.js by build.js, because dynamic imports
// from a content script are checked against the HOST page's CSP, and every one
// of these sites ships a strict one. An import here fails silently and takes
// the whole script down with it.

(() => {
  const DEBUG = (() => {
    try {
      return localStorage.getItem('chainmind:debug') === '1';
    } catch {
      return false;
    }
  })();
  const log = (...args) => DEBUG && console.log('%c[Chain Mind]', 'color:#39ff14', ...args);

  const provider = providerForHost();
  if (!provider) return;
  const adapter = adapterFor(provider.id);
  log('booted on', provider.id);

  let current = null;
  let uploads = 0;
  let notice = null;
  let attempts = 0;
  let streaming = false;
  let nextHops = [];
  let scannedUpto = 0; // how many of current.messages the firewall has already seen
  let security = { blocked: 0, requireApproval: 0, flagged: 0, events: [] };

  const conversationKey = () => {
    const m = location.pathname.match(/([0-9a-f]{8}-[0-9a-f-]{20,}|[0-9a-f]{16,})/i);
    return `${provider.id}:${m ? m[1] : 'new'}`;
  };

  // Uploads used to live in a plain variable, which meant the count reset on
  // every reload and read as zero on a conversation you had already loaded ten
  // files into. Keyed by conversation, persisted, and deduped by URL so a
  // re-fetch of the same file does not count twice.
  const seenUploads = new Set();
  async function loadUploads() {
    const key = `uploads:${conversationKey()}`;
    const store = await chrome.storage.local.get(key);
    uploads = store[key]?.count || 0;
    for (const u of store[key]?.urls || []) seenUploads.add(u);
  }
  function saveUploads() {
    chrome.storage.local.set({
      [`uploads:${conversationKey()}`]: { count: uploads, urls: [...seenUploads].slice(-100) }
    });
  }

  async function publishAvailability(state) {
    const quota = readQuotaFromNotice(notice);
    await recordQuota(provider.id, quota);
    await recordAvailability({
      provider: provider.id,
      label: provider.label,
      title: state.title,
      key: state.key,
      used: state.used,
      limit: state.limit,
      updatedAt: Date.now()
    });
    await refreshRoutes();
  }

  // Ranking is cheap but it reads all of storage, so do it on publish rather
  // than on every mutation.
  async function refreshRoutes() {
    if (!current) return;
    const rows = await availability();
    nextHops = rankProviders({
      from: provider.id,
      profile: profileConversation(current),
      avail: rows
    });
    updateHudRoutes(nextHops);
  }

  function publish(reason) {
    if (!current) return;
    const limit = contextWindowFor(provider.id, current.source.model);
    const used = current.stats.tokens;
    const state = {
      provider: provider.id,
      providerLabel: provider.label,
      key: conversationKey(),
      title: current.title,
      model: current.source.model,
      messages: current.stats.messages,
      used,
      limit,
      remaining: limit ? Math.max(0, limit - used) : null,
      band: confidenceBand(used),
      media: { used: uploads, limit: provider.media?.limit ?? null, note: provider.media?.note },
      notice,
      updatedAt: Date.now(),
      reason
    };
    log('publish', reason, state.messages, 'msgs', used, 'tokens');
    chrome.storage.local.set({ [`state:${state.key}`]: state, lastState: state });
    chrome.storage.local.set({ [`conv:${state.key}`]: current });
    updateHud(state);
    publishAvailability(state);
  }

  function ingest(conv, reason) {
    if (!conv || !conv.messages.length) return false;
    // Never let a thin read clobber a fuller one for the same thread. This used
    // to compare conv.id, but a DOM scrape has no id and makeConversation mints
    // a fresh UUID each call, so the ids never matched and the guard never
    // fired: a mid-render scrape could and did overwrite a complete parse.
    // The URL is the only identity both paths agree on.
    if (current && current.__key === conversationKey() && conv.stats.messages < current.stats.messages) {
      log('ignoring thinner read', conv.stats.messages, '<', current.stats.messages);
      return true;
    }
    conv.__key = conversationKey();
    current = conv;
    publish(reason);
    scanConversation();
    return true;
  }

  // --- security firewall ----------------------------------------------------
  // Runs every new message (not yet-scanned ones — a rescan re-reads the whole
  // thread, and re-scanning history that has not changed would both waste
  // work and duplicate events already on the dashboard) through the detectors
  // in firewall.js, then folds the results into a small summary for the HUD.
  async function scanConversation() {
    if (!current) return;
    const fresh = current.messages.slice(scannedUpto);
    if (!fresh.length) return;
    scannedUpto = current.messages.length;

    for (const m of fresh) {
      const text = m.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
      if (!text.trim()) continue;
      try {
        const result = await scanMessage({
          text,
          role: m.role === 'assistant' ? 'assistant' : 'user',
          provider: provider.id,
          conversationTitle: current.title
        });
        for (const ev of result.events || []) {
          security.events.unshift(ev);
          if (ev.verdict === 'block') security.blocked++;
          else if (ev.verdict === 'require_approval') security.requireApproval++;
          else security.flagged++;
        }
      } catch (err) {
        log('firewall scan threw', err);
      }
    }
    security.events = security.events.slice(0, 20);
    updateHudSecurity(security);
    archiveConversation(current).catch(() => {});
  }

  // Some sites print the quota and its reset time right on the page. When they
  // do, that beats any counter we could keep ourselves, so prefer it.
  const QUOTA_RE =
    /(unavailable until|usage (?:limit|resets?)|limit reached|resets? at|you'?ve (?:hit|reached)|out of)[^.]{0,120}/i;
  function readNotice() {
    const main = document.querySelector('main') || document.body;
    for (const el of main.querySelectorAll('p, div, span')) {
      if (el.children.length) continue;
      const text = el.textContent?.trim();
      if (!text || text.length > 220) continue;
      const hit = text.match(QUOTA_RE);
      if (hit) return text;
    }
    return null;
  }

  // --- page traffic --------------------------------------------------------
  // Only POSTs to an upload endpoint are uploads. Matching /upload|\/files\b/
  // against every URL counted ChatGPT's file *listing* GETs as new uploads and
  // inflated the number on every page load.
  const UPLOAD_RE = /\/(backend-api\/files|upload-file|upload)(\b|\/|\?|$)/i;
  const isUpload = (url, method) =>
    UPLOAD_RE.test(url || '') && String(method || 'POST').toUpperCase() === 'POST';

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data?.__chainmind) return;
    const { kind, url: reqUrl, body, method } = event.data;

    if (kind === 'navigate') {
      log('navigate', reqUrl);
      current = null;
      attempts = 0;
      scannedUpto = 0;
      security = { blocked: 0, requireApproval: 0, flagged: 0, events: [] };
      updateHudSecurity(security);
      seenUploads.clear();
      loadUploads().then(() => scheduleScan());
      return;
    }

    if (isUpload(reqUrl, method)) {
      const id = String(reqUrl).split('?')[0];
      if (!seenUploads.has(id)) {
        seenUploads.add(id);
        uploads += 1;
        saveUploads();
        log('upload seen', uploads);
        publish('upload');
      }
      return;
    }

    if (kind === 'response' && adapter?.matches(reqUrl)) {
      try {
        const parsed = adapter.parse(body, reqUrl);
        log('parsed from network:', parsed?.messages.length ?? 0, 'messages');
        if (!ingest(parsed, 'network')) rescan();
      } catch (err) {
        log('parse threw, falling back to DOM', err);
        rescan();
      }
      return;
    }

    if (kind === 'stream-start') {
      streaming = true;
      return;
    }
    if (kind === 'stream') {
      streaming = false;
      setTimeout(rescan, 500);
    }
  });

  function rescan() {
    notice = readNotice();
    try {
      const scraped = adapter?.scrape();
      log('scrape found', scraped?.messages.length ?? 0, 'messages');
      return ingest(scraped, 'dom');
    } catch (err) {
      log('scrape threw', err);
      return false;
    }
  }

  // The thread may not be painted yet on first load, and ChatGPT in particular
  // can render from server state without ever issuing a fetch we can see. So
  // retry on a backoff rather than scanning once and giving up.
  const BACKOFF = [400, 1200, 2500, 5000, 9000];
  function scheduleScan() {
    if (attempts >= BACKOFF.length) {
      updateHud(null, 'Nothing readable on this page yet.');
      return;
    }
    const wait = BACKOFF[attempts++];
    setTimeout(() => {
      if (!rescan()) scheduleScan();
    }, wait);
  }

  // --- popup requests ------------------------------------------------------
  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg.type === 'chainmind:get') {
      rescan();
      respond({ conversation: current, notice, provider: provider.id, next: nextHops, security });
      return true;
    }
    if (msg.type === 'chainmind:insert') {
      respond({ ok: insertIntoComposer(msg.text) });
      return true;
    }
    if (msg.type === 'chainmind:ping') {
      respond({ ok: true, provider: provider.id, messages: current?.stats.messages ?? 0 });
      return true;
    }
  });

  // Writing into someone else's editor is the fiddliest part of this whole
  // extension. Assigning .value never reaches React, and innerHTML never
  // reaches ProseMirror, so go through the native setter for real inputs and
  // through insertText for everything else.
  function insertIntoComposer(text) {
    for (const selector of provider.composer) {
      const el = document.querySelector(selector);
      if (!el) continue;
      el.focus();

      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }

      const ok = document.execCommand('insertText', false, text);
      if (!ok) {
        el.dispatchEvent(
          new InputEvent('beforeinput', { inputType: 'insertText', data: text, bubbles: true, cancelable: true })
        );
      }
      return true;
    }
    log('no composer matched', provider.composer);
    return false;
  }

  // Carrying to another site: trim to half the target's window, put it on the
  // clipboard, open the tab. The click on the HUD button is the user gesture
  // the clipboard write needs, so this has to run from the handler.
  async function carryTo(targetId) {
    if (!current) return { ok: false, why: 'Nothing read yet.' };
    const limit = contextWindowFor(targetId) || 128000;
    const { text, dropped } = await prepareHandoff(current, Math.floor(limit * 0.5), targetId);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return { ok: false, why: 'Clipboard refused. Use the popup to export a file instead.' };
    }
    chrome.runtime.sendMessage({ type: 'chainmind:openTab', provider: targetId });
    return { ok: true, dropped };
  }

  // --- boot ----------------------------------------------------------------
  mountHud({
    onCopyHandoff: () => insertIntoComposer(HANDOFF_PROMPT),
    onRescan: () => {
      attempts = 0;
      if (!rescan()) scheduleScan();
    },
    onOpenPopup: () => chrome.runtime.sendMessage({ type: 'chainmind:openPopup' }),
    onCarryTo: carryTo,
    onOpenDashboard: () => chrome.runtime.sendMessage({ type: 'chainmind:openDashboard' })
  });

  installDraftGuard(provider);
  installCopySanitizer();

  loadUploads().then(() => scheduleScan());

  // A chat app mutates constantly while a reply streams in, and a rescan of the
  // whole thread on every batch of those mutations is wasted work on the one
  // thread the user is watching. Skip while a stream is open; the stream's own
  // completion event triggers a rescan anyway.
  const observer = new MutationObserver(
    debounce(() => {
      if (!streaming) rescan();
    }, 1500)
  );
  observer.observe(document.body, { childList: true, subtree: true });

  // Handy when something breaks: run chainmind.debug() in the page console.
  window.chainmind = {
    debug: () => {
      try {
        localStorage.setItem('chainmind:debug', '1');
      } catch {}
      return {
        provider: provider.id,
        messages: current?.stats.messages ?? 0,
        conversation: current,
        uploads,
        notice,
        next: nextHops
      };
    },
    rescan,
    routes: () => nextHops,
    suggest: (q) => suggestTools(q)
  };

  function debounce(fn, ms) {
    let t;
    return () => {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }
})();
