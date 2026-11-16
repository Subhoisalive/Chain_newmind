// Chain Mind — Made by Suvhankar Dutta
// AI firewall. The layer every message passes through before it is treated as
// clean: injection detection, secret detection, code-vulnerability scanning
// on assistant replies, and agent-action monitoring against the least-
// privilege policy. Produces one verdict — allow, flag, require_approval, or
// block — and logs an event for anything worth surfacing on the dashboard.

import { scanForInjection } from './injection.js';
import { scanForSecrets, redact } from './dlp.js';
import { scanCode } from './codeScanner.js';
import { monitorAgentActions } from './agentMonitor.js';
import { classify } from './contextIntegrity.js';
import { getPolicy } from './policy.js';
import { scanHidden } from './hidden.js';
import { scanEncoded } from './encoding.js';
import { scanLinks } from './links.js';
import { scanDependencies } from './deps.js';
import { scanEntropy } from './entropy.js';
import { logEvent, makeEvent, bumpCounter } from './events.js';

const RANK = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

// role: 'user' | 'assistant'
// origin: 'user' | 'assistant' | 'tool' | 'fetched' — defaults to role.
export async function scanMessage({ text, role, origin, provider, conversationTitle }) {
  await bumpCounter('scanned');
  if (!text) return { verdict: 'allow', trust: 'trusted', findings: {} };

  const effectiveOrigin = origin || role;
  const hidden = scanHidden(text);
  const hiddenInjections = hidden.hiddenText.flatMap((h) =>
    scanForInjection(h, { origin: 'fetched' }).map((x) => ({ ...x, kind: 'hidden', label: `Hidden text: ${x.label}`, severity: 'critical' }))
  );
  const encoded = scanEncoded(text);
  const injections = [...scanForInjection(text, { origin: effectiveOrigin }), ...hiddenInjections, ...encoded];
  const secrets = scanForSecrets(text);
  const entropy = scanEntropy(redact(text).text);
  const links = scanLinks(text, { origin: effectiveOrigin });
  const deps = role === 'assistant' ? scanDependencies(text) : [];
  const code = role === 'assistant' ? scanCode(text) : [];
  const trust = classify({ origin: effectiveOrigin, containsInjection: injections.length > 0 });

  let actions = [];
  if (role === 'assistant') {
    const policy = await getPolicy();
    actions = monitorAgentActions(text, policy);
  }

  let verdict = 'allow';
  const bump = (v) => {
    const order = ['allow', 'flag', 'require_approval', 'block'];
    if (order.indexOf(v) > order.indexOf(verdict)) verdict = v;
  };

  const events = [];

  for (const hit of injections) {
    const eventVerdict = hit.severity === 'critical' ? 'block' : hit.severity === 'high' ? 'require_approval' : 'flag';
    events.push(
      makeEvent({
        type: 'injection',
        severity: hit.severity,
        verdict: eventVerdict,
        provider,
        title: hit.label,
        detail: hit.match,
        meta: { kind: hit.kind, trust, conversationTitle }
      })
    );
    bump(eventVerdict);
  }

  const verdictFor = (sev) => (sev === 'critical' ? 'block' : sev === 'high' ? 'require_approval' : 'flag');
  const extra = [
    ...hidden.findings.map((f) => ({ type: 'hidden', f })),
    ...links.map((f) => ({ type: 'link', f })),
    ...deps.map((f) => ({ type: 'dependency', f }))
  ];
  for (const { type, f } of extra) {
    const v = verdictFor(f.severity);
    events.push(makeEvent({ type, severity: f.severity, verdict: v, provider, title: f.label, detail: f.match, meta: { conversationTitle } }));
    bump(v);
  }

  for (const e of entropy) {
    events.push(makeEvent({ type: 'dlp', severity: e.severity, verdict: 'flag', provider, title: e.name, detail: e.sample, meta: { conversationTitle } }));
    bump('flag');
  }

  for (const s of secrets) {
    events.push(
      makeEvent({
        type: 'dlp',
        severity: s.severity,
        verdict: 'flag',
        provider,
        title: `${s.name} detected`,
        detail: s.sample,
        meta: { conversationTitle }
      })
    );
    bump('flag');
  }

  for (const c of code) {
    events.push(
      makeEvent({
        type: 'code',
        severity: c.severity,
        verdict: 'flag',
        provider,
        title: c.name,
        detail: `${c.owasp} · ${c.cwe}`,
        meta: { sample: c.sample, conversationTitle }
      })
    );
    bump('flag');
  }

  for (const a of actions) {
    const eventVerdict = a.effect.toLowerCase();
    events.push(
      makeEvent({
        type: 'agent',
        severity: a.effect === 'BLOCK' ? 'high' : a.effect === 'REQUIRE_APPROVAL' ? 'medium' : 'info',
        verdict: eventVerdict,
        provider,
        title: `Agent action: ${a.action}`,
        detail: `${a.value} — ${a.reason}`,
        meta: { conversationTitle, ruleId: a.ruleId }
      })
    );
    bump(eventVerdict);
  }

  events.sort((x, y) => RANK[y.severity] - RANK[x.severity]);
  for (const ev of events) await logEvent(ev);
  if (events.length) await bumpCounter('flagged');
  if (verdict === 'block') await bumpCounter('blocked');
  if (verdict === 'require_approval') await bumpCounter('approvalsRequired');

  return {
    verdict,
    trust,
    findings: { injections, secrets, code, actions, hidden: hidden.findings, links, deps, entropy },
    redactedText: secrets.length ? redact(text).text : text,
    events
  };
}


// Synchronous scan of a draft before it is sent. Deliberately narrow: it looks
// for things that leak (secrets, high-entropy strings) or arrive hidden in
// pasted text, not for jailbreak phrasing — people write those prompts on
// purpose, and holding every one would make the guard unusable. Findings that
// are only low severity (an email, a phone number) do not hold the draft.
export function scanDraft(text) {
  const findings = [];
  for (const s of scanForSecrets(text)) findings.push({ name: s.name, severity: s.severity, sample: s.sample });
  for (const e of scanEntropy(redact(text).text)) findings.push({ name: e.name, severity: e.severity, sample: e.sample });
  const hidden = scanHidden(text);
  for (const f of hidden.findings.filter((x) => x.severity === 'critical' || x.severity === 'high')) {
    findings.push({ name: f.label, severity: f.severity, sample: f.match });
  }
  for (const h of hidden.hiddenText) {
    for (const x of scanForInjection(h, { origin: 'fetched' })) findings.push({ name: `Hidden text: ${x.label}`, severity: 'critical', sample: x.match });
  }
  for (const e of scanEncoded(text)) findings.push({ name: e.label, severity: e.severity, sample: e.match });
  const actionable = findings.some((f) => RANK[f.severity] >= 2);
  return { findings: actionable ? findings : [] };
}
