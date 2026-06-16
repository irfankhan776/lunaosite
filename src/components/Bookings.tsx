import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CalendarCheck, RefreshCw, AlertCircle, Loader2, Phone, Clock,
  MessageCircle, FileText, Check, X, CheckCircle2, CalendarDays, User,
} from 'lucide-react';
import { listBookings, updateBookingStatus, Booking, BookingStatus } from '../lib/pipelineClient';
import {
  playSoftTap, playSlideTick, playConfirmSuccess, playCancelTone,
  playElegantError, playTiktokLike,
} from '../utils/audio';

interface BookingsProps {
  active: boolean;
}

const sfx = {
  tap: playSoftTap,
  toggle: playSlideTick,
  confirm: playConfirmSuccess,
  cancel: playCancelTone,
  error: playElegantError,
  refresh: playTiktokLike,
};

function relTime(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}

const STATUS_META: Record<BookingStatus, { label: string; cls: string }> = {
  new: { label: 'New', cls: 'bg-accent-soft text-accent' },
  confirmed: { label: 'Confirmed', cls: 'bg-success-soft text-success' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-50 text-red-600' },
};

export const Bookings: React.FC<BookingsProps> = ({ active }) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterSite, setFilterSite] = useState('All');
  const [filterStatus, setFilterStatus] = useState<'All' | BookingStatus>('All');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listBookings();
      setBookings(list);
      setLoaded(true);
    } catch (err: any) {
      setError(err?.message || 'Could not load bookings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active && !loaded && !loading) load();
  }, [active, loaded, loading, load]);

  const sites = useMemo(
    () => ['All', ...Array.from(new Set(bookings.map((b) => b.slug)))],
    [bookings],
  );

  const filtered = bookings.filter(
    (b) =>
      (filterSite === 'All' || b.slug === filterSite) &&
      (filterStatus === 'All' || b.status === filterStatus),
  );

  const counts = useMemo(
    () => ({
      total: bookings.length,
      neu: bookings.filter((b) => b.status === 'new').length,
      confirmed: bookings.filter((b) => b.status === 'confirmed').length,
      chatbot: bookings.filter((b) => b.source === 'chatbot').length,
    }),
    [bookings],
  );

  const setStatus = async (id: number, status: BookingStatus) => {
    setBusyId(id);
    try {
      const updated = await updateBookingStatus(id, status);
      setBookings((prev) => prev.map((b) => (b.id === id ? updated : b)));
      if (status === 'confirmed') sfx.confirm();
      else if (status === 'cancelled') sfx.cancel();
    } catch {
      sfx.error();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in">
      {/* Hero header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center shadow-sm shrink-0">
            <CalendarCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold font-sans tracking-tight text-ink leading-tight">Bookings</h1>
            <p className="text-sm text-ink-secondary font-sans max-w-xl mt-1">
              Every appointment booked through your clients' sites — via the booking form or the chatbot — lands here in real time.
            </p>
          </div>
        </div>
        <button
          onClick={() => { sfx.refresh(); load(); }}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-border-main text-ink text-sm font-semibold font-sans hover:bg-off-white active:scale-[0.98] transition-all disabled:opacity-60 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      {!loading && bookings.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatCard icon={<CalendarDays className="w-4 h-4" />} label="Total" value={counts.total} />
          <StatCard icon={<Clock className="w-4 h-4" />} label="New" value={counts.neu} accent />
          <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Confirmed" value={counts.confirmed} />
          <StatCard icon={<MessageCircle className="w-4 h-4" />} label="Via chatbot" value={counts.chatbot} />
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 mb-6">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-sm font-sans">{error}</div>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-white border border-border-main animate-pulse" />
          ))}
        </div>
      )}

      {!loading && loaded && bookings.length === 0 && (
        <div className="text-center py-20 px-6 bg-white rounded-2xl border border-dashed border-border-main">
          <div className="w-14 h-14 rounded-2xl bg-accent-soft flex items-center justify-center mx-auto mb-4">
            <CalendarCheck className="w-7 h-7 text-accent" />
          </div>
          <h3 className="text-lg font-bold font-sans text-ink mb-1.5">No bookings yet</h3>
          <p className="text-sm text-ink-secondary font-sans max-w-sm mx-auto">
            Enable the Booking System or Chatbot on a site in the Site Editor. Every appointment your clients receive will show up here.
          </p>
        </div>
      )}

      {/* Filters + list */}
      {!loading && bookings.length > 0 && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
              {(['All', 'new', 'confirmed', 'cancelled'] as const).map((s) => {
                const isActive = filterStatus === s;
                const count = s === 'All' ? bookings.length : bookings.filter((b) => b.status === s).length;
                return (
                  <button
                    key={s}
                    onClick={() => { sfx.toggle(); setFilterStatus(s); }}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold font-sans border capitalize transition-all active:scale-[0.97] ${
                      isActive ? 'bg-accent text-white border-accent shadow-sm' : 'bg-white text-ink-secondary border-border-main hover:text-ink hover:border-accent/40'
                    }`}
                  >
                    {s === 'All' ? 'All' : STATUS_META[s].label}
                    <span className={`text-[10px] tabular-nums ${isActive ? 'text-white/80' : 'text-ink-tertiary'}`}>{count}</span>
                  </button>
                );
              })}
            </div>

            {sites.length > 2 && (
              <select
                value={filterSite}
                onChange={(e) => { sfx.tap(); setFilterSite(e.target.value); }}
                className="sm:ml-auto px-3 py-2 rounded-xl border border-border-main bg-white text-sm font-sans text-ink focus:outline-none focus:border-accent transition-all"
              >
                {sites.map((s) => (
                  <option key={s} value={s}>{s === 'All' ? 'All sites' : `/${s}/`}</option>
                ))}
              </select>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-16 px-6 bg-white rounded-2xl border border-dashed border-border-main">
              <p className="text-sm text-ink-secondary font-sans">No bookings match this filter.</p>
            </div>
          ) : (
            <div className="space-y-3 animate-editor-fade">
              {filtered.map((b) => (
                <BookingRow key={b.id} booking={b} busy={busyId === b.id} onStatus={setStatus} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: number; accent?: boolean }> = ({
  icon, label, value, accent,
}) => (
  <div className={`rounded-2xl border p-4 ${accent ? 'bg-accent-soft/60 border-accent/20' : 'bg-white border-border-main'}`}>
    <div className="flex items-center gap-1.5 text-ink-secondary mb-1.5">
      {icon}
      <span className="text-[11px] font-semibold font-sans uppercase tracking-wide">{label}</span>
    </div>
    <div className="text-2xl font-bold font-sans text-ink tabular-nums">{value}</div>
  </div>
);

const BookingRow: React.FC<{
  booking: Booking;
  busy: boolean;
  onStatus: (id: number, status: BookingStatus) => void;
}> = ({ booking: b, busy, onStatus }) => {
  const status = STATUS_META[b.status];
  return (
    <div className="bg-white rounded-2xl border border-border-main p-4 sm:p-5 hover:border-accent/30 transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* identity */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0">
            <User className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold font-sans text-ink truncate">{b.customerName || 'Guest'}</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold font-sans ${status.cls}`}>
                {status.label}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold font-sans bg-off-white text-ink-secondary border border-border-light">
                {b.source === 'chatbot' ? <MessageCircle className="w-2.5 h-2.5" /> : <FileText className="w-2.5 h-2.5" />}
                {b.source === 'chatbot' ? 'Chatbot' : 'Form'}
              </span>
            </div>
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1 text-[12px] text-ink-secondary font-sans">
              {b.businessName && <span className="font-medium text-ink">{b.businessName}</span>}
              {b.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{b.phone}</span>}
              <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{relTime(b.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* appointment details */}
        <div className="flex items-center gap-4 sm:gap-6 sm:px-4 sm:border-l sm:border-border-light shrink-0">
          <Detail label="Service" value={b.service || '—'} />
          <Detail label="Date" value={b.date || '—'} />
          <Detail label="Time" value={b.time || '—'} />
        </div>

        {/* actions */}
        <div className="flex items-center gap-2 shrink-0 sm:pl-2">
          {b.status !== 'confirmed' && (
            <button
              onClick={() => onStatus(b.id, 'confirmed')}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-success-soft text-success text-xs font-semibold font-sans hover:bg-success hover:text-white active:scale-[0.97] transition-all disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Confirm
            </button>
          )}
          {b.status !== 'cancelled' && (
            <button
              onClick={() => onStatus(b.id, 'cancelled')}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-border-main text-ink-secondary text-xs font-semibold font-sans hover:text-red-600 hover:border-red-200 active:scale-[0.97] transition-all disabled:opacity-60"
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
          )}
        </div>
      </div>

      {b.notes && (
        <div className="mt-3 pt-3 border-t border-border-light text-[12px] text-ink-secondary font-sans">
          <span className="font-semibold text-ink">Notes: </span>{b.notes}
        </div>
      )}
    </div>
  );
};

const Detail: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-0">
    <div className="text-[10px] uppercase tracking-wide font-bold text-ink-tertiary font-sans mb-0.5">{label}</div>
    <div className="text-[13px] font-semibold font-sans text-ink truncate max-w-[120px]">{value}</div>
  </div>
);
