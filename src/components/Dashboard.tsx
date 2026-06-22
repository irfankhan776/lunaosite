import React, { useState } from 'react';
import { Campaign, SidebarTab, Business } from '../types';
import { 
  Play, Pause, Trash2, Eye, ExternalLink, Calendar, Plus, 
  ChevronRight, ChevronLeft, Search, Copy, Check, Globe, Phone 
} from 'lucide-react';
import { playTiktokLike } from '../utils/audio';


interface DashboardProps {
  campaigns: Campaign[];
  setCampaigns: React.Dispatch<React.SetStateAction<Campaign[]>>;
  setActiveTab: (tab: SidebarTab) => void;
  setCampToEdit?: (camp: Campaign | null) => void;
  setSelectedTemplate?: (templateId: string) => void;
  setPreviewTemplateId?: (id: string | null) => void;
  businesses: Business[];
}

export const Dashboard: React.FC<DashboardProps> = ({
  campaigns,
  setCampaigns,
  setActiveTab,
  businesses,
  setCampToEdit,
  setSelectedTemplate,
  setPreviewTemplateId,
}) => {
  const [viewMode, setViewMode] = useState<'summary' | 'deployed-sites'>('summary');
  const [animatingBtn, setAnimatingBtn] = useState<string | null>(null);
  const [isExiting, setIsExiting] = useState(false);

  const handleNavClick = (btnId: string, action: () => void) => {
    playTiktokLike();
    setAnimatingBtn(btnId);
    // 150ms after button click starts, trigger the whole page exit animation
    setTimeout(() => {
      setIsExiting(true);
    }, 150);
    
    // Switch the tab after the exit animation is almost finished
    setTimeout(() => {
      action();
      setIsExiting(false);
      setAnimatingBtn(null); 
    }, 450); 
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Real stats — counted only from actual campaigns you've run.
  const totalSites = campaigns.reduce((acc, c) => acc + (c.sites || 0), 0);
  const totalSms = campaigns.reduce((acc, c) => acc + (c.smsSent || 0), 0);

  // Toggle status of campaign
  const toggleCampaignStatus = (id: string) => {
    setCampaigns(prev => prev.map(c => {
      if (c.id === id) {
        const nextStatus = c.status === 'Active' ? 'Paused' : 'Active';
        return { ...c, status: nextStatus };
      }
      return c;
    }));
  };

  // Delete Campaign
  const deleteCampaign = (id: string) => {
    if (window.confirm('Are you sure you want to delete this campaign?')) {
      setCampaigns(prev => prev.filter(c => c.id !== id));
    }
  };

  const isWaitingForLast = (campId: string) => {
    const idx = campaigns.findIndex(c => c.id === campId);
    if (idx === -1) return false;
    return campaigns.slice(idx + 1).some(c => c.status === 'Active');
  };

  const getStatusStyle = (status: Campaign['status']) => {
    switch (status) {
      case 'Active':
        return 'bg-emerald-500/10 text-emerald-800 border border-emerald-500/15';
      case 'Completed':
        return 'bg-slate-500/10 text-slate-800 border border-slate-500/15';
      case 'Queued':
        return 'bg-amber-500/10 text-amber-800 border border-amber-500/15';
      case 'Crashed':
        return 'bg-rose-500/10 text-rose-800 border border-rose-500/15';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  // Status badge style classes
  const getStatusBadge = (status: Campaign['status']) => {
    return getStatusStyle(status);
  };

  // Helper to map business to its corresponding campaign name dynamically
  const getCampaignForBusiness = (biz: Business) => {
    const matchedCamp = campaigns.find(c => c.niche.toLowerCase() === biz.niche.toLowerCase());
    return matchedCamp ? matchedCamp.name : `${biz.city.split(',')[0]} Local Campaign`;
  };

  // Copy site preview URL to Clipboard
  const handleCopyUrl = (e: React.MouseEvent, id: string, url: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Businesses that have active deployed sites (status exists as deployed / sms sent / claimed)
  const deployedBusinesses = businesses.filter(biz => biz.siteStatus !== 'Not started');

  // Filter deployed businesses by search query
  const filteredDeployed = deployedBusinesses.filter(biz => {
    const campaignName = getCampaignForBusiness(biz);
    const textQuery = searchQuery.toLowerCase();
    return (
      biz.name.toLowerCase().includes(textQuery) ||
      biz.owner.toLowerCase().includes(textQuery) ||
      biz.phone.includes(searchQuery) ||
      biz.niche.toLowerCase().includes(textQuery) ||
      campaignName.toLowerCase().includes(textQuery) ||
      biz.siteUrl.toLowerCase().includes(textQuery)
    );
  });

  return (
    <div 
      id="dashboard-tab-content-root" 
      className={`space-y-8 font-sans transition-all duration-300 ease-in-out ${
        isExiting 
          ? 'opacity-0 scale-[0.97] blur-[2px] translate-y-2' 
          : 'animate-fade-in opacity-100 scale-100 blur-0 translate-y-0'
      }`}
    >
      
      {/* Dynamic View Mode Router: Summary Dashboard or Deployed Sites List */}
      {viewMode === 'summary' ? (
        <>
          {/* Main Summary Header */}
          <header id="dashboard-view-header" className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-border-main gap-4">
            <div id="dashboard-title-and-lead" className="space-y-1 text-left">
              <h1 id="dashboard-top-heading" className="text-4xl font-serif text-ink tracking-tight font-normal">Dashboard</h1>
              <p id="dashboard-sub-heading" className="text-sm text-ink-secondary">Welcome back to your Lunao command center.</p>
            </div>
            <div id="dashboard-actions-header" className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-white px-3 py-2 rounded border border-border-main text-xs text-ink-secondary font-medium font-sans shadow-3xs">
                <Calendar className="w-4 h-4 text-ink-secondary" />
                <span>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
              <button
                id="header-create-campaign-btn"
                onClick={() => {
                  handleNavClick('create-campaign', () => setActiveTab('campaigns'));
                }}
                className={`group flex items-center gap-2 bg-white px-3 py-2 rounded border border-border-main text-xs text-ink hover:text-accent hover:border-accent font-sans font-semibold uppercase tracking-wider transition-all cursor-pointer shadow-3xs ${
                  animatingBtn === 'create-campaign' ? 'scale-95' : ''
                }`}
              >
                <Plus className="w-4 h-4 text-accent transition-transform duration-300 group-hover:rotate-90" />
                <span>Launch</span>
              </button>
            </div>
          </header>

          {/* Metrics Row (Exactly 2 clickable cards, clean and clickable) */}
          <div id="metrics-card-row-grid" className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Sites Generated Card -> Opens Deployed Sites directory list */}
            <button
              id="metric-card-sites"
              onClick={() => {
                handleNavClick('sites-generated', () => setViewMode('deployed-sites'));
              }}
              className={`group relative bg-white rounded-[16px] p-6 text-left border shadow-[0_4px_16px_rgba(37,99,235,0.02)] transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent overflow-hidden isolate ${
                animatingBtn === 'sites-generated'
                  ? 'duration-[300ms] ease-out scale-[0.98] translate-y-[2px] shadow-sm border-accent bg-off-white'
                  : 'duration-[500ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1.5 hover:shadow-[0_16px_32px_rgba(37,99,235,0.06)] border-border-light hover:border-accent/30 active:scale-[0.96] active:translate-y-[2px] active:shadow-[0_4px_12px_rgba(37,99,235,0.1),0_0_0_5px_rgba(37,99,235,0.08)] active:border-accent active:duration-[100ms]'
              }`}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-accent/5 to-transparent opacity-0 group-hover:opacity-100 group-active:opacity-100 group-active:duration-100 transition-opacity duration-500 ease-out -z-10 rounded-[16px]"></div>
              <div className="flex items-center justify-between text-ink-secondary text-xs font-semibold uppercase tracking-wider mb-2">
                <span>Sites Generated</span>
                <ChevronRight className="w-4 h-4 text-ink-tertiary group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
              </div>
              <div className="text-5xl font-serif text-ink tracking-tight leading-none mt-3">
                {totalSites.toLocaleString()}
              </div>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border-light">
                <span className="text-[11px] text-ink-secondary">Real-time local web deployments</span>
                <span className="text-[11px] text-accent font-bold uppercase tracking-wider group-hover:underline">View Deployed Sites Directory →</span>
              </div>
            </button>

            {/* SMS Sent Card -> Redirects to the SMS Outreach section */}
            <button
              id="metric-card-sms"
              onClick={() => {
                handleNavClick('sms-sent', () => setActiveTab('messages'));
              }}
              className={`group relative bg-white rounded-[16px] p-6 text-left border shadow-[0_4px_16px_rgba(37,99,235,0.02)] transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent overflow-hidden isolate ${
                animatingBtn === 'sms-sent'
                  ? 'duration-[300ms] ease-out scale-[0.98] translate-y-[2px] shadow-sm border-accent bg-off-white'
                  : 'duration-[500ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1.5 hover:shadow-[0_16px_32px_rgba(37,99,235,0.06)] border-border-light hover:border-accent/30 active:scale-[0.96] active:translate-y-[2px] active:shadow-[0_4px_12px_rgba(37,99,235,0.1),0_0_0_5px_rgba(37,99,235,0.08)] active:border-accent active:duration-[100ms]'
              }`}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-accent/5 to-transparent opacity-0 group-hover:opacity-100 group-active:opacity-100 group-active:duration-100 transition-opacity duration-500 ease-out -z-10 rounded-[16px]"></div>
              <div className="flex items-center justify-between text-ink-secondary text-xs font-semibold uppercase tracking-wider mb-2">
                <span>SMS Sent</span>
                <ChevronRight className="w-4 h-4 text-ink-tertiary group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
              </div>
              <div className="text-5xl font-serif text-ink tracking-tight leading-none mt-3 flex items-baseline gap-2">
                {totalSms.toLocaleString()}
                <span className="text-[10px] font-sans font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700">SMS Coming Soon</span>
              </div>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border-light">
                <span className="text-[11px] text-ink-secondary">Real SMS activates once Telnyx is funded</span>
                <span className="text-[11px] text-accent font-bold uppercase tracking-wider group-hover:underline">View Messaging Center →</span>
              </div>
            </button>

          </div>

          {/* Main Grid Content: Table */}
          <div id="dashboard-one-column-layout" className="space-y-4">
            
            {/* Table Column (Full Width) */}
            <div id="dashboard-campaigns-table-container" className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 id="recent-campaigns-section-title" className="text-xl font-serif text-ink tracking-tight">Recent Campaigns</h2>
                <button 
                  id="view-all-campaigns-link"
                  onClick={() => setActiveTab('campaigns')}
                  className="text-xs font-bold uppercase tracking-wide text-accent hover:text-accent-hover flex items-center gap-1 cursor-pointer"
                >
                  <span>Manage all campaigns</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="bg-white rounded-lg border border-border-main overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table id="campaigns-list-table" className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-off-white border-b border-border-light text-[10px] font-semibold text-ink-secondary uppercase tracking-wider">
                        <th className="py-3 px-4">Campaign Title</th>
                        <th className="py-3 px-4">Niche Focus</th>
                        <th className="py-3 px-3 text-center">🔍 Leads</th>
                        <th className="py-3 px-3 text-center">🌐 Sites</th>
                        <th className="py-3 px-3 text-center">✉️ SMS</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-right">Registered</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-light text-sm text-ink font-sans">
                      {campaigns.slice(0, 5).map((campaign) => (
                        <tr key={campaign.id} className="hover:bg-off-white/30 transition-colors group">
                          <td className="py-3 px-4 font-semibold max-w-[180px] truncate">{campaign.name}</td>
                          <td className="py-3 px-4">
                            <span className="inline-flex px-1.5 py-0.5 rounded bg-surface text-ink text-xs font-medium">
                              {campaign.niche}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center font-mono text-xs text-ink">{campaign.leadsFound || Math.floor(campaign.sites * 1.2)}</td>
                          <td className="py-3 px-3 text-center font-mono text-xs text-ink">{campaign.sites}</td>
                          <td className="py-3 px-3 text-center font-mono text-xs text-ink">{campaign.smsSent}</td>
                          <td className="py-3 px-4 text-center">
                            {isWaitingForLast(campaign.id) ? (
                              <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-800 border border-amber-500/15" title="Waiting for prior campaign to finish outreach">
                                Queued
                              </span>
                            ) : (
                              <div className="flex flex-col items-center gap-1">
                                <span 
                                  className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getStatusStyle(campaign.status)}`}
                                >
                                  {campaign.status}
                                </span>
                                {campaign.status === 'Crashed' && campaign.errorReason && (
                                  <span className="text-[9px] text-danger font-medium leading-tight max-w-[150px] truncate" title={campaign.errorReason}>
                                    {campaign.errorReason}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right text-xs text-ink-secondary font-mono">
                            {campaign.createdAt}
                          </td>
                        </tr>
                      ))}
                      {campaigns.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-ink-secondary text-sm">
                            No active campaigns. Click "+ New Campaign" to get started.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </div>
        </>
      ) : (
        /* DEPLOYED SITES SUB-VIEW / DIRECTORY */
        <div id="deployed-sites-section-wrapper" className="space-y-6 animate-fade-in text-left">
          
          {/* Header Action Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-border-main gap-4">
            <div className="space-y-1.5">
              <button 
                onClick={() => setViewMode('summary')}
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-secondary hover:text-ink transition-colors pb-1 group cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                <span>Back to Dashboard</span>
              </button>
              <h1 className="text-3xl font-serif text-ink tracking-tight font-normal">Deployed Sites Directory</h1>
              <p className="text-xs text-ink-secondary">Review live layout previews, source marketing campaigns, and business contact phone numbers.</p>
            </div>

            {/* Searching form */}
            <div className="relative w-full sm:max-w-xs shrink-0">
              <Search className="w-3.5 h-3.5 text-ink-tertiary absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search name, phone, niche..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-border-main rounded text-xs text-ink placeholder:text-ink-tertiary focus:ring-1 focus:ring-accent focus:outline-none shadow-3xs font-sans"
              />
            </div>
          </div>

          {/* Table list - Desktop Layout */}
          <div className="bg-white rounded-lg border border-border-main overflow-hidden shadow-sm hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-off-white border-b border-border-main text-ink-secondary text-[10px] font-sans font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Business / Barber Name</th>
                    <th className="py-3 px-4">Source Marketing Campaign</th>
                    <th className="py-3 px-4">Contact Phone</th>
                    <th className="py-3 px-4">Deployed Site Preview Link</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light text-xs text-ink font-sans">
                  {filteredDeployed.map((biz) => {
                    const campaignName = getCampaignForBusiness(biz);
                    return (
                      <tr key={biz.id} className="hover:bg-off-white/50 transition-colors group">
                        {/* Barber Title & Owner */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-ink text-sm">{biz.name}</div>
                          <div className="text-[10px] text-ink-secondary">Owner: {biz.owner || 'Representative'}</div>
                        </td>
                        
                        {/* Deployment Campaign */}
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-ink">{campaignName}</div>
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-accent-soft text-accent text-[9px] font-bold uppercase mt-0.5">
                            {biz.niche}
                          </span>
                        </td>
                        
                        {/* Representative phone */}
                        <td className="py-3.5 px-4">
                          <div className="font-mono text-xs text-ink-secondary flex items-center gap-1.5">
                            <Phone className="w-3 h-3 text-ink-tertiary" />
                            <span>{biz.phone}</span>
                          </div>
                          <span className="text-[9px] text-ink-tertiary font-sans block mt-0.5">{biz.city}</span>
                        </td>

                        {/* Live Site Preview URL */}
                        <td className="py-3.5 px-4 font-mono text-[11px] max-w-[260px] truncate">
                          <div className="flex items-center gap-2">
                            <a 
                              href={biz.siteUrl} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="text-accent underline hover:text-accent-hover truncate flex items-center gap-1 font-medium"
                            >
                              <Globe className="w-3.5 h-3.5 inline text-accent/70 shrink-0" />
                              <span>{biz.siteUrl ? biz.siteUrl.replace(/^https?:\/\//, '') : `${biz.slug}.lunao.io`}</span>
                            </a>
                            
                            <button
                              onClick={(e) => handleCopyUrl(e, biz.id, biz.siteUrl)}
                              title="Copy layout link to clipboard"
                              className="p-1 rounded bg-off-white hover:bg-surface border border-border-main transition-colors cursor-pointer inline-flex items-center shrink-0"
                            >
                              {copiedId === biz.id ? (
                                <Check className="w-3 h-3 text-success" />
                              ) : (
                                <Copy className="w-3 h-3 text-ink-secondary" />
                              )}
                            </button>
                            {copiedId === biz.id && (
                              <span className="text-[10px] text-success font-semibold shrink-0">Copied!</span>
                            )}
                          </div>
                        </td>

                        {/* Status Badge */}
                        <td className="py-3.5 px-4 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                            biz.siteStatus === 'Converted' ? 'bg-success-soft text-success border border-success/20' :
                            biz.siteStatus === 'SMS sent' ? 'bg-accent-soft text-accent border border-accent/20' :
                            'bg-warning-soft text-warning border border-warning/10'
                          }`}>
                            ✓ {biz.siteStatus}
                          </span>
                        </td>

                        {/* Open Website Button */}
                        <td className="py-3.5 px-4 text-right">
                          <a
                            href={biz.siteUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-off-white hover:bg-surface border border-border-main text-[11px] font-bold text-ink rounded shadow-3xs cursor-pointer"
                          >
                            <span>Visit Site</span>
                            <ExternalLink className="w-3 h-3 text-ink-secondary" />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredDeployed.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-ink-secondary text-sm font-sans">
                        No deployed sites fit your searching filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cards list - Mobile Layout Grid */}
          <div className="grid grid-cols-1 gap-4 md:hidden">
            {filteredDeployed.map(biz => {
              const campaignName = getCampaignForBusiness(biz);
              return (
                <div key={biz.id} className="bg-white rounded-lg p-5 border border-border-main shadow-2xs space-y-4">
                  
                  {/* Top Name Block */}
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-base font-bold text-ink leading-tight">{biz.name}</h3>
                      <p className="text-[11px] text-ink-secondary mt-0.5">Owner: {biz.owner || 'Representative'}</p>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                      biz.siteStatus === 'Converted' ? 'bg-success-soft text-success border border-success/20' :
                      biz.siteStatus === 'SMS sent' ? 'bg-accent-soft text-accent border border-accent/20' :
                      'bg-warning-soft text-warning border border-warning/10'
                    }`}>
                      {biz.siteStatus}
                    </span>
                  </div>

                  {/* Metadata information block */}
                  <div className="bg-off-white p-3 rounded space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-ink-secondary">Campaign:</span>
                      <span className="font-semibold text-ink">{campaignName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-secondary">Niche:</span>
                      <span className="font-semibold text-accent uppercase text-[10px] tracking-wider">{biz.niche}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-secondary">Phone:</span>
                      <span className="font-mono text-ink font-medium">{biz.phone}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-secondary">City:</span>
                      <span className="text-ink">{biz.city}</span>
                    </div>
                  </div>

                  {/* Links and URL with Copy action code */}
                  <div className="flex flex-col gap-2 pt-2 border-t border-border-light">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <a 
                        href={biz.siteUrl} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="text-accent underline truncate font-medium flex items-center gap-1"
                      >
                        <Globe className="w-3.5 h-3.5 text-accent/70 shrink-0" />
                        <span className="truncate">{biz.siteUrl ? biz.siteUrl.replace(/^https?:\/\//, '') : `${biz.slug}.lunao.io`}</span>
                      </a>
                      
                      <button
                        onClick={(e) => handleCopyUrl(e, biz.id, biz.siteUrl)}
                        className="flex items-center gap-1 px-2 py-1 bg-off-white hover:bg-surface border border-border-main rounded text-xs cursor-pointer shrink-0"
                      >
                        {copiedId === biz.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-success" />
                            <span className="text-[10px] text-success font-semibold">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-ink-secondary" />
                            <span className="text-[10px]">Copy</span>
                          </>
                        )}
                      </button>
                    </div>

                    <a
                      href={biz.siteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full text-center py-2 bg-accent hover:bg-accent-hover text-white text-xs font-bold uppercase tracking-wider rounded shadow-3xs cursor-pointer flex items-center justify-center gap-1 mt-1"
                    >
                      <span>Visit Site Preview</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                </div>
              );
            })}
            {filteredDeployed.length === 0 && (
              <div className="text-center py-8 text-ink-secondary text-xs">
                No matching deployed sites.
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
};
