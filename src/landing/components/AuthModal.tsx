import React, { useEffect, useRef, useState } from 'react';
import { X, Mail, ArrowRight, Chrome } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface AuthModalProps {
  open: boolean;
  initialMode?: 'signup' | 'login';
  initialPlan?: string;
  initialNiche?: string;
  onClose: () => void;
  onAuthed: () => void;
  googleClientId?: string;
}

const PLAN_FROM_STORAGE_KEY = 'lunao_user_plan';

const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export const AuthModal: React.FC<AuthModalProps> = ({
  open,
  initialMode = 'signup',
  initialPlan,
  initialNiche,
  onClose,
  onAuthed,
  googleClientId,
}) => {
  const { login, register, loginWithGoogle, loading, error: authError } = useAuth();
  const [mode, setMode] = useState<'signup' | 'login'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<Element | null>(null);
  const googleBtnRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError(null);
      setPassword('');
      setTimeout(() => emailInputRef.current?.focus(), 80);
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
      if (triggerRef.current && (triggerRef.current as HTMLElement).focus) {
        (triggerRef.current as HTMLElement).focus();
      }
    };
  }, [open]);

  // Initialize Google Identity Services when the modal opens and a client ID is available.
  useEffect(() => {
    if (!open || !googleClientId) return;
    const scriptId = 'gis-script';
    if (document.getElementById(scriptId)) return;

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, [open, googleClientId]);

  // Render the Google button once GIS is loaded.
  useEffect(() => {
    if (!open || !googleClientId || !googleBtnRef.current) return;
    const container = googleBtnRef.current;
    container.innerHTML = '';

    const win = window as any;
    if (!win.google?.accounts?.identity) {
      const check = setInterval(() => {
        if (win.google?.accounts?.identity) {
          clearInterval(check);
          renderGoogleButton();
        }
      }, 200);
      return () => clearInterval(check);
    }
    renderGoogleButton();

    function renderGoogleButton() {
      win.google.accounts.identity.renderButton(container, {
        theme: 'outline',
        size: 'large',
        text: mode === 'signup' ? 'signin_with' : 'signin_with',
        shape: 'rectangular',
        width: parseInt(getComputedStyle(container).width) || 380,
      });
      container.querySelector('[role="button"]')?.addEventListener('click', handleGoogleClick);
    }
  }, [open, googleClientId, mode]);

  const handleGoogleClick = async () => {
    const win = window as any;
    if (!win.google?.accounts?.identity) return;

    win.google.accounts.identity.requestCredential({
      client_id: googleClientId,
      callback: async (response: any) => {
        if (!response?.credential) return;
        try {
          setSubmitting(true);
          setError(null);
          await loginWithGoogle(response.credential);
          onAuthed();
        } catch (err: any) {
          setError(err.message || 'Google sign-in failed. Please try again.');
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'signup') {
        await register(email, password);
      } else {
        await login(email, password);
      }
      if (initialPlan) localStorage.setItem(PLAN_FROM_STORAGE_KEY, initialPlan);
      if (initialNiche) localStorage.setItem('lunao_pending_niche', initialNiche);
      onAuthed();
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

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
              : 'Enter the email and password you used when you signed up.'}
          </p>

          {/* Google Sign-In */}
          {googleClientId && (
            <>
              <div
                ref={googleBtnRef}
                className="mb-4 flex items-center justify-center cursor-pointer"
              />
              <div className="relative mb-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border-main" />
                </div>
                <div className="relative flex justify-center text-[10px]">
                  <span className="bg-white px-3 text-ink-tertiary font-mono uppercase tracking-widest">or</span>
                </div>
              </div>
            </>
          )}

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

            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-tertiary block mb-1.5">
                Password
              </span>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary" strokeWidth={1.8} />
                <input
                  type="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
                  className="w-full h-11 pl-10 pr-3 rounded-md bg-off-white border border-border-main text-ink text-sm font-sans placeholder:text-ink-tertiary focus:outline-none focus:border-accent focus:bg-white transition-colors"
                />
              </div>
            </label>

            {(error || authError) && (
              <p role="alert" className="text-xs font-sans text-danger">
                {error || authError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || loading}
              className="mt-1 h-11 w-full rounded-md bg-accent text-white font-sans text-sm font-medium hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {submitting || loading
                ? 'Please wait…'
                : mode === 'signup'
                ? 'Create account'
                : 'Log in'}
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </button>
          </form>

          <p className="mt-5 text-center font-sans text-xs text-ink-secondary">
            {mode === 'signup' ? (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(null); setPassword(''); }}
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
                  onClick={() => { setMode('signup'); setError(null); setPassword(''); }}
                  className="text-accent hover:text-accent-hover font-medium"
                >
                  Create an account
                </button>
              </>
            )}
          </p>
        </div>

        <div className="border-t border-border-light bg-off-white px-6 sm:px-8 py-3 text-[11px] font-mono text-ink-tertiary flex items-center justify-between">
          <span>{googleClientId ? 'Secure cookie session' : 'Account'}</span>
          <span>v1.0</span>
        </div>
      </div>
    </div>
  );
};
