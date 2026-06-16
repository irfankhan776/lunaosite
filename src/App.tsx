import { useState, useEffect } from 'react';
import { Home, Megaphone, LayoutTemplate, MessageSquare, Settings as SettingsIcon, CreditCard, Code2, CalendarCheck } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Campaigns } from './components/Campaigns';
import { Templates } from './components/Templates';
import { Editor } from './components/Editor';
import { Bookings } from './components/Bookings';
import { Messages } from './components/Messages';
import { Settings } from './components/Settings';
import { Plans } from './components/Plans';
import { playTiktokLike, playSoftTap } from './utils/audio';
import { Landing } from './Landing';

import {
  initialCampaigns,
  initialBusinesses,
  initialTemplates,
  initialSmsLogs
} from './data';
import { SidebarTab, Campaign, Business, SmsLog } from './types';

const OWNER_KEY_STORAGE = 'lunao_owner_key';
const ROUTE_STORAGE = 'lunao_route';

const readAuthed = () => {
  try {
    return Boolean(localStorage.getItem(OWNER_KEY_STORAGE));
  } catch {
    return false;
  }
};

const readRoute = (): '/' | '/app' => {
  try {
    const r = localStorage.getItem(ROUTE_STORAGE);
    return r === '/app' ? '/app' : '/';
  } catch {
    return '/';
  }
};

const writeRoute = (route: '/' | '/app') => {
  try {
    if (route === '/app') localStorage.setItem(ROUTE_STORAGE, '/app');
    else localStorage.removeItem(ROUTE_STORAGE);
  } catch { /* noop */ }
};

export default function App() {
  // Auth + route gate. The Landing page is shown to visitors who have not
  // created an account yet; the dashboard is shown once they have. The
  // /app route is a stable deep link to the dashboard, and bounces back to
  // / with the auth modal open if the visitor is not authed.
  const [authed, setAuthed] = useState<boolean>(() => readAuthed());
  const [route, setRoute] = useState<'/' | '/app'>(() => readRoute());

  useEffect(() => {
    writeRoute(route);
  }, [route]);

  useEffect(() => {
    if (route === '/app' && !authed) {
      // Defer the bounce so the Landing has a chance to mount once and show
      // the auth modal. The Landing opens its own modal on mount when this
      // flag is set in localStorage.
      try { localStorage.setItem('lunao_open_auth_on_load', '1'); } catch { /* noop */ }
      setRoute('/');
    }
  }, [route, authed]);

  // Re-evaluate authed on the window focus event so the dashboard refreshes
  // when the user returns from another tab that may have logged them out.
  useEffect(() => {
    const onFocus = () => setAuthed(readAuthed());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const handleAuthed = (_ownerKey: string) => {
    setAuthed(true);
    setRoute('/app');
  };

  if (!authed) {
    return <Landing onAuthed={handleAuthed} />;
  }

  return <DashboardApp />;
}

// The original dashboard tree lives here, unmodified. Wrapping it in a small
// component lets App() decide whether to render it or the Landing page above
// without touching any of the dashboard's internal wiring.
function DashboardApp() {
  const [activeTab, setActiveTab] = useState<SidebarTab>('dashboard');
  const [bouncingTab, setBouncingTab] = useState<string | null>(null);
  
  // Scroll main flow container to the top on tab change!
  useEffect(() => {
    const mainEl = document.getElementById('main-content-flow');
    if (mainEl) {
      mainEl.scrollTop = 0;
    }
  }, [activeTab]);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Real campaign/site/SMS data persists in localStorage so what you actually
  // ran shows up across refreshes (no mock seed data).
  const loadPersisted = <T,>(key: string, fallback: T): T => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };

  const [campaigns, setCampaigns] = useState<Campaign[]>(() => loadPersisted('lunao_campaigns', initialCampaigns));
  const [businesses, setBusinesses] = useState<Business[]>(() => loadPersisted('lunao_businesses', initialBusinesses));
  const [smsLogs, setSmsLogs] = useState<SmsLog[]>(() => loadPersisted('lunao_sms_logs', initialSmsLogs));
  const [sharedNiche, setSharedNiche] = useState<string>('Barber');

  useEffect(() => {
    localStorage.setItem('lunao_campaigns', JSON.stringify(campaigns));
  }, [campaigns]);
  useEffect(() => {
    localStorage.setItem('lunao_businesses', JSON.stringify(businesses));
  }, [businesses]);
  useEffect(() => {
    localStorage.setItem('lunao_sms_logs', JSON.stringify(smsLogs));
  }, [smsLogs]);

  // Scroll tracking state for mobile navigation dock
  const [isNavMinimized, setIsNavMinimized] = useState(false);

  useEffect(() => {
    const mainEl = document.getElementById('main-content-flow');
    if (!mainEl) return;

    let lastScrollTop = 0;
    const handleScroll = () => {
      const currentScrollTop = mainEl.scrollTop;
      // Scrolling down -> shrink/minimize the dock
      if (currentScrollTop > lastScrollTop + 12 && currentScrollTop > 60) {
        setIsNavMinimized(true);
      } 
      // Scrolling up (or near the absolute top) -> expand the dock immediately with bouncy feedback
      else if (currentScrollTop < lastScrollTop - 8 || currentScrollTop <= 15) {
        setIsNavMinimized(false);
      }
      lastScrollTop = currentScrollTop;
    };

    mainEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => mainEl.removeEventListener('scroll', handleScroll);
  }, []);

  // User Profile state
  const [userName, setUserName] = useState<string>('David Orwot');
  const [userEmail, setUserEmail] = useState<string>('davidorwot34@gmail.com');
  const [userPlan, setUserPlan] = useState<string>(() => {
    return localStorage.getItem('lunao_user_plan') || 'Free Plan';
  });

  const [userCredits, setUserCredits] = useState<number>(() => {
    const cached = localStorage.getItem('lunao_user_credits');
    if (cached !== null) {
      return parseInt(cached, 10);
    }
    const defaultMap: Record<string, number> = {
      'Free Plan': 5,
      'Starter Plan': 300,
      'Growth Plan': 1000,
      'Pro Plan': 3000,
      'Agency Plan': 7000
    };
    return defaultMap[userPlan] || 5;
  });

  const handleSetUserPlan = (plan: string) => {
    let normalized = plan;
    if (!plan.endsWith(' Plan') && !plan.endsWith(' Tier')) {
      normalized = `${plan} Plan`;
    }
    setUserPlan(normalized);
    localStorage.setItem('lunao_user_plan', normalized);

    const planClean = normalized.replace(' Plan', '').replace(' Tier', '');
    const defaultMap: Record<string, number> = {
      'Free': 5,
      'Starter': 300,
      'Growth': 1000,
      'Pro': 3000,
      'Agency': 7000
    };
    const nextCredits = defaultMap[planClean] || 5;
    setUserCredits(nextCredits);
    localStorage.setItem('lunao_user_credits', nextCredits.toString());

    // Sync the server-side account so the ledger reflects the new tier. This
    // also creates the credit_accounts row on first sight. Best-effort; if
    // the backend is offline the local cache still works.
    const ownerKey = localStorage.getItem('lunao_owner_key') || `dash-${normalized.replace(/\s+/g, '-')}`;
    if (!localStorage.getItem('lunao_owner_key')) localStorage.setItem('lunao_owner_key', ownerKey);
    (async () => {
      try {
        const { getCredits } = await import('./lib/pipelineClient');
        const status = await getCredits(ownerKey, normalized);
        if (status.account) {
          setUserCredits(status.account.balance);
          localStorage.setItem('lunao_user_credits', String(status.account.balance));
        }
      } catch {
        /* silent — local cache still works */
      }
    })();
  };

  const [telnyxKey, setTelnyxKey] = useState<string>(() => {
    return localStorage.getItem('lunao_telnyx_key') || '';
  });
  const [telnyxPhone, setTelnyxPhone] = useState<string>(() => {
    return localStorage.getItem('lunao_telnyx_phone') || '';
  });

  // Template preview id bridge: so that clicking eye on dashboard/businesses transitions to Templates and auto-triggers preview modal
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);

  // Callback to add SMS logs when new broadcasts or campaign dispatches complete
  const addSmsLog = (newLogs: any[]) => {
    setSmsLogs(prev => [...newLogs, ...prev]);
  };

  return (
    <div id="lunao-saas-root-layout" className="flex flex-col md:flex-row bg-off-white h-screen text-ink overflow-hidden max-w-[1920px] mx-auto select-none selection:bg-accent-soft selection:text-accent">
      
      {/* MOBILE HEADER FOR SAAS APP */}
      <header className="flex md:hidden h-14 w-full items-center justify-between px-6 bg-white/80 backdrop-blur-md border-b border-[#E4E2DC] sticky top-0 z-30 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6.5 h-6.5 bg-accent rounded-sm rotate-[12deg] flex items-center justify-center shadow-xs">
            <div className="w-3 h-3 bg-white rounded-xs -rotate-[12deg]"></div>
          </div>
          <span className="text-base font-bold font-sans tracking-tight text-ink leading-none">Lunao</span>
        </div>
        <div 
          onClick={() => {
            playSoftTap();
            setActiveTab('plans');
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success-soft text-success text-[10px] font-bold border border-success/15 shadow-3xs cursor-pointer active:scale-95 transition-all"
        >
          <span>✦</span>
          <span>{userCredits.toLocaleString()} Credits</span>
        </div>
      </header>

      {/* MOBILE FLOATING NAVIGATION DOCK (iOS/SaaS Native Feel) */}
      <nav 
        id="mobile-dock-saas" 
        className={`fixed md:hidden bottom-4 left-1/2 -translate-x-1/2 z-40 bg-white/95 backdrop-blur-xl border border-[#E4E2DC]/80 shadow-[0_16px_40px_rgba(26,25,22,0.18)] overflow-hidden transition-[width,height,border-radius,box-shadow] duration-[400ms] ease-[cubic-bezier(0.25,1,0.3,1)] ${
          isNavMinimized 
            ? 'h-[52px] w-[280px] rounded-[30px] shadow-[0_8px_32px_rgba(26,25,22,0.14)]' 
            : 'h-[68px] w-[calc(100%-32px)] max-w-[420px] rounded-[24px]'
        }`}
      >
        {/* Absolute Background Ambient Aurora Glow */}
        <div className="absolute inset-x-0 bottom-0 h-10 w-full bg-gradient-to-t from-accent/10 to-transparent blur-lg opacity-50 -z-10 animate-pulse pointer-events-none" />
        
        {/* Sliding back indicator pill positioned relative to the nav container */}
        {(() => {
          const tabsList = ['dashboard', 'campaigns', 'templates', 'editor', 'bookings', 'messages', 'plans', 'settings'];
          const activeIndex = tabsList.indexOf(activeTab);
          return (
            <div 
              className={`absolute top-1.5 bottom-1.5 bg-accent-soft/85 border border-accent/15 pointer-events-none spring-pill-transition shadow-[0_2px_12px_rgba(37,99,235,0.08)] transition-all duration-300 ${
                isNavMinimized ? 'rounded-full' : 'rounded-[16px]'
              }`}
              style={{
                left: '6px',
                width: 'calc((100% - 12px) / 8)',
                transform: `translateX(${activeIndex * 100}%)`,
              }}
            />
          );
        })()}

        <div className="relative w-full h-full flex items-center px-1.5">
          {[
            { id: 'dashboard' as SidebarTab, label: 'Home', icon: Home },
            { id: 'campaigns' as SidebarTab, label: 'Launch', icon: Megaphone },
            { id: 'templates' as SidebarTab, label: 'Templates', icon: LayoutTemplate },
            { id: 'editor' as SidebarTab, label: 'Editor', icon: Code2 },
            { id: 'bookings' as SidebarTab, label: 'Bookings', icon: CalendarCheck },
            { id: 'messages' as SidebarTab, label: 'Outreach', icon: MessageSquare },
            { id: 'plans' as SidebarTab, label: 'Plans', icon: CreditCard },
            { id: 'settings' as SidebarTab, label: 'Settings', icon: SettingsIcon },
          ].map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const isBouncing = bouncingTab === item.id;
            return (
              <button
                key={item.id}
                id={`mobile-dock-btn-${item.id}`}
                onClick={() => {
                  playTiktokLike();
                  setActiveTab(item.id);
                  // Trigger smooth WhatsApp bounce cycle
                  setBouncingTab(null);
                  setTimeout(() => {
                    setBouncingTab(item.id);
                  }, 15);
                }}
                className={`relative z-10 flex-1 flex flex-col items-center justify-center w-full h-full cursor-pointer outline-none transition-colors duration-300 ${
                  isActive ? 'text-accent' : 'text-ink-secondary hover:text-ink'
                }`}
                aria-label={item.label}
              >
                <div className={`relative flex items-center justify-center transition-transform duration-[400ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isBouncing ? 'animate-whatsapp-bounce' : ''} ${isNavMinimized ? 'translate-y-0 scale-95' : '-translate-y-[8px] scale-100'}`}>
                  <Icon className={`transition-all duration-300 ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.8px]'} ${isNavMinimized ? 'w-5 h-5' : 'w-[22px] h-[22px]'}`} />
                  {isActive && (
                    <span className="absolute -inset-1.5 rounded-full bg-accent/20 blur-[3px] -z-10 animate-ping opacity-60" />
                  )}
                </div>
                
                <div className={`absolute left-0 w-full flex items-center justify-center transition-all duration-[400ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                  isNavMinimized 
                    ? 'bottom-2 opacity-0 translate-y-4 scale-50 pointer-events-none' 
                    : 'bottom-[9px] opacity-100 translate-y-0 scale-100'
                }`}>
                  <span className={`text-[10px] sm:text-[11px] font-sans transition-all duration-300 tracking-tight leading-none ${isActive ? 'font-bold' : 'font-medium'}`}>
                    {item.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </nav>

      {/* 240px wide FIXED sidebar navigation - hidden on mobile, flex on desktop */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        userName={userName}
        userEmail={userEmail}
        userPlan={userPlan}
        userCredits={userCredits}
        className="hidden md:flex"
      />

      {/* Main scrolling content area */}
      <main id="main-content-flow" className="flex-1 overflow-y-auto h-[calc(100vh-56px)] md:h-screen p-6 md:p-12 relative flex flex-col justify-between">
        
        {/* Dynamic Screen router under Caching layer */}
        <div id="routed-module-wrapper" className="flex-1 pb-24 md:pb-16">
          <div className={activeTab === 'dashboard' ? 'block animate-fade-in' : 'hidden'}>
            <Dashboard 
              campaigns={campaigns} 
              setCampaigns={setCampaigns} 
              setActiveTab={setActiveTab}
              setPreviewTemplateId={setPreviewTemplateId}
              businesses={businesses}
            />
          </div>

          <div className={activeTab === 'campaigns' ? 'block animate-fade-in' : 'hidden'}>
            <Campaigns 
              campaigns={campaigns} 
              setCampaigns={setCampaigns} 
              templates={initialTemplates} 
              businesses={businesses}
              setBusinesses={setBusinesses}
              addSmsLog={addSmsLog}
              setActiveTab={setActiveTab}
              selectedNiche={sharedNiche === 'All' ? 'Barber' : sharedNiche}
              setSelectedNiche={setSharedNiche}
              userPlan={userPlan}
              userCredits={userCredits}
              setUserCredits={setUserCredits}
              telnyxKey={telnyxKey}
              telnyxPhone={telnyxPhone}
            />
          </div>

          <div className={activeTab === 'templates' ? 'block animate-fade-in' : 'hidden'}>
            <Templates 
              templates={initialTemplates} 
              previewTemplateId={previewTemplateId} 
              setPreviewTemplateId={setPreviewTemplateId} 
              selectedNicheFilter={sharedNiche}
              setSelectedNicheFilter={setSharedNiche}
              setActiveTab={setActiveTab}
            />
          </div>

          <div className={activeTab === 'editor' ? 'block animate-fade-in' : 'hidden'}>
            <Editor active={activeTab === 'editor'} />
          </div>

          <div className={activeTab === 'bookings' ? 'block animate-fade-in' : 'hidden'}>
            <Bookings active={activeTab === 'bookings'} />
          </div>

          <div className={activeTab === 'messages' ? 'block animate-fade-in' : 'hidden'}>
            <Messages 
              businesses={businesses} 
              setBusinesses={setBusinesses} 
              setActiveTab={setActiveTab}
            />
          </div>

          <div className={activeTab === 'settings' ? 'block animate-fade-in' : 'hidden'}>
            <Settings 
              userName={userName}
              setUserName={setUserName}
              userEmail={userEmail}
              setUserEmail={setUserEmail}
              userPlan={userPlan}
              setUserPlan={handleSetUserPlan}
              userCredits={userCredits}
              telnyxKey={telnyxKey}
              setTelnyxKey={setTelnyxKey}
              telnyxPhone={telnyxPhone}
              setTelnyxPhone={setTelnyxPhone}
              setActiveTab={setActiveTab}
            />
          </div>

          <div className={activeTab === 'plans' ? 'block animate-fade-in' : 'hidden'}>
            <Plans 
              setActiveTab={setActiveTab}
              setUserPlan={handleSetUserPlan}
              userPlan={userPlan}
              userCredits={userCredits}
            />
          </div>
        </div>

        {/* Global Footer separated by separator */}
        <footer id="global-application-footer" className="section-border-top border-t border-border-main pt-6 mt-16 text-center text-[11px] font-sans text-ink-secondary flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="w-2.5 h-2.5 bg-accent rounded-full animate-pulse"></span>
            <span>All systems fully operational. API health connections 100%.</span>
          </div>
          <span>© 2026 Lunao Inc. Built to claim.</span>
        </footer>

      </main>

    </div>
  );
}
