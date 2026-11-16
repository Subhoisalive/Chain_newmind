// Chain Mind — Made by Suvhankar Dutta
// The tool catalog the advisor searches.
//
// This is a directory, and a stale directory presented confidently is worse
// than a short honest one. So every entry carries `checked`, the last date a
// human confirmed the link resolves and the product still exists, and the UI
// shows it. Entries seeded from an older list are marked `checked: null` and
// the advisor labels them "unverified" rather than quietly recommending them.
//
// Deliberately excluded: engagement farming, view/subscriber services, and
// crypto miners. They were in the seed list. They are not productivity tools
// and recommending them out of this extension would cost more trust than they
// could ever earn.
//
// Tags are the whole matching surface. Keep them from the vocabulary below —
// a tag nobody searches for is a tag that does nothing.
//
//   write seo copywriting email resume
//   code spreadsheet formula data research analytics
//   image generate edit background upscale restore avatar
//   logo branding naming color design ui prototype html
//   video slides narration music audio voice transcribe meetings
//   screen-record docs prompts assistant

const SEED = null; // never hand-checked; from the imported list

export const CATALOG = [
  // --- general assistants (the routing targets) ----------------------------
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com', checked: '2026-09-18',
    what: 'General assistant. Strong at code, structured output, and image generation in one place.',
    tags: ['assistant', 'write', 'code', 'research', 'generate'] },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai', checked: '2026-09-18',
    what: 'General assistant. Long documents, careful editing, and code that has to actually run.',
    tags: ['assistant', 'write', 'code', 'docs', 'research'] },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com', checked: '2026-09-18',
    what: 'General assistant with the largest context window of the four. Good for dumping a lot in at once.',
    tags: ['assistant', 'write', 'code', 'research', 'video'] },
  { id: 'grok', name: 'Grok', url: 'https://grok.com', checked: '2026-09-18',
    what: 'General assistant wired to live posts. Useful when the answer depends on what happened today.',
    tags: ['assistant', 'write', 'research'] },

  // --- writing and marketing copy ------------------------------------------
  { id: 'jasper', name: 'Jasper', url: 'https://jasper.ai', checked: SEED,
    what: 'Marketing copy at team scale, with brand voice settings.', tags: ['write', 'copywriting', 'email'] },
  { id: 'writesonic', name: 'Writesonic', url: 'https://writesonic.com', checked: SEED,
    what: 'Article and ad copy generation.', tags: ['write', 'copywriting', 'seo'] },
  { id: 'rytr', name: 'Rytr', url: 'https://rytr.me', checked: SEED,
    what: 'Short-form copy on a cheap plan.', tags: ['write', 'copywriting'] },
  { id: 'anyword', name: 'Anyword', url: 'https://anyword.com', checked: SEED,
    what: 'Copy with a predicted performance score per variant, and persona targeting.',
    tags: ['write', 'copywriting', 'email', 'analytics'] },
  { id: 'textcortex', name: 'TextCortex', url: 'https://textcortex.com', checked: SEED,
    what: 'Writing assistant that works inside other web apps.', tags: ['write', 'email'] },
  { id: 'easypeasy', name: 'Easy-Peasy AI', url: 'https://easy-peasy.ai', checked: SEED,
    what: 'Templates for posts, emails, and resumes, plus images and transcripts.',
    tags: ['write', 'email', 'resume', 'transcribe'] },
  { id: 'typewise', name: 'Typewise', url: 'https://typewise.app', checked: SEED,
    what: 'Reply drafting for support and sales inboxes.', tags: ['write', 'email'] },

  // --- SEO ------------------------------------------------------------------
  { id: 'surfer', name: 'Surfer', url: 'https://surferseo.com', checked: SEED,
    what: 'Outlines and on-page scoring against what already ranks.', tags: ['seo', 'write', 'research'] },
  { id: 'outranking', name: 'Outranking', url: 'https://www.outranking.io', checked: SEED,
    what: 'SEO-led drafting from keyword to published post.', tags: ['seo', 'write'] },

  // --- images ---------------------------------------------------------------
  { id: 'removebg', name: 'remove.bg', url: 'https://www.remove.bg', checked: SEED,
    what: 'Cuts the background out of a photo. One job, done fast.', tags: ['image', 'background', 'edit'] },
  { id: 'cleanup', name: 'Cleanup.pictures', url: 'https://cleanup.pictures', checked: SEED,
    what: 'Paints out unwanted objects without opening Photoshop.', tags: ['image', 'edit', 'restore'] },
  { id: 'letsenhance', name: "Let's Enhance", url: 'https://letsenhance.io', checked: SEED,
    what: 'Upscales low-resolution images.', tags: ['image', 'upscale', 'restore'] },
  { id: 'vanceai', name: 'VanceAI', url: 'https://vanceai.com', checked: SEED,
    what: 'Bundle of image fixes: upscale, denoise, background, text recognition.',
    tags: ['image', 'upscale', 'edit', 'background'] },
  { id: 'pfpmaker', name: 'PFPMaker', url: 'https://pfpmaker.com', checked: SEED,
    what: 'Turns a photo into a profile picture with a clean backdrop.', tags: ['image', 'avatar', 'background'] },
  { id: 'deeparteffects', name: 'Deep Art Effects', url: 'https://www.deeparteffects.com', checked: SEED,
    what: 'Style transfer and artistic filters on a photo.', tags: ['image', 'edit', 'generate'] },

  // --- brand and design -----------------------------------------------------
  { id: 'looka', name: 'Looka', url: 'https://looka.com', checked: SEED,
    what: 'Logo plus a starter brand kit, guided by picking styles you like.', tags: ['logo', 'branding', 'design'] },
  { id: 'brandmark', name: 'Brandmark', url: 'https://brandmark.io', checked: SEED,
    what: 'Logo, palette, and a matching page template in one pass.', tags: ['logo', 'branding', 'color'] },
  { id: 'namelix', name: 'Namelix', url: 'https://namelix.com', checked: SEED,
    what: 'Short brandable business names, filtered by style.', tags: ['naming', 'branding'] },
  { id: 'khroma', name: 'Khroma', url: 'https://www.khroma.co', checked: SEED,
    what: 'Palettes trained on colors you said you liked, previewed as type and gradients.',
    tags: ['color', 'design'] },
  { id: 'uizard', name: 'Uizard', url: 'https://uizard.io', checked: SEED,
    what: 'Sketch or prompt to clickable prototype.', tags: ['ui', 'prototype', 'design'] },
  { id: 'fronty', name: 'Fronty', url: 'https://fronty.com', checked: SEED,
    what: 'Design image to HTML and CSS.', tags: ['html', 'ui', 'code', 'design'] },

  // --- video, audio, slides -------------------------------------------------
  { id: 'synthesia', name: 'Synthesia', url: 'https://www.synthesia.io', checked: SEED,
    what: 'Script to presenter video with a synthetic avatar.', tags: ['video', 'narration', 'slides'] },
  { id: 'lumen5', name: 'Lumen5', url: 'https://lumen5.com', checked: SEED,
    what: 'Turns an article into a captioned social video.', tags: ['video', 'slides'] },
  { id: 'pictory', name: 'Pictory', url: 'https://pictory.ai', checked: SEED,
    what: 'Long recordings cut down to short clips.', tags: ['video', 'edit'] },
  { id: 'narakeet', name: 'Narakeet', url: 'https://narakeet.com', checked: SEED,
    what: 'Slides plus a script to a narrated video, many languages.',
    tags: ['video', 'narration', 'slides', 'voice'] },
  { id: 'podcastle', name: 'Podcastle', url: 'https://podcastle.ai', checked: SEED,
    what: 'Record and clean up a podcast in the browser.', tags: ['audio', 'voice', 'edit'] },
  { id: 'bannerbear', name: 'Bannerbear', url: 'https://www.bannerbear.com', checked: SEED,
    what: 'Generates images and short videos from templates over an API.',
    tags: ['image', 'video', 'generate', 'code'] },

  // --- meetings and speech --------------------------------------------------
  { id: 'otter', name: 'Otter.ai', url: 'https://otter.ai', checked: SEED,
    what: 'Live meeting notes, transcript, and a summary afterwards.',
    tags: ['meetings', 'transcribe', 'audio', 'docs'] },
  { id: 'fireflies', name: 'Fireflies.ai', url: 'https://fireflies.ai', checked: SEED,
    what: 'Records and indexes calls so you can search across them.',
    tags: ['meetings', 'transcribe', 'research'] },
  { id: 'poised', name: 'Poised', url: 'https://poised.com', checked: SEED,
    what: 'Coaching on how you actually sound on calls.', tags: ['meetings', 'voice'] },

  // --- work artifacts -------------------------------------------------------
  { id: 'formulagenerator', name: 'FormulaGenerator', url: 'https://formulagenerator.app', checked: SEED,
    what: 'Spreadsheet formulas from a description, plus an error checker.',
    tags: ['spreadsheet', 'formula', 'data'] },
  { id: 'kickresume', name: 'Kickresume', url: 'https://kickresume.com', checked: SEED,
    what: 'Resume and cover letter drafting on designed templates.', tags: ['resume', 'write', 'docs'] },
  { id: 'scribe', name: 'Scribe', url: 'https://scribehow.com', checked: SEED,
    what: 'Records what you click and writes the step-by-step guide.', tags: ['screen-record', 'docs'] },
  { id: 'vento', name: 'Vento', url: 'https://vento.so', checked: SEED,
    what: 'Screen recording where you re-record over a mistake instead of starting again.',
    tags: ['screen-record', 'video'] },
  { id: 'roseai', name: 'Rose AI', url: 'https://rose.ai', checked: SEED,
    what: 'Finding, cleaning, and charting datasets.', tags: ['data', 'research', 'analytics'] },
  { id: 'dashthis', name: 'DashThis', url: 'https://dashthis.com', checked: SEED,
    what: 'Marketing dashboards pulled from your ad and analytics accounts.', tags: ['analytics', 'data'] },

  // --- prompts --------------------------------------------------------------
  { id: 'prompthero', name: 'PromptHero', url: 'https://prompthero.com', checked: SEED,
    what: 'Searchable gallery of image prompts and their results.', tags: ['prompts', 'image', 'generate'] },
  { id: 'promptbase', name: 'PromptBase', url: 'https://promptbase.com', checked: SEED,
    what: 'Marketplace for prompts that someone already tuned.', tags: ['prompts'] },
  { id: 'promptlayer', name: 'PromptLayer', url: 'https://promptlayer.com', checked: SEED,
    what: 'Logs and versions prompts when you are building on an API.', tags: ['prompts', 'code', 'analytics'] }
];

// Query words that are not tags, mapped to the tags they imply. This is where
// most of the matching quality lives — add a line here whenever a search that
// should have worked comes back empty.
export const SYNONYMS = {
  blog: ['write', 'seo'], post: ['write'], article: ['write', 'seo'], essay: ['write'],
  copy: ['copywriting'], ad: ['copywriting'], ads: ['copywriting'], headline: ['copywriting'],
  newsletter: ['email', 'write'], outreach: ['email'], reply: ['email'], inbox: ['email'],
  rank: ['seo'], keyword: ['seo'], keywords: ['seo'], google: ['seo'],
  cv: ['resume'], job: ['resume'], application: ['resume'],
  photo: ['image'], picture: ['image'], pic: ['image'], png: ['image'], jpg: ['image'],
  remove: ['background', 'edit'], cutout: ['background'], transparent: ['background'],
  blurry: ['upscale', 'image'], pixelated: ['upscale', 'image'], resolution: ['upscale'],
  sharpen: ['upscale', 'image'], sharper: ['upscale', 'image'], screenshot: ['image'],
  headshot: ['avatar', 'image'], profile: ['avatar'], pfp: ['avatar'],
  brand: ['branding'], identity: ['branding'], palette: ['color'], colours: ['color'], colors: ['color'],
  name: ['naming'], names: ['naming'], startup: ['naming', 'branding'],
  mockup: ['ui', 'prototype'], wireframe: ['ui', 'prototype'], figma: ['ui', 'design'],
  website: ['html', 'ui'], landing: ['html', 'ui'], css: ['html', 'code'],
  reel: ['video'], short: ['video'], shorts: ['video'], youtube: ['video'],
  voiceover: ['narration', 'voice'], dub: ['narration', 'voice'], tts: ['voice', 'narration'],
  podcast: ['audio', 'voice'], deck: ['slides'], presentation: ['slides'],
  meeting: ['meetings'], call: ['meetings'], zoom: ['meetings'], notes: ['meetings', 'docs'],
  transcript: ['transcribe'], subtitles: ['transcribe'], caption: ['transcribe'],
  excel: ['spreadsheet', 'formula'], sheets: ['spreadsheet', 'formula'], vlookup: ['formula'],
  csv: ['data', 'spreadsheet'], dataset: ['data'],
  // 'chart' alone used to pull two tags and score a dashboard tool as a strong
  // match for "wedding seating chart". One tag, so it lands as weak instead.
  chart: ['analytics'],
  dashboard: ['analytics'], report: ['analytics', 'docs'],
  tutorial: ['screen-record', 'docs'], documentation: ['docs'], sop: ['screen-record', 'docs'],
  debug: ['code'], refactor: ['code'], script: ['code'], api: ['code'],
  summarize: ['assistant'], summarise: ['assistant'], explain: ['assistant'], brainstorm: ['assistant'],
  prompt: ['prompts'], midjourney: ['prompts', 'generate'], draw: ['generate', 'image']
};

export function toolById(id) {
  return CATALOG.find((t) => t.id === id) || null;
}
