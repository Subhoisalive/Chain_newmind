// Chain Mind — Made by Suvhankar Dutta
// Security event log. Every detector below writes here and only here, so the
// dashboard, the popup badge, and the analytics module all read one shape
// instead of three. Kept small on purpose: this is an extension, not a SIEM.

export const MAX_EVENTS = 500;

export function makeEvent({ type, severity, verdict, provider, title, detail, meta }) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ts: Date.now(),
    type, // 'injection' | 'dlp' | 'agent' | 'code' | 'originality'
    severity, // 'info' | 'low' | 'medium' | 'high' | 'critical'
    verdict, // 'allow' | 'block' | 'require_approval' | 'flag'
    provider: provider || null,
    title,
    detail: detail || null,
    meta: meta || {}
  };
}

export async function logEvent(event) {
  const store = await chrome.storage.local.get('secEvents');
  const events = store.secEvents || [];
  events.push(event);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  await chrome.storage.local.set({ secEvents: events });
  return event;
}

export async function getEvents() {
  const store = await chrome.storage.local.get('secEvents');
  return store.secEvents || [];
}

export async function clearEvents() {
  await chrome.storage.local.set({ secEvents: [] });
}

// Rolling counters for things that happened whether or not they produced an
// event worth logging — e.g. "scanned" ticks on every message, "flagged"
// only when a detector fired. Analytics divides one by the other.
export async function bumpCounter(name, by = 1) {
  const store = await chrome.storage.local.get('secCounters');
  const counters = store.secCounters || {};
  counters[name] = (counters[name] || 0) + by;
  await chrome.storage.local.set({ secCounters: counters });
  return counters;
}

export async function getCounters() {
  const store = await chrome.storage.local.get('secCounters');
  return store.secCounters || {};
}
