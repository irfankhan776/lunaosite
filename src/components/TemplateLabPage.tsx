import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Key, ChevronDown, Loader2, Sparkles, AlertCircle,
  FlaskConical, Layout, Monitor, Smartphone, Upload, Copy,
  CheckSquare, RotateCcw, BookmarkPlus, X, Code2, Check,
} from 'lucide-react';
import {
  AiChatMessage, SiteHistoryEntry,
  listSiteHistory, createSiteHistory, convertHistoryToTemplate,
  streamAiEdit, processUploadedHtml,
} from '../lib/pipelineClient';
import {
  playSoftTap, playTiktokLike, playSlideTick, playDialogPop, playSoftBubble,
  playElegantBell, playConfirmSuccess, playVictoryCelebration, playGentleChime,
  playElegantError, playCancelTone, playMagicWhoosh,
} from '../utils/audio';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FlashToastFn {
  (t: { type: 'success' | 'error' | 'info'; text: string }): void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BLANK_CANVAS = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;padding:0;background:#f8f8f8}</style></head><body></body></html>`;

const VIBE_CODE_PROMPT = `Create a complete, production-ready single-file HTML website for a local business.

REQUIREMENTS:
- Single HTML file with all CSS inline in <style> tags
- Fully responsive: mobile-first design
- Real business name, city, and phone number included directly in the HTML (no placeholders, no tokens)
- Professional design with a cohesive color palette
- Sections: header/nav, hero with CTA, services/features, about/why us, testimonials, CTA banner, footer with contact info
- Phone link: <a href="tel:+15550100100">(555) 010-0100</a> format
- Instagram and Facebook links included where appropriate
- Use real Unsplash image URLs for photos
- Google Fonts loaded from fonts.googleapis.com
- No JavaScript frameworks — vanilla JS only
- NO external CSS files — everything inline
- Return ONLY the HTML document, starting with <!DOCTYPE html> and ending with </html>
- Do NOT wrap in markdown fences`;

// ---------------------------------------------------------------------------
// Sound design
// ---------------------------------------------------------------------------

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
  magic: playMagicWhoosh,
  error: playElegantError,
  close: playCancelTone,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relTime(ms: number | null): string {
  if (!ms) return 'recently';
  const diff = Date.now() - ms * 1000;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ms * 1000).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TemplateLabPage: React.FC<{
  aiEnabled: boolean;
  onClose: () => void;
  onBrowseTemplates: () => void;
  flashToast: FlashToastFn;
}> = ({ aiEnabled, onClose, onBrowseTemplates, flashToast }) => {
  // ---- State ---------------------------------------------------------------
  const [mode, setMode] = useState<'idle' | 'active'>('idle');
  const [html, setHtml] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [history, setHistory] = useState<SiteHistoryEntry[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [title, setTitle] = useState('');
  const [niche, setNiche] = useState('');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [labError, setLabError] = useState<string | null>(null);
  const [showVibePrompt, setShowVibePrompt] = useState(false);
  const [vibeCopied, setVibeCopied] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveCategory, setSaveCategory] = useState<string | null>(null);
  const [saveNewCat, setSaveNewCat] = useState('');
  const [saveNewCatColor, setSaveNewCatColor] = useState('#2563EB');
  const [showNewCat, setShowNewCat] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string; color: string }[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // ---- Refs ---------------------------------------------------------------
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastPush = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Load history on mount -----------------------------------------------
  useEffect(() => {
    setLoadingHistory(true);
    listSiteHistory()
      .then((h) => setHistory(h))
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));
  }, []);

  // ---- Helpers ------------------------------------------------------------
  const flashError = (msg: string) => {
    sfx.error();
    setLabError(msg);
    setTimeout(() => setLabError(null), 5000);
  };

  // ---- handleFileUpload ---------------------------------------------------
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.html') && !file.type.includes('html')) {
      setUploadError('Please upload a valid .html file.');
      sfx.error();
      return;
    }
    sfx.swap();
    setUploading(true);
    setUploadError(null);
    setLabError(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const rawHtml = ev.target?.result as string;
      if (!rawHtml || rawHtml.length < 100) {
        setUploadError('File appears empty or too small.');
        sfx.error();
        setUploading(false);
        return;
      }
      try {
        sfx.magic();
        setMode('active');
        const { rawHtml: processed, previewHtml: preview } = await processUploadedHtml({
          html: rawHtml,
          niche: niche || 'Local Business',
          anthropicApiKey: apiKey.trim() || undefined,
        });
        setHtml(processed);
        setPreviewHtml(preview);
        setTitle(niche || 'Uploaded Template');
        setMessages([{
          role: 'assistant',
          content: 'File processed! Your HTML has been converted to a Lunao template with personalization placeholders. Preview is ready below.',
        }]);
        sfx.aiDone();
        const entry = await createSiteHistory({
          title: niche || 'Uploaded Template',
          niche: niche || 'Local Business',
          html: processed,
          snapshotLabel: 'Uploaded HTML',
        }) as { id: string; parentSlug: string };
        setHistory((prev) => [{ id: entry.id, parentSlug: entry.parentSlug, title: niche || 'Uploaded Template', niche: niche || 'Local Business', html: processed, snapshotLabel: 'Uploaded HTML', isTemplate: false, templateId: null, templateName: null, createdAt: Math.floor(Date.now() / 1000) }, ...prev]);
      } catch (err: any) {
        flashError(err?.message || 'Failed to process uploaded file.');
        setMode('idle');
      } finally {
        setUploading(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ---- sendPrompt ---------------------------------------------------------
  const sendPrompt = async () => {
    const instruction = input.trim();
    if (!instruction || streaming) return;
    if (!aiEnabled && !apiKey.trim()) {
      flashError('AI needs an Anthropic key. Add one below or configure the server key.');
      return;
    }
    sfx.magic();
    const history_msgs = messages.slice(-6);
    setMessages((m) => [...m, { role: 'user', content: instruction }]);
    setInput('');
    setStreaming(true);
    setMode('active');
    setLabError(null);
    try {
      const base = html || BLANK_CANVAS;
      const result = await streamAiEdit(
        { html: base, instruction, history: history_msgs },
        (fullSoFar) => {
          setHtml(fullSoFar);
          const now = Date.now();
          if (now - lastPush.current > 400) {
            lastPush.current = now;
            setPreviewHtml(fullSoFar);
          }
        },
      );
      setHtml(result);
      setPreviewHtml(result);
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = { role: 'assistant', content: 'Done! Preview updated below. Keep editing or save as a template.' };
        return next;
      });
      sfx.aiDone();
      try {
        const entry = await createSiteHistory({
          title: title || instruction.slice(0, 40),
          niche,
          html: result,
          snapshotLabel: instruction.slice(0, 60),
        }) as { id: string; parentSlug: string };
        setHistory((prev) => [{
          id: entry.id,
          parentSlug: entry.parentSlug,
          title: title || instruction.slice(0, 40),
          niche,
          html: result,
          snapshotLabel: instruction.slice(0, 60),
          isTemplate: false,
          templateId: null,
          templateName: null,
          createdAt: Math.floor(Date.now() / 1000),
        }, ...prev]);
      } catch { /* ignore */ }
    } catch (err: any) {
      sfx.error();
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = { role: 'assistant', content: 'Error: ' + (err?.message || 'Generation failed.') };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  };

  // ---- loadEntry ----------------------------------------------------------
  const loadEntry = (entry: SiteHistoryEntry) => {
    sfx.open();
    setHtml(entry.html);
    setPreviewHtml(entry.html);
    setTitle(entry.title);
    setNiche(entry.niche);
    setMode('active');
    setMessages([{ role: 'assistant', content: 'Loaded "' + (entry.snapshotLabel || entry.title) + '". Keep editing below.' }]);
  };

  // ---- openSave -----------------------------------------------------------
  const openSave = async () => {
    sfx.tap();
    setSaveOpen(true);
    setSaveName(title || 'My Custom Template');
    setSaveCategory(null);
    setSaveNewCat('');
    setSaveNewCatColor('#2563EB');
    setShowNewCat(false);
    try {
      const { listTemplateCategories } = await import('../lib/pipelineClient');
      const cats = await listTemplateCategories();
      setCategories(cats.map((c: any) => ({ id: c.id, name: c.name, color: c.color })));
    } catch {
      setCategories([]);
    }
  };

  // ---- handleSave ---------------------------------------------------------
  const handleSave = async () => {
    if (!saveName.trim()) { sfx.error(); return; }
    sfx.primary();
    setSaving(true);
    try {
      let catId = saveCategory;
      if (showNewCat && saveNewCat.trim()) {
        const { createTemplateCategory } = await import('../lib/pipelineClient');
        const cat = await createTemplateCategory({ name: saveNewCat.trim(), color: saveNewCatColor });
        catId = cat.id;
        setCategories((prev) => [...prev, { id: cat.id, name: cat.name, color: cat.color }]);
      }
      const entry = await createSiteHistory({ title: saveName.trim(), niche, html });
      const { convertHistoryToTemplate } = await import('../lib/pipelineClient');
      const result = await convertHistoryToTemplate({
        historyId: (entry as any).id,
        name: saveName.trim(),
        categoryId: catId,
        niche,
      });
      sfx.deployed();
      flashToast({ type: 'success', text: '"' + result.name + '" saved as a template!' });
      setSaveOpen(false);
      onClose();
    } catch (err: any) {
      sfx.error();
      flashToast({ type: 'error', text: err?.message || 'Failed to save template.' });
    } finally {
      setSaving(false);
    }
  };

  // ---- onIframeLoad -------------------------------------------------------
  const onIframeLoad = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.addEventListener('input', () => {
      const c = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
      setHtml(c);
      setPreviewHtml(c);
    });
  };

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-[60] bg-[#0a0a0f] flex flex-col animate-editor-rise overflow-hidden">

      {/* HEADER */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0 bg-gradient-to-r from-[#0a0a0f] via-[#111118] to-[#0a0a0f]">
        {/* Back button */}
        <button
          onClick={() => { sfx.close(); onClose(); }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 text-sm font-medium font-sans active:scale-[0.98] transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* Logo + title */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent/30 to-violet-500/20 border border-accent/20 flex items-center justify-center">
            <FlaskConical className="w-4 h-4 text-accent" />
          </div>
          <div>
            <span className="text-sm font-bold font-sans text-white leading-none">Template Lab</span>
            <p className="text-[10px] text-white/40 font-sans">Vibe-code any website in seconds</p>
          </div>
        </div>

        {/* Right: step badge + browse */}
        <div className="ml-auto flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold font-sans ${
            mode === 'idle' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
            streaming ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
            'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
          }`}>
            {streaming && <Loader2 className="w-3 h-3 animate-spin" />}
            {mode === 'idle' && 'Ready'}
            {mode === 'active' && !streaming && 'Editing'}
            {streaming && 'Building\u2026'}
          </span>
          <button
            onClick={() => { sfx.open(); onBrowseTemplates(); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 text-sm font-medium font-sans active:scale-[0.98] transition-all"
          >
            <Layout className="w-4 h-4" /> Browse Templates
          </button>
        </div>
      </div>

      {/* WORKSPACE */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT PANEL */}
        <div className="w-80 shrink-0 bg-[#111118] border-r border-white/10 flex flex-col overflow-hidden">

          {/* 1. API Key section */}
          <div className="px-3 py-3 border-b border-white/8">
            <button
              onClick={() => { sfx.toggle(); setShowApiKey(!showApiKey); }}
              className="w-full flex items-center gap-2 text-[11px] font-semibold font-sans text-white/50 hover:text-white/80 transition-colors"
            >
              <Key className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1 text-left">{showApiKey ? 'Hide API key' : 'Add your Anthropic key'}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showApiKey ? 'rotate-180' : ''}`} />
            </button>
            {showApiKey && (
              <div className="mt-2 animate-editor-rise">
                <div className="relative">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-ant-api03-\u2026"
                    className="w-full px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-white text-xs font-mono placeholder:text-white/20 focus:outline-none focus:border-accent/60 transition-colors"
                  />
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-accent hover:text-accent/80 font-medium"
                  >
                    Get key
                  </a>
                </div>
                <p className="mt-1.5 text-[10px] font-sans leading-relaxed">
                  {apiKey.trim() ? <span className="text-emerald-400/60">Using your key</span> :
                   aiEnabled ? <span className="text-emerald-400/60">Using server key</span> :
                   <span className="text-white/30">Add a key to enable AI generation</span>}
                </p>
              </div>
            )}
          </div>

          {/* 2. Previous Builds */}
          <div className="px-3 py-3 border-b border-white/8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold font-sans text-white/40 uppercase tracking-widest">Previous Builds</span>
              <span className="text-[10px] font-sans text-white/30">{history.length}</span>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-none">
              {loadingHistory ? (
                <div className="flex items-center justify-center py-3">
                  <Loader2 className="w-4 h-4 animate-spin text-white/30" />
                </div>
              ) : history.length === 0 ? (
                <p className="text-[11px] text-white/25 font-sans italic text-center py-2">No builds yet \u2014 start below</p>
              ) : (
                history.slice(0, 10).map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => loadEntry(entry)}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-white/5 transition-colors group"
                  >
                    <p className="text-xs font-semibold font-sans text-white/70 group-hover:text-white truncate">
                      {entry.title || entry.snapshotLabel || 'Build'}
                    </p>
                    <p className="text-[10px] font-sans text-white/30 mt-0.5">
                      {relTime(entry.createdAt)} \u00b7 {entry.niche}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* 3. Vibe Code Prompt Card */}
          <div className="px-3 py-3 border-b border-white/8">
            <button
              onClick={() => { sfx.toggle(); setShowVibePrompt(!showVibePrompt); }}
              className="w-full flex items-center gap-2 text-[11px] font-semibold font-sans text-white/50 hover:text-white/80 transition-colors mb-2"
            >
              <Code2 className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1 text-left">Copy vibe-code prompt</span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${showVibePrompt ? 'bg-accent/20 text-accent' : 'bg-white/10 text-white/40'}`}>
                {showVibePrompt ? 'Hide' : 'Show'}
              </span>
            </button>
            {showVibePrompt && (
              <div className="animate-editor-rise">
                <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                  <p className="text-[10px] font-sans text-white/40 leading-relaxed mb-2">
                    Paste this in Cursor, Bolt, or any AI coding tool to vibe-code your template outside Lunao:
                  </p>
                  <div className="bg-[#0a0a0f] rounded-lg p-2 max-h-32 overflow-y-auto">
                    <pre className="text-[10px] font-mono text-white/60 whitespace-pre-wrap leading-relaxed">
                      {VIBE_CODE_PROMPT}
                    </pre>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(VIBE_CODE_PROMPT);
                      sfx.copy();
                      setVibeCopied(true);
                      setTimeout(() => setVibeCopied(false), 2000);
                    }}
                    className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/20 border border-accent/30 text-accent text-[11px] font-semibold font-sans hover:bg-accent/30 active:scale-[0.98] transition-all"
                  >
                    {vibeCopied ? <CheckSquare className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {vibeCopied ? 'Copied!' : 'Copy prompt'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 4. Chat + Input */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
              {messages.length === 0 && (
                <div className="text-center pt-4">
                  <p className="text-[11px] text-white/30 font-sans italic">Describe a website and AI will build it\u2026</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[92%] rounded-2xl px-3 py-2 text-[11px] font-sans leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-accent/80 text-white rounded-br-sm'
                      : 'bg-white/8 text-white/70 border border-white/8 rounded-bl-sm'
                  }`}>
                    {m.content || (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Working\u2026
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {streaming && messages[messages.length - 1]?.role !== 'user' && (
                <div className="flex justify-start">
                  <div className="max-w-[92%] rounded-2xl px-3 py-2 bg-white/8 border border-white/8 rounded-bl-sm">
                    <span className="inline-flex items-center gap-1 text-[11px] text-white/40 font-sans animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" /> AI is writing\u2026
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Error */}
            {labError && (
              <div className="mx-3 mb-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-sans flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {labError}
              </div>
            )}

            {/* Input */}
            <div className="px-3 py-3 border-t border-white/8 space-y-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPrompt(); }
                }}
                placeholder="e.g. Modern dental clinic with amber tones, hero with CTA\u2026"
                disabled={streaming}
                rows={3}
                className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-sans text-white placeholder:text-white/20 focus:outline-none focus:border-accent/60 focus:bg-white/8 transition-all disabled:opacity-40"
              />
              <button
                onClick={sendPrompt}
                disabled={streaming || !input.trim() || (!aiEnabled && !apiKey.trim())}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-bold font-sans shadow-sm hover:bg-accent/90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {streaming ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Building\u2026</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> Build My Website</>
                )}
              </button>
              <button
                onClick={() => { sfx.tap(); fileInputRef.current?.click(); }}
                disabled={uploading}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-white/15 text-white/40 hover:text-white/60 hover:border-white/25 text-[11px] font-sans transition-all"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {uploading ? 'Processing file\u2026' : 'or upload a .html file'}
              </button>
              {uploadError && (
                <p className="text-[10px] text-red-400 font-sans text-center">{uploadError}</p>
              )}
              <input ref={fileInputRef} type="file" accept=".html,text/html" className="hidden" onChange={handleFileUpload} />
            </div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#f4f2ee]">

          {/* Toolbar */}
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-border-light shrink-0">
            {/* Device toggle */}
            <div className="flex items-center bg-[#f4f2ee] rounded-lg p-0.5">
              <button
                onClick={() => { sfx.toggle(); setDevice('desktop'); }}
                className={`p-1.5 rounded-md transition-all ${device === 'desktop' ? 'bg-white shadow-sm text-accent' : 'text-ink-secondary hover:text-ink'}`}
                title="Desktop"
              >
                <Monitor className="w-4 h-4" />
              </button>
              <button
                onClick={() => { sfx.toggle(); setDevice('mobile'); }}
                className={`p-1.5 rounded-md transition-all ${device === 'mobile' ? 'bg-white shadow-sm text-accent' : 'text-ink-secondary hover:text-ink'}`}
                title="Mobile"
              >
                <Smartphone className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] font-sans text-ink-secondary">
              <FlaskConical className="w-3.5 h-3.5" />
              {mode === 'idle' ? 'Describe your website above' : 'Live preview \u2014 edit mode'}
            </div>

            <div className="ml-auto flex items-center gap-2">
              {mode === 'active' && (
                <button
                  onClick={() => {
                    sfx.tap();
                    setMode('idle');
                    setHtml('');
                    setPreviewHtml('');
                    setMessages([]);
                    setTitle('');
                    setNiche('');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-main text-ink-secondary hover:text-ink text-xs font-medium font-sans active:scale-[0.98] transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> New
                </button>
              )}
              {mode === 'active' && html && (
                <button
                  onClick={openSave}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold font-sans shadow-sm hover:bg-accent/90 active:scale-[0.98] transition-all"
                >
                  <BookmarkPlus className="w-4 h-4" /> Convert to Template
                </button>
              )}
            </div>
          </div>

          {/* Preview Area */}
          <div className="flex-1 overflow-auto flex justify-center items-start p-4">
            {mode === 'idle' ? (
              /* IDLE STATE */
              <div className="w-full max-w-2xl animate-editor-rise">
                <div className="text-center mb-8">
                  <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/20 to-violet-500/20 border border-accent/20 flex items-center justify-center mx-auto mb-4">
                    <FlaskConical className="w-8 h-8 text-accent" />
                    <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-accent flex items-center justify-center animate-bounce">
                      <Sparkles className="w-3 h-3 text-white" />
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold font-sans text-ink mb-2">Build any website with AI</h2>
                  <p className="text-sm text-ink-secondary font-sans max-w-md mx-auto leading-relaxed">
                    Describe what you want in plain English. AI writes the complete HTML \u2014 preview it live, edit it, and save it as a template.
                  </p>
                </div>

                {/* Quick-start cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
                  {[
                    { emoji: '\u{1F9E7}', label: 'Dental Clinic', prompt: 'A modern dental clinic website with warm amber tones, hero section with booking CTA, services grid, patient testimonials, before/after gallery, and contact form.' },
                    { emoji: '\u{1F3E8}', label: 'Barber Shop', prompt: 'A luxury barber shop website with dark wood tones, vintage aesthetic, services menu with prices, about the barbers section, and a booking CTA.' },
                    { emoji: '\u2744\uFE0F', label: 'HVAC Service', prompt: 'A bold HVAC company website with navy and orange, 24/7 emergency banner, services checklist, service area map, and a CTA to call.' },
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={() => {
                        sfx.tap();
                        setNiche(item.label);
                        setInput(item.prompt);
                        setMode('active');
                      }}
                      className="group flex flex-col items-center gap-2 p-5 rounded-2xl bg-white border border-border-main hover:border-accent/50 hover:shadow-lg transition-all text-center"
                    >
                      <span className="text-4xl">{item.emoji}</span>
                      <span className="text-sm font-bold font-sans text-ink">{item.label}</span>
                      <span className="text-[10px] text-ink-secondary font-sans">Tap to start</span>
                    </button>
                  ))}
                </div>

                {/* Upload CTA */}
                <div className="bg-white rounded-2xl border border-dashed border-border-main p-6 text-center">
                  <p className="text-sm font-semibold font-sans text-ink mb-1">Have an HTML file?</p>
                  <p className="text-xs text-ink-secondary font-sans mb-3">
                    Upload it and AI will convert it to a Lunao template automatically.
                  </p>
                  <button
                    onClick={() => { sfx.tap(); fileInputRef.current?.click(); }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-ink text-white text-sm font-semibold font-sans hover:bg-ink/90 active:scale-[0.98] transition-all"
                  >
                    <Upload className="w-4 h-4" /> Upload HTML File
                  </button>
                </div>
              </div>
            ) : (
              /* LIVE PREVIEW */
              <div
                className={`w-full bg-white rounded-xl border border-border-main shadow-lg overflow-hidden transition-all ${
                  device === 'mobile' ? 'max-w-[400px]' : 'max-w-[1100px]'
                }`}
                style={{ minHeight: 'calc(100vh - 200px)' }}
              >
                {streaming && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs font-sans text-blue-700">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating your website in real-time\u2026
                  </div>
                )}
                <iframe
                  ref={iframeRef}
                  srcDoc={previewHtml || html || BLANK_CANVAS}
                  onLoad={onIframeLoad}
                  title="Site preview"
                  className="w-full border-0 bg-white block"
                  style={{ minHeight: 'calc(100vh - 220px)' }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SAVE AS TEMPLATE DIALOG */}
      {saveOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm animate-editor-fade"
          onClick={(e) => { if (e.target === e.currentTarget) { sfx.close(); setSaveOpen(false); } }}
        >
          <div
            className="w-full max-w-md bg-[#111118] rounded-2xl border border-white/10 shadow-[0_24px_70px_rgba(0,0,0,0.6)] p-6 animate-editor-rise"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center">
                  <BookmarkPlus className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h2 className="text-lg font-bold font-sans text-white">Save as Template</h2>
                  <p className="text-[11px] text-white/40 font-sans">Turn your AI site into a reusable template</p>
                </div>
              </div>
              <button
                onClick={() => { sfx.close(); setSaveOpen(false); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold font-sans text-white/60 mb-1.5">Template Name</label>
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. Modern Dental Clinic"
                className="w-full px-3.5 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white text-sm font-sans placeholder:text-white/20 focus:outline-none focus:border-accent/60 transition-colors"
                autoFocus
              />
            </div>

            <div className="mb-5">
              <label className="block text-xs font-semibold font-sans text-white/60 mb-1.5">Category</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { sfx.toggle(); setSaveCategory(null); setShowNewCat(false); }}
                  className={`shrink-0 inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold font-sans border transition-all active:scale-[0.96] ${
                    saveCategory === null && !showNewCat
                      ? 'bg-white text-ink border-white'
                      : 'bg-transparent text-white/60 border-white/15 hover:border-white/30'
                  }`}
                >
                  Uncategorized
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { sfx.toggle(); setSaveCategory(c.id); setShowNewCat(false); }}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold font-sans border transition-all active:scale-[0.96] ${
                      saveCategory === c.id ? 'border-current' : 'border-white/15'
                    }`}
                    style={
                      saveCategory === c.id
                        ? { color: c.color, backgroundColor: c.color + '20', borderColor: c.color }
                        : {}
                    }
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </button>
                ))}
                <button
                  onClick={() => { sfx.tap(); setShowNewCat(!showNewCat); setSaveCategory(null); }}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold font-sans border border-dashed border-white/15 text-white/40 hover:text-white/60 hover:border-white/25 transition-all"
                >
                  <span className="text-sm">+</span> New
                </button>
              </div>
              {showNewCat && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex gap-1">
                    {['#2563EB', '#7C3AED', '#DB2777', '#DC2626', '#D97706', '#16A34A', '#0891B2', '#4F46E5'].map((c) => (
                      <button
                        key={c}
                        onClick={() => { sfx.tap(); setSaveNewCatColor(c); }}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${
                          saveNewCatColor === c ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <input
                    value={saveNewCat}
                    onChange={(e) => setSaveNewCat(e.target.value)}
                    placeholder="Category name\u2026"
                    className="flex-1 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white text-xs font-sans placeholder:text-white/20 focus:outline-none focus:border-accent/60"
                    autoFocus
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => { sfx.close(); setSaveOpen(false); }}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 text-sm font-semibold font-sans hover:bg-white/10 active:scale-[0.98] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !saveName.trim()}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-bold font-sans shadow-sm hover:bg-accent/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {saving ? 'Saving\u2026' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
