import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Nav } from './landing/sections/Nav';
import { Hero } from './landing/sections/Hero';
import { SocialProof } from './landing/sections/SocialProof';
import { UseCases } from './landing/sections/UseCases';
import { PainPoints } from './landing/sections/PainPoints';
import { WhyUs } from './landing/sections/WhyUs';
import { HowItWorks } from './landing/sections/HowItWorks';
import { Benefits } from './landing/sections/Benefits';
import { Pricing } from './landing/sections/Pricing';
import { Testimonials } from './landing/sections/Testimonials';
import { CTV } from './landing/sections/CTV';
import { FAQ } from './landing/sections/FAQ';
import { Footer } from './landing/sections/Footer';
import { AuthModal } from './landing/components/AuthModal';
import { SectionDivider } from './landing/components/SectionDivider';
import { useAuth } from './contexts/AuthContext';
import './landing/index.css';

const PLAN_ID_TO_LABEL: Record<string, string> = {
  free: 'Free Plan',
  starter: 'Starter Plan',
  growth: 'Growth Plan',
  pro: 'Pro Plan',
  agency: 'Agency Plan',
};

// Google Client ID — set VITE_GOOGLE_CLIENT_ID in your .env file.
// If not set, the Google button is hidden and only email/password auth is available.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export const Landing: React.FC = () => {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup');
  const [pendingPlan, setPendingPlan] = useState<string | undefined>(undefined);
  const [pendingNiche, setPendingNiche] = useState<string | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Single IntersectionObserver toggles data-visible on .landing-fade elements.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      root.querySelectorAll<HTMLElement>('.landing-fade').forEach((el) => {
        el.dataset.visible = 'true';
      });
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.visible = 'true';
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    root.querySelectorAll<HTMLElement>('.landing-fade').forEach((el) => {
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  // If the visitor deep-linked to /app while unauthenticated, App.tsx sets
  // this flag and bounces them back to /. Open the auth modal on mount.
  useEffect(() => {
    try {
      if (localStorage.getItem('lunao_open_auth_on_load') === '1') {
        localStorage.removeItem('lunao_open_auth_on_load');
        setAuthMode('login');
        setAuthOpen(true);
      }
    } catch { /* noop */ }
  }, []);

  const openAuth = useCallback((mode: 'login' | 'signup', opts?: { plan?: string; niche?: string }) => {
    setAuthMode(mode);
    setPendingPlan(opts?.plan);
    setPendingNiche(opts?.niche);
    setAuthOpen(true);
  }, []);

  const closeAuth = useCallback(() => setAuthOpen(false), []);

  const handlePickPlan = useCallback((planId: string) => {
    openAuth('signup', { plan: PLAN_ID_TO_LABEL[planId] ?? 'Free Plan' });
  }, [openAuth]);

  const handlePickNiche = useCallback((niche: string) => {
    openAuth('signup', { niche });
  }, [openAuth]);

  return (
    <div ref={rootRef} className="landing-root">
      <Nav onOpenAuth={(mode) => openAuth(mode)} />

      <main id="main-content-flow" className="pt-16 md:pt-20">
        <SectionDivider withMark />
        <Hero onOpenAuth={() => openAuth('signup')} />

        <SectionDivider withMark />
        <SocialProof />

        <SectionDivider withMark />
        <UseCases onPickNiche={handlePickNiche} />

        <SectionDivider withMark />
        <PainPoints />

        <SectionDivider withMark />
        <WhyUs />

        <SectionDivider withMark />
        <HowItWorks />

        <SectionDivider withMark />
        <Benefits />

        <SectionDivider withMark />
        <Pricing onPickPlan={handlePickPlan} />

        <SectionDivider withMark />
        <Testimonials />

        <SectionDivider withMark />
        <CTV onOpenAuth={() => openAuth('signup')} />

        <SectionDivider withMark />
        <FAQ />
      </main>

      <Footer onOpenAuth={openAuth} />

      <AuthModal
        open={authOpen}
        initialMode={authMode}
        initialPlan={pendingPlan}
        initialNiche={pendingNiche}
        onClose={closeAuth}
        onAuthed={() => setAuthOpen(false)}
        googleClientId={GOOGLE_CLIENT_ID}
      />
    </div>
  );
};
