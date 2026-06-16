// server/lib/auth.js
// Server-side auth: JWT signing/verification, password hashing, session cookies.
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { auth } from './config.js';
import { db } from './db.js';

const secret = new TextEncoder().encode(auth.jwtSecret);

export function makeSessionToken(userId, email) {
  return new SignJWT({ sub: String(userId), email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(auth.jwtExpiresIn)
    .sign(secret);
}

export async function verifySessionToken(token) {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload; // { sub: userId, email, iat, exp }
  } catch {
    return null;
  }
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function setSessionCookie(res, token) {
  res.cookie(auth.cookieName, token, {
    httpOnly: true,
    secure: auth.cookieSecure,
    sameSite: auth.cookieSameSite,
    maxAge: auth.cookieMaxAge,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(auth.cookieName, {
    httpOnly: true,
    secure: auth.cookieSecure,
    sameSite: auth.cookieSameSite,
    path: '/',
  });
}

export function parseSessionCookie(req) {
  return req.cookies?.[auth.cookieName] ?? null;
}

// ---------------------------------------------------------------------------
// User CRUD (server-side only)
// ---------------------------------------------------------------------------

export function createUser({ email, name, passwordHash, googleId, avatarUrl }) {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO users (email, name, password_hash, google_id, avatar_url, email_verified, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    email.toLowerCase().trim(),
    name || '',
    passwordHash || null,
    googleId || null,
    avatarUrl || null,
    googleId ? 1 : 0,
    now,
    now,
  );
  return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
}

export function findUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
}

export function findUserByGoogleId(googleId) {
  return db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);
}

export function findUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function updateUserGoogleId(userId, googleId, avatarUrl) {
  db.prepare(`
    UPDATE users SET google_id = ?, avatar_url = ?, email_verified = 1, updated_at = ?
    WHERE id = ?
  `).run(googleId, avatarUrl || null, Date.now(), userId);
}

export function publicUser(user) {
  if (!user) return null;
  const { password_hash: _, ...pub } = user;
  return pub;
}
