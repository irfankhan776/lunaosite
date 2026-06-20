import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Key, ChevronDown, Loader2, Sparkles, AlertCircle,
  FlaskConical, Layout, Monitor, Smartphone, Upload, Copy,
  CheckSquare, RotateCcw, BookmarkPlus, X, Code2, Check, Plus,
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
// Component
// ---------------------------------------------------------------------------

export const TemplateLabPage: React.FC<{
  aiEnabled: boolean;
  onClose: () => void;
  onBrowseTemplates: () => void;
  flashToast: FlashToastFn;
}> = ({ aiEnabled, onClose, onBrowseTemplates, flashToast }) => {

  const [mode, setMode] = useState<'idle' | 'active'>('idle');
  // html = raw HTML with {{PLACEHOLDERS}} — never shown directly in preview
  const [html, setHtml] = useState('');
  // previewHtml = compiled HTML with demo values — shown in the iframe
  const [previewHtml, setPreviewHtml] = useState('');
  // thinkingAcc = live thinking output from the AI (shown as animated text)
  const [thinkingAcc, setThinkingAcc] = useState('');
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
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastPush = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoadingHistory(true);
    listSiteHistory()
      .then(h => setHistory(h))
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));
    // Load saved API key from localStorage
    const savedKey = localStorage.getItem('lunao_user_anthropic_key');
    if (savedKey) setApiKey(savedKey);
  }, []);

  const flashError = (msg: string) => {
    sfx.error();
    setLabError(msg);
    setTimeout(() => setLabError(null), 5000);
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

  /** Replace all {{PLACEHOLDERS}} with demo values for the iframe preview. */
  function compilePreview(rawHtml: string): string {
    if (!rawHtml || typeof rawHtml !== 'string') return rawHtml;
    return rawHtml.replace(/\{\{(\w+)\}\}/g, (_, key) =>
      key in PLACEHOLDER_MAP ? PLACEHOLDER_MAP[key] : `{{${key}}}`,
    );
  }

  /** Brief one-line summary of what the AI changed, for the chat message. */
  function summarizeHtml(rawHtml: string): string {
    if (!rawHtml || typeof rawHtml !== 'string') return 'Done! Preview updated.';
    const hasPlaceholders = rawHtml.includes('{{');
    const titleMatch = rawHtml.match(/<title>([^<]{0,60})/i);
    const bodySnippet = rawHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    const parts: string[] = [];
    if (hasPlaceholders) parts.push('Personalization ready');
    if (titleMatch) parts.push(`Title: "${titleMatch[1].trim()}"`);
    if (parts.length === 0 && bodySnippet) parts.push(bodySnippet + '\u2026');
    return parts.length > 0 ? parts.join(' \u00b7 ') : 'Done! Preview updated.';
  }

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
        setMessages([{ role: 'assistant', content: 'File processed! Your HTML has been converted to a Lunao template with personalization placeholders. Preview is ready below.' }]);
        sfx.aiDone();
        const entry = await createSiteHistory({ title: niche || 'Uploaded Template', niche: niche || 'Local Business', html: processed, snapshotLabel: 'Uploaded HTML' });
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

    try {
      const base = html || BLANK_CANVAS;
      const result = await streamAiEdit(
        { html: base, instruction, history: history_msgs, anthropicApiKey: apiKey.trim() || undefined },
        (fullSoFar) => {
          setHtml(fullSoFar);
          // Compile preview: replace {{PLACEHOLDERS}} with demo values for the iframe
          const compiled = compilePreview(fullSoFar);
          const now = Date.now();
          if (now - lastPush.current > 400) {
            lastPush.current = now;
            setPreviewHtml(compiled);
          }
        },
        (thinkingText) => {
          // Show AI thinking in the chat as it happens
          setThinkingAcc(prev => prev + thinkingText);
        },
      );

      // Final compile for preview
      const finalCompiled = compilePreview(result);
      setHtml(result);
      setPreviewHtml(finalCompiled);
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

  const loadEntry = (entry: SiteHistoryEntry) => {
    sfx.open();
    setHtml(entry.html);
    setPreviewHtml(entry.html);
    setTitle(entry.title);
    setNiche(entry.niche);
    setMode('active');
    setMessages([{ role: 'assistant', content: 'Loaded "' + (entry.snapshotLabel || entry.title) + '". Keep editing below.' }]);
  };

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

  const onIframeLoad = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.addEventListener('input', () => {
      const c = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
      setHtml(c);
      setPreviewHtml(c);
    });
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

  const activeKey = apiKey.trim() || (aiEnabled ? '(server)' : '');

  return (
    <div className="fixed inset-0 z-[60] bg-off-white flex flex-col animate-editor-rise overflow-hidden">

      {/* ============================================================
          TOP HEADER BAR — brand-consistent cream/white
      ============================================================ */}
      <div className="flex items-center gap-3 px-5 py-3.5 bg-white border-b border-border-main shrink-0">
        {/* Back */}
        <button
          onClick={() => { sfx.close(); onClose(); }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-border-main text-ink-secondary hover:text-ink hover:border-ink-tertiary text-sm font-medium font-sans active:scale-[0.98] transition-all shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {/* Title */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent-soft flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-base font-bold font-sans text-ink leading-none">Template Lab</h1>
            <p className="text-[11px] text-ink-tertiary font-sans mt-0.5">Build any website with AI</p>
          </div>
        </div>

        {/* Status badge */}
        <div className="ml-auto flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold font-sans ${
            mode === 'idle' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
            streaming ? 'bg-blue-50 text-blue-700 border border-blue-200' :
            'bg-success-soft text-success border border-green-200'
          }`}>
            {streaming && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {mode === 'idle' && <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
            {mode === 'active' && !streaming && <div className="w-1.5 h-1.5 rounded-full bg-success" />}
            {streaming ? 'Building\u2026' : mode === 'idle' ? 'Ready' : 'Editing'}
          </span>

          <button
            onClick={() => { sfx.open(); onBrowseTemplates(); }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-border-main text-ink-secondary hover:text-ink text-sm font-medium font-sans active:scale-[0.98] transition-all shadow-sm"
          >
            <Layout className="w-4 h-4" />
            Browse Templates
          </button>
        </div>
      </div>

      {/* ============================================================
          WORKSPACE — left sidebar + right preview
      ============================================================ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ----------------------------------------------------
            LEFT SIDEBAR — white card, matches app aesthetic
        ---------------------------------------------------- */}
        <div className="w-[340px] shrink-0 flex flex-col overflow-hidden border-r border-border-main bg-white">

          {/* ---- API Key section ---- */}
          <div className="px-4 pt-4 pb-3 border-b border-border-light">
            <button
              onClick={() => { sfx.toggle(); setShowApiKey(!showApiKey); }}
              className="w-full flex items-center gap-2.5 text-[12px] font-semibold font-sans text-ink-secondary hover:text-ink transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-accent-soft flex items-center justify-center shrink-0">
                <Key className="w-3.5 h-3.5 text-accent" />
              </div>
              <span className="flex-1 text-left">
                {showApiKey ? 'Your Anthropic key' : 'Anthropic API Key'}
              </span>
              <div className={`w-2 h-2 rounded-full shrink-0 ${apiKey.trim() ? 'bg-success' : 'bg-ink-tertiary'}`} />
              <ChevronDown className={`w-4 h-4 text-ink-tertiary transition-transform ${showApiKey ? 'rotate-180' : ''}`} />
            </button>

            {showApiKey && (
              <div className="mt-3 animate-editor-rise space-y-2.5">
                <div className="relative">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-ant-api03\u2026"
                    className="w-full pr-20 pl-3 py-2.5 rounded-xl border border-border-main bg-off-white text-ink text-xs font-mono placeholder:text-ink-tertiary focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
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

                {/* Status + Set button */}
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-sans">
                    {apiKey.trim() ? (
                      <span className="text-success font-medium">Key saved \u2014 will be used for AI generation</span>
                    ) : (
                      <span className="text-ink-tertiary">Paste your key above and click Set to save it</span>
                    )}
                  </p>
                  <button
                    onClick={() => {
                      if (apiKey.trim()) {
                        localStorage.setItem('lunao_user_anthropic_key', apiKey.trim());
                        sfx.saved();
                      }
                    }}
                    disabled={!apiKey.trim()}
                    className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent text-white text-[11px] font-bold font-sans hover:bg-accent-hover active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {apiKey.trim() ? 'Set' : 'Set'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ---- How it works — feature cards ---- */}
          <div className="px-4 pt-3 pb-2 border-b border-border-light">
            <span className="text-[11px] font-bold font-sans text-ink-tertiary uppercase tracking-wide">How it works</span>
            <div className="mt-2 space-y-1.5">
              {[
                { icon: String.fromCodePoint(0x270F, 0xFE0F), label: 'Describe your site', hint: 'e.g. Modern dental clinic with amber tones' },
                { icon: String.fromCodePoint(0x1F3AF), label: 'AI builds instantly', hint: 'Live preview updates as AI writes' },
                { icon: String.fromCodePoint(0x1F4C1), label: 'Save as template', hint: 'Convert to reusable Lunao template' },
              ].map(f => (
                <div key={f.label} className="flex items-start gap-2 px-3 py-2 rounded-xl bg-off-white">
                  <span className="text-base leading-none mt-0.5">{f.icon}</span>
                  <div>
                    <p className="text-[11px] font-semibold font-sans text-ink leading-tight">{f.label}</p>
                    <p className="text-[10px] font-sans text-ink-tertiary leading-tight mt-0.5">{f.hint}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ---- Previous Builds ---- */}
          <div className="px-4 py-3 border-b border-border-light">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-bold font-sans text-ink-tertiary uppercase tracking-wide">Recent Builds</span>
              <span className="text-[11px] font-sans text-ink-tertiary">{history.length > 0 ? history.length : ''}</span>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-none">
              {loadingHistory ? (
                <div className="flex items-center justify-center py-3">
                  <Loader2 className="w-4 h-4 animate-spin text-ink-tertiary" />
                </div>
              ) : history.length === 0 ? (
                <p className="text-[11px] text-ink-tertiary font-sans italic text-center py-2">Your recent builds will appear here</p>
              ) : (
                history.slice(0, 6).map(entry => (
                  <button
                    key={entry.id}
                    onClick={() => loadEntry(entry)}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-accent-soft transition-colors group"
                  >
                    <p className="text-xs font-semibold font-sans text-ink group-hover:text-accent truncate">
                      {entry.title || entry.snapshotLabel || 'Build'}
                    </p>
                    <p className="text-[10px] font-sans text-ink-tertiary mt-0.5">{relTime(entry.createdAt)} · {entry.niche}</p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* ---- Vibe Code Prompt ---- */}
          <div className="px-4 py-3 border-b border-border-light">
            <button
              onClick={() => { sfx.toggle(); setShowVibePrompt(!showVibePrompt); }}
              className="w-full flex items-center gap-2.5 text-[12px] font-semibold font-sans text-ink-secondary hover:text-ink transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-off-white flex items-center justify-center shrink-0">
                <Code2 className="w-3.5 h-3.5 text-ink-secondary" />
              </div>
              <span className="flex-1 text-left">Vibe-code prompt</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${showVibePrompt ? 'bg-accent-soft text-accent' : 'bg-off-white text-ink-tertiary'}`}>
                {showVibePrompt ? 'Hide' : 'Copy'}
              </span>
            </button>
            {showVibePrompt && (
              <div className="mt-3 animate-editor-rise">
                <div className="bg-off-white border border-border-main rounded-xl p-3">
                  <p className="text-[10px] font-sans text-ink-tertiary leading-relaxed mb-2">
                    Paste this in Cursor, Bolt, or any AI coding tool to vibe-code outside Lunao:
                  </p>
                  <div className="bg-white rounded-lg p-2 max-h-28 overflow-y-auto border border-border-light">
                    <pre className="text-[9px] font-mono text-ink-secondary whitespace-pre-wrap leading-relaxed">{VIBE_CODE_PROMPT}</pre>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(VIBE_CODE_PROMPT);
                      sfx.copy();
                      setVibeCopied(true);
                      setTimeout(() => setVibeCopied(false), 2000);
                    }}
                    className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-accent text-white text-xs font-bold font-sans hover:bg-accent-hover active:scale-[0.98] transition-all"
                  >
                    {vibeCopied ? (
                      <><CheckSquare className="w-3.5 h-3.5" /> Copied!</>
                    ) : (
                      <><Copy className="w-3.5 h-3.5" /> Copy prompt</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ---- Chat messages ---- */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
            {messages.length === 0 && (
              <div className="text-center pt-3">
                <p className="text-[11px] text-ink-tertiary font-sans italic">
                  Describe a website and AI will build it\u2026
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[12px] font-sans leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-accent text-white rounded-br-sm'
                    : 'bg-off-white border border-border-light text-ink rounded-bl-sm'
                }`}>
                  {m.content || <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Working\u2026</span>}
                </div>
              </div>
            ))}
            {streaming && (
              <div className="flex justify-start">
                <div className="max-w-[92%] rounded-2xl px-3.5 py-2.5 bg-off-white border border-border-light rounded-bl-sm">
                  <div className="flex items-center gap-1 mb-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    <span className="text-[11px] text-accent font-semibold font-sans">Thinking</span>
                  </div>
                  {thinkingAcc ? (
                    <p className="text-[11px] text-ink-secondary font-sans leading-relaxed italic">
                      {thinkingAcc.slice(-300)}
                    </p>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[12px] text-ink-tertiary font-sans animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" /> Preparing…
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ---- Error ---- */}
          {labError && (
            <div className="mx-4 mb-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[11px] font-sans flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {labError}
            </div>
          )}

          {/* ---- Input + actions ---- */}
          <div className="px-4 pb-4 pt-2 space-y-2.5 border-t border-border-light shrink-0">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendPrompt();
                }
              }}
              placeholder="Describe your website\u2026 e.g. Modern dental clinic with amber tones, hero with booking CTA\u2026"
              disabled={streaming}
              rows={3}
              className="w-full resize-none rounded-xl border border-border-main bg-off-white px-3.5 py-2.5 text-xs font-sans text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all disabled:opacity-50 scrollbar-none"
            />

            <button
              onClick={sendPrompt}
              disabled={streaming || !input.trim() || (!aiEnabled && !apiKey.trim())}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-accent text-white text-sm font-bold font-sans shadow-sm hover:bg-accent-hover active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-border-main text-ink-secondary hover:text-ink hover:border-accent text-xs font-sans transition-all"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploading ? 'Processing\u2026' : 'or upload a .html file'}
            </button>
            {uploadError && (
              <p className="text-[11px] text-red-500 font-sans text-center">{uploadError}</p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,text/html"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        </div>

        {/* ----------------------------------------------------
            RIGHT PANEL — light gray bg, preview area
        ---------------------------------------------------- */}
        <div className="flex-1 flex flex-col overflow-hidden bg-off-white">

          {/* ---- Toolbar ---- */}
          <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-border-main shrink-0">
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

            {/* Status */}
            <div className="flex items-center gap-1.5 text-[12px] font-sans text-ink-tertiary">
              <FlaskConical className="w-4 h-4" />
              {mode === 'idle' ? 'Describe your website above' : 'Live preview \u2014 keep editing below'}
            </div>

            <div className="ml-auto flex items-center gap-2">
              {/* New / reset */}
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
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border-main text-ink-secondary hover:text-ink text-sm font-medium font-sans active:scale-[0.98] transition-all bg-white shadow-sm"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> New
                </button>
              )}

              {/* Convert to template */}
              {mode === 'active' && html && (
                <button
                  onClick={openSave}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold font-sans shadow-sm hover:bg-accent-hover active:scale-[0.98] transition-all"
                >
                  <BookmarkPlus className="w-4 h-4" /> Convert to Template
                </button>
              )}
            </div>
          </div>

          {/* ---- Preview area ---- */}
          <div className="flex-1 overflow-auto flex justify-center items-start p-6">
            {mode === 'idle' ? (
              /* ---- IDLE: welcome + quick-start cards ---- */
              <div className="w-full max-w-3xl animate-editor-rise">

                {/* Hero text */}
                <div className="text-center mb-8">
                  <div className="w-16 h-16 rounded-2xl bg-accent-soft flex items-center justify-center mx-auto mb-4">
                    <FlaskConical className="w-8 h-8 text-accent" />
                  </div>
                  <h2 className="text-2xl font-bold font-sans text-ink mb-2">Build any website with AI</h2>
                  <p className="text-sm text-ink-secondary font-sans max-w-lg mx-auto leading-relaxed">
                    Describe what you want in plain English. AI writes the complete HTML \u2014 preview it live, edit it, and save it as a reusable template.
                  </p>
                </div>

                {/* Quick-start grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                  {[
                    {
                      emoji: String.fromCodePoint(0x1F9E7),
                      label: 'Dental Clinic',
                      prompt: 'A modern dental clinic website with warm amber tones, hero section with booking CTA, services grid, patient testimonials, before/after gallery, and contact form.',
                      color: '#0EA5A0',
                    },
                    {
                      emoji: String.fromCodePoint(0x1F3E8),
                      label: 'Barber Shop',
                      prompt: 'A luxury barber shop website with dark wood tones, vintage aesthetic, services menu with prices, about the barbers section, and a booking CTA.',
                      color: '#C9A96E',
                    },
                    {
                      emoji: String.fromCodePoint(0x2744, 0xFE0F),
                      label: 'HVAC Service',
                      prompt: 'A bold HVAC company website with navy and orange, 24/7 emergency banner, services checklist, service area map, and a CTA to call.',
                      color: '#F97316',
                    },
                  ].map(item => (
                    <button
                      key={item.label}
                      onClick={() => {
                        sfx.tap();
                        setNiche(item.label);
                        setInput(item.prompt);
                        setMode('active');
                      }}
                      className="group flex flex-col items-center gap-2 p-5 rounded-2xl bg-white border border-border-main hover:border-[var(--c,theme(colors.accent.DEFAULT))] hover:shadow-lg transition-all text-center"
                      style={{ '--c': item.color } as React.CSSProperties}
                    >
                      <span className="text-4xl">{item.emoji}</span>
                      <span className="text-sm font-bold font-sans text-ink">{item.label}</span>
                      <span className="text-[10px] text-ink-tertiary font-sans">Tap to start</span>
                    </button>
                  ))}
                </div>

                {/* Upload section */}
                <div className="bg-white rounded-2xl border border-dashed border-border-main p-6 text-center">
                  <p className="text-sm font-semibold font-sans text-ink mb-1">Have an HTML file?</p>
                  <p className="text-xs text-ink-secondary font-sans mb-4 max-w-sm mx-auto">
                    Upload it and AI will convert it to a Lunao template automatically \u2014 adding all the personalization placeholders.
                  </p>
                  <button
                    onClick={() => { sfx.tap(); fileInputRef.current?.click(); }}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-white text-sm font-bold font-sans hover:bg-accent-hover active:scale-[0.98] transition-all shadow-sm"
                  >
                    <Upload className="w-4 h-4" /> Upload HTML File
                  </button>
                  <p className="mt-3 text-[10px] text-ink-tertiary font-sans">
                    Max 10MB \u00b7 Single .html file only
                  </p>
                </div>
              </div>
            ) : (
              /* ---- ACTIVE: live preview iframe ---- */
              <div
                className={`w-full bg-white rounded-2xl border border-border-main shadow-lg overflow-hidden transition-all ${
                  device === 'mobile' ? 'max-w-[400px]' : 'max-w-[1100px]'
                }`}
                style={{ minHeight: 'calc(100vh - 220px)' }}
              >
                {streaming && (
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border-b border-blue-100 text-xs font-sans text-blue-700">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Generating your website in real-time\u2026
                  </div>
                )}
                <iframe
                  ref={iframeRef}
                  srcDoc={previewHtml || html || BLANK_CANVAS}
                  onLoad={onIframeLoad}
                  title="Site preview"
                  className="w-full border-0 bg-white block"
                  style={{ minHeight: 'calc(100vh - 240px)' }}
                />
              </div>
            )}
          </div>
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
            {/* Dialog header */}
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

            {/* Template name */}
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

            {/* Category */}
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

            {/* Actions */}
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
