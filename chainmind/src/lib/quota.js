// Chain Mind — Made by Suvhankar Dutta
// What actually stops a session is the message quota, not the context window.
// A 200k window is no use at all if the site says "limit reached, resets at
// 3pm". So the quota banner, when a site prints one, is the single highest
// value signal this extension can hold — and it has to outlive the tab.
//
// Two records live in chrome.storage.local:
//   quota:{provider}  what the banner said, and when it lifts
//   avail:{provider}  the last known reading for that provider, any tab
//
// Both are small and both are overwritten, never appended, so they cannot grow
// without bound the way the conversation store can.

const HOUR = 3600e3;

// Deliberately conservative: a wrong reset time is worse than none, because it
// sends you back to a site that is still locked. Anything unrecognised returns
// null and the UI says "unknown" rather than guessing.
export function parseReset(text, now = Date.now()) {
  if (!text) return null;
  const t = text.toLowerCase();

  // "resets in about 2 hours", "try again in 45 minutes"
  const rel = t.match(/in\s+(?:about\s+|~\s*)?(\d{1,3})\s*(minute|min|hour|hr|day)s?/);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2];
    const ms = unit.startsWith('min') ? n * 60e3 : unit.startsWith('day') ? n * 24 * HOUR : n * HOUR;
    return new Date(now + ms).toISOString();
  }

  // "resets at 3:40 PM", "unavailable until 10 am"
  const abs = t.match(/(?:until|at|after)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (abs) {
    const d = new Date(now);
    let hour = Number(abs[1]);
    const min = Number(abs[2] || 0);
    const mer = abs[3];
    if (mer === 'pm' && hour < 12) hour += 12;
    if (mer === 'am' && hour === 12) hour = 0;
    if (hour > 23 || min > 59) return null;
    d.setHours(hour, min, 0, 0);
    // A time already past means tomorrow, unless it is only just past, in
    // which case the limit has most likely just lifted.
    if (d.getTime() < now - 5 * 60e3) d.setDate(d.getDate() + 1);
    return d.toISOString();
  }

  return null;
}

// A banner can be informational ("usage resets weekly") rather than a block.
// Only treat it as a block when it reads like one.
const BLOCKING = /(limit reached|you'?ve (?:hit|reached)|out of|unavailable until|no longer available|upgrade to continue)/i;

export function readQuotaFromNotice(notice, now = Date.now()) {
  if (!notice) return null;
  return {
    raw: notice,
    blocking: BLOCKING.test(notice),
    resetsAt: parseReset(notice, now),
    seenAt: new Date(now).toISOString()
  };
}

export async function recordQuota(provider, quota) {
  const key = `quota:${provider}`;
  if (!quota) return chrome.storage.local.remove(key);
  return chrome.storage.local.set({ [key]: { provider, ...quota } });
}

export async function recordAvailability(record) {
  return chrome.storage.local.set({ [`avail:${record.provider}`]: record });
}

// Fold both stores into one list the router can rank. Stale readings are kept
// but flagged: "you had 180k free here an hour ago" is still worth saying, as
// long as it is not dressed up as current.
export async function availability(now = Date.now()) {
  const all = await chrome.storage.local.get(null);
  const out = [];

  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith('avail:')) continue;
    const provider = key.slice('avail:'.length);
    const quota = all[`quota:${provider}`] || null;
    const lifted = quota?.resetsAt ? Date.parse(quota.resetsAt) <= now : false;

    out.push({
      ...value,
      provider,
      staleMs: now - (value.updatedAt || 0),
      blocked: Boolean(quota?.blocking) && !lifted,
      blockedUntil: quota?.blocking && !lifted ? quota.resetsAt || null : null,
      quotaNote: quota?.raw || null
    });
  }
  return out;
}

export function describeReset(iso) {
  if (!iso) return 'no time given';
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return 'should be clear now';
  const mins = Math.round(ms / 60e3);
  if (mins < 60) return `about ${mins} min`;
  return `about ${Math.round(mins / 60)} h`;
}
