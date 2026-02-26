'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SlidersHorizontal, Layers, MessageSquareText, ArrowRight } from 'lucide-react';
import { LensesTab } from './lenses-tab';
import { NarrativeTab } from './narrative-tab';

type Tab = 'lenses' | 'narrative';

const TABS: { key: Tab; label: string; icon: typeof Layers }[] = [
  { key: 'lenses', label: 'Lenses', icon: Layers },
  { key: 'narrative', label: 'Narrative Prompt', icon: MessageSquareText },
];

export default function AIBehaviorPage() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) || 'lenses';
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.key === initialTab) ? initialTab : 'lenses');

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-lg bg-indigo-600/20 flex items-center justify-center">
          <SlidersHorizontal size={18} className="text-indigo-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">AI Behavior</h1>
          <p className="text-sm text-slate-400 mt-0.5">Configure how AI Insights responds to tenant questions</p>
        </div>
      </div>

      {/* Knowledge box */}
      <div className="mb-6 p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/20">
        <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wide mb-2.5">How it works</p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-start">
          {/* Lenses */}
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-md bg-indigo-500/10 flex items-center justify-center shrink-0 mt-0.5">
              <Layers size={14} className="text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Lenses &mdash; Scope</p>
              <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
                Control <em>what</em> the AI can talk about. Each lens constrains available metrics and dimensions for a
                specific use case, and injects a prompt fragment for context-specific behavior.
              </p>
            </div>
          </div>

          {/* Arrow */}
          <div className="hidden sm:flex items-center justify-center pt-3">
            <ArrowRight size={16} className="text-slate-600" />
          </div>

          {/* Narrative */}
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-md bg-indigo-500/10 flex items-center justify-center shrink-0 mt-0.5">
              <MessageSquareText size={14} className="text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Narrative Prompt &mdash; Style</p>
              <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
                Controls <em>how</em> the AI writes its response. One global template defines the personality,
                format, tone, and data interpretation rules for all tenants and lenses.
              </p>
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-3 border-t border-slate-700/50 pt-2.5">
          At runtime, the active lens&apos;s prompt fragment is injected into the narrative template
          via <code className="text-indigo-300/70">{'{{LENS_SECTION}}'}</code>, producing the final system prompt sent to the LLM.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-slate-700 pb-px overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                tab === t.key
                  ? 'text-white bg-slate-800 border border-slate-700 border-b-transparent -mb-px'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === 'lenses' && <LensesTab />}
      {tab === 'narrative' && <NarrativeTab />}
    </div>
  );
}
