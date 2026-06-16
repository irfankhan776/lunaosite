// Server-side credit economy for Lunao.
//
// The dashboard used to deduct credits purely in localStorage — anyone with the
// API URL could bypass the guard by calling /api/campaign/run directly. This
// module is the canonical source of truth. The flow is:
//
//   1. ensureAccount(ownerKey, plan)   -> on first sight, credit the starting
//                                        balance for that plan tier; top-up
//                                        the *delta* if the plan changed.
//   2. charge(ownerKey, n, reason, ref) -> atomically deduct n credits, write
//                                        a ledger row, return new balance.
//                                        Throws if balance < n.
//   3. refund(ownerKey, n, reason, ref) -> credit back n, write ledger row.
//                                        No-op if already refunded (idempotent
//                                        via ref_type+ref_id lookup).
//
// All operations run inside a single better-sqlite3 transaction so a partial
// charge/refund is impossible.
import { db } from './db.js';

// Plan -> starting balance. Mirrors src/App.tsx defaultMap.
const PLAN_BALANCE = {
  'Free Plan': 5,
  'Starter Plan': 300,
  'Growth Plan': 1000,
  'Pro Plan': 3000,
  'Agency Plan': 7000,
};

function balanceFor(plan) {
  return PLAN_BALANCE[plan] ?? PLAN_BALANCE['Free Plan'];
}

function ledgerRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerKey: row.owner_key,
    delta: row.delta,
    reason: row.reason,
    refType: row.ref_type,
    refId: row.ref_id,
    balanceAfter: row.balance_after,
    createdAt: row.created_at,
  };
}

function accountRow(row) {
  if (!row) return null;
  return {
    ownerKey: row.owner_key,
    plan: row.plan,
    balance: row.balance,
    lifetimeUsed: row.lifetime_used,
    lifetimeRefunded: row.lifetime_refunded,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

// Idempotent ledger lookup: has this (reason, ref_type, ref_id) already been
// recorded? Used so a repeat refund for the same reference is a no-op.
function findExistingLedger(ownerKey, reason, refType, refId) {
  if (!refType || !refId) return null;
  return db
    .prepare(
      `SELECT * FROM credit_ledger
        WHERE owner_key = ? AND reason = ? AND ref_type = ? AND ref_id = ?
        LIMIT 1`,
    )
    .get(ownerKey, reason, refType, String(refId));
}

// Ensure an account exists; if the plan changed, top up to the new balance.
// Called on every campaign start with the dashboard's currently selected plan.
export function ensureAccount(ownerKey, plan) {
  if (!ownerKey) throw new Error('ownerKey is required');
  const safePlan = PLAN_BALANCE[plan] ? plan : 'Free Plan';
  const now = Date.now();

  const existing = db
    .prepare('SELECT * FROM credit_accounts WHERE owner_key = ?')
    .get(ownerKey);

  if (!existing) {
    const starting = balanceFor(safePlan);
    db.transaction(() => {
      db.prepare(
        `INSERT INTO credit_accounts
           (owner_key, plan, balance, lifetime_used, lifetime_refunded, updated_at, created_at)
         VALUES (?, ?, ?, 0, 0, ?, ?)`,
      ).run(ownerKey, safePlan, starting, now, now);
      if (starting > 0) {
        db.prepare(
          `INSERT INTO credit_ledger
             (owner_key, delta, reason, ref_type, ref_id, balance_after, created_at)
           VALUES (?, ?, 'plan_topup', 'plan', ?, ?, ?)`,
        ).run(ownerKey, starting, safePlan, starting, now);
      }
    })();
    return getAccount(ownerKey);
  }

  // Plan changed? Top up the difference so the new tier is honored.
  if (existing.plan !== safePlan) {
    const target = balanceFor(safePlan);
    const delta = target - existing.balance;
    db.transaction(() => {
      db.prepare(
        `UPDATE credit_accounts SET plan = ?, balance = ?, updated_at = ? WHERE owner_key = ?`,
      ).run(safePlan, target, now, ownerKey);
      if (delta !== 0) {
        db.prepare(
          `INSERT INTO credit_ledger
             (owner_key, delta, reason, ref_type, ref_id, balance_after, created_at)
           VALUES (?, ?, 'plan_topup', 'plan', ?, ?, ?)`,
        ).run(ownerKey, delta, safePlan, target, now);
      }
    })();
  }
  return getAccount(ownerKey);
}

export function getAccount(ownerKey) {
  if (!ownerKey) return null;
  const row = db
    .prepare('SELECT * FROM credit_accounts WHERE owner_key = ?')
    .get(ownerKey);
  return accountRow(row);
}

// Atomically debit `n` credits. Throws an Error with `.status = 402` on
// insufficient balance so the route can convert that into a 402 response.
export function charge(ownerKey, n, reason, ref = {}) {
  if (!ownerKey) throw Object.assign(new Error('ownerKey is required'), { status: 400 });
  if (!Number.isInteger(n) || n <= 0) {
    throw Object.assign(new Error('amount must be a positive integer'), { status: 400 });
  }
  const now = Date.now();
  const txn = db.transaction(() => {
    const row = db
      .prepare('SELECT * FROM credit_accounts WHERE owner_key = ?')
      .get(ownerKey);
    if (!row) {
      throw Object.assign(new Error('No credit account. Call ensureAccount first.'), { status: 400 });
    }
    if (row.balance < n) {
      const err = new Error(
        `Insufficient credits: need ${n}, have ${row.balance}. Top up to continue.`,
      );
      err.status = 402;
      err.needed = n;
      err.available = row.balance;
      throw err;
    }
    const newBalance = row.balance - n;
    db.prepare(
      `UPDATE credit_accounts
         SET balance = ?, lifetime_used = lifetime_used + ?, updated_at = ?
       WHERE owner_key = ?`,
    ).run(newBalance, n, now, ownerKey);
    db.prepare(
      `INSERT INTO credit_ledger
         (owner_key, delta, reason, ref_type, ref_id, balance_after, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      ownerKey,
      -n,
      reason || 'manual_charge',
      ref.type || null,
      ref.id ? String(ref.id) : null,
      newBalance,
      now,
    );
    return newBalance;
  });
  return txn();
}

// Read-only balance check that throws the same 402 error charge() would,
// without writing anything. Used as a pre-flight by /api/campaign/run.
export function checkBalance(ownerKey, n) {
  if (!ownerKey) throw Object.assign(new Error('ownerKey is required'), { status: 400 });
  const row = db
    .prepare('SELECT balance FROM credit_accounts WHERE owner_key = ?')
    .get(ownerKey);
  if (!row) {
    throw Object.assign(new Error('No credit account. Call ensureAccount first.'), { status: 400 });
  }
  if (row.balance < n) {
    const err = new Error(
      `Insufficient credits: need ${n}, have ${row.balance}. Top up to continue.`,
    );
    err.status = 402;
    err.needed = n;
    err.available = row.balance;
    throw err;
  }
  return row.balance;
}

// Refund `n` credits. Idempotent on (ownerKey, reason, ref.type, ref.id) —
// repeat calls for the same reference are no-ops (we do not double-refund).
export function refund(ownerKey, n, reason, ref = {}) {
  if (!ownerKey) return null;
  if (!Number.isInteger(n) || n <= 0) return null;
  if (ref.type && ref.id) {
    const dup = findExistingLedger(ownerKey, reason || 'manual_refund', ref.type, ref.id);
    if (dup) {
      return accountRow(
        db.prepare('SELECT * FROM credit_accounts WHERE owner_key = ?').get(ownerKey),
      );
    }
  }
  const now = Date.now();
  const txn = db.transaction(() => {
    const row = db
      .prepare('SELECT * FROM credit_accounts WHERE owner_key = ?')
      .get(ownerKey);
    if (!row) return null;
    const newBalance = row.balance + n;
    db.prepare(
      `UPDATE credit_accounts
         SET balance = ?, lifetime_refunded = lifetime_refunded + ?, updated_at = ?
       WHERE owner_key = ?`,
    ).run(newBalance, n, now, ownerKey);
    db.prepare(
      `INSERT INTO credit_ledger
         (owner_key, delta, reason, ref_type, ref_id, balance_after, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      ownerKey,
      n,
      reason || 'manual_refund',
      ref.type || null,
      ref.id ? String(ref.id) : null,
      newBalance,
      now,
    );
    return newBalance;
  });
  txn();
  return getAccount(ownerKey);
}

export function listLedger(ownerKey, limit = 50) {
  if (!ownerKey) return [];
  const rows = db
    .prepare(
      `SELECT * FROM credit_ledger WHERE owner_key = ?
        ORDER BY created_at DESC LIMIT ?`,
    )
    .all(ownerKey, Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200));
  return rows.map(ledgerRow);
}

export function planBalanceFor(plan) {
  return balanceFor(plan);
}

export { PLAN_BALANCE };
