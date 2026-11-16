# Chain Mind 0.4.0 (unreleased)

Builds on the 0.3.0 security suite. Every item is local; nothing is sent anywhere.

- **Pre-send interception** (`content/guards.js`, `scanDraft` in `firewall.js`) — Enter or the send button is held when the draft contains secrets, high-entropy strings, or hidden text. Choices: *Redact and send*, *Redact only*, *Send anyway*, *Cancel*. Each choice is logged. Email/phone alone never hold a draft. Switch off under Settings.
- **Hidden-text detection** (`hidden.js`) — invisible Unicode tag characters (decoded to the hidden message), zero-width runs, bidi controls, HTML comments, invisible-styled spans, alt/title text (scanned for injection), mixed-script words.
- **Encoding tricks** (`encoding.js`) — base64, ROT13 and homoglyph/invisible-character obfuscation, re-checked with the injection detector.
- **Link reputation** (`links.js`) — lookalike domains, brand-as-subdomain, punycode, raw IPs, user-info URLs, and image URLs that carry data out.
- **Dependency check** (`deps.js`) — typosquats of popular npm/pip packages, installs from URLs, custom indexes. It cannot tell whether an unfamiliar name exists on a registry; that needs a lookup.
- **Entropy-based secrets** (`entropy.js`) — random-looking strings; ignores URLs, hex hashes and plain identifiers.
- **Handoff sanitizer** (`sanitize.js`, `handoff.js`) — redacts secrets, strips hidden characters, and prefixes a notice if the transcript contains AI-directed instructions.
- **Smart compression** (`compress.js`) — when a chat does not fit, builds goal / decisions / constraints / open items / latest code / recent messages instead of head-and-tail. Extractive: selects existing sentences, does not rewrite them.
- **Semantic diff** — the dashboard's Handoff tab shows what did not make the trip (code blocks, key statements, coverage %). Keyword-overlap heuristic.
- **Cross-provider search** (`archive.js`, Search tab) — off by default; saves redacted conversations locally.
- **Copy sanitizer** (`sanitize.js`) — selected text copied from a chat loses invisible characters, odd spaces, citation markers, and stray markdown (`**`, `*`, `#`, `* ` bullets). Code blocks keep their content. Joiners are kept in emoji and Indic scripts. It does **not** remove statistical watermarks (those live in word choice), and does not intercept a site's own Copy button.
- Dashboard: Search, Handoff and Settings tabs; Analytics now scores seven detectors. The test sets are small and were written alongside the detectors, so their perfect scores show the rules work on those cases, not how they perform on real traffic.

# Chain Mind 0.3.0 (unreleased)

A security suite added on top of 0.2.0's context transfer: an AI firewall that
scans every message flowing through a supported tab, a least-privilege policy
engine for actions an assistant describes taking, a code scanner, and a
dashboard to see all of it. Drop this folder over your existing one and run
`node build.js` — the bundle in this drop is already built, so it loads
unpacked as-is too.

## New in 0.3.0 — Security suite

Twelve pieces, all local: nothing here calls out to a server, and the event
log lives in `chrome.storage.local` like everything else Chain Mind keeps.

1. **AI Context Transfer** — already existed in 0.2.0 (`schema.js`'s
   `compactExtractive()` and the handoff-brief prompt); unchanged here.
2. **AI Firewall** (`src/lib/security/firewall.js`) — the layer every message
   passes through. Runs injection detection, secret detection, and (on
   assistant replies) code scanning and agent-action monitoring, then folds
   the results into one verdict: `allow`, `flag`, `require_approval`, `block`.
   Wired into `bridge-core.js`'s `ingest()`, so it runs automatically as a
   conversation is read — no separate step.
3. **Prompt Injection Detection** (`injection.js`) — direct-override patterns
   ("ignore all previous instructions", DAN-style jailbreaks) scored high
   regardless of where they came from, and indirect markers (an instruction
   addressed to "the AI" sitting inside content) scored critical specifically
   when the text did not come from the user typing it — a scraped page, a
   tool result — since that is the case the user never saw.
4. **AI Data Loss Prevention** (`dlp.js`) — pattern rules for AWS/GitHub/
   Slack/Stripe keys, private-key blocks, JWTs, DB connection strings,
   passwords, SSNs, card numbers (Luhn-checked), emails, and phone numbers.
   `redact()` returns a copy with matches swapped for `[REDACTED:KIND]`.
5. **AI Agent Security** (`agentMonitor.js`) — reads an assistant's reply for
   the shapes an action takes once written down (a shell fence, `fetch`/
   `curl`, a file write, a SQL statement) and runs each one past the policy.
   Text-pattern extraction from the transcript, not a live tool-call hook —
   Chain Mind only ever sees what a chat page renders.
6. **Least-Privilege Policy Engine** (`policy.js`) — ordered `ALLOW` /
   `BLOCK` / `REQUIRE_APPROVAL` rules, first match wins. Ships with a
   conservative default (recursive deletes and `curl | sh` blocked outright;
   shell, writes, network, and DB actions need approval by default; reads are
   allowed). Editable from the dashboard's Policy tab; stored under
   `policyRules` so edits survive a reload.
7. **AI Code Security Scanner** (`codeScanner.js`) — regex rules for SQL
   built by concatenation, `innerHTML` XSS, shell command injection, SSRF
   from unvalidated input, hardcoded credentials, weak hashes, `eval`/`exec`,
   insecure RNG for tokens, disabled TLS verification, and path traversal.
   Each finding carries an OWASP Top 10 category and a CWE id.
8. **Context Integrity** (`contextIntegrity.js`) — classifies a message as
   trusted (user-typed or the model's own reply), sensitive (pulled from a
   page/PDF/tool result), or untrusted (pulled in *and* carrying an
   injection marker).
9. **Originality & Integrity Analyzer** (`originality.js`) — shingled n-gram
   overlap against text you paste in for comparison (not a web-wide check —
   this extension has no crawler), plus pattern flags for claims that read as
   authoritative with no citation nearby ("studies show", "experts agree").
   Framed throughout as a rewriting aid, not a plagiarism verdict.
10. **AI Output Cleaner** (`cleaner.js`) — strips filler openers ("Certainly!",
    "As an AI language model"), a short list of stock phrases, and sentences
    repeated verbatim later in the same reply. Leaves fenced code blocks
    untouched.
11. **AI Security Dashboard** (`src/ui/dashboard.html`, opened from the popup
    or the in-page firewall summary) — an Overview tab with live counts, risk
    levels by severity, findings by detector, and an attack-chain view for the
    most recent conversation with anything flagged; a full Events log with a
    type filter; the Policy editor; and a Tools tab exposing the DLP
    redactor, originality analyzer, and output cleaner as standalone paste-in
    utilities.
12. **Research & Analytics** (`analytics.js`, Analytics tab) — an
    eight-case hand-labeled test set for injection detection and a six-case
    set for DLP, scored for precision/recall/F1/latency against the live
    detectors so the numbers are checkable in the source rather than
    asserted. Separately, live detection rate and counts pulled from actual
    events logged in this browser.

None of the detectors above are exhaustive — they are regex and heuristics,
not a model. They are written to fail toward showing you something rather
than staying silent, which means the honest cost is more false positives, not
fewer. The Analytics tab exists so that trade-off is visible rather than
assumed.

## New in 0.2.0

**`src/lib/quota.js`** — the quota banner, persisted. `readNotice()` was already
finding "limit reached, resets at 3pm" and then throwing it away when the tab
closed. Now it parses a reset time out of it and keeps two small records per
provider, `quota:{id}` and `avail:{id}`, both overwritten rather than appended.

**`src/lib/recommend.js`** — two offline recommenders.
`rankProviders()` answers "where do I go now", scoring each other assistant on
quota state, usable window against the size of the thread you are carrying, how
full your open chat there already is, and content fit. `suggestTools()` answers
"what tool does this job" against the catalog.

**`src/lib/catalog.js`** — the tool list, restructured into tags with a
`checked` date per entry. Entries seeded from your list carry `checked: null`
and the UI labels them unverified, because a directory that implies it was
checked and was not is worse than a short one. Miners and view-selling services
from the seed list are left out on purpose.

**HUD routing block** — hidden until the gauge goes critical or the site prints
a quota banner, then it lists up to three places to go with one line of
reasoning each. The button trims to half the target's window, copies, and opens
the tab.

**Popup advisor** — a box you describe a job into. Local match first; when
nothing fits closely it says so and offers to put the question to the assistant
in the tab instead, which costs one turn and no API key.

## Fixed

1. **A thin scrape could overwrite a full parse.** `ingest()` compared
   `conv.id`, but `makeConversation()` mints a fresh UUID when the caller has no
   id, and `scrape()` never passes one — so the ids never matched, the guard
   never fired, and a mid-render DOM read could replace a complete network
   parse. Now keyed on the conversation URL, which both paths agree on.
2. **Upload count reset on reload and over-counted.** It lived in a plain
   variable, and matched `/upload|\/files\b/` against every request, so
   ChatGPT's file *listing* GETs counted as uploads. Now persisted per
   conversation, POST-only, deduped by URL.
3. **Storage would eventually stop accepting writes.** Full conversations, 50 of
   them, into a 10 MB bucket. Added `unlimitedStorage`.
4. **Cleanup almost never ran.** `chrome.runtime.onStartup` fires on browser
   launch only. Moved to a `chrome.alarms` sweep every three hours, which also
   drops expired quota records.
5. **Rescans fought the stream.** The MutationObserver fired continuously while
   a reply was being written. The hook now emits `stream-start`, and the
   observer sits out until the stream ends.

## Matching bugs found while testing the advisor

Worth knowing about, because they are the shape of bug this kind of feature has:

- "look up a value across sheets" returned **Looka**, and "a blog post that
  ranks on google" returned **Fronty** — short query words were allowed to
  substring-match product names. Name matching now needs five characters.
- "debug my python script" returned three tools that merely carry a `code` tag
  and buried the right answer, which is the assistant already in front of you.
  General assistants are out of the catalog search now and handled by the
  weak-match path.
- "wedding seating chart" scored a dashboard tool as a strong match, because
  `chart` expanded to two tags. It maps to one now and lands as weak.

`SYNONYMS` in `catalog.js` is where this quality lives. Every search that should
have worked and did not is one line there.

## Still worth doing

- Verify the catalog links and fill in `checked` dates. Until then most of the
  list shows as unverified, which is accurate but not a good look at 40 entries.
- The reset-time parser handles clock times and relative durations in English
  only. Anyone using these sites in another language gets `blocking: true` with
  no reset time, which degrades correctly but is not great.
- `carryTo()` copies the trimmed transcript. Copying the *handoff brief* instead,
  once one exists in the thread, would be strictly better — that needs the brief
  captured as a first-class artifact, which is the next feature.
