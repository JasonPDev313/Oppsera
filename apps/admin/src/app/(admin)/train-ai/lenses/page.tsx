'use client';

import { useEffect, useState, useCallback } from 'react';
import { Layers, Plus, Pencil, Power, PowerOff, X, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { useLenses } from '@/hooks/use-lenses';
import { adminFetch } from '@/lib/api-fetch';
import type { SystemLens, CreateSystemLensPayload, UpdateSystemLensPayload } from '@/types/lenses';

const DOMAIN_OPTIONS = ['', 'core', 'golf', 'inventory', 'customer', 'retail', 'fnb'];

// ── Lens Form ────────────────────────────────────────────────────

function LensForm({
  initial,
  onSubmit,
  onCancel,
  isNew,
}: {
  initial?: SystemLens;
  onSubmit: (data: CreateSystemLensPayload | UpdateSystemLensPayload) => Promise<void>;
  onCancel: () => void;
  isNew: boolean;
}) {
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [domain, setDomain] = useState(initial?.domain ?? 'core');
  const [allowedMetrics, setAllowedMetrics] = useState(initial?.allowedMetrics?.join(', ') ?? '');
  const [allowedDimensions, setAllowedDimensions] = useState(initial?.allowedDimensions?.join(', ') ?? '');
  const [defaultMetrics, setDefaultMetrics] = useState(initial?.defaultMetrics?.join(', ') ?? '');
  const [defaultDimensions, setDefaultDimensions] = useState(initial?.defaultDimensions?.join(', ') ?? '');
  const [systemPromptFragment, setSystemPromptFragment] = useState(initial?.systemPromptFragment ?? '');
  const [exampleQuestions, setExampleQuestions] = useState(initial?.exampleQuestions?.join('\n') ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function parseList(val: string): string[] | undefined {
    const items = val.split(',').map((s) => s.trim()).filter(Boolean);
    return items.length > 0 ? items : undefined;
  }

  function parseLines(val: string): string[] | undefined {
    const items = val.split('\n').map((s) => s.trim()).filter(Boolean);
    return items.length > 0 ? items : undefined;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (isNew) {
        const payload: CreateSystemLensPayload = {
          slug,
          displayName,
          domain,
          ...(description && { description }),
          ...(allowedMetrics && { allowedMetrics: parseList(allowedMetrics) }),
          ...(allowedDimensions && { allowedDimensions: parseList(allowedDimensions) }),
          ...(defaultMetrics && { defaultMetrics: parseList(defaultMetrics) }),
          ...(defaultDimensions && { defaultDimensions: parseList(defaultDimensions) }),
          ...(systemPromptFragment && { systemPromptFragment }),
          ...(exampleQuestions && { exampleQuestions: parseLines(exampleQuestions) }),
        };
        await onSubmit(payload);
      } else {
        const payload: UpdateSystemLensPayload = {
          displayName,
          domain,
          description: description || undefined,
          allowedMetrics: parseList(allowedMetrics),
          allowedDimensions: parseList(allowedDimensions),
          defaultMetrics: parseList(defaultMetrics),
          defaultDimensions: parseList(defaultDimensions),
          systemPromptFragment: systemPromptFragment || undefined,
          exampleQuestions: parseLines(exampleQuestions),
        };
        await onSubmit(payload);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = 'w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500';
  const labelClass = 'block text-xs font-medium text-slate-400 mb-1';

  return (
    <form onSubmit={handleSubmit} className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-white">{isNew ? 'New System Lens' : `Edit: ${initial?.slug}`}</h3>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-white">
          <X size={16} />
        </button>
      </div>

      {formError && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
          {formError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {isNew && (
          <div>
            <label className={labelClass}>Slug</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my_custom_lens"
              required
              pattern="^[a-z][a-z0-9_]{1,63}$"
              className={inputClass}
            />
            <p className="text-xs text-slate-600 mt-0.5">Lowercase, digits, underscores</p>
          </div>
        )}
        <div>
          <label className={labelClass}>Display Name</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Domain</label>
          <select value={domain} onChange={(e) => setDomain(e.target.value)} className={inputClass}>
            {DOMAIN_OPTIONS.filter(Boolean).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputClass} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Allowed Metrics (comma-separated slugs)</label>
          <input type="text" value={allowedMetrics} onChange={(e) => setAllowedMetrics(e.target.value)} placeholder="total_revenue, order_count" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Allowed Dimensions (comma-separated slugs)</label>
          <input type="text" value={allowedDimensions} onChange={(e) => setAllowedDimensions(e.target.value)} placeholder="location, date" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Default Metrics</label>
          <input type="text" value={defaultMetrics} onChange={(e) => setDefaultMetrics(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Default Dimensions</label>
          <input type="text" value={defaultDimensions} onChange={(e) => setDefaultDimensions(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>System Prompt Fragment</label>
        <p className="text-xs text-slate-600 mb-1.5">Injected into the LLM system prompt when this lens is active. Use this to shape how AI responds for this context.</p>
        <textarea
          value={systemPromptFragment}
          onChange={(e) => setSystemPromptFragment(e.target.value)}
          rows={10}
          placeholder={"You are analyzing sales and revenue data.\nKey metrics: net_sales, order_count, avg_order_value.\nFocus on trends, anomalies, and actionable recommendations."}
          className={`${inputClass} font-mono text-xs leading-relaxed`}
        />
        <p className="text-xs text-slate-600 mt-1">{systemPromptFragment.length} / 2000 characters</p>
      </div>

      <div>
        <label className={labelClass}>Example Questions (one per line)</label>
        <p className="text-xs text-slate-600 mb-1.5">Shown to tenants as suggested queries when using this lens.</p>
        <textarea
          value={exampleQuestions}
          onChange={(e) => setExampleQuestions(e.target.value)}
          rows={5}
          placeholder={"What are my top selling items?\nHow is revenue trending this week?\nWhich location has the highest average order value?"}
          className={inputClass}
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {submitting ? 'Saving...' : isNew ? 'Create Lens' : 'Save Changes'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Lens Card ────────────────────────────────────────────────────

function LensCard({
  lens,
  onEdit,
  onToggleActive,
}: {
  lens: SystemLens;
  onEdit: () => void;
  onToggleActive: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function handleToggle() {
    if (confirming) {
      onToggleActive();
      setConfirming(false);
    } else {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
    }
  }

  return (
    <div className={`bg-slate-800 rounded-xl border ${lens.isActive ? 'border-slate-700' : 'border-slate-700/50 opacity-60'} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white">{lens.displayName}</span>
            <code className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">{lens.slug}</code>
            <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded">{lens.domain}</span>
            {!lens.isActive && (
              <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">Inactive</span>
            )}
          </div>
          {lens.description && (
            <p className="text-sm text-slate-400 mt-1">{lens.description}</p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors" title="Edit">
            <Pencil size={14} />
          </button>
          <button
            onClick={handleToggle}
            className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs ${
              confirming
                ? lens.isActive
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-green-500/20 text-green-400'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
            title={lens.isActive ? 'Deactivate' : 'Reactivate'}
          >
            {lens.isActive ? <PowerOff size={14} /> : <Power size={14} />}
            {confirming && <span>{lens.isActive ? 'Confirm?' : 'Activate?'}</span>}
          </button>
        </div>
      </div>

      {/* Expandable detail */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 mt-3 transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {expanded ? 'Hide details' : 'Show details'}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 text-xs text-slate-400">
          {lens.allowedMetrics && lens.allowedMetrics.length > 0 && (
            <div>
              <span className="text-slate-500">Metrics: </span>
              {lens.allowedMetrics.map((m) => (
                <span key={m} className="inline-block bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded mr-1 mb-1">{m}</span>
              ))}
            </div>
          )}
          {lens.allowedDimensions && lens.allowedDimensions.length > 0 && (
            <div>
              <span className="text-slate-500">Dimensions: </span>
              {lens.allowedDimensions.map((d) => (
                <span key={d} className="inline-block bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded mr-1 mb-1">{d}</span>
              ))}
            </div>
          )}
          {lens.systemPromptFragment && (
            <div>
              <span className="text-slate-500 block mb-1">Prompt fragment:</span>
              <pre className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-300 text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">{lens.systemPromptFragment}</pre>
            </div>
          )}
          {lens.exampleQuestions && lens.exampleQuestions.length > 0 && (
            <div>
              <span className="text-slate-500">Example questions:</span>
              <ul className="list-disc list-inside ml-2 mt-1 space-y-0.5">
                {lens.exampleQuestions.map((q, i) => (
                  <li key={i} className="text-slate-300">{q}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="text-slate-600">
            Created {new Date(lens.createdAt).toLocaleDateString()} · Updated {new Date(lens.updatedAt).toLocaleDateString()}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────

export default function SystemLensesPage() {
  const { data: lenses, isLoading, error, load, create, update, deactivate, reactivate } = useLenses();
  const [domain, setDomain] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingLens, setEditingLens] = useState<SystemLens | null>(null);
  const [cacheStatus, setCacheStatus] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (domain) params.domain = domain;
    if (includeInactive) params.includeInactive = 'true';
    load(params);
  }, [load, domain, includeInactive]);

  const handleRefreshCache = useCallback(async () => {
    setRefreshing(true);
    setCacheStatus(null);
    try {
      await adminFetch('/api/v1/eval/lenses/invalidate-cache', { method: 'POST' });
      setCacheStatus('Cache refreshed. Web app will pick up changes within ~5 minutes.');
      setTimeout(() => setCacheStatus(null), 5000);
    } catch {
      setCacheStatus('Failed to refresh cache');
    } finally {
      setRefreshing(false);
    }
  }, []);

  async function handleCreate(payload: CreateSystemLensPayload | UpdateSystemLensPayload) {
    await create(payload as CreateSystemLensPayload);
    setShowForm(false);
  }

  async function handleUpdate(slug: string, payload: CreateSystemLensPayload | UpdateSystemLensPayload) {
    await update(slug, payload as UpdateSystemLensPayload);
    setEditingLens(null);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600/20 flex items-center justify-center">
              <Layers size={18} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">System Lenses</h1>
              <p className="text-sm text-slate-400 mt-0.5">Platform-wide AI analysis contexts visible to all tenants</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefreshCache}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 text-sm rounded-lg transition-colors"
            title="Refresh the semantic registry cache so changes take effect immediately"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh Cache
          </button>
          {!showForm && !editingLens && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={16} />
              New Lens
            </button>
          )}
        </div>
      </div>

      {/* Cache status */}
      {cacheStatus && (
        <div className="mb-4 px-4 py-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-indigo-400 text-xs">
          {cacheStatus}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All domains</option>
          {DOMAIN_OPTIONS.filter(Boolean).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
          />
          Show inactive
        </label>

        <span className="text-xs text-slate-500 ml-auto">{lenses.length} lenses</span>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="mb-6">
          <LensForm isNew onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* List */}
      {!isLoading && (
        <div className="space-y-3">
          {lenses.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Layers size={24} className="text-slate-600" />
              </div>
              <p className="text-slate-500 text-sm">No system lenses yet. Create one to customize AI analysis contexts.</p>
            </div>
          ) : (
            lenses.map((lens) =>
              editingLens?.slug === lens.slug ? (
                <LensForm
                  key={lens.slug}
                  initial={lens}
                  isNew={false}
                  onSubmit={(payload) => handleUpdate(lens.slug, payload)}
                  onCancel={() => setEditingLens(null)}
                />
              ) : (
                <LensCard
                  key={lens.slug}
                  lens={lens}
                  onEdit={() => setEditingLens(lens)}
                  onToggleActive={() => (lens.isActive ? deactivate(lens.slug) : reactivate(lens.slug))}
                />
              ),
            )
          )}
        </div>
      )}
    </div>
  );
}
