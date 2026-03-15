'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  AlertCircle,
  RefreshCw,
  Bell,
} from 'lucide-react';
import { adminFetch, AdminApiError } from '@/lib/api-fetch';

// ── Types ─────────────────────────────────────────────────────────────

interface ProactiveRule {
  id: string;
  tenantId: string | null;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  messageTemplate: string;
  moduleKey: string | null;
  routePattern: string | null;
  priority: number;
  enabled: string;
  maxShowsPerUser: number;
  cooldownHours: number;
  createdAt: string | null;
  updatedAt: string | null;
}

interface RuleFormState {
  triggerType: string;
  messageTemplate: string;
  moduleKey: string;
  routePattern: string;
  priority: number;
  enabled: 'true' | 'false';
  maxShowsPerUser: number;
  cooldownHours: number;
  tenantId: string;
}

const BLANK_FORM: RuleFormState = {
  triggerType: 'route_visit',
  messageTemplate: '',
  moduleKey: '',
  routePattern: '',
  priority: 0,
  enabled: 'true',
  maxShowsPerUser: 1,
  cooldownHours: 24,
  tenantId: '',
};

// ── Helpers ───────────────────────────────────────────────────────────

function EnabledBadge({ enabled }: { enabled: string }) {
  return enabled === 'true' ? (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-900/50 text-emerald-300 border border-emerald-700">
      Enabled
    </span>
  ) : (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-600">
      Disabled
    </span>
  );
}

function errMessage(e: unknown): string {
  if (e instanceof AdminApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Unknown error';
}

// ── Inline Rule Form ──────────────────────────────────────────────────

function RuleForm({
  initial,
  onSave,
  onCancel,
  saving,
  saveError,
}: {
  initial: RuleFormState;
  onSave: (data: RuleFormState) => void;
  onCancel: () => void;
  saving: boolean;
  saveError: string | null;
}) {
  const [form, setForm] = useState<RuleFormState>(initial);

  function field<K extends keyof RuleFormState>(key: K, value: RuleFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="bg-slate-900 border border-indigo-600 rounded-lg p-5 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Trigger Type */}
        <div>
          <label htmlFor="pf-trigger-type" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Trigger Type <span className="text-red-400">*</span>
          </label>
          <input
            id="pf-trigger-type"
            value={form.triggerType}
            onChange={(e) => field('triggerType', e.target.value)}
            placeholder="e.g. route_visit, idle, module_error"
            className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Enabled */}
        <div>
          <label htmlFor="pf-enabled" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Status
          </label>
          <select
            id="pf-enabled"
            value={form.enabled}
            onChange={(e) => field('enabled', e.target.value as 'true' | 'false')}
            className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </div>

        {/* Module Key */}
        <div>
          <label htmlFor="pf-module-key" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Module Key
          </label>
          <input
            id="pf-module-key"
            value={form.moduleKey}
            onChange={(e) => field('moduleKey', e.target.value)}
            placeholder="e.g. catalog, orders (leave blank for all)"
            className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Route Pattern */}
        <div>
          <label htmlFor="pf-route-pattern" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Route Pattern
          </label>
          <input
            id="pf-route-pattern"
            value={form.routePattern}
            onChange={(e) => field('routePattern', e.target.value)}
            placeholder="e.g. /catalog (prefix match, leave blank for all)"
            className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Priority */}
        <div>
          <label htmlFor="pf-priority" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Priority
          </label>
          <input
            id="pf-priority"
            type="number"
            value={form.priority}
            onChange={(e) => field('priority', parseInt(e.target.value, 10) || 0)}
            className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Cooldown Hours */}
        <div>
          <label htmlFor="pf-cooldown" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Cooldown (hours)
          </label>
          <input
            id="pf-cooldown"
            type="number"
            min={0}
            value={form.cooldownHours}
            onChange={(e) => field('cooldownHours', parseInt(e.target.value, 10) || 0)}
            className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Max Shows Per User */}
        <div>
          <label htmlFor="pf-max-shows" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Max Shows Per User
          </label>
          <input
            id="pf-max-shows"
            type="number"
            min={1}
            value={form.maxShowsPerUser}
            onChange={(e) => field('maxShowsPerUser', parseInt(e.target.value, 10) || 1)}
            className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Tenant ID (optional) */}
        <div>
          <label htmlFor="pf-tenant-id" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Tenant ID <span className="text-slate-500">(leave blank for global)</span>
          </label>
          <input
            id="pf-tenant-id"
            value={form.tenantId}
            onChange={(e) => field('tenantId', e.target.value)}
            placeholder="tenant ULID (optional)"
            className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Message Template */}
      <div>
        <label htmlFor="pf-message-template" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
          Message Template <span className="text-red-400">*</span>
        </label>
        <textarea
          id="pf-message-template"
          value={form.messageTemplate}
          onChange={(e) => field('messageTemplate', e.target.value)}
          rows={3}
          placeholder="Enter the message to show proactively to users..."
          className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-sm text-slate-200 resize-y focus:outline-none focus:border-indigo-500"
        />
      </div>

      {saveError && (
        <p className="text-sm text-red-400 flex items-center gap-1.5">
          <AlertCircle size={14} />
          {saveError}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onSave(form)}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors"
        >
          <Check size={14} />
          {saving ? 'Saving...' : 'Save Rule'}
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
        >
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Rule Row ──────────────────────────────────────────────────────────

function RuleRow({
  rule,
  onUpdated,
  onDeleted,
}: {
  rule: ProactiveRule;
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const formInitial: RuleFormState = {
    triggerType: rule.triggerType,
    messageTemplate: rule.messageTemplate,
    moduleKey: rule.moduleKey ?? '',
    routePattern: rule.routePattern ?? '',
    priority: rule.priority,
    enabled: rule.enabled as 'true' | 'false',
    maxShowsPerUser: rule.maxShowsPerUser,
    cooldownHours: rule.cooldownHours,
    tenantId: rule.tenantId ?? '',
  };

  async function handleSave(form: RuleFormState) {
    setSaving(true);
    setSaveError(null);
    try {
      await adminFetch(`/api/v1/ai-support/proactive-rules/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          triggerType: form.triggerType,
          messageTemplate: form.messageTemplate,
          moduleKey: form.moduleKey || null,
          routePattern: form.routePattern || null,
          priority: form.priority,
          enabled: form.enabled,
          maxShowsPerUser: form.maxShowsPerUser,
          cooldownHours: form.cooldownHours,
          tenantId: form.tenantId || null,
        }),
      });
      setEditing(false);
      onUpdated();
    } catch (e) {
      setSaveError(errMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this proactive rule? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await adminFetch(`/api/v1/ai-support/proactive-rules/${rule.id}`, {
        method: 'DELETE',
      });
      onDeleted();
    } catch {
      // Deletion failed — row will remain visible
    } finally {
      setDeleting(false);
    }
  }

  if (editing) {
    return (
      <RuleForm
        initial={formInitial}
        onSave={handleSave}
        onCancel={() => { setEditing(false); setSaveError(null); }}
        saving={saving}
        saveError={saveError}
      />
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <EnabledBadge enabled={rule.enabled} />
            <span className="text-xs font-mono text-indigo-400 bg-indigo-950/50 border border-indigo-800 px-2 py-0.5 rounded-full">
              {rule.triggerType}
            </span>
            {rule.moduleKey && (
              <span className="text-xs text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">
                {rule.moduleKey}
              </span>
            )}
            <span className="text-xs text-slate-500">priority: {rule.priority}</span>
          </div>

          <p className="text-sm text-slate-200 leading-relaxed">{rule.messageTemplate}</p>

          <div className="flex flex-wrap gap-4 text-xs text-slate-500">
            {rule.routePattern && (
              <span>
                Route: <span className="text-slate-400 font-mono">{rule.routePattern}</span>
              </span>
            )}
            <span>Cooldown: {rule.cooldownHours}h</span>
            <span>Max shows: {rule.maxShowsPerUser}</span>
            {rule.tenantId && (
              <span>
                Tenant: <span className="font-mono">{rule.tenantId}</span>
              </span>
            )}
            {rule.updatedAt && (
              <span>Updated: {new Date(rule.updatedAt).toLocaleDateString()}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setEditing(true)}
            aria-label="Edit rule"
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            aria-label="Delete rule"
            className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-red-950/30 disabled:opacity-50 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────

export default function ProactiveMessagesPage() {
  const [rules, setRules] = useState<ProactiveRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const json = await adminFetch<{ data: { items: ProactiveRule[] } }>(
        '/api/v1/ai-support/proactive-rules',
      );
      setRules(json.data.items);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(form: RuleFormState) {
    if (!form.triggerType.trim() || !form.messageTemplate.trim()) {
      setCreateError('Trigger type and message template are required.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await adminFetch('/api/v1/ai-support/proactive-rules', {
        method: 'POST',
        body: JSON.stringify({
          triggerType: form.triggerType,
          messageTemplate: form.messageTemplate,
          moduleKey: form.moduleKey || null,
          routePattern: form.routePattern || null,
          priority: form.priority,
          enabled: form.enabled,
          maxShowsPerUser: form.maxShowsPerUser,
          cooldownHours: form.cooldownHours,
          tenantId: form.tenantId || null,
        }),
      });
      setShowCreate(false);
      await load();
    } catch (e) {
      setCreateError(errMessage(e));
    } finally {
      setCreating(false);
    }
  }

  const enabledCount = rules.filter((r) => r.enabled === 'true').length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Proactive Messages</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Rules that surface contextual AI assistant messages based on route and module context
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-300 bg-slate-800 border border-slate-700 hover:text-white hover:border-slate-600 transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            onClick={() => { setShowCreate(true); setCreateError(null); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            <Plus size={14} />
            Add Rule
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <p className="text-2xl font-bold text-white">{rules.length}</p>
          <p className="text-sm text-slate-400 mt-0.5">Total Rules</p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <p className="text-2xl font-bold text-emerald-400">{enabledCount}</p>
          <p className="text-sm text-slate-400 mt-0.5">Enabled</p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <p className="text-2xl font-bold text-slate-400">{rules.length - enabledCount}</p>
          <p className="text-sm text-slate-400 mt-0.5">Disabled</p>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <RuleForm
          initial={BLANK_FORM}
          onSave={handleCreate}
          onCancel={() => { setShowCreate(false); setCreateError(null); }}
          saving={creating}
          saveError={createError}
        />
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-950 border border-red-700 rounded-lg p-4 text-red-300 text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="bg-slate-900 border border-slate-700 rounded-lg h-20 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && rules.length === 0 && !error && !showCreate && (
        <div className="text-center py-16 text-slate-500">
          <Bell size={40} className="mx-auto mb-3 text-slate-700" />
          <p className="text-lg font-medium">No proactive rules</p>
          <p className="text-sm mt-1">Create your first rule to start surfacing contextual messages.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors mx-auto"
          >
            <Plus size={14} />
            Add Rule
          </button>
        </div>
      )}

      {/* Rules list */}
      {!isLoading && rules.length > 0 && (
        <div className="space-y-3">
          {rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              onUpdated={load}
              onDeleted={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}
