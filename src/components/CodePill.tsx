// Renders an invite code (LUNAO-XXXX-XXXX) as a hero "code pill":
// each character is a small monospace block, separated by hyphens,
// with a reveal animation on mount and a flash animation on copy.
//
// v2: visually richer, mobile-first, and "breathes" with a soft brand glow
// so the pill looks alive even when idle. The pill is also a clickable
// "copy" target (with full keyboard support) so the entire code is tappable
// on both mobile and desktop.

import React, { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CodePillProps {
  code: string;        // e.g. "LUNAO-7H2K-9XF1"
  onCopy?: () => void;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
  // When true the pill floats inside the aurora background card (no border).
  floating?: boolean;
}

const SIZE_CLASSES = {
  sm: { wrap: 'gap-1.5 px-3 py-2', char: 'w-7 h-9 text-sm', dash: 'text-sm' },
  md: { wrap: 'gap-2 px-4 py-2.5', char: 'w-9 h-11 text-base', dash: 'text-base' },
  lg: { wrap: 'gap-2 sm:gap-2.5 px-3.5 sm:px-5 py-2.5 sm:py-3', char: 'w-8 h-10 sm:w-10 sm:h-12 text-base sm:text-lg', dash: 'text-base sm:text-lg' },
};

export const CodePill: React.FC<CodePillProps> = ({ code, onCopy, onClick, size = 'md', floating = false }) => {
  const [flashing, setFlashing] = useState(false);
  const [copied, setCopied] = useState(false);
  const cls = SIZE_CLASSES[size];

  // Split the code into segments so we can render hyphens as plain text.
  // We expect "LUNAO-XXXX-XXXX".
  const segments = code.split('-');
  const chars: Array<{ ch: string; idx: number; isDash: boolean }> = [];
  segments.forEach((seg, si) => {
    for (let ci = 0; ci < seg.length; ci++) {
      chars.push({ ch: seg[ci], idx: chars.length, isDash: false });
    }
    if (si < segments.length - 1) {
      chars.push({ ch: '-', idx: chars.length, isDash: true });
    }
  });

  const handleClick = async () => {
    if (onClick) onClick();
    if (!onCopy) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Fallback: select + execCommand (very old browsers)
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* noop */ }
      document.body.removeChild(ta);
    }
    onCopy();
    setCopied(true);
    setFlashing(true);
    setTimeout(() => setFlashing(false), 650);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      title="Click to copy"
      className={`group inline-flex items-center font-mono font-semibold text-ink select-none cursor-pointer
                  transition-all
                  ${floating
                    ? 'bg-white/85 backdrop-blur-sm border border-white/60 rounded-2xl shadow-[0_18px_50px_-12px_rgba(37,99,235,0.35)] hover:shadow-[0_22px_60px_-12px_rgba(37,99,235,0.45)] hover:bg-white animate-invite-pill-breathe'
                    : 'bg-off-white border border-border-main rounded-xl hover:border-accent/40 hover:bg-white'}
                  ${cls.wrap}
                  ${flashing ? 'animate-code-copy-flash' : ''}`}
    >
      {chars.map((c, i) =>
        c.isDash ? (
          <span key={i} className={`${cls.dash} text-ink-tertiary px-0.5`}>-</span>
        ) : (
          <span
            key={i}
            className={`${cls.char} inline-flex items-center justify-center rounded-md
                        bg-white border border-border-light text-ink
                        group-hover:border-accent/30 transition-colors
                        animate-code-reveal`}
            style={{ animationDelay: `${i * 35}ms` }}
          >
            {c.ch}
          </span>
        ),
      )}
      <span className={`ml-2 inline-flex items-center justify-center rounded-md border transition-colors
                        ${floating ? 'w-8 h-8 sm:w-9 sm:h-9 bg-accent-soft border-accent/20 text-accent group-hover:bg-accent group-hover:text-white group-hover:border-accent'
                                   : 'w-7 h-7 bg-white border-border-light text-ink-secondary group-hover:text-accent group-hover:border-accent/30'}`}>
        {copied
          ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          : <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
      </span>
    </div>
  );
};

export default CodePill;
