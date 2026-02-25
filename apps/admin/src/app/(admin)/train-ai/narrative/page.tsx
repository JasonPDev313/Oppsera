'use client';

import { useState, useEffect, useCallback } from 'react';
import { MessageSquareText, Save, RotateCcw, Info, AlertTriangle } from 'lucide-react';
import { adminFetch } from '@/lib/api-fetch';

// ── Types ──────────────────────────────────────────────────────────

interface NarrativeConfig {
  promptTemplate: string | null;
  defaultTemplate: string;
  updatedAt: string | null;
  updatedBy: string | null;
  isCustom: boolean;
}

// ── Placeholder Reference ──────────────────────────────────────────

const PLACEHOLDERS = [
  {
    token: '{{INDUSTRY_HINT}}',
    description: 'Industry-specific translation guidance (e.g., golf, retail, F&B). Auto-generated from the active lens slug.',
  },
  {
    token: '{{LENS_SECTION}}',
    description: 'The active lens\'s custom prompt fragment. Injected when a tenant uses a specific lens context.',
  },
  {
    token: '{{METRIC_SECTION}}',
    description: 'Definitions of metrics available in the current query (name, description, format). Auto-generated from the registry.',
  },
];

// ── Page ────────────────────────────────────────────────────────────

export default function NarrativePromptPage() {
  const [config, setConfig] = useState<NarrativeConfig | null>(null);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showPlaceholders, setShowPlaceholders] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: NarrativeConfig }>('/api/v1/eval/narrative');
      setConfig(res.data);
      setDraft(res.data.promptTemplate ?? res.data.defaultTemplate);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load narrative config');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await adminFetch<{ data: NarrativeConfig }>('/api/v1/eval/narrative', {
        method: 'PATCH',
        body: JSON.stringify({ promptTemplate: draft }),
      });
      setConfig(res.data);
      setSuccess('Narrative prompt saved successfully. Changes take effect within 5 minutes (or immediately after cache invalidation).');
      setTimeout(() => setSuccess(null), 6000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    setShowResetConfirm(false);
    try {
      const res = await adminFetch<{ data: NarrativeConfig }>('/api/v1/eval/narrative', {
        method: 'DELETE',
      });
      setConfig(res.data);
      setDraft(res.data.defaultTemplate);
      setSuccess('Reset to default prompt template.');
      setTimeout(() => setSuccess(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset');
    } finally {
      setIsSaving(false);
    }
  };

  const isDirty = config
    ? draft !== (config.promptTemplate ?? config.defaultTemplate)
    : false;

  const missingPlaceholders = PLACEHOLDERS
    .filter((p) => !draft.includes(p.token))
    .map((p) => p.token);

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-700 rounded w-64" />
          <div className="h-4 bg-slate-700 rounded w-96" />
          <div className="h-96 bg-slate-700 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <MessageSquareText size={24} className="text-indigo-400" />
            <h1 className="text-2xl font-bold text-white">THE OPPS ERA LENS</h1>
          </div>
          <p className="text-slate-400 text-sm max-w-2xl">
            This is the core system prompt that shapes all AI Insights responses.
            Edit the template below to change the AI&apos;s personality, response format, rules, and data interpretation guidelines.
          </p>
        </div>

        {/* Status badge */}
        <div className="shrink-0">
          {config?.isCustom ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Custom Prompt
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              Default Prompt
            </span>
          )}
        </div>
      </div>

      {/* Error / Success alerts */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
          {success}
        </div>
      )}

      {/* Placeholder warnings */}
      {missingPlaceholders.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <span className="font-medium">Missing required placeholders: </span>
            {missingPlaceholders.map((p) => (
              <code key={p} className="mx-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-xs">{p}</code>
            ))}
            <p className="mt-1 text-xs text-amber-400/70">These placeholders are required for dynamic content injection. The prompt will not save without them.</p>
          </div>
        </div>
      )}

      {/* Placeholder reference toggle */}
      <button
        onClick={() => setShowPlaceholders((v) => !v)}
        className="mb-4 flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
      >
        <Info size={14} />
        {showPlaceholders ? 'Hide' : 'Show'} placeholder reference
      </button>

      {showPlaceholders && (
        <div className="mb-4 p-4 rounded-lg bg-slate-800/50 border border-slate-700 space-y-3">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Template Placeholders</p>
          {PLACEHOLDERS.map((p) => (
            <div key={p.token} className="flex gap-3">
              <code className="shrink-0 px-2 py-1 rounded bg-indigo-500/20 text-indigo-300 text-xs font-mono h-fit">
                {p.token}
              </code>
              <p className="text-sm text-slate-400">{p.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Editor */}
      <div className="relative">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full h-[600px] bg-slate-800 border border-slate-700 text-white text-sm font-mono rounded-lg px-4 py-3 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          spellCheck={false}
        />
        <div className="absolute bottom-3 right-3 text-xs text-slate-500">
          {draft.length.toLocaleString()} characters
        </div>
      </div>

      {/* Last updated info */}
      {config?.isCustom && config.updatedAt && (
        <p className="mt-2 text-xs text-slate-500">
          Last updated {new Date(config.updatedAt).toLocaleString()}
          {config.updatedBy ? ` by ${config.updatedBy}` : ''}
        </p>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isSaving || !isDirty || missingPlaceholders.length > 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Save size={14} />
          {isSaving ? 'Saving...' : 'Save Prompt'}
        </button>

        {config?.isCustom && !showResetConfirm && (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700 text-slate-400 text-sm hover:text-white hover:border-slate-600 transition-colors"
          >
            <RotateCcw size={14} />
            Reset to Default
          </button>
        )}

        {showResetConfirm && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-amber-400">Are you sure? This will discard your custom prompt.</span>
            <button
              onClick={handleReset}
              disabled={isSaving}
              className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-500 disabled:opacity-50 transition-colors"
            >
              Yes, Reset
            </button>
            <button
              onClick={() => setShowResetConfirm(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 text-sm hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {isDirty && (
          <span className="text-xs text-amber-400 ml-2">Unsaved changes</span>
        )}
      </div>
    </div>
  );
}
