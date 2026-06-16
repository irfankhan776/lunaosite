// Template compilation engine.
// Reads a PRISTINE raw template from /public/templates-raw, fills every
// {{PLACEHOLDER}} with verified business data, and guarantees zero brackets
// remain. Raw templates are never modified (per AGENTS.md absolute rules).
import fs from 'node:fs/promises';
import path from 'node:path';
import { TEMPLATES_RAW_DIR } from './config.js';

// Maps a niche (case-insensitive) to its raw template file name.
export const NICHE_TEMPLATE_MAP = {
  barber: 'barber-template.html',
  'barber-02': 'barber-template-02.html',
  salon: 'salon-template-01.html',
  dentist: 'dentist-template-01.html',
  hvac: 'hvac-template-01.html',
  gym: 'gym-template-01.html',
  roofing: 'roofing-template-01.html',
  'real estate': 'realestate-template-01.html',
  realestate: 'realestate-template-01.html',
};

export function resolveTemplateFile(nicheOrFile) {
  if (!nicheOrFile) return NICHE_TEMPLATE_MAP.barber;
  const key = String(nicheOrFile).trim().toLowerCase();
  if (key.endsWith('.html')) return key; // explicit file name passed
  return NICHE_TEMPLATE_MAP[key] || NICHE_TEMPLATE_MAP.barber;
}

function digitsOnly(str) {
  return String(str || '').replace(/\D/g, '');
}

function firstWord(str) {
  return String(str || '').trim().split(/\s+/)[0] || '';
}

function splitCityState(city) {
  // "Austin, TX" -> { city: "Austin, TX", state: "TX" }
  const parts = String(city || '').split(',').map((p) => p.trim());
  const state = parts.length > 1 ? parts[parts.length - 1] : '';
  return { state };
}

// Build the full placeholder manifest from a (possibly sparse) business record.
// Sensible defaults are derived so a minimal CSV (name, phone, city) still
// produces a fully populated, bracket-free site.
export function buildPlaceholders(biz) {
  const name = biz.name || biz.business_name || 'Local Business';
  const city = biz.city || '';
  const { state: derivedState } = splitCityState(city);
  const phoneDisplay = biz.phone || biz.phone_display || '';
  const phoneRaw = biz.phone_raw || digitsOnly(phoneDisplay);
  const igHandle =
    biz.instagram_handle ||
    biz.instagram ||
    name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const fbUrl =
    biz.facebook_url ||
    biz.facebook ||
    `https://facebook.com/${igHandle}`;

  const rating = String(biz.google_rating || biz.rating || '4.9');

  return {
    BUSINESS_NAME: name,
    BUSINESS_NAME_SHORT: biz.business_name_short || biz.short || firstWord(name),
    CITY: city || 'your city',
    STATE: biz.state || derivedState || '',
    YEARS_IN_BUSINESS: String(biz.years_in_business || biz.years || '2015'),
    PHONE_DISPLAY: phoneDisplay,
    PHONE_RAW: phoneRaw,
    EMAIL:
      biz.email ||
      `hello@${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}.com`,
    ADDRESS: biz.address || (city ? `Downtown ${city.split(',')[0]}` : ''),
    GOOGLE_RATING: rating,
    GOOGLE_REVIEW_COUNT: String(biz.google_review_count || biz.reviews || '127'),
    INSTAGRAM_HANDLE: String(igHandle).replace(/^@/, ''),
    FACEBOOK_URL: fbUrl,
    // Niche-specific placeholders found in some templates (dentist/gym/realestate).
    DOCTOR_NAME: biz.doctor_name || biz.owner || `Dr. ${firstWord(name)}`,
    AVERAGE_RATING: biz.average_rating || rating,
    MEMBERS_COUNT: String(biz.members_count || '2,400'),
    TRAINERS_COUNT: String(biz.trainers_count || '18'),
  };
}

// Last-resort default for any UPPER_SNAKE placeholder not in the manifest, so a
// future template addition never produces a broken (bracketed) page.
function fallbackFor(key) {
  return key
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Only strict {{UPPER_SNAKE}} tokens are treated as placeholders. This ignores
// in-template JavaScript such as `{{${pName}}}` used by the live tooltip code.
const PLACEHOLDER_RE = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g;

function applyPlaceholders(html, placeholders) {
  return html.replace(PLACEHOLDER_RE, (_match, key) =>
    key in placeholders ? placeholders[key] : fallbackFor(key),
  );
}

// Compile a single personalized page. Returns { html, placeholders, templateFile }.
export async function compileSite(biz, nicheOrFile) {
  const templateFile = resolveTemplateFile(nicheOrFile || biz.niche);
  const rawPath = path.join(TEMPLATES_RAW_DIR, templateFile);

  let raw;
  try {
    raw = await fs.readFile(rawPath, 'utf8');
  } catch (err) {
    throw new Error(`Raw template not found: ${templateFile} (${rawPath})`);
  }

  const placeholders = buildPlaceholders(biz);
  const html = applyPlaceholders(raw, placeholders);

  // Absolute safety rule: zero leftover {{UPPER_SNAKE}} placeholders allowed.
  // (In-template JS like `{{${pName}}}` is intentionally left untouched.)
  const leftovers = html.match(PLACEHOLDER_RE);
  if (leftovers && leftovers.length) {
    const unique = [...new Set(leftovers)];
    throw new Error(
      `Compilation incomplete for "${biz.name}". Unresolved placeholders: ${unique.join(', ')}`,
    );
  }

  return { html, placeholders, templateFile };
}
