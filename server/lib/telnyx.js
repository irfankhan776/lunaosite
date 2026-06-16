// Telnyx SMS delivery.
// LIVE mode (TELNYX_API_KEY + TELNYX_PHONE_NUMBER set): real outbound SMS.
// DRY-RUN mode: the message is logged and returned as "simulated" so the full
// pipeline can be tested without spending money or needing carrier approval.
import { telnyx } from './config.js';

// Normalize a US-style display phone into E.164 (+1XXXXXXXXXX).
export function toE164(phone) {
  const raw = String(phone || '').replace(/[^\d+]/g, '');
  if (raw.startsWith('+')) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits ? `+${digits}` : '';
}

// Replace the SMS template tokens with real values.
export function renderSms(template, { businessName, city, siteUrl }) {
  return String(template || '')
    .replace(/\{\{\s*business_name\s*\}\}/gi, businessName || '')
    .replace(/\{\{\s*city\s*\}\}/gi, city || '')
    .replace(/\{\{\s*site_url\s*\}\}/gi, siteUrl || '');
}

// Approximate the GSM-7 segment count Telnyx will bill us for.
export function countSegments(text) {
  const len = String(text || '').length;
  if (len <= 160) return 1;
  if (len <= 306) return 2;
  if (len <= 459) return 3;
  return Math.ceil(len / 153);
}

// Telnyx error codes that are NOT worth retrying — invalid number, blocked,
// opted-out, etc. Everything else (5xx, network, 429) gets a retry.
const PERMANENT_ERROR_CODES = new Set([
  '10001', // Authentication error
  '10002', // Wrong number
  '10003', // Blocked as spam
  '10004', // Destination is not a valid mobile number
  '10005', // Destination opted out
  '10006', // Number on do-not-disturb list
  '40002', // Invalid phone number
  '40003', // Phone number not provisioned
  '40004', // Phone number is not SMS-capable
  '40010', // Destination is on the opt-out list
]);

function isPermanentError(code) {
  return code && PERMANENT_ERROR_CODES.has(String(code));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Single attempt (no retry). Used internally and by the retry wrapper below.
async function attemptSend({ to, text }) {
  const dest = toE164(to);
  if (!dest) {
    return { status: 'failed', simulated: !telnyx.live, error: 'Invalid destination phone', errorCode: 'E_INVALID_PHONE' };
  }
  if (!telnyx.live) {
    return { status: 'simulated', simulated: true, to: dest, text, segmentCount: countSegments(text) };
  }

  const body = {
    from: telnyx.from,
    to: dest,
    text,
  };
  if (telnyx.messagingProfileId) body.messaging_profile_id = telnyx.messagingProfileId;

  let res;
  try {
    res = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${telnyx.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { status: 'failed', simulated: false, to: dest, error: `Network error: ${err.message}`, errorCode: 'E_NETWORK' };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errObj = data?.errors?.[0] || {};
    const detail = errObj.detail || `HTTP ${res.status}`;
    const code = errObj.code ? String(errObj.code) : `HTTP_${res.status}`;
    return { status: 'failed', simulated: false, to: dest, error: detail, errorCode: code };
  }

  const id = data?.data?.id || null;
  const segments = data?.data?.parts ?? countSegments(text);
  return {
    status: 'sent',
    simulated: false,
    to: dest,
    id,
    segmentCount: segments,
  };
}

// sendSms: public send with exponential-backoff retry (1s, 2s) on transient
// errors. Permanent Telnyx codes fail fast without retry.
export async function sendSms({ to, text, maxAttempts = 3 } = {}) {
  let lastResult = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await attemptSend({ to, text });
    if (result.status === 'sent' || result.status === 'simulated') return result;
    if (isPermanentError(result.errorCode)) return result;
    lastResult = result;
    if (attempt < maxAttempts) await sleep(500 * Math.pow(2, attempt - 1));
  }
  return lastResult;
}

// fetchMessage: poll Telnyx for the current status of a sent message. Used by
// the pipeline right after sending to upgrade "sent" -> "delivered" if the
// webhook hasn't arrived yet. Optional — never throws.
export async function fetchMessageStatus(telnyxId) {
  if (!telnyxId || !telnyx.live) return null;
  try {
    const res = await fetch(`https://api.telnyx.com/v2/messages/${telnyxId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${telnyx.apiKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const msg = data?.data || {};
    // Telnyx "to" responses use completed_at + errors. Best-effort mapping.
    if (msg.errors && msg.errors.length) {
      return { status: 'failed', errorCode: String(msg.errors[0].code || 'UNKNOWN'), errorMessage: msg.errors[0].detail };
    }
    return { status: msg.completed_at ? 'delivered' : 'sent' };
  } catch {
    return null;
  }
}
