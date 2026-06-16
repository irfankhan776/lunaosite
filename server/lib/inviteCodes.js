// Per-site invite codes for the Lunao Owner App.
//
// Each code is LUNAO-XXXX-XXXX (8 chars in 2 groups of 4) and is bound to
// exactly one slug at creation time. The agency's dashboard uses these
// to hand a business owner access to their mobile companion without
// revealing any other site's data.
//
// The generator excludes 0/O/1/I/L so codes are easy to read aloud and
// type on a phone.
import crypto from 'node:crypto';
import { db } from './db.js';

// Human-friendly alphabet — no 0/O, no 1/I/L.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ALPHABET_LEN = ALPHABET.length;
const CODE_RE = /^LUNAO-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

function randomSegment(len) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += ALPHABET[bytes[i] % ALPHABET_LEN];
  }
  return out;
}

function codeExists(code) {
  return Boolean(
    db.prepare('SELECT 1 FROM invite_codes WHERE code = ?').get(code),
  );
}

// Try up to 5 times to mint a unique code. With 31^8 ≈ 8.5e11 possible
// codes the chance of any collision is essentially zero even at scale,
// but we loop defensively in case of degenerate randomness.
export function generateCode() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `LUNAO-${randomSegment(4)}-${randomSegment(4)}`;
    if (!codeExists(code)) return code;
  }
  throw new Error('Could not generate a unique invite code. Try again.');
}

export function isValidCodeFormat(code) {
  return typeof code === 'string' && CODE_RE.test(code.trim());
}

function rowToRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    slug: row.slug,
    label: row.label,
    createdAt: row.created_at,
    usedAt: row.used_at,
    lastActiveAt: row.last_active_at,
    revokedAt: row.revoked_at,
    redeemedCount: row.redeemed_count,
  };
}

function rowToSafeRecord(row) {
  if (!row) return null;
  // Safe shape: never leaks the slug. Used by GET /api/invite-codes/:code.
  return {
    code: row.code,
    label: row.label,
    createdAt: row.created_at,
    usedAt: row.used_at,
    lastActiveAt: row.last_active_at,
    revokedAt: row.revoked_at,
  };
}

export function listCodes(slug) {
  const rows = db
    .prepare('SELECT * FROM invite_codes WHERE slug = ? ORDER BY created_at DESC')
    .all(slug);
  return rows.map(rowToRecord);
}

export function createCode(slug, label) {
  const code = generateCode();
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO invite_codes (code, slug, label, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(code, slug, label || null, now);
  return findById(info.lastInsertRowid);
}

export function findById(id) {
  const row = db.prepare('SELECT * FROM invite_codes WHERE id = ?').get(id);
  return rowToRecord(row);
}

export function findByCode(code) {
  if (!code) return null;
  const normalized = String(code).trim().toUpperCase();
  const row = db
    .prepare('SELECT * FROM invite_codes WHERE code = ?')
    .get(normalized);
  return rowToRecord(row);
}

export function findByCodeSafe(code) {
  if (!code) return null;
  const normalized = String(code).trim().toUpperCase();
  const row = db
    .prepare('SELECT * FROM invite_codes WHERE code = ?')
    .get(normalized);
  return rowToSafeRecord(row);
}

export function revokeCode(id) {
  const now = Date.now();
  const info = db
    .prepare(
      `UPDATE invite_codes
         SET revoked_at = COALESCE(revoked_at, ?)
       WHERE id = ?`,
    )
    .run(now, id);
  if (!info.changes) return null;
  return findById(id);
}

export function renameCode(id, label) {
  const info = db
    .prepare('UPDATE invite_codes SET label = ? WHERE id = ?')
    .run(label || null, id);
  if (!info.changes) return null;
  return findById(id);
}

// Called on every successful /api/owner/redeem to record usage.
export function touchCode(code, _deviceLabel) {
  if (!code) return null;
  const normalized = String(code).trim().toUpperCase();
  const now = Date.now();
  db.prepare(
    `UPDATE invite_codes
       SET used_at = COALESCE(used_at, ?),
           last_active_at = ?,
           redeemed_count = redeemed_count + 1
     WHERE code = ?`,
  ).run(now, now, normalized);
  return findByCode(normalized);
}
