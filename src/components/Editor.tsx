import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Code2, ArrowLeft, Save, UploadCloud, Image as ImageIcon,
  Send, Monitor, Smartphone, Wand2, Loader2, ExternalLink, X,
  Rocket, AlertCircle, Pencil, CheckCircle2, Link2,
  Globe, Copy, Eye, Search, RefreshCw, Clock,
  Puzzle, MessageCircle, UserPlus,
} from 'lucide-react';
import {
  listSites, getSiteHtml, saveSiteHtml, deploySite, streamAiEdit,
  getAddons, setAddons, SiteAddons,
  EditorSite, AiChatMessage,
  listInviteCodes, InviteCode,
} from '../lib/pipelineClient';
import {
  playSoftTap, playTiktokLike, playSlideTick, playDialogPop, playSoftBubble,
  playElegantBell, playConfirmSuccess, playVictoryCelebration, playGentleChime,
  playElegantError, playCancelTone,
} from '../utils/audio';
import { InviteClientDrawer } from './InviteClientDrawer';

interface EditorProps {
  active: boolean;
}

type Toast = { type: 'success' | 'error' | 'info'; text: string } | null;

// Human-friendly "updated" label for site cards.
function relTime(ms: number | null): string {
  if (!ms) return 'recently';
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

function monogram(title: string): string {
  const clean = title.replace(/[^a-zA-Z0-9 ]/g, '').trim();
  return (clean.charAt(0) || 'S').toUpperCase();
}

// Curated, intentional sound design for the Site Editor so every interaction
// feels distinctly "Lunao". Each semantic event maps to one consistent tone:
//   tap     — light navigation/secondary press (soft tactile)
//   toggle  — switching a view/mode (mechanical tick)
//   open    — a panel/modal/screen opens (upward pop)
//   engage  — entering edit mode (satisfying bubble)
//   primary — energetic primary action (TikTok-like double pop)
//   copy    — something copied (crystalline bell)
//   swap    — an image is replaced (organic bubble)
//   saved   — save succeeded (bright confirm chord)
//   deployed— site went live (cascading celebration)
//   aiDone  — AI finished writing (gentle chime)
//   error   — something failed (warm double low pulse)
//   close   — dismiss/cancel (downward tone)
const sfx = {
  tap: playSoftTap,
  toggle: playSlideTick,
  open: playDialogPop,
  engage: playSoftBubble,
  primary: playTiktokLike,
  copy: playElegantBell,
  swap: playSoftBubble,
  saved: playConfirmSuccess,
  deployed: playVictoryCelebration,
  aiDone: () => playGentleChime(3),
  error: playElegantError,
  close: playCancelTone,
};

export const Editor: React.FC<EditorProps> = ({ active }) => {
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [sites, setSites] = useState<EditorSite[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [listLoaded, setListLoaded] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selected, setSelected] = useState<EditorSite | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [loadingSite, setLoadingSite] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [editMode, setEditMode] = useState(false);
  // On mobile only one panel is visible at a time (segmented switch).
  const [mobileTab, setMobileTab] = useState<'chat' | 'preview'>('preview');
  const [saving, setSaving] = useState(false);

  // First-page filtering (real, runs over the loaded sites).
  const [search, setSearch] = useState('');
  const [filterNiche, setFilterNiche] = useState('All');
  const [deploying, setDeploying] = useState(false);
  const [deployInfo, setDeployInfo] = useState<{ url: string; deployUrl: string | null; dryRun: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  // Image edit panel
  const [imgPanel, setImgPanel] = useState(false);
  const [imgUrl, setImgUrl] = useState('');
  const selectedImgRef = useRef<HTMLImageElement | null>(null);

  // Add-ons (booking chatbot)
  const [addonsPanel, setAddonsPanel] = useState(false);
  const [addons, setAddonsState] = useState<SiteAddons>({ booking: false, chatbot: false });
  const [addonBusy, setAddonBusy] = useState<null | 'chatbot'>(null);

  // Invite client (per-site LUNAO-XXXX-XXXX codes)
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [inviteRefreshKey, setInviteRefreshKey] = useState(0);

  // AI chat
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [streaming, setStreaming] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const htmlRef = useRef('');
  const lastPreviewPush = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const flashToast = (t: Toast) => {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 3500);
  };

  // ---- list loading --------------------------------------------------------
  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const { sites: s, aiEnabled: ai } = await listSites();
      setSites(s);
      setAiEnabled(ai);
      setListLoaded(true);
    } catch (err: any) {
      setListError(err?.message || 'Could not load your deployed sites.');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active && !listLoaded && !listLoading) loadList();
  }, [active, listLoaded, listLoading, loadList]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  // ---- invite codes loading ----------------------------------------------
  const loadInviteCodes = useCallback(async (s: string) => {
    try {
      const list = await listInviteCodes(s);
      setInviteCodes(list);
    } catch {
      setInviteCodes([]);
    }
  }, []);

  useEffect(() => {
    if (selected) loadInviteCodes(selected.slug);
  }, [selected, inviteRefreshKey, loadInviteCodes]);

  // Refresh the active-count badge whenever the drawer closes
  // (it may have created/revoked codes inside).
  const activeInviteCount = inviteCodes.filter((c) => !c.revokedAt).length;

  // ---- open / load a single site ------------------------------------------
  const openSite = async (site: EditorSite) => {
    sfx.open();
    setSelected(site);
    setView('edit');
    setLoadingSite(true);
    setMessages([]);
    setEditMode(false);
    setMobileTab('preview');
    setImgPanel(false);
    setAddonsPanel(false);
    setDeployInfo(null);
    setDirty(false);
    try {
      const html = await getSiteHtml(site.slug);
      htmlRef.current = html;
      setPreviewHtml(html);
      getAddons(site.slug)
        .then((a) => setAddonsState(a))
        .catch(() => setAddonsState({ booking: false, chatbot: false }));
    } catch (err: any) {
      flashToast({ type: 'error', text: err?.message || 'Failed to load site HTML.' });
      setView('list');
    } finally {
      setLoadingSite(false);
    }
  };

  const backToList = () => {
    sfx.close();
    setView('list');
    setSelected(null);
    setPreviewHtml('');
    htmlRef.current = '';
    setImgPanel(false);
    selectedImgRef.current = null;
  };

  // ---- iframe wiring -------------------------------------------------------
  // Read the live DOM (with inline edits) back into our canonical html string.
  const syncFromIframe = useCallback((): string => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || !doc.documentElement) return htmlRef.current;
    const html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
    htmlRef.current = html;
    return html;
  }, []);

  const applyEditModeToDoc = useCallback((on: boolean) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    try {
      doc.designMode = on ? 'on' : 'off';
    } catch { /* ignore */ }

    const imgs = Array.from(doc.images || []);
    imgs.forEach((img) => {
      (img as HTMLImageElement).style.outline = on ? '2px dashed rgba(37,99,235,0.6)' : '';
      (img as HTMLImageElement).style.cursor = on ? 'pointer' : '';
    });
  }, []);

  const handleImgClick = useCallback((e: Event) => {
    const target = e.target as HTMLElement;
    if (target && target.tagName === 'IMG') {
      e.preventDefault();
      e.stopPropagation();
      selectedImgRef.current = target as HTMLImageElement;
      setImgUrl((target as HTMLImageElement).getAttribute('src') || '');
      setImgPanel(true);
      sfx.open();
    }
  }, []);

  const onIframeLoad = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    // Track edits to mark the site dirty.
    doc.addEventListener('input', () => setDirty(true));
    doc.addEventListener('click', handleImgClick, true);
    applyEditModeToDoc(editMode);
  };

  useEffect(() => {
    applyEditModeToDoc(editMode);
    if (!editMode) setImgPanel(false);
  }, [editMode, previewHtml, applyEditModeToDoc]);

  const toggleEditMode = () => {
    // Editing only makes sense over the live preview.
    setMobileTab('preview');
    setEditMode((v) => {
      if (v) sfx.tap(); else sfx.engage();
      return !v;
    });
  };

  // ---- image replace -------------------------------------------------------
  const applyImageUrl = () => {
    if (selectedImgRef.current && imgUrl.trim()) {
      selectedImgRef.current.src = imgUrl.trim();
      setDirty(true);
      sfx.swap();
      flashToast({ type: 'success', text: 'Image updated from URL.' });
      setImgPanel(false);
    }
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedImgRef.current) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (selectedImgRef.current && typeof reader.result === 'string') {
        selectedImgRef.current.src = reader.result; // data URI embeds the image
        setDirty(true);
        sfx.swap();
        flashToast({ type: 'success', text: 'Image uploaded & embedded.' });
        setImgPanel(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ---- save / deploy -------------------------------------------------------
  const handleSave = async () => {
    if (!selected) return;
    sfx.tap();
    const html = syncFromIframe();
    setSaving(true);
    try {
      await saveSiteHtml(selected.slug, html);
      setDirty(false);
      sfx.saved();
      flashToast({ type: 'success', text: 'Changes saved.' });
    } catch (err: any) {
      sfx.error();
      flashToast({ type: 'error', text: err?.message || 'Save failed.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeploy = async () => {
    if (!selected) return;
    sfx.primary();
    const html = syncFromIframe();
    setDeploying(true);
    try {
      const { url } = await deploySite(selected.slug, html);
      setDirty(false);
      // The clean, stable public URL is where the edited site now lives.
      setDeployInfo({ url: selected.url, deployUrl: url, dryRun: !url });
      sfx.deployed();
    } catch (err: any) {
      sfx.error();
      flashToast({ type: 'error', text: err?.message || 'Deploy failed.' });
    } finally {
      setDeploying(false);
    }
  };

  const copyDeployUrl = () => {
    if (!deployInfo) return;
    navigator.clipboard.writeText(deployInfo.url);
    sfx.copy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ---- Add-ons (booking + chatbot) -----------------------------------------
  const toggleAddon = async (kind: 'chatbot') => {
    if (!selected || addonBusy) return;
    sfx.toggle();
    const next: SiteAddons = { ...addons, [kind]: !addons[kind] };
    setAddonBusy(kind);
    try {
      // Persist any in-progress inline edits first so the widget injects on top
      // of the latest version, then re-inject/remove the widget block.
      const current = syncFromIframe();
      await saveSiteHtml(selected.slug, current);
      const { addons: applied, html: newHtml } = await setAddons(selected.slug, next);
      setAddonsState(applied);
      htmlRef.current = newHtml;
      setPreviewHtml(newHtml);
      setDirty(true);
      sfx.saved();
      flashToast({
        type: 'success',
        text: `Booking chatbot ${next[kind] ? 'enabled' : 'removed'} — Redeploy to push live.`,
      });
    } catch (err: any) {
      sfx.error();
      flashToast({ type: 'error', text: err?.message || 'Could not update add-ons.' });
    } finally {
      setAddonBusy(null);
    }
  };

  // ---- AI chat -------------------------------------------------------------
  const sendAi = async () => {
    const instruction = chatInput.trim();
    if (!instruction || streaming) return;
    if (!aiEnabled) {
      sfx.error();
      flashToast({ type: 'error', text: 'AI editor needs an Anthropic key on the server.' });
      return;
    }
    sfx.tap();
    const baseHtml = syncFromIframe();
    const history = messages.slice(-6);
    setMessages((m) => [...m, { role: 'user', content: instruction }, { role: 'assistant', content: '' }]);
    setChatInput('');
    setStreaming(true);

    try {
      const finalHtml = await streamAiEdit(
        { html: baseHtml, instruction, history },
        (fullSoFar) => {
          const now = Date.now();
          if (now - lastPreviewPush.current > 350) {
            lastPreviewPush.current = now;
            setPreviewHtml(fullSoFar);
          }
        },
      );
      htmlRef.current = finalHtml;
      setPreviewHtml(finalHtml);
      setDirty(true);
      sfx.aiDone();
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = { role: 'assistant', content: 'Done — preview updated. Review it, then Save or Redeploy.' };
        return next;
      });
    } catch (err: any) {
      sfx.error();
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = { role: 'assistant', content: `⚠ ${err?.message || 'AI edit failed.'}` };
        return next;
      });
      // Restore the pre-edit preview.
      setPreviewHtml(htmlRef.current);
    } finally {
      setStreaming(false);
    }
  };

  // ===========================================================================
  // LIST VIEW
  // ===========================================================================
  if (view === 'list') {
    const niches = ['All', ...Array.from(new Set(sites.map((s) => s.niche)))];
    const q = search.trim().toLowerCase();
    const filteredSites = sites.filter(
      (s) =>
        (filterNiche === 'All' || s.niche === filterNiche) &&
        (q === '' || s.title.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q)),
    );

    return (
      <div key="editor-list" className="max-w-[1400px] mx-auto animate-editor-rise">
        {toast && <ToastBanner toast={toast} onClose={() => setToast(null)} />}

        {/* Hero header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center shadow-sm shrink-0">
              <Code2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold font-sans tracking-tight text-ink leading-tight">Site Editor</h1>
              <p className="text-sm text-ink-secondary font-sans max-w-xl mt-1">
                Pick a deployed client site to edit its text, swap images, or let AI rewrite sections — then redeploy live in one click.
              </p>
            </div>
          </div>
          <button
            onClick={() => { sfx.primary(); loadList(); }}
            disabled={listLoading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-border-main text-ink text-sm font-semibold font-sans hover:bg-off-white active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${listLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Error */}
        {listError && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-danger-soft border border-danger/20 text-danger mb-6">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm font-sans">{listError}</div>
          </div>
        )}

        {/* Loading skeleton */}
        {listLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-44 rounded-2xl bg-white border border-border-main animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty (no deployed sites at all) */}
        {!listLoading && listLoaded && sites.length === 0 && (
          <div className="text-center py-20 px-6 bg-white rounded-2xl border border-dashed border-border-main">
            <div className="w-14 h-14 rounded-2xl bg-accent-soft flex items-center justify-center mx-auto mb-4">
              <Code2 className="w-7 h-7 text-accent" />
            </div>
            <h3 className="text-lg font-bold font-sans text-ink mb-1.5">No deployed sites yet</h3>
            <p className="text-sm text-ink-secondary font-sans max-w-sm mx-auto">
              Launch a campaign first. Every site you deploy will appear here, ready to edit and redeploy.
            </p>
          </div>
        )}

        {/* Filter toolbar + grid */}
        {!listLoading && sites.length > 0 && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
              {/* search */}
              <div className="relative sm:w-64 shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-secondary pointer-events-none" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search your sites…"
                  className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-border-main bg-white text-sm font-sans text-ink placeholder:text-ink-secondary/70 focus:outline-none focus:border-accent transition-all"
                />
                {search && (
                  <button
                    onClick={() => { sfx.tap(); setSearch(''); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-secondary hover:text-ink"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* niche filter toggle */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                {niches.map((n) => {
                  const isActive = filterNiche === n;
                  const count = n === 'All' ? sites.length : sites.filter((s) => s.niche === n).length;
                  return (
                    <button
                      key={n}
                      onClick={() => { sfx.toggle(); setFilterNiche(n); }}
                      className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold font-sans border transition-all active:scale-[0.97] ${
                        isActive
                          ? 'bg-accent text-white border-accent shadow-sm'
                          : 'bg-white text-ink-secondary border-border-main hover:text-ink hover:border-accent/40'
                      }`}
                    >
                      {n}
                      <span className={`text-[10px] tabular-nums ${isActive ? 'text-white/80' : 'text-ink-tertiary'}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* count line */}
            <p className="text-xs text-ink-secondary font-sans mb-4">
              {filteredSites.length} {filteredSites.length === 1 ? 'site' : 'sites'}
              {filterNiche !== 'All' ? ` in ${filterNiche}` : ''}
              {q ? ` matching "${search.trim()}"` : ''}
            </p>

            {filteredSites.length === 0 ? (
              <div className="text-center py-16 px-6 bg-white rounded-2xl border border-dashed border-border-main">
                <div className="w-12 h-12 rounded-2xl bg-off-white flex items-center justify-center mx-auto mb-3">
                  <Search className="w-6 h-6 text-ink-tertiary" />
                </div>
                <h3 className="text-base font-bold font-sans text-ink mb-1">No matching sites</h3>
                <p className="text-sm text-ink-secondary font-sans mb-4">Try a different filter or search term.</p>
                <button
                  onClick={() => { sfx.tap(); setSearch(''); setFilterNiche('All'); }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent-soft text-accent text-sm font-semibold font-sans hover:bg-accent hover:text-white transition-all"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div key={`${filterNiche}|${q}`} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 animate-editor-fade">
                {filteredSites.map((site) => (
                  <div
                    key={site.slug}
                    className="group bg-white rounded-2xl border border-border-main p-5 hover:border-accent/40 hover:shadow-[0_12px_36px_rgba(26,25,22,0.10)] transition-all flex flex-col"
                  >
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="w-11 h-11 rounded-xl bg-accent-soft text-accent flex items-center justify-center font-bold font-sans text-lg shrink-0">
                        {monogram(site.title)}
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold font-sans bg-off-white text-ink-secondary uppercase tracking-wide border border-border-light">
                        {site.niche}
                      </span>
                    </div>
                    <h3 className="text-base font-bold font-sans text-ink leading-snug mb-1 line-clamp-2">
                      {site.title}
                    </h3>
                    <p className="text-[11px] text-ink-secondary font-sans truncate mb-4">/{site.slug}/</p>

                    <div className="mt-auto">
                      <div className="flex items-center gap-1.5 text-[11px] text-ink-secondary font-sans mb-3">
                        <Clock className="w-3 h-3" /> Updated {relTime(site.updatedAt)}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openSite(site)}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-ink text-white text-sm font-semibold font-sans hover:bg-ink/90 active:scale-[0.98] transition-all"
                        >
                          <Pencil className="w-4 h-4" /> Open Editor
                        </button>
                        <a
                          href={site.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => sfx.tap()}
                          className="inline-flex items-center justify-center w-11 rounded-lg bg-white border border-border-main text-ink-secondary hover:text-accent hover:border-accent/40 transition-all active:scale-[0.96]"
                          title="Open live site"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ===========================================================================
  // EDIT VIEW
  // ===========================================================================
  return (
    <div key="editor-edit" className="max-w-[1600px] mx-auto animate-editor-rise">
      {toast && <ToastBanner toast={toast} onClose={() => setToast(null)} />}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={backToList}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-border-main text-ink-secondary hover:text-ink text-sm font-medium font-sans active:scale-[0.98] transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Sites</span>
        </button>

        <div className="flex flex-col min-w-0 mr-auto">
          <span className="text-sm font-bold font-sans text-ink truncate max-w-[40vw] sm:max-w-xs">{selected?.title}</span>
          <span className="text-[11px] text-ink-secondary font-sans truncate">/{selected?.slug}/{dirty ? ' · unsaved' : ''}</span>
        </div>

        {/* device toggle */}
        <div className="hidden sm:flex items-center bg-white border border-border-main rounded-lg p-0.5">
          <button
            onClick={() => { sfx.toggle(); setDevice('desktop'); }}
            className={`p-1.5 rounded-md transition-all ${device === 'desktop' ? 'bg-accent-soft text-accent' : 'text-ink-secondary hover:text-ink'}`}
            title="Desktop preview"
          >
            <Monitor className="w-4 h-4" />
          </button>
          <button
            onClick={() => { sfx.toggle(); setDevice('mobile'); }}
            className={`p-1.5 rounded-md transition-all ${device === 'mobile' ? 'bg-accent-soft text-accent' : 'text-ink-secondary hover:text-ink'}`}
            title="Mobile preview"
          >
            <Smartphone className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={toggleEditMode}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium font-sans active:scale-[0.98] transition-all border ${
            editMode ? 'bg-accent text-white border-accent' : 'bg-white text-ink-secondary border-border-main hover:text-ink'
          }`}
          title="Click text to edit it, click images to replace them"
        >
          <Pencil className="w-4 h-4" /> <span className="hidden sm:inline">{editMode ? 'Editing' : 'Edit'}</span>
        </button>

        <button
          onClick={() => { sfx.open(); setAddonsPanel(true); }}
          className={`relative inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium font-sans active:scale-[0.98] transition-all border ${
            addons.chatbot ? 'bg-accent-soft text-accent border-accent/30' : 'bg-white text-ink-secondary border-border-main hover:text-ink'
          }`}
          title="Add a booking chatbot to this site"
        >
          <Puzzle className="w-4 h-4" /> <span className="hidden sm:inline">Add-ons</span>
          {addons.chatbot && (
            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-bold tabular-nums">
              1
            </span>
          )}
        </button>

        <button
          onClick={() => { sfx.open(); setInviteOpen(true); }}
          className={`relative inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium font-sans active:scale-[0.98] transition-all border ${
            activeInviteCount > 0 ? 'bg-accent-soft text-accent border-accent/30' : 'bg-white text-ink-secondary border-border-main hover:text-ink'
          }`}
          title="Generate an invite code your client can use in the Lunao Owner app"
        >
          <UserPlus className="w-4 h-4" /> <span className="hidden sm:inline">Invite Client</span>
          {activeInviteCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-bold tabular-nums">
              {activeInviteCount}
            </span>
          )}
        </button>

        <button
          onClick={handleSave}
          disabled={saving || deploying}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-border-main text-ink hover:bg-off-white text-sm font-semibold font-sans active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} <span className="hidden sm:inline">Save</span>
        </button>

        <button
          onClick={handleDeploy}
          disabled={deploying || saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold font-sans shadow-sm hover:bg-accent/90 active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {deploying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />} Redeploy
        </button>
      </div>

      {/* Mobile panel switch — one panel at a time so scrolling stays clean */}
      <div className="flex lg:hidden items-center gap-1 p-1 bg-white border border-border-main rounded-xl mb-3">
        <button
          onClick={() => { sfx.toggle(); setMobileTab('chat'); }}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold font-sans transition-all ${
            mobileTab === 'chat' ? 'bg-accent-soft text-accent' : 'text-ink-secondary'
          }`}
        >
          <Wand2 className="w-4 h-4" /> AI Editor
        </button>
        <button
          onClick={() => { sfx.toggle(); setMobileTab('preview'); }}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold font-sans transition-all ${
            mobileTab === 'preview' ? 'bg-accent-soft text-accent' : 'text-ink-secondary'
          }`}
        >
          <Eye className="w-4 h-4" /> Preview
        </button>
      </div>

      {/* Workspace: chat (left) + preview (right) — desktop height fits the
          viewport so the whole editor (incl. chat) is visible without scrolling */}
      <div className="flex flex-col lg:flex-row gap-4 h-[calc(100dvh-250px)] min-h-[440px] lg:h-[calc(100vh-170px)] lg:min-h-[440px] lg:max-h-[760px]">
        {/* AI chat panel */}
        <div className={`lg:w-[340px] shrink-0 bg-white rounded-xl border border-border-main flex-col h-full overflow-hidden lg:flex ${mobileTab === 'chat' ? 'flex' : 'hidden'}`}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border-light">
            <div className="w-7 h-7 rounded-lg bg-accent-soft flex items-center justify-center">
              <Wand2 className="w-4 h-4 text-accent" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold font-sans text-ink leading-none">AI Code Chat</span>
              <span className="text-[10px] text-ink-secondary font-sans">
                {aiEnabled ? 'Powered by Claude' : 'Disabled — add server key'}
              </span>
            </div>
          </div>

          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center pt-8 px-2">
                <div className="w-12 h-12 rounded-2xl bg-accent-soft flex items-center justify-center mx-auto mb-3">
                  <Wand2 className="w-6 h-6 text-accent" />
                </div>
                <p className="text-sm font-semibold font-sans text-ink mb-1">Describe a change</p>
                <p className="text-xs text-ink-secondary font-sans mb-4">
                  AI writes real code and the preview refreshes as it types.
                </p>
                <div className="space-y-1.5 text-left">
                  {['Make the hero background darker and more luxurious',
                    'Change the headline to be more bold and confident',
                    'Add a limited-time offer banner at the top'].map((s) => (
                    <button
                      key={s}
                      onClick={() => { sfx.tap(); setChatInput(s); }}
                      className="w-full text-left text-xs font-sans text-ink-secondary bg-off-white hover:bg-accent-soft hover:text-accent rounded-lg px-3 py-2 transition-all"
                    >
                      "{s}"
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2 text-sm font-sans leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-accent text-white rounded-br-sm'
                      : 'bg-off-white text-ink rounded-bl-sm border border-border-light'
                  }`}
                >
                  {m.content || (
                    <span className="inline-flex items-center gap-2 text-ink-secondary">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Writing code…
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-border-light">
            <div className="flex items-end gap-2">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAi(); }
                }}
                placeholder={aiEnabled ? 'e.g. make the buttons gold…' : 'AI editor is disabled'}
                disabled={!aiEnabled || streaming}
                rows={2}
                className="flex-1 resize-none rounded-lg border border-border-main bg-off-white px-3 py-2 text-sm font-sans text-ink placeholder:text-ink-secondary/70 focus:outline-none focus:border-accent focus:bg-white transition-all disabled:opacity-60"
              />
              <button
                onClick={sendAi}
                disabled={!aiEnabled || streaming || !chatInput.trim()}
                className="w-10 h-10 shrink-0 rounded-lg bg-accent text-white flex items-center justify-center hover:bg-accent/90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Preview panel */}
        <div className={`flex-1 bg-white rounded-xl border border-border-main overflow-hidden flex-col h-full relative lg:flex ${mobileTab === 'preview' ? 'flex' : 'hidden'}`}>
          {editMode && (
            <div className="flex items-center gap-2 px-4 py-2 bg-accent-soft/60 border-b border-accent/15 text-[11px] font-sans text-accent font-medium">
              <Pencil className="w-3.5 h-3.5" />
              Edit mode on — click any text to type, click any image to replace it.
            </div>
          )}

          {/* Live preview — kept mounted so inline edits are never lost */}
          <div className="flex-1 overflow-hidden bg-[#f4f2ee] flex justify-center items-stretch">
            {loadingSite ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-7 h-7 animate-spin text-accent" />
              </div>
            ) : (
              <div className={`h-full bg-white transition-[width] duration-300 ${device === 'mobile' ? 'w-[390px] max-w-full border-x border-border-main shadow-[0_0_40px_rgba(26,25,22,0.12)]' : 'w-full'}`}>
                <iframe
                  ref={iframeRef}
                  title="Site preview"
                  srcDoc={previewHtml}
                  onLoad={onIframeLoad}
                  className="w-full h-full border-0 bg-white block"
                />
              </div>
            )}
          </div>

          {/* streaming overlay */}
          {streaming && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-ink text-white text-xs font-sans font-medium shadow-lg">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> AI is writing your changes…
            </div>
          )}

          {/* Image edit panel — centered floating card inside the preview area */}
          {imgPanel && (
            <div
              className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-editor-fade"
              onClick={() => { sfx.close(); setImgPanel(false); }}
            >
              <div
                className="w-full max-w-sm bg-white rounded-2xl border border-border-main shadow-[0_24px_60px_rgba(26,25,22,0.25)] p-5 animate-editor-rise"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-accent-soft flex items-center justify-center">
                      <ImageIcon className="w-4 h-4 text-accent" />
                    </div>
                    <span className="text-sm font-bold font-sans text-ink">Replace image</span>
                  </div>
                  <button onClick={() => { sfx.close(); setImgPanel(false); }} className="text-ink-secondary hover:text-ink">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* current image preview */}
                <div className="mb-4 rounded-xl border border-border-light bg-off-white overflow-hidden flex items-center justify-center h-32">
                  {imgUrl ? (
                    <img src={imgUrl} alt="Selected" className="max-h-32 max-w-full object-contain" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-ink-tertiary" />
                  )}
                </div>

                <button
                  onClick={() => { sfx.tap(); fileInputRef.current?.click(); }}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold font-sans hover:bg-accent/90 active:scale-[0.98] transition-all mb-3"
                >
                  <UploadCloud className="w-4 h-4" /> Upload from your PC
                </button>

                <div className="flex items-center gap-2 mb-3">
                  <span className="h-px flex-1 bg-border-light" />
                  <span className="text-[10px] uppercase tracking-wide font-bold text-ink-tertiary font-sans">or paste a URL</span>
                  <span className="h-px flex-1 bg-border-light" />
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 bg-off-white border border-border-main rounded-lg px-3 focus-within:border-accent transition-all">
                    <Link2 className="w-4 h-4 text-ink-secondary shrink-0" />
                    <input
                      value={imgUrl}
                      onChange={(e) => setImgUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') applyImageUrl(); }}
                      placeholder="https://…"
                      className="flex-1 bg-transparent py-2.5 text-sm font-sans text-ink placeholder:text-ink-secondary/70 focus:outline-none min-w-0"
                    />
                  </div>
                  <button
                    onClick={applyImageUrl}
                    disabled={!imgUrl.trim()}
                    className="px-4 py-2.5 rounded-lg bg-ink text-white text-sm font-semibold font-sans hover:bg-ink/90 active:scale-[0.98] transition-all disabled:opacity-50 shrink-0"
                  >
                    Apply
                  </button>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
              </div>
            </div>
          )}

          {/* Add-ons panel — booking system + booking chatbot toggles */}
          {addonsPanel && (
            <div
              className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-editor-fade"
              onClick={() => { sfx.close(); setAddonsPanel(false); }}
            >
              <div
                className="w-full max-w-md bg-white rounded-2xl border border-border-main shadow-[0_24px_60px_rgba(26,25,22,0.25)] p-5 animate-editor-rise"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-accent-soft flex items-center justify-center">
                      <Puzzle className="w-4 h-4 text-accent" />
                    </div>
                    <span className="text-sm font-bold font-sans text-ink">Site Add-ons</span>
                  </div>
                  <button onClick={() => { sfx.close(); setAddonsPanel(false); }} className="text-ink-secondary hover:text-ink">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-ink-secondary font-sans mb-4 pl-9">
                  One-click upgrades that live on Lunao. Toggle on, then Redeploy to push them live.
                </p>

                <AddonToggle
                  icon={<MessageCircle className="w-5 h-5" />}
                  title="Booking Chatbot"
                  desc="A friendly assistant that chats with visitors and books them in."
                  enabled={addons.chatbot}
                  busy={addonBusy === 'chatbot'}
                  onToggle={() => toggleAddon('chatbot')}
                />

                <div className="mt-4 flex items-center gap-2 text-[11px] text-ink-secondary font-sans bg-off-white border border-border-light rounded-lg px-3 py-2">
                  <Rocket className="w-3.5 h-3.5 shrink-0 text-accent" />
                  Changes preview instantly. Hit <span className="font-semibold text-ink">Redeploy</span> to publish to the live site.
                </div>
              </div>
            </div>
          )}

          {/* Deploy success — beautiful animated URL reveal in the preview area */}
          {deployInfo && (            <div
              className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-ink/45 backdrop-blur-sm animate-editor-fade"
              onClick={() => { sfx.close(); setDeployInfo(null); }}
            >
              <div
                className="relative w-full max-w-md bg-white rounded-2xl border border-border-main shadow-[0_24px_70px_rgba(26,25,22,0.3)] p-6 text-center overflow-hidden animate-editor-rise"
                onClick={(e) => e.stopPropagation()}
              >
                {/* ambient glow */}
                <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-72 bg-accent/15 blur-3xl rounded-full" />

                <button onClick={() => { sfx.close(); setDeployInfo(null); }} className="absolute top-3 right-3 text-ink-secondary hover:text-ink z-10">
                  <X className="w-4 h-4" />
                </button>

                {/* animated success check */}
                <div className="relative mx-auto mb-5 w-16 h-16">
                  <span className="absolute inset-0 rounded-full bg-success/15 animate-editor-ring" />
                  <div className="relative w-16 h-16 rounded-full bg-success-soft flex items-center justify-center animate-editor-pop">
                    <CheckCircle2 className="w-9 h-9 text-success" />
                  </div>
                </div>

                <h3 className="text-xl font-bold font-sans text-ink mb-1">
                  {deployInfo.dryRun ? 'Saved & staged!' : 'Your site is live!'}
                </h3>
                <p className="text-sm text-ink-secondary font-sans mb-5 px-2">
                  {deployInfo.dryRun
                    ? 'Changes were written locally (dry-run). Add Cloudflare keys to push live.'
                    : 'Your edits are deploying to Cloudflare now — live in a few seconds.'}
                </p>

                {/* URL pill */}
                <div className="flex items-center gap-2 bg-off-white border border-border-main rounded-xl pl-3 pr-1.5 py-1.5 mb-4">
                  <Globe className="w-4 h-4 text-accent shrink-0" />
                  <span className="flex-1 text-sm font-mono text-ink truncate text-left">{deployInfo.url}</span>
                  <button
                    onClick={copyDeployUrl}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold font-sans transition-all shrink-0 ${
                      copied ? 'bg-success-soft text-success' : 'bg-accent-soft text-accent hover:bg-accent hover:text-white'
                    }`}
                  >
                    {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <div className="flex gap-2">
                  <a
                    href={deployInfo.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => sfx.primary()}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold font-sans shadow-sm hover:bg-accent/90 active:scale-[0.98] transition-all"
                  >
                    Open Live Site <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => { sfx.close(); setDeployInfo(null); }}
                    className="px-4 py-2.5 rounded-lg bg-white border border-border-main text-ink text-sm font-semibold font-sans hover:bg-off-white active:scale-[0.98] transition-all"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Invite Client drawer — full-screen overlay, mounted at the editor
          root so its backdrop covers the entire workspace. */}
      <InviteClientDrawer
        slug={selected.slug}
        businessName={selected.title}
        siteUrl={selected.url}
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          setInviteRefreshKey((k) => k + 1); // re-pull active count for the badge
        }}
        refreshKey={inviteRefreshKey}
      />

    </div>
  );
};

// A single brand-consistent add-on row with an animated toggle switch.
const AddonToggle: React.FC<{
  icon: React.ReactNode;
  title: string;
  desc: string;
  enabled: boolean;
  busy: boolean;
  onToggle: () => void;
}> = ({ icon, title, desc, enabled, busy, onToggle }) => (
  <div
    className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all ${
      enabled ? 'bg-accent-soft/50 border-accent/30' : 'bg-white border-border-main'
    }`}
  >
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
      enabled ? 'bg-accent text-white' : 'bg-off-white text-ink-secondary'
    }`}>
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold font-sans text-ink">{title}</span>
        {enabled && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold font-sans bg-success-soft text-success uppercase tracking-wide">
            Live
          </span>
        )}
      </div>
      <p className="text-[11px] text-ink-secondary font-sans leading-snug mt-0.5">{desc}</p>
    </div>
    <button
      onClick={onToggle}
      disabled={busy}
      role="switch"
      aria-checked={enabled}
      aria-label={`Toggle ${title}`}
      className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-200 disabled:opacity-60 ${
        enabled ? 'bg-accent' : 'bg-border-main'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm flex items-center justify-center transition-transform duration-200 ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      >
        {busy && <Loader2 className="w-3 h-3 animate-spin text-accent" />}
      </span>
    </button>
  </div>
);

// Brand-consistent toast
const ToastBanner: React.FC<{ toast: NonNullable<Toast>; onClose: () => void }> = ({ toast, onClose }) => {
  const styles = {
    success: 'bg-success-soft text-success border-success/20',
    error: 'bg-red-50 text-red-700 border-red-200',
    info: 'bg-accent-soft text-accent border-accent/20',
  }[toast.type];
  const Icon = toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? AlertCircle : Loader2;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] animate-editor-rise">
      <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border shadow-lg text-sm font-medium font-sans ${styles}`}>
        <Icon className={`w-4 h-4 shrink-0 ${toast.type === 'info' ? 'animate-spin' : ''}`} />
        <span>{toast.text}</span>
        <button onClick={() => { sfx.close(); onClose(); }} className="ml-1 opacity-60 hover:opacity-100">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
