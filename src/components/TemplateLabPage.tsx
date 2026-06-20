import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Key, ChevronDown, Loader2, Sparkles, AlertCircle,
  FlaskConical, Layout, Monitor, Smartphone, Upload, Copy,
  CheckSquare, RotateCcw, BookmarkPlus, X, Code2, Check, Plus,
  RefreshCw, Wand2,
} from 'lucide-react';
import {
  AiChatMessage, SiteHistoryEntry,
  listSiteHistory, createSiteHistory, convertHistoryToTemplate,
  streamAiEdit, processUploadedHtml,
  listTemplateCategories, createTemplateCategory,
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
// Helpers: compile preview HTML and summarize changes
// ---------------------------------------------------------------------------

const PLACEHOLDER_MAP: Record<string, string> = {
  BUSINESS_NAME: 'Radiant Smiles Dental',
  BUSINESS_NAME_SHORT: 'Radiant',
  CITY: 'Austin, TX',
  STATE: 'TX',
  PHONE_DISPLAY: '(512) 555-0199',
  PHONE_RAW: '5125550199',
  EMAIL: 'hello@example.com',
  ADDRESS: '3801 Capital of Texas Hwy, Austin, TX',
  GOOGLE_RATING: '4.9',
  GOOGLE_REVIEW_COUNT: '342',
  INSTAGRAM_HANDLE: 'radiant_smiles',
  FACEBOOK_URL: 'https://facebook.com/radiantsmiles',
  YEARS_IN_BUSINESS: '2012',
  DOCTOR_NAME: 'Dr. Alex Rivera',
  AVERAGE_RATING: '4.9',
  MEMBERS_COUNT: '1,200',
  TRAINERS_COUNT: '8',
  SITE_URL: 'https://example.com',
};

function compilePreview(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') return rawHtml || '';
  return rawHtml.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    key in PLACEHOLDER_MAP ? PLACEHOLDER_MAP[key] : `{{${key}}}`,
  );
}

function summarizeHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') return 'Done! Preview updated.';
  const hasPlaceholders = rawHtml.includes('{{');
  const titleMatch = rawHtml.match(/<title>([^<]{0,60})/i);
  const parts: string[] = [];
  if (hasPlaceholders) parts.push('Personalization ready');
  if (titleMatch) parts.push(`Title: "${titleMatch[1].trim()}"`);
  return parts.length > 0 ? parts.join(' \u00b7 ') : 'Done! Preview updated.';
}

/**
 * Validate HTML — return null if it's not a valid HTML doc, otherwise return as-is.
 */
function validateHtml(html: string): string | null {
  if (!html || typeof html !== 'string') return null;
  const trimmed = html.trim();
  if (!trimmed) return null;
  // Must contain html tag
  if (!/<html[\s>]/i.test(trimmed)) return null;
  return trimmed;
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

  // Layout mode
  const [mode, setMode] = useState<'idle' | 'active'>('idle');
  // html = raw HTML with {{PLACEHOLDERS}}
  const [html, setHtml] = useState('');
  // previewHtml = compiled HTML with demo values — shown in the iframe
  const [previewHtml, setPreviewHtml] = useState('');
  // thinkingAcc = live thinking output from the AI
  const [thinkingAcc, setThinkingAcc] = useState('');
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [history, setHistory] = useState<SiteHistoryEntry[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [title, setTitle] = useState('');
  // Show/hide the prompt input area (collapsed after first prompt submitted)
  const [showPromptInput, setShowPromptInput] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [niche, setNiche] = useState('');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [labError, setLabError] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveCategory, setSaveCategory] = useState<string | null>(null);
  const [saveNewCat, setSaveNewCat] = useState('');
  const [saveNewCatColor, setSaveNewCatColor] = useState('#2563EB');
  const [showNewCat, setShowNewCat] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string; color: string }[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // CRITICAL: Push previewHtml to iframe ref the MOMENT it changes.
  // This bypasses React re-render timing — iframe always shows the latest.
  useEffect(() => {
    if (iframeRef.current && previewHtml) {
      iframeRef.current.srcdoc = previewHtml;
    }
  }, [previewHtml]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinkingAcc]);

  useEffect(() => {
    setLoadingHistory(true);
    listSiteHistory()
      .then(h => setHistory(h))
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));
    const savedKey = localStorage.getItem('lunao_user_anthropic_key');
    if (savedKey) setApiKey(savedKey);
  }, []);

  const flashError = (msg: string) => {
    sfx.error();
    setLabError(msg);
    setTimeout(() => setLabError(null), 5000);
  };

  // -------------------------------------------------------------------------
  // Preview refresh
  // -------------------------------------------------------------------------
  const refreshPreview = () => {
    sfx.tap();
    if (previewHtml && iframeRef.current) {
      iframeRef.current.srcdoc = previewHtml;
    }
  };

  // -------------------------------------------------------------------------
  // Title editing helpers
  // -------------------------------------------------------------------------
  const startEditTitle = () => {
    setTitleDraft(title);
    setEditingTitle(true);
  };

  const commitTitle = () => {
    setTitle(titleDraft.trim() || title);
    setEditingTitle(false);
  };

  // -------------------------------------------------------------------------
  // File upload
  // -------------------------------------------------------------------------
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
        setShowPromptInput(false);
        const { rawHtml: processed, previewHtml: preview } = await processUploadedHtml({
          html: rawHtml,
          niche: niche || 'Local Business',
          anthropicApiKey: apiKey.trim() || undefined,
        });
        const compiled = compilePreview(processed);
        setHtml(processed);
        setPreviewHtml(compiled); // useEffect pushes to iframe instantly
        setTitle(niche || 'Uploaded Template');
        setMessages([{ role: 'assistant', content: 'File processed! Preview is ready on the right. Describe any changes you want below.' }]);
        sfx.aiDone();
        const entry = await createSiteHistory({
          title: niche || 'Uploaded Template',
          niche: niche || 'Local Business',
          html: processed,
          snapshotLabel: 'Uploaded HTML',
        });
        setHistory(prev => [entry as any, ...prev]);
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

  // -------------------------------------------------------------------------
  // Send prompt to AI
  // -------------------------------------------------------------------------
  const sendPrompt = async () => {
    const instruction = input.trim();
    if (!instruction || streaming) return;
    if (!aiEnabled && !apiKey.trim()) {
      flashError('AI needs an Anthropic key. Add one below or configure the server key.');
      return;
    }
    sfx.magic();
    const history_msgs = messages.slice(-6);
    setMessages(m => [...m, { role: 'user', content: instruction }]);
    setInput('');
    setStreaming(true);
    setMode('active');
    setLabError(null);
    setThinkingAcc('');
    // Hide the prompt area — chat now dominates
    setShowPromptInput(false);

    try {
      const base = html || BLANK_CANVAS;
      const result = await streamAiEdit(
        { html: base, instruction, history: history_msgs, anthropicApiKey: apiKey.trim() || undefined },
        (_fullSoFar) => {
          // preview updates via the useEffect watching previewHtml
        },
        (thinkingText) => {
          setThinkingAcc(prev => prev + thinkingText);
        },
      );

      const finalCompiled = compilePreview(result);
      setHtml(result);
      setPreviewHtml(finalCompiled); // triggers the useEffect → iframe gets updated instantly
      setThinkingAcc('');

      const summary = summarizeHtml(result);
      setMessages(m => {
        const next = [...m];
        next[next.length - 1] = {
          role: 'assistant',
          content: summary || 'Done! Preview updated. Keep editing or save as a template.',
        };
        return next;
      });
      sfx.aiDone();
      try {
        const entry = await createSiteHistory({
          title: title || instruction.slice(0, 40),
          niche,
          html: result,
          snapshotLabel: instruction.slice(0, 60),
        });
        setHistory(prev => [entry as any, ...prev]);
      } catch { /* ignore */ }
    } catch (err: any) {
      sfx.error();
      setThinkingAcc('');
      setMessages(m => {
        const next = [...m];
        next[next.length - 1] = { role: 'assistant', content: 'Error: ' + (err?.message || 'Generation failed.') };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  };

  // -------------------------------------------------------------------------
  // Load a history entry
  // -------------------------------------------------------------------------
  const loadEntry = (entry: SiteHistoryEntry) => {
    sfx.open();
    const compiled = compilePreview(entry.html);
    setHtml(entry.html);
    setPreviewHtml(compiled); // useEffect will push to iframe
    setTitle(entry.title);
    setNiche(entry.niche);
    setMode('active');
    setMessages([{ role: 'assistant', content: 'Loaded "' + (entry.snapshotLabel || entry.title) + '". Preview on the right. Keep editing below.' }]);
    setShowPromptInput(false); // collapse input after loading
  };

  // -------------------------------------------------------------------------
  // Save as template
  // -------------------------------------------------------------------------
  const openSave = async () => {
    sfx.tap();
    setSaveOpen(true);
    setSaveName(title || 'My Custom Template');
    setSaveCategory(null);
    setSaveNewCat('');
    setSaveNewCatColor('#2563EB');
    setShowNewCat(false);
    try {
      const cats = await listTemplateCategories();
      setCategories(cats.map((c: any) => ({ id: c.id, name: c.name, color: c.color })));
    } catch { setCategories([]); }
  };

  const handleSave = async () => {
    if (!saveName.trim()) { sfx.error(); return; }
    sfx.primary();
    setSaving(true);
    try {
      let catId = saveCategory;
      if (showNewCat && saveNewCat.trim()) {
        const cat = await createTemplateCategory({ name: saveNewCat.trim(), color: saveNewCatColor });
        catId = cat.id;
        setCategories(prev => [...prev, { id: cat.id, name: cat.name, color: cat.color }]);
      }
      const entry = await createSiteHistory({ title: saveName.trim(), niche, html });
      const result = await convertHistoryToTemplate({ historyId: entry.id, name: saveName.trim(), categoryId: catId, niche });
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

  const relTime = (ms: number | null) => {
    if (!ms) return 'recently';
    const diff = Date.now() - ms * 1000;
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    const d = Math.floor(h / 24);
    if (d < 30) return d + 'd ago';
    return new Date(ms * 1000).toLocaleDateString();
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const isActive = mode === 'active';

  return (
    <div className="fixed inset-0 z-[60] bg-off-white flex flex-col animate-editor-rise overflow-hidden">

      {/* ============================================================
          TOP HEADER BAR
      ============================================================ */}
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-border-main shrink-0">
        <button
          onClick={() => { sfx.close(); onClose(); }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-border-main text-ink-secondary hover:text-ink hover:border-ink-tertiary text-sm font-medium font-sans active:scale-[0.98] transition-all shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent-soft flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-base font-bold font-sans text-ink leading-none">Template Lab</h1>
            <p className="text-[11px] text-ink-tertiary font-sans mt-0.5">
              {isActive ? title || 'Editing' : 'Build any website with AI'}
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold font-sans ${
            !isActive ? 'bg-amber-50 text-amber-700 border border-amber-200' :
            streaming ? 'bg-blue-50 text-blue-700 border border-blue-200' :
            'bg-success-soft text-success border border-green-200'
          }`}>
            {streaming && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {!isActive && <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
            {isActive && !streaming && <div className="w-1.5 h-1.5 rounded-full bg-success" />}
            {streaming ? 'Building\u2026' : !isActive ? 'Ready' : 'Editing'}
          </span>
          <button
            onClick={() => { sfx.open(); onBrowseTemplates(); }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-border-main text-ink-secondary hover:text-ink text-sm font-medium font-sans active:scale-[0.98] transition-all shadow-sm"
          >
            <Layout className="w-4 h-4" />
            Templates
          </button>
        </div>
      </div>

      {/* ============================================================
          MAIN WORKSPACE
          - idle: centered welcome cards
          - active: 320px left sidebar + right preview
      ============================================================ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ----------------------------------------------------
            LEFT SIDEBAR — always visible, adapts to context
        ---------------------------------------------------- */}
        <div className="w-[320px] shrink-0 flex flex-col overflow-hidden bg-white border-r border-border-main">

          {/* ---- API Key ---- */}
          <div className="px-4 pt-4 pb-3 border-b border-border-light">
            <button
              onClick={() => { sfx.toggle(); setShowApiKey(!showApiKey); }}
              className="w-full flex items-center gap-2 text-[12px] font-semibold font-sans text-ink-secondary hover:text-ink transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-accent-soft flex items-center justify-center shrink-0">
                <Key className="w-3.5 h-3.5 text-accent" />
              </div>
              <span className="flex-1 text-left text-xs">Anthropic Key</span>
              <div className={`w-2 h-2 rounded-full shrink-0 ${apiKey.trim() ? 'bg-success' : 'bg-ink-tertiary'}`} />
              <ChevronDown className={`w-3.5 h-3.5 text-ink-tertiary transition-transform ${showApiKey ? 'rotate-180' : ''}`} />
            </button>

            {showApiKey && (
              <div className="mt-3 space-y-2">
                <div className="relative">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-ant-api03\u2026"
                    className="w-full pr-20 pl-3 py-2 rounded-xl border border-border-main bg-off-white text-ink text-xs font-mono placeholder:text-ink-tertiary focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
                  />
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-accent hover:text-accent-hover font-semibold"
                  >
                    Get key
                  </a>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-sans text-ink-tertiary">
                    {apiKey.trim() ? 'Key saved \u2014 used for generation' : 'Paste key + click Set'}
                  </p>
                  <button
                    onClick={() => {
                      if (apiKey.trim()) {
                        localStorage.setItem('lunao_user_anthropic_key', apiKey.trim());
                        sfx.saved();
                      }
                    }}
                    disabled={!apiKey.trim()}
                    className="inline-flex items-center px-3 py-1.5 rounded-lg bg-accent text-white text-[11px] font-bold font-sans hover:bg-accent-hover active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Set
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ---- Chat messages — always visible ---- */}
          <div className="flex-1 overflow-y-auto px-4 pt-3 pb-2 space-y-2 min-h-0">
            {messages.length === 0 && !streaming && (
              <div className="text-center py-3">
                <p className="text-[11px] text-ink-tertiary font-sans italic">
                  Describe a change and AI updates the preview instantly\u2026
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[93%] rounded-2xl px-3 py-2.5 text-[12px] font-sans leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-accent text-white rounded-br-sm'
                    : 'bg-off-white border border-border-light text-ink rounded-bl-sm'
                }`}>
                  {m.content || (
                    <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Working\u2026</span>
                  )}
                </div>
              </div>
            ))}

            {/* AI thinking bubble */}
            {streaming && (
              <div className="flex justify-start">
                <div className="max-w-[93%] rounded-2xl px-3 py-2.5 bg-off-white border border-border-light rounded-bl-sm">
                  <div className="flex items-center gap-1 mb-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    <span className="text-[10px] text-accent font-semibold font-sans">Thinking</span>
                  </div>
                  {thinkingAcc ? (
                    <p className="text-[11px] text-ink-secondary font-sans leading-relaxed italic">
                      {thinkingAcc.slice(-200)}
                    </p>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-ink-tertiary font-sans animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" /> Preparing…
                    </span>
                  )}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ---- Recent builds (compact) ---- */}
          {history.length > 0 && (
            <div className="px-4 py-2 border-t border-border-light">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold font-sans text-ink-tertiary uppercase tracking-wide">Recent</span>
              </div>
              <div className="space-y-0.5 max-h-16 overflow-y-auto">
                {history.slice(0, 3).map(entry => (
                  <button
                    key={entry.id}
                    onClick={() => loadEntry(entry)}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-accent-soft transition-colors group"
                  >
                    <p className="text-[11px] font-semibold font-sans text-ink group-hover:text-accent truncate">
                      {entry.title || entry.snapshotLabel || 'Build'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ---- Prompt input — collapses after submit ---- */}
          <div className="border-t border-border-light shrink-0">
            {/* Show-input button when collapsed */}
            {!showPromptInput && !streaming && (
              <button
                onClick={() => { sfx.tap(); setShowPromptInput(true); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold font-sans text-accent hover:bg-accent-soft transition-all"
              >
                <Wand2 className="w-3.5 h-3.5" />
                Continue editing\u2026
              </button>
            )}

            {/* Prompt area — smooth collapse animation */}
            <div
              className="overflow-hidden transition-all duration-300 ease-in-out"
              style={{
                maxHeight: showPromptInput ? '500px' : '0px',
                opacity: showPromptInput ? 1 : 0,
              }}
            >
              <div className="px-4 pb-4 pt-2 space-y-2">
                {labError && (
                  <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[10px] font-sans flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    {labError}
                  </div>
                )}
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendPrompt();
                    }
                  }}
                  placeholder="Describe a change\u2026 e.g. Change site name to Radiant Dental"
                  disabled={streaming}
                  rows={2}
                  className="w-full resize-none rounded-xl border border-border-main bg-off-white px-3 py-2 text-xs font-sans text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all disabled:opacity-50 scrollbar-none"
                  autoFocus
                />
                <button
                  onClick={sendPrompt}
                  disabled={streaming || !input.trim() || (!aiEnabled && !apiKey.trim())}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-bold font-sans shadow-sm hover:bg-accent-hover active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {streaming ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Building\u2026</>
                  ) : (
                    <><Wand2 className="w-4 h-4" /> Edit Site</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------
            MAIN CONTENT — welcome OR preview
        ---------------------------------------------------- */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* ========== WELCOME / IDLE MODE ========== */}
          {!isActive && (
            <div className="flex-1 overflow-y-auto flex justify-center items-start pt-10 pb-6 px-6">
              <div className="w-full max-w-2xl animate-editor-rise">
                {/* Hero */}
                <div className="text-center mb-8">
                  <div className="w-16 h-16 rounded-2xl bg-accent-soft flex items-center justify-center mx-auto mb-4">
                    <FlaskConical className="w-8 h-8 text-accent" />
                  </div>
                  <h2 className="text-2xl font-bold font-sans text-ink mb-2">Build any website with AI</h2>
                  <p className="text-sm text-ink-secondary font-sans max-w-md mx-auto leading-relaxed">
                    Describe what you want in plain English. AI writes the complete HTML \u2014 preview it live, edit it, and save it as a reusable template.
                  </p>
                </div>

                {/* How it works cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                  {[
                    { icon: String.fromCodePoint(0x270F, 0xFE0F), label: 'Describe your site', hint: 'e.g. Modern dental clinic with amber tones, hero with booking CTA' },
                    { icon: String.fromCodePoint(0x1F3AF), label: 'AI builds instantly', hint: 'Live preview updates as AI writes \u2014 see changes in real-time' },
                    { icon: String.fromCodePoint(0x1F4C1), label: 'Save as template', hint: 'Convert to reusable Lunao template and use in campaigns' },
                  ].map(f => (
                    <div key={f.label} className="flex items-start gap-3 p-4 rounded-2xl bg-white border border-border-main">
                      <span className="text-2xl leading-none mt-0.5">{f.icon}</span>
                      <div>
                        <p className="text-sm font-bold font-sans text-ink leading-tight">{f.label}</p>
                        <p className="text-[11px] font-sans text-ink-tertiary leading-relaxed mt-1">{f.hint}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Quick-start */}
                <div className="bg-white rounded-2xl border border-border-main p-5 mb-4">
                  <p className="text-xs font-bold font-sans text-ink-tertiary uppercase tracking-wide mb-3">Quick start</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {[
                      { emoji: String.fromCodePoint(0x1F9E7), label: 'Dental Clinic', prompt: 'A modern dental clinic website with warm amber tones, hero section with booking CTA, services grid, patient testimonials, and contact form.', color: '#0EA5A0' },
                      { emoji: String.fromCodePoint(0x1F3E8), label: 'Barber Shop', prompt: 'A luxury barber shop website with dark wood tones, vintage aesthetic, services menu with prices, about the barbers section, and a booking CTA.', color: '#C9A96E' },
                      { emoji: String.fromCodePoint(0x2744, 0xFE0F), label: 'HVAC Service', prompt: 'A bold HVAC company website with navy and orange, 24/7 emergency banner, services checklist, and a CTA to call.', color: '#F97316' },
                    ].map(item => (
                      <button
                        key={item.label}
                        onClick={() => {
                          sfx.tap();
                          setNiche(item.label);
                          setTitle(item.label);
                          setInput(item.prompt);
                          setMode('active');
                          setMessages([{ role: 'user', content: item.prompt }]);
                          setStreaming(true);
                          setThinkingAcc('');
                          setLabError(null);
                          streamAiEdit(
                            { html: BLANK_CANVAS, instruction: item.prompt, anthropicApiKey: apiKey.trim() || undefined },
                            (_fullSoFar) => {},
                            (thinkingText) => setThinkingAcc(prev => prev + thinkingText),
                          ).then(result => {
                            const finalCompiled = compilePreview(result);
                            setHtml(result);
                            setPreviewHtml(finalCompiled); // triggers useEffect → iframe updated
                            setThinkingAcc('');
                            setMessages(m => {
                              const next = [...m];
                              next[next.length - 1] = { role: 'assistant', content: summarizeHtml(result) || 'Done! Preview ready.' };
                              return next;
                            });
                            sfx.aiDone();
                            createSiteHistory({ title: item.label, niche: item.label, html: result, snapshotLabel: item.prompt.slice(0, 60) }).catch(() => {});
                          }).catch((err: any) => {
                            sfx.error();
                            setThinkingAcc('');
                            setMessages(m => {
                              const next = [...m];
                              next[next.length - 1] = { role: 'assistant', content: 'Error: ' + (err?.message || 'Generation failed.') };
                              return next;
                            });
                          }).finally(() => setStreaming(false));
                        }}
                        className="flex flex-col items-center gap-1.5 p-4 rounded-xl border border-border-main hover:border-[var(--c)] hover:shadow-md transition-all text-center"
                        style={{ '--c': item.color } as React.CSSProperties}
                      >
                        <span className="text-3xl">{item.emoji}</span>
                        <span className="text-xs font-bold font-sans text-ink">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Upload */}
                <div className="bg-white rounded-2xl border border-dashed border-border-main p-5 text-center">
                  <p className="text-sm font-semibold font-sans text-ink mb-1">Have an HTML file?</p>
                  <p className="text-xs text-ink-secondary font-sans mb-4">
                    Upload it and AI will convert it to a Lunao template \u2014 adding all personalization placeholders automatically.
                  </p>
                  <button
                    onClick={() => { sfx.tap(); fileInputRef.current?.click(); }}
                    disabled={uploading}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-white text-sm font-bold font-sans hover:bg-accent-hover active:scale-[0.98] transition-all shadow-sm disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {uploading ? 'Processing\u2026' : 'Upload HTML File'}
                  </button>
                  {uploadError && (
                    <p className="mt-2 text-xs text-red-500 font-sans">{uploadError}</p>
                  )}
                  <input ref={fileInputRef} type="file" accept=".html,text/html" className="hidden" onChange={handleFileUpload} />
                  <p className="mt-3 text-[10px] text-ink-tertiary font-sans">Max 10MB \u00b7 Single .html file</p>
                </div>
              </div>
            </div>
          )}

          {/* ========== PREVIEW MODE (active) ========== */}
          {isActive && (
            <>
              {/* Toolbar */}
              <div className="flex items-center gap-3 px-5 py-2.5 bg-white border-b border-border-main shrink-0">
                {/* Device toggle */}
                <div className="flex items-center bg-off-white rounded-xl p-1 gap-0.5">
                  <button
                    onClick={() => { sfx.toggle(); setDevice('desktop'); }}
                    className={`p-2 rounded-lg transition-all ${device === 'desktop' ? 'bg-white shadow-sm text-accent' : 'text-ink-tertiary hover:text-ink'}`}
                    title="Desktop"
                  >
                    <Monitor className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { sfx.toggle(); setDevice('mobile'); }}
                    className={`p-2 rounded-lg transition-all ${device === 'mobile' ? 'bg-white shadow-sm text-accent' : 'text-ink-tertiary hover:text-ink'}`}
                    title="Mobile"
                  >
                    <Smartphone className="w-4 h-4" />
                  </button>
                </div>

                {/* Site title — click to edit */}
                {editingTitle ? (
                  <input
                    autoFocus
                    value={titleDraft}
                    onChange={e => setTitleDraft(e.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitTitle();
                      if (e.key === 'Escape') { setEditingTitle(false); }
                    }}
                    className="flex-1 max-w-[200px] px-2 py-1 rounded-lg border border-accent bg-white text-xs font-semibold font-sans text-ink focus:outline-none"
                  />
                ) : (
                  <button
                    onClick={startEditTitle}
                    title="Click to rename"
                    className="flex items-center gap-1.5 text-xs font-semibold font-sans text-ink-secondary hover:text-ink px-2 py-1 rounded-lg hover:bg-off-white transition-all"
                  >
                    <FlaskConical className="w-3.5 h-3.5" />
                    <span className="max-w-[200px] truncate">{title || 'Untitled site'}</span>
                    <span className="text-ink-tertiary text-[10px] opacity-0 group-hover:opacity-100">✎</span>
                  </button>
                )}

                {/* Build indicator */}
                {streaming && (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-xs font-semibold font-sans text-blue-600">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Generating
                  </div>
                )}

                <div className="ml-auto flex items-center gap-2">
                  {/* Refresh */}
                  <button
                    onClick={refreshPreview}
                    title="Refresh preview"
                    className="p-2 rounded-xl border border-border-main text-ink-secondary hover:text-ink hover:border-ink-tertiary active:scale-[0.97] transition-all bg-white shadow-sm"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>

                  {/* New */}
                  <button
                    onClick={() => {
                      sfx.tap();
                      setMode('idle');
                      setHtml('');
                      setPreviewHtml('');
                      setMessages([]);
                      setTitle('');
                      setNiche('');
                      setThinkingAcc('');
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border-main text-ink-secondary hover:text-ink text-sm font-medium font-sans active:scale-[0.98] transition-all bg-white shadow-sm"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> New
                  </button>

                  {/* Convert to Template */}
                  {html && (
                    <button
                      onClick={openSave}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold font-sans shadow-sm hover:bg-accent-hover active:scale-[0.98] transition-all"
                    >
                      <BookmarkPlus className="w-4 h-4" /> Save as Template
                    </button>
                  )}
                </div>
              </div>

              {/* Preview iframe */}
              <div className="flex-1 overflow-auto flex justify-center items-start p-5 bg-off-white">
                <div
                  className={`w-full bg-white rounded-2xl border border-border-main shadow-lg overflow-hidden ${
                    device === 'mobile' ? 'max-w-[400px]' : 'max-w-[1100px]'
                  }`}
                  style={{ minHeight: 'calc(100vh - 170px)' }}
                >
                  <iframe
                    ref={iframeRef}
                    srcdoc={previewHtml || BLANK_CANVAS}
                    title="Site preview"
                    className="w-full border-0 bg-white block"
                    style={{ minHeight: 'calc(100vh - 200px)' }}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ============================================================
          SAVE AS TEMPLATE DIALOG
      ============================================================ */}
      {saveOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-editor-fade"
          onClick={(e) => { if (e.target === e.currentTarget) { sfx.close(); setSaveOpen(false); } }}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-[0_24px_70px_rgba(0,0,0,0.15)] p-6 animate-editor-rise"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center">
                  <BookmarkPlus className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h2 className="text-lg font-bold font-sans text-ink">Save as Template</h2>
                  <p className="text-xs text-ink-secondary font-sans">Turn your AI site into a reusable template</p>
                </div>
              </div>
              <button
                onClick={() => { sfx.close(); setSaveOpen(false); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-tertiary hover:text-ink hover:bg-off-white transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold font-sans text-ink-secondary mb-1.5">Template Name</label>
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. Modern Dental Clinic"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border-main bg-off-white text-ink text-sm font-sans placeholder:text-ink-tertiary focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
                autoFocus
              />
            </div>

            <div className="mb-5">
              <label className="block text-xs font-semibold font-sans text-ink-secondary mb-1.5">Category</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { sfx.toggle(); setSaveCategory(null); setShowNewCat(false); }}
                  className={`shrink-0 inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold font-sans border transition-all active:scale-[0.96] ${
                    saveCategory === null && !showNewCat
                      ? 'bg-ink text-white border-ink'
                      : 'bg-white text-ink-secondary border-border-main hover:border-ink-tertiary'
                  }`}
                >
                  Uncategorized
                </button>
                {categories.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { sfx.toggle(); setSaveCategory(c.id); setShowNewCat(false); }}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold font-sans border transition-all active:scale-[0.96] ${
                      saveCategory === c.id ? '' : 'bg-white text-ink-secondary border-border-main hover:border-ink-tertiary'
                    }`}
                    style={saveCategory === c.id ? { color: c.color, backgroundColor: c.color + '15', borderColor: c.color } : {}}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </button>
                ))}
                <button
                  onClick={() => { sfx.tap(); setShowNewCat(!showNewCat); setSaveCategory(null); }}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold font-sans border border-dashed border-border-main text-ink-tertiary hover:text-ink-secondary hover:border-ink-tertiary transition-all"
                >
                  <Plus className="w-3 h-3" /> New
                </button>
              </div>

              {showNewCat && (
                <div className="mt-3 animate-editor-rise">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex gap-1">
                      {['#2563EB', '#7C3AED', '#DB2777', '#DC2626', '#D97706', '#16A34A', '#0891B2', '#4F46E5'].map(c => (
                        <button
                          key={c}
                          onClick={() => { sfx.tap(); setSaveNewCatColor(c); }}
                          className={`w-6 h-6 rounded-full border-2 transition-all ${saveNewCatColor === c ? 'border-ink scale-110' : 'border-transparent'}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <input
                      value={saveNewCat}
                      onChange={(e) => setSaveNewCat(e.target.value)}
                      placeholder="Category name\u2026"
                      className="flex-1 px-3 py-1.5 rounded-lg border border-border-main bg-off-white text-ink text-xs font-sans placeholder:text-ink-tertiary focus:outline-none focus:border-accent transition-all"
                      autoFocus
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2.5">
              <button
                onClick={() => { sfx.close(); setSaveOpen(false); }}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-border-main text-ink-secondary text-sm font-semibold font-sans hover:bg-off-white active:scale-[0.98] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !saveName.trim()}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-bold font-sans shadow-sm hover:bg-accent-hover active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
