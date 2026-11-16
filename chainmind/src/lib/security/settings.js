// Chain Mind — Made by Suvhankar Dutta
// User-facing switches for the protections, stored under 'cmSettings'.

export const DEFAULT_SETTINGS = {
  preSend: 'warn', // 'warn' holds a risky draft before it is sent; 'off' disables it
  copySanitize: true, // clean text copied from a chat
  sanitizeHandoff: true, // redact and strip hidden text from handoffs
  archive: false // keep a local, redacted copy of conversations for search
};

export async function getSettings() {
  const { cmSettings } = await chrome.storage.local.get('cmSettings');
  return { ...DEFAULT_SETTINGS, ...(cmSettings || {}) };
}

export async function setSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ cmSettings: next });
  return next;
}
