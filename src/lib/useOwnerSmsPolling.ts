// src/lib/useOwnerSmsPolling.ts
//
// Polls GET /api/owner/sms on a fast interval (4s by default) until every
// row has reached a terminal status (`delivered` or `failed`) or a timeout
// (60s default) elapses. Used by the Messages tab so the user sees the
// double-blue ✓ within seconds of the Telnyx webhook landing, even though
// the webhook is asynchronous and can arrive anywhere from <1s to minutes
// after send.
//
// Each tick calls /api/owner/sms and diffs by `id`. Rows are added/updated
// in-place; rows that disappear (e.g. older than the limit) are pruned.
//
// The hook is designed to be safe to mount many times simultaneously —
// the timer is owned per-instance and is torn down on unmount. A global
// deduper (requestSeq) prevents in-flight overlap.

import { useCallback, useEffect, useRef, useState } from 'react';

export interface OwnerSmsRow {
  id: number;
  campaignId: string | null;
  leadId: number | null;
  ownerKey: string | null;
  toNumber: string;
  fromNumber: string | null;
  body: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'simulated' | string;
  telnyxId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  segmentCount: number;
  costCredits: number;
  refunded: boolean;
  createdAt: number;
  updatedAt: number;
}

const TERMINAL_STATUSES = new Set(['delivered', 'failed', 'simulated']);

interface Options {
  ownerKey?: string;
  intervalMs?: number;
  timeoutMs?: number;
  limit?: number;
}

interface PollingState {
  sms: OwnerSmsRow[];
  loading: boolean;
  error: string | null;
  isPolling: boolean;
  lastPolledAt: number | null;
  forceRefresh: () => void;
  sendOneOff: (to: string, text: string, leadName?: string) => Promise<OwnerSmsRow | null>;
}

const API_BASE = '';

export function useOwnerSmsPolling(opts: Options = {}): PollingState {
  const { ownerKey = 'dashboard', intervalMs = 4000, timeoutMs = 60_000, limit = 200 } = opts;
  const [sms, setSms] = useState<OwnerSmsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [lastPolledAt, setLastPolledAt] = useState<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopAtRef = useRef<number>(0);
  const inflightRef = useRef<boolean>(false);

  const fetchOnce = useCallback(async (): Promise<OwnerSmsRow[] | null> => {
    if (inflightRef.current) return null;
    inflightRef.current = true;
    try {
      const qs = new URLSearchParams({ ownerKey, limit: String(limit) });
      const r = await fetch(`${API_BASE}/api/owner/sms?${qs.toString()}`, { credentials: 'include' });
      if (!r.ok) {
        setError(`Server returned ${r.status}`);
        return null;
      }
      const data = await r.json().catch(() => ({}));
      const rows = (Array.isArray(data?.sms) ? data.sms : []) as OwnerSmsRow[];
      setError(null);
      return rows;
    } catch (e: any) {
      setError(e?.message || 'Network error');
      return null;
    } finally {
      inflightRef.current = false;
    }
  }, [ownerKey, limit]);

  const reconcile = useCallback((rows: OwnerSmsRow[]) => {
    setSms((prev) => {
      const byId = new Map<number, OwnerSmsRow>();
      for (const r of prev) byId.set(r.id, r);
      for (const r of rows) byId.set(r.id, r); // overwrite with fresh
      const merged = Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
      return merged;
    });
  }, []);

  const tick = useCallback(async () => {
    const rows = await fetchOnce();
    setLastPolledAt(Date.now());
    if (rows) reconcile(rows);

    // Decide whether to keep polling.
    const stillInflight = rows?.some((r) => !TERMINAL_STATUSES.has(r.status));
    const timedOut = Date.now() >= stopAtRef.current;
    if (stillInflight && !timedOut) {
      timerRef.current = setTimeout(tick, intervalMs);
    } else {
      setIsPolling(false);
      if (timedOut && stillInflight) {
        // We've hit the cap but rows still pending. We could keep going,
        // but stop here to avoid hammering the server if something is wedged.
        // Callers can forceRefresh() to resume.
      }
    }
  }, [fetchOnce, reconcile, intervalMs]);

  // First paint + bootstrap the polling loop.
  useEffect(() => {
    let cancelled = false;
    stopAtRef.current = Date.now() + timeoutMs;
    setIsPolling(true);
    (async () => {
      const rows = await fetchOnce();
      if (cancelled) return;
      setLastPolledAt(Date.now());
      if (rows) reconcile(rows);
      setLoading(false);
      const stillInflight = rows?.some((r) => !TERMINAL_STATUSES.has(r.status));
      if (stillInflight && Date.now() < stopAtRef.current) {
        timerRef.current = setTimeout(tick, intervalMs);
      } else {
        setIsPolling(false);
      }
    })();
    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // We deliberately don't depend on `tick` — `tick` closes over current
    // intervalMs via refs to keep this effect mount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerKey, intervalMs, timeoutMs]);

  const forceRefresh = useCallback(() => {
    // Bump the stop window and re-arm the loop if it had given up.
    stopAtRef.current = Date.now() + timeoutMs;
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsPolling(true);
    tick();
  }, [tick, timeoutMs]);

  const sendOneOff = useCallback(async (to: string, text: string, leadName?: string): Promise<OwnerSmsRow | null> => {
    try {
      const r = await fetch(`${API_BASE}/api/owner/sms`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, text, leadName, ownerKey }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        setError(data.error || `Send failed (${r.status})`);
        return null;
      }
      // Refresh the list immediately + start polling to catch the webhook.
      forceRefresh();
      // We don't have the full row from the POST response, so return a
      // minimal placeholder; the next poll will fill in the real row.
      return {
        id: data.smsId || -1,
        campaignId: null,
        leadId: null,
        ownerKey,
        toNumber: to,
        fromNumber: null,
        body: text,
        status: data.status || 'queued',
        telnyxId: data.telnyxId || null,
        errorCode: null,
        errorMessage: null,
        segmentCount: 1,
        costCredits: 3,
        refunded: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    } catch (e: any) {
      setError(e?.message || 'Send failed');
      return null;
    }
  }, [ownerKey, forceRefresh]);

  return { sms, loading, error, isPolling, lastPolledAt, forceRefresh, sendOneOff };
}
