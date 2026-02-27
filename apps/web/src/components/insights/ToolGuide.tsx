'use client';

import { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Zap, Lightbulb, HelpCircle } from 'lucide-react';

// ── Collapsible Guide ─────────────────────────────────────────────
// Card-based progressive disclosure guide.
// Expanded by default on first visit; remembers collapse in localStorage.

export function ToolGuide({
  storageKey,
  steps,
  useCases,
  example,
}: {
  storageKey: string;
  steps: { label: string; detail: string }[];
  useCases: string[];
  example: string;
}) {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(`tools_guide_${storageKey}`) !== 'collapsed';
  });

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      localStorage.setItem(`tools_guide_${storageKey}`, next ? 'open' : 'collapsed');
      return next;
    });
  }, [storageKey]);

  return (
    <div className="mb-5 rounded-xl border border-primary/15 bg-primary/3 overflow-hidden">
      {/* Header bar — always visible */}
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-primary/4 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <HelpCircle className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground leading-tight">
              Getting Started
            </p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {open ? 'Learn how to use this tool' : 'Click to see how this works'}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-muted-foreground">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </button>

      {/* Expandable body */}
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200 border-t border-primary/10">
          {/* Use cases */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1.5">
              When to use
            </p>
            <div className="flex flex-wrap gap-1.5">
              {useCases.map((uc) => (
                <span
                  key={uc}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full bg-primary/8 text-primary/80 border border-primary/10"
                >
                  <Zap className="h-2.5 w-2.5" />
                  {uc}
                </span>
              ))}
            </div>
          </div>

          {/* Steps */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
              How it works
            </p>
            <ol className="flex flex-col sm:flex-row gap-3">
              {steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 flex-1 min-w-0">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground leading-tight">{step.label}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Example */}
          <div className="flex items-start gap-2.5 rounded-lg bg-amber-500/5 border border-amber-500/15 px-3 py-2.5">
            <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-amber-500">Try this:</span>{' '}
              {example}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
