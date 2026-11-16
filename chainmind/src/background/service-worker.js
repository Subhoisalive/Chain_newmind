// Chain Mind — Made by Suvhankar Dutta
// Keeps the toolbar badge in sync with how much room is left, so you get a
// warning without having to open anything.

import { PROVIDERS } from '../lib/providers.js';

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  // A quota block outranks the token gauge. If the site has said no, the
  // number of tokens left is no longer the thing you need to know.
  for (const key of Object.keys(changes)) {
    if (key.startsWith('quota:') && changes[key].newValue?.blocking) {
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#ff4d6d' });
      return;
    }
  }

  if (!changes.lastState) return;
  const state = changes.lastState.newValue;
  if (!state?.limit) return chrome.action.setBadgeText({ text: '' });

  const left = 1 - state.used / state.limit;
  const pct = Math.max(0, Math.round(left * 100));

  chrome.action.setBadgeText({ text: pct > 99 ? '' : `${pct}` });
  chrome.action.setBadgeBackgroundColor({
    color: left <= 0.1 ? '#ff4d6d' : left <= 0.3 ? '#ffc53d' : '#12275e'
  });
  chrome.action.setTitle({
    title: `Chain Mind — about ${state.remaining.toLocaleString()} tokens left in "${state.title}"`
  });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'chainmind:openPopup') chrome.action.openPopup?.();

  if (msg.type === 'chainmind:openTab') {
    const p = PROVIDERS[msg.provider];
    if (p) chrome.tabs.create({ url: `https://${p.hosts[0]}/` });
  }

  if (msg.type === 'chainmind:openDashboard') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/dashboard.html') + (msg.tab ? `#${msg.tab}` : '') });
  }
});

// A blocked action or a critical injection outranks the token gauge too —
// both use the badge, so whichever fired most recently wins visually, but a
// block is the one state worth pinning regardless of what the gauge says.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.secEvents) return;
  const events = changes.secEvents.newValue || [];
  const recent = events.slice(-5);
  if (recent.some((e) => e.verdict === 'block')) {
    chrome.action.setBadgeText({ text: '\u2715' });
    chrome.action.setBadgeBackgroundColor({ color: '#ff4d6d' });
  }
});

// Old conversations pile up. Keep the most recent 50.
//
// This used to run on chrome.runtime.onStartup, which fires when the browser
// launches and at no other time, so on a machine that never reboots it never
// ran at all and storage grew until writes started failing. An alarm runs it
// on a schedule the browser actually keeps.
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('chainmind:sweep', { periodInMinutes: 180 });
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('chainmind:sweep', { periodInMinutes: 180 });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'chainmind:sweep') sweep();
});

async function sweep() {
  const all = await chrome.storage.local.get(null);
  const convs = Object.keys(all).filter((k) => k.startsWith('conv:'));
  const drop = [];

  if (convs.length > 50) {
    drop.push(
      ...convs
        .map((k) => ({ k, at: all[k]?.source?.exported_at || '' }))
        .sort((a, b) => a.at.localeCompare(b.at))
        .slice(0, convs.length - 50)
        .map((x) => x.k)
    );
  }

  // Expired quota records are misleading rather than merely stale: they say a
  // site is locked when it is not.
  const now = Date.now();
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith('quota:') && v?.resetsAt && Date.parse(v.resetsAt) < now) drop.push(k);
  }

  if (drop.length) await chrome.storage.local.remove(drop);
}
