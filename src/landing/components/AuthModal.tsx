import React, { useEffect, useRef, useState } from 'react';
import { X, Mail, ArrowRight } from 'lucide-react';

interface AuthModalProps {
  open: boolean;
  initialMode?: 'signup' | 'login';
  initialPlan?: string;
  initialNiche?: string;
  onClose: () => void;
  onAuthed: (ownerKey: string) => void;
}

const PLAN_FROM_STORAGE_KEY = 'lunao_user_plan';

// Generate a stable, human-friendly owner key. Not cryptographically secure —
// this is a UX-level gate, not a security boundary. The real backend auth is
// deferred per the plan.
const makeOwnerKey = (email: string): string => {
  const slug = email
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'user';
  const rand = Math.random().toString(36).slice(2, 8);
  return `dash-${slug}-${rand}`;
};

const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export const AuthModal: React.FC<AuthModalProps> = ({
  open,
  initialMode = 'signup',
  initialPlan,
  initialNiche,
  onClose,
  onAuthed,
}) => {
  const [mode, setMode] = useState<'signup' | 'login'>(initialMode);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError(null);
      // Focus the input shortly after the modal mounts.
      setTimeout(() => emailInputRef.current?.focus(), 80);
      // Remember the trigger so we can restore focus on close.
      triggerRef.current = document.activeElement;
    }
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      // Restore focus to the element that opened the modal.
      if (triggerRef.current && (triggerRef.current as HTMLElement).focus) {
        (triggerRef.current as HTMLElement).focus();
      }
    };
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      const ownerKey = makeOwnerKey(email);
      localStorage.setItem('lunao_owner_key', ownerKey);
      localStorage.setItem('lunao_user_email', email.trim().toLowerCase());
      if (initialPlan) {
        localStorage.setItem(PLAN_FROM_STORAGE_KEY, initialPlan);
      }
      if (initialNiche) {
        localStorage.setItem('lunao_pending_niche', initialNiche);
      }
      onAuthed(ownerKey);
    } catch (err) {
      setError('Could not save your account. Check that local storage is enabled and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-stretch sm:items-center justify-center bg-ink/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="relative w-full sm:max-w-[440px] sm:rounded-xl bg-white shadow-md border border-border-main overflow-hidden animate-editor-rise flex flex-col h-full sm:h-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 w-9 h-9 rounded-md flex items-center justify-center text-ink-secondary hover:bg-off-white hover:text-ink"
          aria-label="Close"
        >
          <X className="w-4 h-4" strokeWidth={2} />
        </button>

        <div className="px-6 sm:px-8 pt-10 pb-6 sm:pt-12 sm:pb-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-tertiary mb-3">
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </p>
          <h2 id="auth-modal-title" className="font-serif text-ink text-[28px] sm:text-[32px] leading-[1.1] mb-3">
            {mode === 'signup'
              ? initialPlan
                ? `Start with ${initialPlan.replace(' Plan', '')}.`
                : 'Start with 5 free credits.'
              : 'Log in to your Lunao dashboard.'}
          </h2>
          <p className="font-sans text-sm text-ink-secondary leading-relaxed mb-6">
            {mode === 'signup'
              ? 'No card. Cancel any time. Your first campaign can go out in under a minute.'
              : 'Enter the email you used when you signed up. We will restore your account in place.'}
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-tertiary block mb-1.5">
                Work email
              </span>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary" strokeWidth={1.8} />
                <input
                  ref={emailInputRef}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@agency.com"
                  className="w-full h-11 pl-10 pr-3 rounded-md bg-off-white border border-border-main text-ink text-sm font-sans placeholder:text-ink-tertiary focus:outline-none focus:border-accent focus:bg-white transition-colors"
                />
              </div>
            </label>

            {error && (
              <p role="alert" className="text-xs font-sans text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 h-11 w-full rounded-md bg-accent text-white font-sans text-sm font-medium hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {submitting
                ? 'Opening your dashboard…'
                : mode === 'signup'
                ? 'Continue to dashboard'
                : 'Open dashboard'}
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </button>
          </form>

          <p className="mt-5 text-center font-sans text-xs text-ink-secondary">
            {mode === 'signup' ? (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(null); }}
                  className="text-accent hover:text-accent-hover font-medium"
                >
                  Log in
                </button>
              </>
            ) : (
              <>
                New here?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('signup'); setError(null); }}
                  className="text-accent hover:text-accent-hover font-medium"
                >
                  Create an account
                </button>
              </>
            )}
          </p>
        </div>

        <div className="border-t border-border-light bg-off-white px-6 sm:px-8 py-3 text-[11px] font-mono text-ink-tertiary flex items-center justify-between">
          <span>Local-only account</span>
          <span>v1.0</span>
        </div>
      </div>
    </div>
  );
};
