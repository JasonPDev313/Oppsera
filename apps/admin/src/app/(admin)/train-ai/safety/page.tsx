'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shield, ShieldAlert, ShieldCheck, Plus, ToggleLeft, ToggleRight, Eye, AlertTriangle } from 'lucide-react';
import { useSafetyRules, useSafetyViolations } from '@/hooks/use-eval-training';
import type { SafetyRule, SafetyViolation, SafetyRuleType, SafetySeverity, CreateSafetyRulePayload } from '@/types/eval';

const RULE_TYPE_OPTIONS: { value: SafetyRuleType; label: string }[] = [
  { value: 'pii_detection', label: 'PII Detection' },
  { value: 'injection_detection', label: 'Injection Detection' },
  { value: 'table_access', label: 'Table Access' },
  { value: 'row_limit', label: 'Row Limit' },
  { value: 'custom_regex', label: 'Custom Regex' },
];

const SEVERITY_OPTIONS: { value: SafetySeverity; label: string }[] = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
];

function getRuleTypeClasses(ruleType: string): string {
  switch (ruleType) {
    case 'pii_detection': return 'bg-red-500/20 text-red-400';
    case 'injection_detection': return 'bg-orange-500/20 text-orange-400';
    case 'table_access': return 'bg-blue-500/20 text-blue-400';
    case 'row_limit': return 'bg-yellow-500/20 text-yellow-400';
    case 'custom_regex': return 'bg-slate-600/20 text-slate-400';
    default: return 'bg-slate-600/20 text-slate-400';
  }
}

function getSeverityClasses(severity: string): string {
  switch (severity) {
    case 'info': return 'bg-blue-500/20 text-blue-400';
    case 'warning': return 'bg-yellow-500/20 text-yellow-400';
    case 'critical': return 'bg-red-500/20 text-red-400';
    default: return 'bg-slate-600/20 text-slate-400';
  }
}

function formatRuleType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Add Rule Form ────────────────────────────────────────────────

function AddRuleForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (payload: CreateSafetyRulePayload) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ruleType, setRuleType] = useState<SafetyRuleType>('pii_detection');
  const [severity, setSeverity] = useState<SafetySeverity>('warning');
  const [configJson, setConfigJson] = useState('{}');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    let config: Record<string, unknown>;
    try {
      config = JSON.parse(configJson);
    } catch {
      setFormError('Invalid JSON in config field');
      setSubmitting(false);
      return;
    }

    try {
      await onSubmit({
        name,
        ...(description && { description }),
        ruleType,
        severity,
        config,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create rule');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = 'w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500';
  const labelClass = 'block text-xs font-medium text-slate-400 mb-1';

  return (
    <form onSubmit={handleSubmit} className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 space-y-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Plus size={14} />
          New Safety Rule
        </h3>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-white text-xs">
          Cancel
        </button>
      </div>

      {formError && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
          {formError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Rule Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Block SSN patterns"
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className={labelClass}>Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description..."
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Rule Type</label>
          <select
            value={ruleType}
            onChange={(e) => setRuleType(e.target.value as SafetyRuleType)}
            className={inputClass}
          >
            {RULE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Severity</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as SafetySeverity)}
            className={inputClass}
          >
            {SEVERITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Configuration (JSON)</label>
        <textarea
          value={configJson}
          onChange={(e) => setConfigJson(e.target.value)}
          rows={4}
          placeholder='{"pattern": "\\\\d{3}-\\\\d{2}-\\\\d{4}", "tables": ["users", "customers"]}'
          className={`${inputClass} font-mono text-xs`}
          required
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {submitting ? 'Creating...' : 'Create Rule'}
      </button>
    </form>
  );
}

// ── Rule Card ────────────────────────────────────────────────────

function RuleCard({
  rule,
  onToggle,
  onDelete,
}: {
  rule: SafetyRule;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [showConfig, setShowConfig] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function handleDelete() {
    if (confirming) {
      onDelete();
      setConfirming(false);
    } else {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
    }
  }

  return (
    <div className={`bg-slate-800 rounded-xl p-5 border transition-opacity ${
      rule.isActive ? 'border-slate-700' : 'border-slate-700/50 opacity-60'
    }`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-medium text-white">{rule.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded ${getRuleTypeClasses(rule.ruleType)}`}>
              {formatRuleType(rule.ruleType)}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded ${getSeverityClasses(rule.severity)}`}>
              {rule.severity}
            </span>
            {!rule.isActive && (
              <span className="text-xs bg-slate-600/20 text-slate-400 px-2 py-0.5 rounded">Inactive</span>
            )}
          </div>
          {rule.description && (
            <p className="text-xs text-slate-400">{rule.description}</p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onToggle}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            title={rule.isActive ? 'Deactivate' : 'Activate'}
          >
            {rule.isActive ? <ToggleRight size={16} className="text-green-400" /> : <ToggleLeft size={16} />}
          </button>
          <button
            onClick={handleDelete}
            className={`p-1.5 rounded-lg transition-colors text-xs ${
              confirming
                ? 'bg-red-500/20 text-red-400'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
            title="Delete rule"
          >
            {confirming ? 'Confirm?' : '\u00D7'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span>{rule.triggerCount} triggers</span>
        {rule.lastTriggeredAt && (
          <span>Last: {new Date(rule.lastTriggeredAt).toLocaleDateString()}</span>
        )}
        <button
          onClick={() => setShowConfig((v) => !v)}
          className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
        >
          <Eye size={11} />
          {showConfig ? 'Hide config' : 'Show config'}
        </button>
      </div>

      {showConfig && (
        <pre className="mt-3 bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-300 font-mono overflow-x-auto max-h-32">
          {JSON.stringify(rule.config, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Violation Card ───────────────────────────────────────────────

function ViolationCard({
  violation,
  onResolve,
}: {
  violation: SafetyViolation;
  onResolve: () => void;
}) {
  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs px-2 py-0.5 rounded ${getSeverityClasses(violation.severity)}`}>
              {violation.severity}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded ${getRuleTypeClasses(violation.ruleType)}`}>
              {formatRuleType(violation.ruleType)}
            </span>
            {violation.ruleName && (
              <span className="text-xs text-slate-300">{violation.ruleName}</span>
            )}
          </div>
          {violation.details && (
            <p className="text-xs text-slate-400 line-clamp-2 mt-1">
              {typeof violation.details === 'object'
                ? JSON.stringify(violation.details).slice(0, 200)
                : String(violation.details)}
            </p>
          )}
        </div>

        <div className="shrink-0">
          {violation.resolved ? (
            <div className="text-right">
              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded flex items-center gap-1">
                <ShieldCheck size={11} />
                Resolved
              </span>
              {violation.resolvedBy && (
                <p className="text-xs text-slate-500 mt-1">{violation.resolvedBy}</p>
              )}
              {violation.resolvedAt && (
                <p className="text-xs text-slate-600">{new Date(violation.resolvedAt).toLocaleDateString()}</p>
              )}
            </div>
          ) : (
            <button
              onClick={onResolve}
              className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Resolve
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-slate-500">
        {violation.evalTurnId && (
          <a
            href={`/train-ai/turns/${violation.evalTurnId}`}
            className="text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            View Turn
          </a>
        )}
        <span>{new Date(violation.createdAt).toLocaleString()}</span>
      </div>
    </div>
  );
}

// ── Rules Tab ────────────────────────────────────────────────────

function RulesTab() {
  const { data: rules, isLoading, error, load, create, update, remove } = useSafetyRules();
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(payload: CreateSafetyRulePayload) {
    await create(payload);
    setShowAddForm(false);
    await load();
  }

  async function handleToggle(rule: SafetyRule) {
    await update(rule.id, { isActive: !rule.isActive });
    await load();
  }

  async function handleDelete(id: string) {
    await remove(id);
  }

  return (
    <div>
      {!showAddForm && (
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setShowAddForm(true)}
            className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1"
          >
            <Plus size={12} />
            Add Rule
          </button>
        </div>
      )}

      {showAddForm && (
        <AddRuleForm onSubmit={handleCreate} onCancel={() => setShowAddForm(false)} />
      )}

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
          {rules.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <Shield size={24} className="mx-auto mb-3 text-slate-600" />
              <p>No safety rules configured. Add rules to protect your AI pipeline.</p>
            </div>
          ) : (
            rules.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                onToggle={() => handleToggle(rule)}
                onDelete={() => handleDelete(rule.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Violations Tab ───────────────────────────────────────────────

function ViolationsTab() {
  const { data, isLoading, error, load, resolve } = useSafetyViolations();
  const [ruleFilter, setRuleFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const [allViolations, setAllViolations] = useState<SafetyViolation[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const fetchPage = useCallback(async (nextCursor?: string) => {
    const params: Record<string, string> = {};
    if (ruleFilter) params.ruleId = ruleFilter;
    if (severityFilter) params.severity = severityFilter;
    if (showResolved) params.resolved = 'true';
    if (nextCursor) params.cursor = nextCursor;
    await load(params);
  }, [load, ruleFilter, severityFilter, showResolved]);

  useEffect(() => {
    setAllViolations([]);
    setCursor(null);
    fetchPage();
  }, [ruleFilter, severityFilter, showResolved, fetchPage]);

  useEffect(() => {
    if (!data) return;
    setAllViolations((prev) => {
      const existingIds = new Set(prev.map((v) => v.id));
      const newOnes = data.violations.filter((v) => !existingIds.has(v.id));
      return [...prev, ...newOnes];
    });
    setCursor(data.cursor);
    setHasMore(data.hasMore);
  }, [data]);

  async function handleResolve(id: string) {
    try {
      await resolve(id);
      setAllViolations((prev) =>
        prev.map((v) => v.id === id ? { ...v, resolved: true, resolvedAt: new Date().toISOString() } : v)
      );
    } catch {
      // error handled by hook
    }
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All severities</option>
          {SEVERITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Filter by rule ID..."
          value={ruleFilter}
          onChange={(e) => setRuleFilter(e.target.value)}
          className="flex-1 min-w-40 bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-1.5 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
          />
          Show resolved
        </label>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {isLoading && allViolations.length === 0 && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && allViolations.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <ShieldCheck size={24} className="mx-auto mb-3 text-slate-600" />
          <p>No violations found. Your AI pipeline is clean!</p>
        </div>
      )}

      <div className="space-y-3">
        {allViolations.map((violation) => (
          <ViolationCard
            key={violation.id}
            violation={violation}
            onResolve={() => handleResolve(violation.id)}
          />
        ))}

        {isLoading && allViolations.length > 0 && (
          <div className="flex justify-center py-4">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {hasMore && !isLoading && (
          <button
            onClick={() => fetchPage(cursor ?? undefined)}
            className="w-full py-3 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-xl hover:border-slate-600 transition-colors"
          >
            Load more
          </button>
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────

type SafetyTab = 'rules' | 'violations';

export default function SafetyDashboardPage() {
  const [activeTab, setActiveTab] = useState<SafetyTab>('rules');

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-600/20 flex items-center justify-center">
            <Shield size={18} className="text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Safety Dashboard</h1>
            <p className="text-sm text-slate-400 mt-0.5">Manage safety rules and monitor violations</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 p-1 bg-slate-800/50 rounded-xl border border-slate-700 w-fit">
        <button
          onClick={() => setActiveTab('rules')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
            activeTab === 'rules'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          <ShieldAlert size={14} />
          Rules
        </button>
        <button
          onClick={() => setActiveTab('violations')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
            activeTab === 'violations'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          <AlertTriangle size={14} />
          Violations
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'rules' ? <RulesTab /> : <ViolationsTab />}
    </div>
  );
}
