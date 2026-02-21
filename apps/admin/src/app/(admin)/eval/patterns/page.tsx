'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { TenantSelector } from '@/components/TenantSelector';
import { useEvalPatterns } from '@/hooks/use-eval';
import type { ProblematicPattern } from '@/types/eval';

function PatternRow({ pattern }: { pattern: ProblematicPattern }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-start justify-between gap-3 p-5 hover:bg-slate-700/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {expanded ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
          <div className="min-w-0">
            <p className="text-xs font-mono text-slate-400 mb-1">{pattern.planHash}</p>
            <p className="text-sm text-white font-medium line-clamp-1">
              {pattern.exampleMessages[0] ?? '(no example)'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 text-xs">
          <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded">
            {pattern.occurrenceCount}× occurrences
          </span>
          {pattern.avgUserRating !== null && (
            <span className="text-amber-400">{pattern.avgUserRating.toFixed(1)}★ avg</span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-700 pt-4 space-y-3">
          {/* Common verdicts */}
          {pattern.commonVerdicts.length > 0 && (
            <div>
              <p className="text-xs text-slate-400 mb-1.5">Common verdicts</p>
              <div className="flex flex-wrap gap-1">
                {pattern.commonVerdicts.map((v) => (
                  <span key={v} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded capitalize">
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Common flags */}
          {pattern.commonFlags.length > 0 && (
            <div>
              <p className="text-xs text-slate-400 mb-1.5">Common quality flags</p>
              <div className="flex flex-wrap gap-1">
                {pattern.commonFlags.map((f) => (
                  <span key={f} className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Example messages */}
          {pattern.exampleMessages.length > 1 && (
            <div>
              <p className="text-xs text-slate-400 mb-1.5">Example messages</p>
              <ul className="space-y-1">
                {pattern.exampleMessages.slice(0, 5).map((msg, i) => (
                  <li key={i} className="text-xs text-slate-300">• {msg}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EvalPatternsPage() {
  const [tenantId, setTenantId] = useState('');
  const { data: patterns, isLoading, error, load } = useEvalPatterns(tenantId || undefined);

  useEffect(() => {
    load();
  }, [load, tenantId]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Problematic Patterns</h1>
          <p className="text-sm text-slate-400 mt-0.5">Plan hashes that recur with low quality scores</p>
        </div>
        <div className="flex items-center gap-3">
          <TenantSelector value={tenantId} onChange={setTenantId} />
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <AlertTriangle size={13} />
            {patterns.length} patterns
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && (
        <div className="space-y-3">
          {patterns.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              No problematic patterns detected. Keep reviewing turns!
            </div>
          ) : (
            patterns.map((p) => <PatternRow key={p.planHash} pattern={p} />)
          )}
        </div>
      )}
    </div>
  );
}
