import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, Send, Inbox, AlertTriangle, CheckCircle2, 
  Trash2, Search, Building2, ExternalLink, Minimize2, Maximize2, 
  User, Sparkles, Check, CheckCheck, Landmark, ChevronRight, X, ArrowUpRight
} from 'lucide-react';
import { Business, SidebarTab } from '../types';

interface MessagesProps {
  businesses: Business[];
  setBusinesses: React.Dispatch<React.SetStateAction<Business[]>>;
  setActiveTab: (tab: SidebarTab) => void;
  // Trigger a billing subtab auto-focus if possible
}

export const Messages: React.FC<MessagesProps> = ({ 
  businesses, 
  setBusinesses, 
  setActiveTab 
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBiz, setSelectedBiz] = useState<Business | null>(null);
  const [newMessageText, setNewMessageText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-select first interaction on desktop
  useEffect(() => {
    if (window.innerWidth >= 1024 && businesses.length > 0 && !selectedBiz) {
      setSelectedBiz(businesses[0]);
    }
  }, [businesses, selectedBiz]);

  // Auto-scroll chat to bottom when chat updates
  useEffect(() => {
    if (chatEndRef.current) {
      const container = chatEndRef.current.parentElement;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [selectedBiz?.smsHistory]);

  // Scroll main flow container to the top on mount and selection change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    const workspaceEl = document.getElementById('messages-tab-root-container');
    if (workspaceEl) {
      workspaceEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const mainEl = document.getElementById('main-content-flow');
    if (mainEl) {
      mainEl.scrollTop = 0;
    }
  }, [selectedBiz?.id]);

  const playClickSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContext();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
      console.log('Audio disabled in this environment');
    }
  };

  // Clean filters
  const filteredBusinesses = businesses.filter(biz => {
    const term = searchQuery.toLowerCase();
    return (
      biz.name.toLowerCase().includes(term) ||
      biz.owner.toLowerCase().includes(term) ||
      biz.niche.toLowerCase().includes(term) ||
      biz.phone.includes(searchQuery)
    );
  });

  // Toggle delivery status simulation or click status action buttons
  const toggleStatusDirect = (bizId: string, type: 'sent' | 'delivered' | 'received') => {
    setBusinesses(prev => prev.map(b => {
      if (b.id === bizId) {
        let updatedStatus = b.siteStatus;
        if (type === 'sent') updatedStatus = 'SMS sent';
        if (type === 'delivered') updatedStatus = 'SMS sent'; // same channel
        if (type === 'received') updatedStatus = 'Converted'; // reply is received, leads to conversion!
        return {
          ...b,
          siteStatus: updatedStatus
        };
      }
      return b;
    }));
  };

  // Send a message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBiz || !newMessageText.trim()) return;

    const timestampStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const newEntry = {
      text: newMessageText,
      timestamp: timestampStr,
      type: 'outgoing' as const
    };

    // Update history
    setBusinesses(prev => prev.map(b => {
      if (b.id === selectedBiz.id) {
        return {
          ...b,
          siteStatus: 'SMS sent' as const,
          smsHistory: [...b.smsHistory, newEntry]
        };
      }
      return b;
    }));

    // Select the updated business to refresh messages text pane
    const updatedHistoryOfBiz = [...selectedBiz.smsHistory, newEntry];
    setSelectedBiz(prev => prev ? { 
      ...prev, 
      siteStatus: 'SMS sent' as const, 
      smsHistory: updatedHistoryOfBiz 
    } : null);

    setNewMessageText('');

    // Simulate auto-reply received event in 2.5 seconds if they haven't run out.
    setTimeout(() => {
      const incomingReply = {
        text: `Hey! Thanks for building this. Your automatic preview at ${selectedBiz.slug}.lunao.io looks great. Can we hop on a quick call?`,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
        type: 'incoming' as const
      };

      setBusinesses(prev => prev.map(b => {
        if (b.id === selectedBiz.id) {
          return {
            ...b,
            siteStatus: 'Converted' as const, // Received response means Converted!
            smsHistory: [...b.smsHistory, incomingReply]
          };
        }
        return b;
      }));

      // If active selection is still this business, update active pane
      setSelectedBiz(prev => {
        if (prev && prev.id === selectedBiz.id) {
          return {
            ...prev,
            siteStatus: 'Converted' as const,
            smsHistory: [...prev.smsHistory, incomingReply]
          };
        }
        return prev;
      });
    }, 2500);
  };

  // Render chat list item status icons helper
  const renderItemStatusIndicators = (biz: Business) => {
    const hasIncoming = biz.smsHistory.some(m => m.type === 'incoming');
    const isSent = biz.smsHistory.some(m => m.type === 'outgoing');

    return (
      <div className="flex gap-2 items-center">
        {/* Sent/Delivered Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleStatusDirect(biz.id, 'sent');
          }}
          title="Toggle message Sent and Delivered confirmation state"
          className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer select-none transition-all ${
            isSent || biz.siteStatus === 'SMS sent' || biz.siteStatus === 'Converted'
              ? 'bg-success-soft text-success border border-success/10'
              : 'bg-off-white text-ink-secondary border border-border-main'
          }`}
        >
          <CheckCheck className="w-3 h-3 shrink-0" />
          <span>Sent & Deliv.</span>
        </button>

        {/* Received Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleStatusDirect(biz.id, 'received');
          }}
          title="Toggle customer Reply Received conversion state"
          className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer select-none transition-all ${
            hasIncoming || biz.siteStatus === 'Converted'
              ? 'bg-accent-soft text-accent border border-accent/15'
              : 'bg-off-white text-ink-secondary border border-border-main'
          }`}
        >
          <Inbox className="w-3 h-3 shrink-0" />
          <span>Received</span>
        </button>
      </div>
    );
  };

  return (
    <div id="messages-tab-root-container" className="space-y-6 animate-fade-in font-sans text-left">
      
      <div className="bg-white border border-border-main rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-xl font-serif text-ink tracking-tight">SMS Outreach</h2>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700">Real SMS — Coming Soon</span>
        </div>
        <p className="text-sm text-ink-secondary leading-relaxed">Sites deploy live today. Real SMS delivery via Telnyx activates as soon as the account is funded — queued messages will send automatically.</p>
      </div>

      {/* Main split viewport workspace: left list, right detail info */}
      <div id="messages-workspace" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start relative pb-10">
        
        {/* Main Side: Business list */}
        <div className={`col-span-1 lg:col-span-7 space-y-4 ${selectedBiz ? 'hidden lg:block' : 'block'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 border border-border-main rounded-lg shadow-2xs">
            {/* Search Input block */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-ink-tertiary absolute left-3.5 top-2.5" />
              <input
                type="text"
                placeholder="Search business names, contacts, categories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-border-main rounded pl-10 pr-4 py-2 text-xs focus:ring-1 focus:ring-accent focus:outline-none placeholder:text-ink-tertiary font-sans"
              />
            </div>
            <div className="text-[11px] text-ink-secondary font-medium shrink-0">
              Showing <span className="font-bold text-ink">{filteredBusinesses.length}</span> of {businesses.length} businesses
            </div>
          </div>

          {/* Table index container */}
          <div className="bg-white border border-border-main rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="bg-off-white border-b border-border-main text-ink-secondary text-[10px] font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Business Info</th>
                    <th className="py-3 px-4">Campaign</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Chat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light text-xs font-sans">
                  {filteredBusinesses.map(biz => {
                    const matchedCampName = `${biz.city ? biz.city.split(',')[0] + ' ' : ''}${biz.niche} Outreach`;
                    const isSelected = selectedBiz?.id === biz.id;

                    return (
                      <tr 
                        key={biz.id}
                        onClick={() => {
                          playClickSound();
                          setSelectedBiz(biz);
                        }}
                        className={`transition-colors cursor-pointer ${
                          isSelected ? 'bg-accent-soft/30' : 'hover:bg-off-white/40'
                        }`}
                      >
                        {/* Name and Phone */}
                        <td className="py-4 px-4 w-2/5">
                          <div className="font-bold text-sm text-ink truncate max-w-[150px]">{biz.name}</div>
                          <div className="text-[10px] text-ink-secondary flex items-center gap-1 mt-0.5">
                            <User className="w-3 h-3 text-ink-tertiary shrink-0" />
                            <span className="truncate max-w-[120px]">{biz.owner || 'Rep'} · <span className="font-mono text-ink">{biz.phone}</span></span>
                          </div>
                        </td>

                        {/* Niche & Campaign name */}
                        <td className="py-4 px-4 text-ink-secondary w-1/4">
                          <div className="font-medium text-ink truncate max-w-[120px]">{matchedCampName}</div>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface text-ink text-[9px] font-bold uppercase mt-1">
                            {biz.niche}
                          </span>
                        </td>

                        {/* Two buttons representing the status metrics */}
                        <td className="py-4 px-4 text-center w-1/4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-col gap-2 items-center">
                            {renderItemStatusIndicators(biz)}
                          </div>
                        </td>

                        {/* Chat Launcher Trigger */}
                        <td className="py-4 px-4 text-right w-[10%]">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playClickSound();
                              setSelectedBiz(biz);
                              if (window.innerWidth < 1024) {
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                document.getElementById('messages-tab-root-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }
                            }}
                            className={`p-2 rounded-full border shadow-3xs transition-transform active:scale-95 flex items-center justify-center ml-auto ${
                              isSelected 
                                ? 'bg-accent text-white border-accent' 
                                : 'bg-off-white hover:bg-surface text-ink hover:text-accent border-border-main'
                            }`}
                          >
                            <MessageSquare className="w-4 h-4 shrink-0" />
                          </button>
                        </td>

                      </tr>
                    );
                  })}
                  {filteredBusinesses.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-ink-secondary text-xs">
                        No targets matched your search filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Chat Thread Panel */}
        {selectedBiz && (
          <div className={`col-span-1 lg:col-span-5 flex flex-col h-[calc(100vh-140px)] min-h-[500px] bg-white border border-border-main rounded-xl shadow-sm lg:sticky top-6 z-10 ${selectedBiz ? 'block' : 'hidden lg:block'}`}>
            
            {/* Header */}
            <div className="p-4 border-b border-border-light flex items-center justify-between bg-off-white rounded-t-xl shrink-0">
              <div className="flex items-center gap-3">
                <button 
                  className="lg:hidden p-1.5 -ml-1.5 text-ink-secondary hover:text-ink hover:bg-border-light rounded-md transition-colors"
                  onClick={() => setSelectedBiz(null)}
                >
                  <ChevronRight className="w-5 h-5 rotate-180" />
                </button>
                <div className="w-10 h-10 rounded-full bg-accent-soft text-accent border border-accent/20 flex flex-col items-center justify-center shrink-0 shadow-sm">
                  <span className="font-bold text-lg leading-none">{selectedBiz.name.charAt(0)}</span>
                </div>
                <div>
                  <h3 className="font-bold text-ink text-sm leading-tight truncate max-w-[160px] sm:max-w-[200px]">{selectedBiz.name}</h3>
                  <p className="text-[11px] text-ink-secondary mt-0.5 font-medium truncate max-w-[160px] sm:max-w-[200px]">
                    <span className="font-mono">{selectedBiz.phone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3')}</span>
                  </p>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                {/* External link removed */}
              </div>
            </div>

            {/* Messages Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-off-white/30 scrollbar-thin scrollbar-thumb-border-main scrollbar-track-transparent">
              {selectedBiz.smsHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-ink-secondary select-none">
                  <div className="w-12 h-12 rounded-full bg-surface border border-border-main flex items-center justify-center mb-3">
                    <MessageSquare className="w-5 h-5 text-ink-tertiary" />
                  </div>
                  <p className="text-xs text-center max-w-[200px] font-medium text-ink-tertiary">No messages yet.<br/>Send a preview link to begin.</p>
                </div>
              ) : (
                selectedBiz.smsHistory.map((msg, idx) => {
                  const isOut = msg.type === 'outgoing';
                  return (
                    <div key={idx} className={`flex ${isOut ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                      <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-[13px] shadow-sm ${
                        isOut 
                          ? 'bg-accent text-white rounded-br-sm' 
                          : 'bg-white border border-border-main text-ink rounded-bl-sm'
                      }`}>
                        <p className="whitespace-pre-wrap leading-relaxed font-medium">{msg.text}</p>
                        <div className={`text-[10px] mt-2 flex items-center gap-1 ${isOut ? 'text-white/70 justify-end' : 'text-ink-tertiary justify-start'}`}>
                          <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                          {isOut && <CheckCheck className="w-3.5 h-3.5" />}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 sm:p-4 border-t border-border-light bg-white rounded-b-xl shrink-0">
              <form onSubmit={handleSendMessage} className="flex gap-2 relative">
                <textarea
                  value={newMessageText}
                  onChange={(e) => setNewMessageText(e.target.value)}
                  placeholder="Type an SMS..."
                  className="flex-1 bg-surface border border-border-main rounded-xl px-4 py-3 min-h-[50px] max-h-[120px] text-[13px] font-medium focus:outline-none focus:ring-1 focus:ring-accent resize-none placeholder:text-ink-tertiary scrollbar-thin"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={!newMessageText.trim()}
                  className="self-end p-3.5 shadow-sm bg-accent hover:bg-accent-hover active:scale-95 text-white rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0 flex items-center justify-center cursor-pointer"
                >
                  <Send className="w-4 h-4 ml-0.5" />
                </button>
              </form>
              <div className="text-[10px] text-amber-700 text-center mt-3 flex items-center justify-center gap-1.5 font-bold uppercase tracking-wider">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Real SMS via Telnyx — Coming Soon (queued until funded)</span>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};
