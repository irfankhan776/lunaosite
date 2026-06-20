// AI code-editing wrapper around Claude for the Site Editor chat.
// Given the site's current HTML + a natural-language instruction, Claude
// returns the FULL updated HTML document. We stream the text back so the
// editor can refresh its live preview as the code is written.
import Anthropic from '@anthropic-ai/sdk';
import { anthropic as anthropicCfg } from './config.js';

function buildClient(apiKey) {
  return new Anthropic({ apiKey: apiKey || anthropicCfg.apiKey });
}

function getClient() {
  if (!anthropicCfg.live) return null;
  return buildClient(anthropicCfg.apiKey);
}

export function isAiEnabled() {
  return anthropicCfg.live;
}

const SYSTEM_PROMPT = `You are an elite front-end engineer editing a single self-contained HTML page for a local business website (the page already has inline <style> and any needed <script>).

CRITICAL — your job is to make MINIMAL, PRECISE changes while keeping everything else IDENTICAL.

ABSOLUTE RULES — never break these:
1. You will receive the CURRENT full HTML and an edit instruction.
2. Apply ONLY the requested change. Leave everything else exactly as-is.
3. NEVER remove, reorder, or restructure HTML elements, CSS classes, or JavaScript unless explicitly asked.
4. NEVER add placeholder tokens like {{BUSINESS_NAME}} or {{CITY}} unless the user EXPLICITLY asks for them.
5. NEVER wrap content in extra <div> wrappers or change the existing DOM structure.
6. NEVER change the <title> tag unless the user explicitly asks.
7. The page must remain fully self-contained (inline CSS/JS). Never remove inline styles.
8. If the user's instruction is vague (e.g. "make it better"), make only TINY improvements — one small CSS color tweak, or one copy change. Do NOT rewrite the whole page.
9. If you're unsure what something is in the HTML, leave it completely unchanged.

WHAT TO DO:
- Small text/color changes: modify only the specific inline style or CSS rule
- Content edits: change only the specific text node
- Adding sections: append new HTML at the end of <body> only
- Removing sections: only if explicitly asked

WHAT NOT TO DO:
- Do NOT rewrite the entire CSS
- Do NOT restructure the <header>, <nav>, <main>, or <footer>
- Do NOT add placeholder tokens ({{BRAND_NAME}}, {{CITY}}, etc.)
- Do NOT add new CSS variables unless adding a new feature

OUTPUT: The COMPLETE updated HTML document and NOTHING else.
No explanations. No markdown fences. No commentary. Start at <!DOCTYPE html> and end at </html>.`;

function buildUserContent(html, instruction, history = []) {
  const convo = (history || [])
    .filter((m) => m && m.role && m.content)
    .slice(-6)
    .map((m) => `${m.role === 'assistant' ? 'You previously' : 'User asked'}: ${m.content}`)
    .join('\n');

  return [
    convo ? `Recent conversation context:\n${convo}\n` : '',
    'CURRENT HTML:',
    '```html',
    html,
    '```',
    '',
    `EDIT INSTRUCTION: ${instruction}`,
    '',
    'Return the complete updated HTML document only.',
  ]
    .filter(Boolean)
    .join('\n');
}

// Strip accidental markdown fences if the model wraps output despite instructions.
export function cleanHtmlOutput(text) {
  let out = (text || '').trim();
  const fence = out.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  if (fence) out = fence[1].trim();
  return out;
}

// ---------------------------------------------------------------------------
// Template generation — builds a brand-new HTML page from a free-text prompt.
// The generated raw HTML uses ONLY the 3 core placeholders (BUSINESS_NAME, CITY,
// PHONE_DISPLAY) plus any extras auto-detected from the user's prompt. This
// guarantees every generated template is safe to compile in a campaign without
// any hardcoded brand names leaking through.
// ---------------------------------------------------------------------------

// The ONLY placeholders the AI may use by default. This is the strict base set.
const CORE_PLACEHOLDERS = ['BUSINESS_NAME', 'CITY', 'PHONE_DISPLAY', 'PHONE_RAW'];

// Smart extras: derived from the 3 core values, no extra placeholders needed.
// The AI is instructed to BUILD these values from the core placeholders in the HTML.
const ALLOWED_SMARTS = ['PHONE_RAW']; // always allowed (always present)

// Additional placeholders the AI may use ONLY if the user explicitly mentioned
// that thing in their prompt. Detected below via keyword matching.
const EXTRA_PLACEHOLDERS = [
  'STATE', 'YEARS_IN_BUSINESS', 'EMAIL', 'ADDRESS',
  'GOOGLE_RATING', 'GOOGLE_REVIEW_COUNT',
  'INSTAGRAM_HANDLE', 'FACEBOOK_URL', 'SITE_URL',
  'DOCTOR_NAME', 'AVERAGE_RATING', 'MEMBERS_COUNT', 'TRAINERS_COUNT',
];

const PLACEHOLDER_RE = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g;

/**
 * Parse the user's prompt and detect which extra placeholders they expect.
 * Returns a merged allowlist of placeholder keys the AI may use.
 */
function detectAllowedPlaceholders(prompt) {
  const p = (prompt || '').toLowerCase();
  const allowed = new Set([...CORE_PLACEHOLDERS, ...ALLOWED_SMARTS]);

  // Keyword → placeholder mapping. If user mentions the concept, allow the placeholder.
  const extraRules = [
    [/\bstate\b/, 'STATE'],
    [/\byears?\s*(in\s*)?(business|biz)\b/, 'YEARS_IN_BUSINESS'],
    [/\bemail\b/, 'EMAIL'],
    [/\baddress\b/, 'ADDRESS'],
    [/\bgoogle\s*(rating|reviews?)\b/, 'GOOGLE_RATING'],
    [/\breview\s*(count|number)\b/, 'GOOGLE_REVIEW_COUNT'],
    [/\b(google|rating|stars?)\b/, 'GOOGLE_RATING'],
    [/\binstagram\b|\big\b|\bIG\b/, 'INSTAGRAM_HANDLE'],
    [/\bfacebook\b|\bfb\b/, 'FACEBOOK_URL'],
    [/\b(website|site)\s*(url|link)\b|\burl\b/, 'SITE_URL'],
    [/\bdoctor\b|\bdr\.\b/, 'DOCTOR_NAME'],
    [/\btrainer\b/, 'TRAINERS_COUNT'],
    [/\bmember\b/, 'MEMBERS_COUNT'],
    [/\brating\b/, 'AVERAGE_RATING'],
  ];

  for (const [regex, placeholder] of extraRules) {
    if (regex.test(p)) allowed.add(placeholder);
  }

  return allowed;
}

/**
 * Validate that a generated HTML contains ONLY allowed placeholders.
 * Returns an array of disallowed placeholders (empty = valid).
 */
function findDisallowedPlaceholders(html, allowedSet) {
  const found = new Set();
  let m;
  const re = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g;
  while ((m = re.exec(html)) !== null) {
    if (!allowedSet.has(m[1])) {
      found.add(m[0]);
    }
  }
  return [...found];
}

/**
 * Scan HTML for common hardcoded brand-name patterns that should have used
 * {{BUSINESS_NAME}} instead. Returns a list of suspicious strings.
 * This catches cases where the AI hardcoded "Everest Cooling" instead of
 * using the placeholder. Works on the raw HTML (before demo values are applied).
 */
function findHardcodedBrandNames(html) {
  // Extract all literal (non-placeholder) text that looks like a business name.
  // Strategy: strip placeholders, then scan for capitalized multi-word strings
  // that look like business names (2-5 words, capitalized, not HTML tags/attrs).
  const withoutPlaceholders = html.replace(/\{\{[^}]+\}\}/g, '___PH___');

  // Find text content outside HTML tags
  const textContent = withoutPlaceholders
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[^a-zA-Z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Look for capitalized multi-word phrases that could be business names
  // (2-4 words, each starting with capital, not common HTML/CSS words)
  const commonHtmlTerms = new Set([
    'html', 'body', 'head', 'style', 'script', 'div', 'span', 'class',
    'footer', 'header', 'nav', 'section', 'button', 'link', 'meta',
    'font', 'color', 'background', 'padding', 'margin', 'border', 'width',
    'height', 'display', 'align', 'center', 'none', 'block', 'flex',
    'absolute', 'relative', 'fixed', 'static', 'auto', 'inline', 'table',
    'row', 'column', 'grid', 'https', 'http', 'www', 'com', 'org',
    'Phone', 'City', 'Email', 'Address', 'About', 'Contact', 'Home',
    'Services', 'Hours', 'Map', 'Location', 'Call', 'Visit', 'Learn',
    'Get', 'Book', 'Schedule', 'Free', 'New', 'Best', 'Top',
  ]);

  const words = textContent.split(/\s+/).filter((w) => w.length > 2);
  const suspicious = [];

  // Scan for 2-4 consecutive capitalized words that aren't common terms
  for (let i = 0; i < words.length - 1; i++) {
    const phrase = [words[i], words[i + 1]];
    if (words[i] && words[i][0] === words[i][0].toUpperCase() &&
        words[i + 1] && words[i + 1][0] === words[i + 1][0].toUpperCase()) {
      // Could be 2-word business name
      const isCommon = commonHtmlTerms.has(words[i]) || commonHtmlTerms.has(words[i + 1]);
      if (!isCommon && words[i].length > 3 && words[i + 1].length > 3) {
        suspicious.push(`Possible hardcoded business name: "${words[i]} ${words[i + 1]}". Use {{BUSINESS_NAME}} instead.`);
      }
    }
  }

  // Remove duplicates
  const uniqueSuspicious = [...new Set(suspicious)];
  return uniqueSuspicious.slice(0, 3); // return max 3 warnings
}

/**
 * Build the system prompt for template generation. This enforces the
 * strict "3 core placeholders by default" rule and guides the AI to
 * intelligently derive all other values from the business name.
 */
function buildTemplateSystemPrompt(niche, allowedPlaceholders, prompt) {
  const p = (prompt || '').toLowerCase();
  const mentions = [];
  if (/\bstate\b/.test(p)) mentions.push('{{STATE}}');
  if (/\byears?\s*(in\s*)?(business|biz)\b/.test(p)) mentions.push('{{YEARS_IN_BUSINESS}}');
  if (/\bemail\b/.test(p)) mentions.push('{{EMAIL}}');
  if (/\baddress\b/.test(p)) mentions.push('{{ADDRESS}}');
  if (/\bgoogle\s*(rating|reviews?)\b/.test(p) || /\brating\b/.test(p) || /\bstars?\b/.test(p)) {
    mentions.push('{{GOOGLE_RATING}}', '{{GOOGLE_REVIEW_COUNT}}');
  }
  if (/\binstagram\b|\big\b|\bIG\b/.test(p)) mentions.push('{{INSTAGRAM_HANDLE}}');
  if (/\bfacebook\b|\bfb\b/.test(p)) mentions.push('{{FACEBOOK_URL}}');
  if (/\b(website|site)\s*(url|link)\b|\burl\b/.test(p)) mentions.push('{{SITE_URL}}');
  if (/\bdoctor\b|\bdr\.\b/.test(p)) mentions.push('{{DOCTOR_NAME}}');
  if (/\btrainer\b/.test(p)) mentions.push('{{TRAINERS_COUNT}}');
  if (/\bmember\b/.test(p)) mentions.push('{{MEMBERS_COUNT}}');

  const extrasLine = mentions.length > 0
    ? `\n\nAdditionally, since you mentioned relevant details, you MAY also use:\n  ${[...new Set(mentions)].join(', ')}`
    : '';

  return `You are an elite front-end engineer building a complete, self-contained HTML website template for a local ${niche || 'business'}.

CRITICAL — PLACEHOLDER RULES (OBEY EXACTLY):
The ONLY placeholders you may use are:
  {{BUSINESS_NAME}}   — required, use EVERYWHERE the business name appears
  {{CITY}}            — required, use for city/location
  {{PHONE_DISPLAY}}   — required, human-readable phone number in visible text
  {{PHONE_RAW}}       — required, digits only, for href="tel:${'{PHONE_RAW}'}"${extrasLine}

NEVER use any placeholder not listed above. NEVER hardcode a business name, city, or phone number — always use the placeholders.

HOW TO HANDLE SOCIAL MEDIA / EXTRA INFO:
If you need an Instagram or Facebook URL:
  - For Instagram: use {{INSTAGRAM_HANDLE}} if allowed, OR build from {{BUSINESS_NAME}}
    Example: use "{{BUSINESS_NAME}}'s official Instagram" as visible text
  - For Facebook: use {{FACEBOOK_URL}} if allowed, OR build from {{BUSINESS_NAME}}
    Example: use "Find us on Facebook" with a link to "{{BUSINESS_NAME}} on Facebook"
If you need an address: build from {{CITY}} — e.g., "Serving all of {{CITY}} and surrounding areas"
If you need a website URL: use {{SITE_URL}} if allowed, OR simply omit it
If you need years in business, email, ratings, or any other detail: build it or omit it — never invent a specific value

TEMPLATE REQUIREMENTS:
1. Output a COMPLETE, production-ready single-file HTML document (<!DOCTYPE html> ... </html>).
2. All CSS must be inline (<style> in <head>). No external stylesheets.
3. Responsive: looks great on mobile (375px) and desktop (1280px).
4. Use Unsplash for images: https://images.unsplash.com/photo-... (use specific photo IDs for real images).
5. Color palette: cohesive and appropriate for ${niche || 'the niche'}.
6. Sections to include: header/nav, hero with CTA, services/features grid, about/why-us, testimonials, CTA banner, footer with contact.
7. Phone links: use href="tel:{{PHONE_RAW}}" and visible text "{{PHONE_DISPLAY}}".
8. NEVER wrap output in markdown fences. Start with <!DOCTYPE html> and end with </html>.
9. NEVER include any explanatory text outside the HTML.

YOUR JOB: If the user asks for something you can't represent with the allowed placeholders, either:
  a) Use {{BUSINESS_NAME}} to build the text (e.g., "hello@{{BUSINESS_NAME}}.com" for email)
  b) Omit that specific detail rather than hardcode a fake value
  c) Never, ever write a real-looking business name, city, or phone number directly in the HTML`;
}

/**
 * Generate a complete HTML template from a free-text prompt.
 * Returns { rawHtml, previewHtml }.
 * rawHtml has {{PLACEHOLDERS}} — safe for campaign compilation.
 * previewHtml has demo values — safe for iframe preview.
 *
 * @param {string} prompt - The user's template description.
 * @param {string} [niche='Local Business'] - Business niche for styling guidance.
 * @param {string} [apiKey] - Optional user-provided Anthropic API key.
 *   If not provided, falls back to the server's ANTHROPIC_API_KEY env var.
 */
export async function generateTemplateHtml(prompt, niche = 'Local Business', apiKey) {
  // Allow user-supplied key; fall back to server-side key.
  const hasUserKey = typeof apiKey === 'string' && apiKey.trim().length > 0;
  if (!hasUserKey && !anthropicCfg.live) {
    throw new Error('AI editor is not configured (missing ANTHROPIC_API_KEY). Add your Anthropic key below to generate templates.');
  }

  const client = hasUserKey ? buildClient(apiKey.trim()) : getClient();
  const allowedSet = detectAllowedPlaceholders(prompt);
  const systemPrompt = buildTemplateSystemPrompt(niche, allowedSet, prompt);

  const stream = await client.messages.stream({
    model: anthropicCfg.model,
    max_tokens: 24000,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Create a website template for a ${niche} business with the following description:\n\n${prompt}\n\nReturn the complete HTML document only — no explanations, no markdown fences.`,
      },
    ],
  });

  let rawHtml = '';
  stream.on('text', (delta) => {
    rawHtml += delta;
  });
  await stream.finalMessage();

  rawHtml = cleanHtmlOutput(rawHtml);

  // ── Validation: disallowed placeholders ──────────────────────────────────
  const disallowed = findDisallowedPlaceholders(rawHtml, allowedSet);
  if (disallowed.length > 0) {
    const unique = [...new Set(disallowed)];
    throw new Error(
      `Template uses placeholders that are not allowed: ${unique.join(', ')}. ` +
      `Allowed: BUSINESS_NAME, CITY, PHONE_DISPLAY, PHONE_RAW${allowedSet.size > 4 ? ', ' + [...allowedSet].filter(k => !CORE_PLACEHOLDERS.includes(k)).join(', ') : ''}. ` +
      `Please regenerate and only use the allowed placeholders.`,
    );
  }

  // ── Validation: hardcoded brand names ─────────────────────────────────────
  // Build demo placeholders for the preview
  const DEMO_PLACEHOLDERS = {
    BUSINESS_NAME: 'Radiant Smiles Dental',
    BUSINESS_NAME_SHORT: 'Radiant',
    CITY: 'Austin, TX',
    STATE: 'TX',
    YEARS_IN_BUSINESS: '2012',
    PHONE_DISPLAY: '(512) 555-0199',
    PHONE_RAW: '5125550199',
    EMAIL: 'hello@radiantsmiles.com',
    ADDRESS: '3801 Capital of Texas Hwy, Austin, TX',
    GOOGLE_RATING: '4.9',
    GOOGLE_REVIEW_COUNT: '342',
    INSTAGRAM_HANDLE: 'radiant_smiles',
    FACEBOOK_URL: 'https://facebook.com/radiantsmiles',
    SITE_URL: 'https://example.com',
    DOCTOR_NAME: 'Dr. Sarah Mitchell',
    AVERAGE_RATING: '4.9',
    MEMBERS_COUNT: '2,400',
    TRAINERS_COUNT: '18',
  };

  const hardcoded = findHardcodedBrandNames(rawHtml);
  if (hardcoded.length > 0) {
    throw new Error(
      `Template contains hardcoded values that should use placeholders: ${hardcoded.join(' ')} ` +
      `Please regenerate and replace hardcoded business names with {{BUSINESS_NAME}}.`,
    );
  }

  // ── Build preview version ─────────────────────────────────────────────────
  const previewHtml = rawHtml.replace(PLACEHOLDER_RE, (_match, key) =>
    key in DEMO_PLACEHOLDERS ? DEMO_PLACEHOLDERS[key] : key,
  );

  return { rawHtml, previewHtml };
}

/**
 * Stream an AI edit. Calls onChunk(textDelta, isThinking?) as tokens arrive.
 * onChunk receives (delta, true) for thinking tokens, (delta, false) for output tokens.
 * Returns the full accumulated text when done.
 * If anthropicApiKey is provided it takes precedence over the server key.
 */
export async function streamEdit({ html, instruction, history, anthropicApiKey }, onChunk) {
  const c = buildClient(anthropicApiKey);
  if (!c) throw new Error('AI editor is not configured (missing ANTHROPIC_API_KEY).');

  const stream = await c.messages.stream({
    model: anthropicCfg.model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: buildUserContent(html, instruction, history) },
    ],
  });

  let full = '';
  let inThinkingBlock = false;
  stream.on('contentblockstart', ({ index, type }) => {
    if (type === 'thinking') inThinkingBlock = true;
  });
  stream.on('contentblockstop', ({ index }) => {
    inThinkingBlock = false;
  });
  stream.on('contentblockdelta', ({ delta, index }) => {
    if (delta.type === 'thinking_api_response') {
      const text = delta.thinking || '';
      full += text;
      if (onChunk) onChunk(text, true); // thinking
    } else if (delta.type === 'text') {
      const text = delta.text || '';
      full += text;
      if (onChunk) onChunk(text, false); // output
    }
  });

  await stream.finalMessage();
  return full;
}
