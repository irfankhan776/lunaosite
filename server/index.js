// Lunao real pipeline API server.
//   GET  /api/health                              -> integration mode
//   POST /api/compile                             -> compile one business
//   POST /api/campaign/run                        -> run full pipeline (SSE)
//   GET  /api/credits                             -> server-side credit balance
//   POST /api/credits/topup                       -> switch plan / refresh
//   GET  /api/credits/ledger                      -> per-user ledger
//   GET  /api/campaigns                           -> history for one owner
//   GET  /api/campaigns/:id                       -> campaign + leads + sms_logs
//   POST /api/test-sms                            -> send a single test SMS
//   POST /api/webhooks/telnyx                     -> inbound + delivery webhooks
//   POST /api/sites/:slug/deploy                  -> publish to Cloudflare
//   GET  /sites/<slug>/                           -> locally hosted compiled sites
//
//   POST /api/auth/register                       -> email + password signup
//   POST /api/auth/login                          -> email + password login
//   POST /api/auth/google                         -> Google OAuth token exchange
//   POST /api/auth/logout                         -> clear session cookie
//   GET  /api/auth/me                             -> current user from cookie
//
// In production it also serves the built frontend from /dist.
import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { PORT, SITES_DIR, ROOT_DIR, modeSummary, siteBaseUrl, telnyx, PUBLIC_API_BASE_URL } from './lib/config.js';
import { compileSite } from './lib/compile.js';
import { parseCsv, validateCsv } from './lib/csv.js';
import { runPipeline, COST_PER_LEAD } from './lib/pipeline.js';
import { listSites, readSite, writeSite, siteExists, isValidSlug, titleFromHtml, nicheFromHtml } from './lib/sites.js';
import { publishBatch } from './lib/cloudflare.js';
import { streamEdit, isAiEnabled, cleanHtmlOutput } from './lib/anthropic.js';
import { createBooking, listBookings, updateBookingStatus } from './lib/bookings.js';
import { chatTurn } from './lib/chatbot.js';
import { getAddons, setAddons } from './lib/widget.js';
import { db } from './lib/db.js';
import {
  listCodes,
  createCode,
  findById,
  findByCode,
  findByCodeSafe,
  revokeCode,
  renameCode,
  touchCode,
  isValidCodeFormat,
} from './lib/inviteCodes.js';
import {
  ensureAccount,
  getAccount,
  listLedger,
  charge,
  refund,
  checkBalance,
  PLAN_BALANCE,
} from './lib/credits.js';
import {
  createCampaign,
  getCampaign,
  listCampaigns,
  listLeads,
  listSmsForCampaign,
  listSmsForOwner,
  findSmsByTelnyxId,
  updateSmsStatus,
  logSmsAttempt,
  logInbound,
  markCampaignFailed,
} from './lib/campaigns.js';
import { sendSms, toE164, countSegments } from './lib/telnyx.js';
import {
  makeSessionToken,
  verifySessionToken,
  hashPassword,
  verifyPassword,
  setSessionCookie,
  clearSessionCookie,
  parseSessionCookie,
  createUser,
  findUserByEmail,
  findUserByGoogleId,
  findUserById,
  updateUserGoogleId,
  publicUser,
} from './lib/auth.js';
import { googleOAuth } from './lib/config.js';

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.text({ type: 'text/csv', limit: '5mb' }));
app.use(cookieParser());

// Permissive CORS so the Vite dev server (port 3000) can call the API.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

fs.mkdirSync(SITES_DIR, { recursive: true });

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: modeSummary() });
});

// Compile a single business and return raw HTML (used for live preview/testing).
app.post('/api/compile', async (req, res) => {
  try {
    const { business, niche } = req.body || {};
    if (!business || !business.name) {
      return res.status(400).json({ ok: false, error: 'business.name is required' });
    }
    const { html, placeholders, templateFile } = await compileSite(business, niche);
    res.json({ ok: true, templateFile, placeholders, html });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Validate + parse a raw CSV body. Returns a structured validation report so
// the dashboard can block launch and show precise, brand-consistent errors.
app.post('/api/csv/parse', (req, res) => {
  try {
    const text = typeof req.body === 'string' ? req.body : req.body?.csv;
    const report = validateCsv(text || '');
    res.json({
      ok: report.ok,
      count: report.validCount,
      leads: report.leads,
      validation: report,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Run the full campaign pipeline, streaming progress as Server-Sent Events.
// When ownerKey is provided we persist the campaign + per-lead + per-SMS rows
// to SQLite and enforce the credit balance server-side. Credits are charged
// up front; failed sites refund the 1 site credit, failed SMS refund the 3
// SMS credits. See server/lib/pipeline.js for the full lifecycle.
app.post('/api/campaign/run', async (req, res) => {
  const {
    businesses,
    csv,
    niche,
    smsTemplate,
    name,
    plan,
  } = req.body || {};

  // Resolve user identity: prefer cookie session, fall back to legacy ownerKey
  let ownerKey = req.body?.ownerKey || req.query?.ownerKey || null;
  if (!ownerKey) {
    const token = parseSessionCookie(req);
    if (token) {
      const payload = await verifySessionToken(token);
      if (payload) ownerKey = `user_${payload.sub}`;
    }
  }

  let leads = Array.isArray(businesses) ? businesses : [];
  if (!leads.length && csv) leads = parseCsv(csv);

  if (!leads.length) {
    return res.status(400).json({ ok: false, error: 'No businesses or CSV provided' });
  }

  // Pre-create the campaign row so the dashboard can poll its status even
  // before the first SSE event arrives. We do a *read-only* pre-flight
  // credit check before creating any rows, then charge exactly once with
  // the real campaign id once we have it. This guarantees:
  //   - 402 returns a clean JSON error (not SSE)
  //   - No orphan campaign rows on failure
  //   - Exactly one ledger entry per campaign
  let campaignId = null;
  let leadIds = [];
  if (ownerKey) {
    try {
      const acct = ensureAccount(ownerKey, plan);
      if (acct) {
        const totalCost = leads.length * COST_PER_LEAD;
        checkBalance(ownerKey, totalCost); // throws 402 on insufficient

        const c = createCampaign({
          ownerKey,
          niche,
          name: name || null,
          leads,
          smsTemplate,
          csv: typeof csv === 'string' ? csv : null,
        });
        campaignId = c.id;
        const stored = listLeads(c.id);
        leadIds = stored.map((l) => l.id);
        // Charge against the real campaign id. If this throws (race condition
        // where another campaign drained the account between check and
        // charge), the campaign row exists but no charge was made — the
        // pipeline will run for free. Acceptable for v1; the next iteration
        // moves the charge inside createCampaign() for full atomicity.
        charge(ownerKey, totalCost, 'campaign_charge', { type: 'campaign', id: campaignId });
      }
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ ok: false, error: err.message, needed: err.needed, available: err.available });
    }
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  // Always echo the campaign id so the client can fetch /api/campaigns/:id.
  if (campaignId) send({ type: 'campaign', campaignId });

  try {
    await runPipeline({
      businesses: leads,
      niche,
      smsTemplate,
      onEvent: send,
      ownerKey,
      campaignId,
      leadIds,
    });
  } catch (err) {
    send({ type: 'error', error: err.message });
    if (campaignId) markCampaignFailed(campaignId, err.message);
  } finally {
    res.end();
  }
});

// ---- Site Editor API -------------------------------------------------------

// List all deployed sites (for the "Get HTML Code" picker).
app.get('/api/sites', async (_req, res) => {
  try {
    const sites = await listSites();
    res.json({ ok: true, sites, aiEnabled: isAiEnabled() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Load one site's current HTML for editing.
app.get('/api/sites/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    if (!isValidSlug(slug) || !(await siteExists(slug))) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    const html = await readSite(slug);
    res.json({ ok: true, slug, html });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Save edits to a site (persist locally; does NOT redeploy).
app.put('/api/sites/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const html = req.body?.html;
    if (!isValidSlug(slug) || !(await siteExists(slug))) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    if (typeof html !== 'string' || !html.trim()) {
      return res.status(400).json({ ok: false, error: 'html is required' });
    }
    const url = await writeSite(slug, html);
    res.json({ ok: true, slug, url });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Save + redeploy a site to Cloudflare Pages (live).
app.post('/api/sites/:slug/deploy', async (req, res) => {
  try {
    const { slug } = req.params;
    const html = req.body?.html;
    if (!isValidSlug(slug) || !(await siteExists(slug))) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    if (typeof html === 'string' && html.trim()) {
      await writeSite(slug, html);
    }
    const result = await publishBatch();
    const url = `${result.deploymentUrl || ''}` || null;
    res.json({ ok: true, slug, deploy: result, url });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// AI code edit (SSE). Streams Claude's HTML output chunk-by-chunk so the
// editor can refresh its live preview as the code is written.
app.post('/api/ai/edit', async (req, res) => {
  const { html, instruction, history } = req.body || {};

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  if (!isAiEnabled()) {
    send({ type: 'error', error: 'AI editor is not configured. Add ANTHROPIC_API_KEY to enable it.' });
    return res.end();
  }
  if (typeof html !== 'string' || !html.trim() || typeof instruction !== 'string' || !instruction.trim()) {
    send({ type: 'error', error: 'html and instruction are required.' });
    return res.end();
  }

  try {
    send({ type: 'start' });
    const full = await streamEdit({ html, instruction, history }, (delta) => {
      send({ type: 'chunk', delta });
    });
    send({ type: 'done', html: cleanHtmlOutput(full) });
  } catch (err) {
    send({ type: 'error', error: err.message });
  } finally {
    res.end();
  }
});

// ---- Booking system API ----------------------------------------------------

// Create a booking (called by injected widgets on live sites + the chatbot).
app.post('/api/bookings', (req, res) => {
  try {
    const booking = createBooking(req.body || {});
    res.json({ ok: true, id: booking.id, booking });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// List bookings (dashboard), optionally filtered by site slug.
app.get('/api/bookings', (req, res) => {
  try {
    const slug = typeof req.query.slug === 'string' && req.query.slug ? req.query.slug : null;
    res.json({ ok: true, bookings: listBookings(slug) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update a booking's status (confirm / cancel).
app.patch('/api/bookings/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });
    const booking = updateBookingStatus(id, req.body?.status);
    res.json({ ok: true, booking });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// ---- Booking chatbot -------------------------------------------------------

// One conversational turn. Body: { slug, sessionId?, message, businessName?, services? }
app.post('/api/chat', async (req, res) => {
  try {
    const result = await chatTurn(req.body || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// ---- Site add-ons (booking + chatbot widget toggles) -----------------------

app.get('/api/sites/:slug/addons', async (req, res) => {
  try {
    const { slug } = req.params;
    if (!isValidSlug(slug) || !(await siteExists(slug))) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    res.json({ ok: true, slug, addons: getAddons(slug) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/sites/:slug/addons', async (req, res) => {
  try {
    const { slug } = req.params;
    if (!isValidSlug(slug) || !(await siteExists(slug))) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    const booking = Boolean(req.body?.booking);
    const chatbot = Boolean(req.body?.chatbot);
    const result = await setAddons(slug, { booking, chatbot });
    res.json({ ok: true, slug, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// ---- User Auth (JWT cookie-based, cross-device) ---------------------------

// Register with email + password.
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'Email and password are required.' });
    }
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'Invalid email address.' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters.' });
    }

    const existing = findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ ok: false, error: 'An account with this email already exists.' });
    }

    const passwordHash = await hashPassword(password);
    const user = createUser({ email, name: name || '', passwordHash });
    const token = makeSessionToken(user.id, user.email);
    setSessionCookie(res, token);

    res.status(201).json({ ok: true, user: publicUser(user) });
  } catch (err) {
    console.error('[/api/auth/register]', err);
    res.status(500).json({ ok: false, error: 'Registration failed. Please try again.' });
  }
});

// Login with email + password.
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'Email and password are required.' });
    }

    const user = findUserByEmail(email);
    if (!user || !user.password_hash) {
      return res.status(401).json({ ok: false, error: 'Invalid email or password.' });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ ok: false, error: 'Invalid email or password.' });
    }

    const token = makeSessionToken(user.id, user.email);
    setSessionCookie(res, token);

    res.json({ ok: true, user: publicUser(user) });
  } catch (err) {
    console.error('[/api/auth/login]', err);
    res.status(500).json({ ok: false, error: 'Login failed. Please try again.' });
  }
});

// Exchange a Google ID token for a server session cookie.
// Body: { googleToken: string }  — the token from the Google Sign-In SDK.
app.post('/api/auth/google', async (req, res) => {
  try {
    const { googleToken } = req.body || {};
    if (!googleToken) {
      return res.status(400).json({ ok: false, error: 'googleToken is required.' });
    }

    if (!googleOAuth.enabled) {
      return res.status(503).json({ ok: false, error: 'Google Sign-In is not configured.' });
    }

    // Verify the token with Google.
    const googleRes = await fetch('https://oauth2.googleapis.com/tokeninfo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_token: googleToken }),
    });

    if (!googleRes.ok) {
      return res.status(401).json({ ok: false, error: 'Invalid Google token.' });
    }

    const payload = await googleRes.json();
    const { email, name, picture, sub: googleId } = payload;

    let user = findUserByGoogleId(googleId);
    if (!user) {
      // First time: create account. If email already exists without google_id, link it.
      const byEmail = findUserByEmail(email);
      if (byEmail && !byEmail.google_id) {
        updateUserGoogleId(byEmail.id, googleId, picture);
        user = findUserById(byEmail.id);
      } else if (!byEmail) {
        user = createUser({ email, name: name || '', googleId, avatarUrl: picture });
      } else {
        return res.status(409).json({ ok: false, error: 'An account with this email already exists. Please log in with your password.' });
      }
    }

    const token = makeSessionToken(user.id, user.email);
    setSessionCookie(res, token);

    res.json({ ok: true, user: publicUser(user) });
  } catch (err) {
    console.error('[/api/auth/google]', err);
    res.status(500).json({ ok: false, error: 'Google sign-in failed. Please try again.' });
  }
});

// Logout: clear the session cookie.
app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// Get the currently logged-in user from the session cookie.
app.get('/api/auth/me', async (req, res) => {
  const token = parseSessionCookie(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Not authenticated.' });
  }
  const payload = await verifySessionToken(token);
  if (!payload) {
    clearSessionCookie(res);
    return res.status(401).json({ ok: false, error: 'Session expired. Please log in again.' });
  }
  const user = findUserById(Number(payload.sub));
  if (!user) {
    clearSessionCookie(res);
    return res.status(401).json({ ok: false, error: 'User not found.' });
  }
  res.json({ ok: true, user: publicUser(user) });
});

// Middleware: require an authenticated session. Attaches `req.userId` for use
// in downstream handlers. Skips if X-Owner-Key is present (legacy ownerKey path
// so existing localStorage-based clients still work while migrating).
async function authenticate(req, res, next) {
  const legacyKey = req.headers['x-owner-key'] || req.query.ownerKey || req.body?.ownerKey;
  if (legacyKey) {
    req.ownerKey = String(legacyKey);
    return next();
  }
  const token = parseSessionCookie(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Not authenticated.' });
  }
  const payload = await verifySessionToken(token);
  if (!payload) {
    clearSessionCookie(res);
    return res.status(401).json({ ok: false, error: 'Session expired. Please log in again.' });
  }
  req.userId = Number(payload.sub);
  req.userEmail = payload.email;
  next();
}

// Serve the locally compiled sites (dry-run live preview).
app.use('/sites', express.static(SITES_DIR, { extensions: ['html'] }));

// In production, serve the built frontend.
const distDir = path.join(ROOT_DIR, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/sites')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// Serve the locally compiled sites (dry-run live preview).
app.use('/sites', express.static(SITES_DIR, { extensions: ['html'] }));

// ---- Owner Auth (invite code IS the login) -----------------------------------
// Single-use codes are generated externally per site. Here we accept any valid-
// format code and bind the caller to the matching site.

const OWNER_CODE_RE = /^LUNAO-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

function generateToken(code) {
  // Simple opaque token — in production replace with a real JWT or DB session.
  return `lunao.${Buffer.from(code).toString('base64url')}.${Date.now()}`;
}

app.post('/api/owner/redeem', (req, res) => {
  try {
    const { code, deviceLabel, platform } = req.body || {};
    if (typeof code !== 'string' || !isValidCodeFormat(code)) {
      return res.status(400).json({ ok: false, error: 'Invalid invite code format. Expected LUNAO-XXXX-XXXX.' });
    }
    const trimmed = code.trim().toUpperCase();
    const devMode = req.query.devMode === '1' || req.query.devMode === 'true';

    // Real invite-code path: look the code up in the table and bind to its slug.
    if (!devMode) {
      const row = findByCode(trimmed);
      if (!row) {
        return res.status(404).json({ ok: false, error: 'Invalid or revoked invite code.' });
      }
      if (row.revokedAt) {
        return res.status(404).json({ ok: false, error: 'This invite code has been revoked.' });
      }
      // Look up the site to attach business metadata.
      const sites = listSitesSync();
      const target = sites.find((s) => s.slug === row.slug);
      if (!target) {
        return res.status(404).json({ ok: false, error: 'No site found for this code.' });
      }
      touchCode(trimmed, deviceLabel);
      const token = generateToken(trimmed);
      return res.json({
        ok: true,
        token,
        slug: target.slug,
        businessName: target.title,
        niche: target.niche,
        siteUrl: target.url,
        inviteCode: { id: row.id, code: row.code, label: row.label },
      });
    }

    // Dev-mode escape hatch (?devMode=1): original fuzzy-match behavior.
    // Used by local testing where no codes have been issued yet.
    const sites = listSitesSync();
    const target = sites.find((s) => s.slug.includes(trimmed.replace('LUNAO-', '').toLowerCase().replace(/[^a-z0-9-]/g, ''))) || sites[0];
    if (!target) {
      return res.status(404).json({ ok: false, error: 'No site found for this code.' });
    }
    const token = generateToken(trimmed);
    res.json({ ok: true, token, slug: target.slug, businessName: target.title, niche: target.niche, siteUrl: target.url, devMode: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// listSitesSync: same logic as the async listSites() but returns synchronously
// so the redeem endpoint can map a code to a site without async/await overhead.
function listSitesSync() {
  let entries = [];
  try { entries = fs.readdirSync(SITES_DIR, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isValidSlug(entry.name)) continue;
    const file = path.join(SITES_DIR, entry.name, 'index.html');
    let html = '';
    try { html = fs.readFileSync(file, 'utf8'); } catch { continue; }
    out.push({
      slug: entry.name,
      title: titleFromHtml(html) || entry.name,
      niche: nicheFromHtml(html),
      url: `${siteBaseUrl()}/${entry.name}/`,
      updatedAt: (() => { try { return fs.statSync(file).mtimeMs; } catch { return null; } })(),
    });
  }
  out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return out;
}

app.get('/api/owner/me', (req, res) => {
  // In production: verify Bearer token, return owner profile.
  // Here we return a stub so the app can test the real endpoint.
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Unauthorized. Send Authorization: Bearer <token>.' });
  }
  // Parse the slug from the token (matches redeem token format).
  try {
    const payload = token.split('.')[1] || '';
    const decoded = Buffer.from(payload, 'base64url').toString('utf-8');
    const codeMatch = decoded.match(/LUNAO-[A-Z0-9]{4}-[A-Z0-9]{4}/i);
    const code = codeMatch ? codeMatch[0] : null;
    const sites = listSitesSync();
    let target = sites[0];
    if (code) {
      const hint = code.replace('LUNAO-', '').toLowerCase().replace(/[^a-z0-9-]/g, '');
      target = sites.find((s) => s.slug.includes(hint)) || target;
    }
    if (!target) return res.status(404).json({ ok: false, error: 'Profile not found.' });
    res.json({ ok: true, slug: target.slug, businessName: target.title, niche: target.niche, siteUrl: target.url });
  } catch {
    return res.status(401).json({ ok: false, error: 'Invalid token.' });
  }
});

app.post('/api/owner/push-token', (req, res) => {
  // In production: store the Expo push token keyed by slug and send push on
  // every new booking for that slug via Expo's push service.
  // Here we acknowledge receipt so the app flow completes.
  const { token, platform, slug } = req.body || {};
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ ok: false, error: 'token is required.' });
  }
  console.log(`[push-token] registered for ${slug || 'unknown'} on ${platform || 'unknown'}: ${token.slice(0, 20)}...`);
  res.json({ ok: true, registered: true });
});

// ---- Conversations (chat history) -------------------------------------------

app.get('/api/sites/:slug/conversations', async (req, res) => {
  try {
    const { slug } = req.params;
    if (!isValidSlug(slug) || !(await siteExists(slug))) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    // Group messages into sessions, return last message + counts per session.
    const sessions = db.prepare('SELECT id, created_at FROM chat_sessions WHERE slug = ? ORDER BY created_at DESC').all(slug);
    const conversations = [];
    for (const s of sessions) {
      const msgs = db.prepare('SELECT role, content, created_at FROM chat_messages WHERE session_id = ? ORDER BY id DESC LIMIT 1').get(s.id);
      const count = db.prepare('SELECT COUNT(*) as n FROM chat_messages WHERE session_id = ?').get(s.id).n;
      const hasBooking = db.prepare("SELECT COUNT(*) as n FROM bookings WHERE slug = ? AND created_at >= ?").get(slug, s.created_at).n > 0;
      conversations.push({
        id: s.id,
        slug,
        createdAt: s.created_at,
        lastMessage: msgs ? msgs.content : '',
        lastRole: msgs ? msgs.role : 'assistant',
        messageCount: count,
        booked: hasBooking,
      });
    }
    res.json({ ok: true, conversations });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/chat/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const session = db.prepare('SELECT id, slug, created_at FROM chat_sessions WHERE id = ?').get(id);
    if (!session) {
      return res.status(404).json({ ok: false, error: 'Session not found.' });
    }
    const messages = db.prepare('SELECT role, content, created_at FROM chat_messages WHERE session_id = ? ORDER BY id ASC').all(id);
    res.json({
      ok: true,
      session: { id: session.id, slug: session.slug, createdAt: session.created_at },
      messages: messages.map((m) => ({ role: m.role, content: m.content, createdAt: m.created_at })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- Invite codes (per-site, agency-issued) -------------------------------
// The dashboard's Editor "Invite Client" drawer uses these. Codes are
// scoped to one slug at creation time and consumed by the Owner App's
// POST /api/owner/redeem (handled above).

// List every code (active, used, revoked) for a given site.
app.get('/api/sites/:slug/invite-codes', async (req, res) => {
  try {
    const { slug } = req.params;
    if (!isValidSlug(slug) || !(await siteExists(slug))) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    res.json({ ok: true, codes: listCodes(slug) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Mint a new LUNAO-XXXX-XXXX bound to this slug.
app.post('/api/sites/:slug/invite-codes', async (req, res) => {
  try {
    const { slug } = req.params;
    if (!isValidSlug(slug) || !(await siteExists(slug))) {
      return res.status(404).json({ ok: false, error: 'Site not found' });
    }
    const label = typeof req.body?.label === 'string' ? req.body.label.trim().slice(0, 64) || null : null;
    const code = createCode(slug, label);
    res.json({ ok: true, code });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update a code (revoke, rename).
app.patch('/api/invite-codes/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });
    const existing = findById(id);
    if (!existing) return res.status(404).json({ ok: false, error: 'Code not found' });

    let updated = existing;
    if (req.body?.revoked === true) {
      updated = revokeCode(id) || updated;
    } else if (req.body?.revoked === false && updated.revokedAt) {
      // Allow un-revoke (clear the revoked_at timestamp).
      db.prepare('UPDATE invite_codes SET revoked_at = NULL WHERE id = ?').run(id);
      updated = findById(id) || updated;
    }
    if (typeof req.body?.label === 'string') {
      const label = req.body.label.trim().slice(0, 64) || null;
      updated = renameCode(id, label) || updated;
    }
    res.json({ ok: true, code: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Quick "is this code still valid?" lookup. Returns safe fields only
// (never the slug) so an agency can verify a code shared by a client
// without exposing which business it belongs to.
app.get('/api/invite-codes/:code', (req, res) => {
  try {
    const { code } = req.params;
    if (!isValidCodeFormat(code)) {
      return res.status(400).json({ ok: false, error: 'Invalid code format' });
    }
    const safe = findByCodeSafe(code);
    if (!safe) return res.status(404).json({ ok: false, error: 'Code not found' });
    res.json({ ok: true, code: safe });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- Credits (server-side source of truth) -------------------------------
// GET /api/credits?ownerKey=...   -> { account, plan, balance, ledger, ... }
// POST /api/credits/topup         -> { ownerKey, plan } -> ensureAccount()
// GET /api/credits/ledger         -> per-user credit ledger rows
//
// The dashboard passes the current user identity (currently a stable browser
// key stored in localStorage) as `ownerKey`. In production this will be the
// authenticated session id or user id from the agency's auth system.

app.get('/api/credits', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    if (!ownerKey) return res.status(400).json({ ok: false, error: 'ownerKey is required' });
    const plan = req.query.plan ? String(req.query.plan) : null;
    const account = plan ? ensureAccount(ownerKey, plan) : getAccount(ownerKey);
    if (!account) return res.json({ ok: true, account: null, plans: PLAN_BALANCE, costPerLead: COST_PER_LEAD });
    res.json({
      ok: true,
      account,
      plans: PLAN_BALANCE,
      costPerLead: COST_PER_LEAD,
    });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

app.post('/api/credits/topup', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : req.body?.ownerKey;
    if (!ownerKey) return res.status(400).json({ ok: false, error: 'ownerKey is required' });
    if (!PLAN_BALANCE[plan]) return res.status(400).json({ ok: false, error: 'Unknown plan tier' });
    const account = ensureAccount(ownerKey, plan);
    res.json({ ok: true, account, plans: PLAN_BALANCE });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

app.get('/api/credits/ledger', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    if (!ownerKey) return res.status(400).json({ ok: false, error: 'ownerKey is required' });
    const limit = parseInt(req.query.limit, 10) || 50;
    res.json({ ok: true, ledger: listLedger(ownerKey, limit) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- Campaign history + per-campaign detail ------------------------------

app.get('/api/campaigns', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    if (!ownerKey) return res.status(400).json({ ok: false, error: 'ownerKey is required' });
    const limit = parseInt(req.query.limit, 10) || 50;
    res.json({ ok: true, campaigns: listCampaigns(ownerKey, { limit }) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/campaigns/:id', authenticate, (req, res) => {
  try {
    const c = getCampaign(req.params.id);
    if (!c) return res.status(404).json({ ok: false, error: 'Campaign not found' });
    const leads = listLeads(c.id);
    const sms = listSmsForCampaign(c.id);
    res.json({ ok: true, campaign: c, leads, sms });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Refund any remaining SMS charges for a campaign (manual admin tool).
// Idempotent: refunds are recorded in the ledger with (reason, ref_type, ref_id)
// and we no-op on repeat calls.
app.post('/api/campaigns/:id/refund', authenticate, (req, res) => {
  try {
    const c = getCampaign(req.params.id);
    if (!c) return res.status(404).json({ ok: false, error: 'Campaign not found' });
    if (!c.ownerKey) return res.status(400).json({ ok: false, error: 'Campaign has no owner' });
    const leads = listLeads(c.id);
    let refundedCount = 0;
    for (const lead of leads) {
      if (lead.smsStatus === 'failed' || lead.smsStatus === 'skipped') {
        refund(c.ownerKey, 3, 'sms_failed_refund', { type: 'lead', id: String(lead.id) });
        refundedCount++;
      }
      if (lead.siteStatus === 'failed') {
        refund(c.ownerKey, 1, 'site_failed_refund', { type: 'lead', id: String(lead.id) });
      }
    }
    const account = getAccount(c.ownerKey);
    res.json({ ok: true, refundedLeads: refundedCount, account });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// ---- Test SMS (Settings "Send test message" button) ----------------------

app.post('/api/test-sms', authenticate, async (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : req.body?.ownerKey;
    const { to, text } = req.body || {};
    const dest = toE164(to);
    if (!dest) return res.status(400).json({ ok: false, error: 'Invalid destination phone' });
    if (!telnyx.enabled) {
      return res.json({
        ok: true,
        status: 'simulated',
        to: dest,
        message: 'SMS master switch is OFF. Set SMS_ENABLED=true to send real messages.',
      });
    }
    const body = text || 'Lunao test message — if you received this, the SMS pipeline is live. ✓';
    const result = await sendSms({ to: dest, text: body });
    if (ownerKey) {
      logSmsAttempt({
        ownerKey,
        to: dest,
        from: telnyx.from,
        body,
        status: result.status,
        telnyxId: result.id || null,
        errorCode: result.errorCode || null,
        errorMessage: result.error || null,
        segmentCount: result.segmentCount || countSegments(body),
        costCredits: 0,
      });
    }
    res.json({
      ok: result.status !== 'failed',
      status: result.status,
      to: dest,
      id: result.id || null,
      simulated: !!result.simulated,
      error: result.error || null,
      errorCode: result.errorCode || null,
    });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

// ---- Telnyx webhook (inbound SMS + delivery receipts) --------------------
// Configure in Telnyx Mission Control: Messaging > Webhooks -> point to
// https://<your-api>/api/webhooks/telnyx. We accept all of:
//   - message.received  -> inbound reply
//   - message.finalized / message.delivered / message.failed -> delivery
//   - message.sent -> outbound accepted

app.post('/api/webhooks/telnyx', (req, res) => {
  try {
    const payload = req.body || {};
    const events = Array.isArray(payload.data) ? payload.data : [payload];

    let inboundCount = 0;
    let deliveryCount = 0;
    let updated = 0;

    for (const evt of events) {
      const eventType = String(evt.event_type || evt.record_type || '').toLowerCase();
      const msg = evt.payload || evt.data || evt;
      const telnyxId = msg.id || evt.id || null;
      const from = msg.from?.phone_number || msg.from || '';
      const to = msg.to?.phone_number || (Array.isArray(msg.to) ? msg.to[0]?.phone_number : msg.to) || '';
      const body = msg.text || msg.body || '';
      const status = msg.status || eventType;

      logInbound({
        telnyxId,
        from,
        to,
        body,
        kind: eventType.includes('received') ? 'inbound' : 'delivery',
        status,
        raw: evt,
      });

      if (eventType.includes('received') || eventType === 'message.received') {
        inboundCount++;
      } else {
        deliveryCount++;
        const sms = findSmsByTelnyxId(telnyxId);
        if (sms) {
          let newStatus = sms.status;
          if (eventType.includes('delivered') || status === 'delivered') newStatus = 'delivered';
          else if (eventType.includes('failed') || status === 'failed') newStatus = 'failed';
          else if (eventType.includes('sent') || status === 'sent') newStatus = 'sent';
          if (newStatus !== sms.status) {
            updateSmsStatus(sms.id, {
              status: newStatus,
              error_code: newStatus === 'failed' ? (msg.errors?.[0]?.code || 'E_DELIVERY_FAILED') : null,
              error_message: newStatus === 'failed' ? (msg.errors?.[0]?.detail || 'Delivery failed') : null,
            });
            db.prepare('UPDATE campaign_leads SET sms_status = ? WHERE id = ?').run(newStatus, sms.leadId);
            updated++;
          }
        }
      }
    }

    res.json({ ok: true, inbound: inboundCount, delivery: deliveryCount, updated });
  } catch (err) {
    console.error('[telnyx-webhook] error:', err.message);
    res.status(200).json({ ok: false, error: err.message });
  }
});

// ---- Telnyx live status (for the Settings panel) -------------------------
app.get('/api/sms/status', (_req, res) => {
  try {
    res.json({
      ok: true,
      enabled: telnyx.enabled,
      live: telnyx.live,
      from: telnyx.from || null,
      hasMessagingProfile: Boolean(telnyx.messagingProfileId),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- Owner SMS log (per-owner aggregated view) ---------------------------
app.get('/api/owner/sms', authenticate, (req, res) => {
  try {
    const ownerKey = req.userId ? `user_${req.userId}` : String(req.query.ownerKey || '').trim();
    if (!ownerKey) return res.status(400).json({ ok: false, error: 'ownerKey is required' });
    const limit = parseInt(req.query.limit, 10) || 100;
    res.json({ ok: true, sms: listSmsForOwner(ownerKey, limit) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// In Railway (and any other PaaS), PORT is injected by the platform. We also
// log the public base URL so the boot banner shows what Twilio / Cloudflare
// should point at.
const PUBLIC_BASE =
  process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : PUBLIC_API_BASE_URL || `http://localhost:${PORT}`;

app.listen(PORT, () => {
  const mode = modeSummary();
  console.log(`\n  Lunao pipeline API  ->  http://localhost:${PORT}`);
  console.log(`  Public base        : ${PUBLIC_BASE}`);
  console.log(`  Telnyx SMS         : ${mode.telnyx}`);
  console.log(`  Cloudflare Pages   : ${mode.cloudflare}`);
  console.log(`  Google Maps        : ${mode.googleMaps}`);
  console.log(`  AI Editor          : ${mode.aiEditor}`);
  console.log(`  Chatbot            : ${mode.chatbot}`);
  console.log(`  Site base URL      : ${mode.siteBaseUrl}`);
  console.log(`  DB                 : ${process.env.DATABASE_URL ? 'Postgres (Railway)' : 'SQLite (local)'}\n`);
});
