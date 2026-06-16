// Deploy a single personalized site to Cloudflare Pages.
// Usage:  node scripts/deploy-one.mjs
// Pure find-and-replace — zero LLM, zero AI. Just template + data = live site.
import { compileSite } from '../server/lib/compile.js';
import { stageSite, publishBatch } from '../server/lib/cloudflare.js';
import { slugify } from '../server/lib/slug.js';
import { modeSummary } from '../server/lib/config.js';

// ── Business data ─────────────────────────────────────────────────────────────
const business = {
  name:                 'Lunao',
  business_name_short:  'Lunao',
  city:                 'New York, NY',
  state:                'NY',
  phone:                '030-457-1380',
  phone_raw:            '0304571380',
  email:                'hello@lunao.io',
  address:              'Downtown Manhattan, New York',
  years_in_business:    '2019',
  instagram_handle:     'lunao_nyc',
  facebook_url:         'https://facebook.com/lunao',
  google_rating:        '4.9',
  google_review_count:  '214',
};

// ── Template ──────────────────────────────────────────────────────────────────
const NICHE    = 'dentist';
const TEMPLATE = 'dentist-template-01.html';

// ─────────────────────────────────────────────────────────────────────────────
const mode = modeSummary();
console.log('\n  LUNAO — single-site live deploy');
console.log('  ────────────────────────────────────────────────');
console.log(`  Business         : ${business.name}`);
console.log(`  City             : ${business.city}`);
console.log(`  Phone            : ${business.phone}`);
console.log(`  Template         : ${TEMPLATE}`);
console.log(`  Cloudflare Pages : ${mode.cloudflare}`);
console.log(`  Site base URL    : ${mode.siteBaseUrl}`);
console.log('  ────────────────────────────────────────────────\n');

// Step A – compile (pure string replace, no LLM)
console.log('⚙️  Compiling template...');
const { html, placeholders } = await compileSite(business, TEMPLATE);
console.log('✅  Placeholders replaced:');
for (const [k, v] of Object.entries(placeholders)) {
  console.log(`    {{${k}}} -> "${v}"`);
}

// Step B – stage to disk
const slug = slugify(business.name, business.city) + '-dentist';
console.log(`\n📁  Staging site as slug: "${slug}"`);
const siteUrl = await stageSite(slug, html);
console.log(`    Staged URL (if local): ${siteUrl}`);

// Step C – push the whole sites directory to Cloudflare Pages
console.log('\n☁️   Deploying to Cloudflare Pages...');
const result = await publishBatch();

if (result.deployed) {
  console.log(`\n🚀  LIVE  ->  ${mode.siteBaseUrl}/${slug}/`);
  console.log(`    Deployment URL : ${result.deploymentUrl || '(check your CF dashboard)'}`);
} else {
  console.log(`\n📦  Staged locally (dry-run): ${siteUrl}`);
}

console.log('\n  Open the link above and check:');
console.log('  • Business name in header/hero');
console.log('  • City throughout the copy');
console.log('  • Phone number + tel: link');
console.log('  • Footer copyright');
console.log('  • Search the page for {{ — should be ZERO\n');
