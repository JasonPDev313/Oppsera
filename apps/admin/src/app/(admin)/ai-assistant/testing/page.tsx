'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Play,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Trash2,
  Edit2,
  X,
  Check,
  Clock,
  FlaskConical,
  TrendingDown,
} from 'lucide-react';
import { adminFetch } from '@/lib/api-fetch';

// ── Types ────────────────────────────────────────────────────────────

interface TestCase {
  id: string;
  question: string;
  expectedAnswerPattern: string;
  moduleKey: string | null;
  route: string | null;
  tags: string[];
  enabled: string;
  createdAt: string | null;
  updatedAt: string | null;
}

interface TestRun {
  id: string;
  name: string;
  status: string;
  totalCases: number;
  passed: number;
  failed: number;
  regressed: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
}

interface TestResult {
  id: string;
  testCaseId: string;
  question: string;
  expectedAnswerPattern: string;
  moduleKey: string | null;
  tags: string[];
  actualAnswer: string | null;
  confidence: string | null;
  sourceTier: string | null;
  passed: string;
  regression: string;
  score: string;
  durationMs: number | null;
  createdAt: string | null;
}

interface RunDetail {
  run: TestRun;
  results: TestResult[];
}

// ── Status Badge ─────────────────────────────────────────────────────

function RunStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-slate-800 text-slate-300 border-slate-600',
    running: 'bg-blue-900/50 text-blue-300 border-blue-700',
    completed: 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
    failed: 'bg-red-900/50 text-red-300 border-red-700',
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status] ?? 'bg-slate-800 text-slate-400 border-slate-700'}`}
    >
      {status}
    </span>
  );
}

// ── Test Case Form ────────────────────────────────────────────────────

function TestCaseForm({
  initial,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial: {
    question: string;
    expectedAnswerPattern: string;
    moduleKey: string;
    route: string;
    tags: string;
    enabled: boolean;
  };
  onSave: (data: typeof initial) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState(initial);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="tc-question" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
          Question <span className="text-red-400">*</span>
        </label>
        <textarea
          id="tc-question"
          value={form.question}
          onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
          rows={2}
          placeholder="e.g. How do I add a product to the catalog?"
          className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 resize-y focus:outline-none focus:border-indigo-500"
        />
      </div>
      <div>
        <label htmlFor="tc-pattern" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
          Expected Answer Pattern <span className="text-red-400">*</span>
        </label>
        <input
          id="tc-pattern"
          value={form.expectedAnswerPattern}
          onChange={(e) => setForm((f) => ({ ...f, expectedAnswerPattern: e.target.value }))}
          placeholder="substring or /regex/i"
          className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
        />
        <p className="text-xs text-slate-500 mt-1">
          Plain text = case-insensitive substring match. Wrap in <code className="text-indigo-400">/pattern/flags</code> for regex.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="tc-module" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Module Key
          </label>
          <input
            id="tc-module"
            value={form.moduleKey}
            onChange={(e) => setForm((f) => ({ ...f, moduleKey: e.target.value }))}
            placeholder="e.g. catalog"
            className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="tc-route" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Route
          </label>
          <input
            id="tc-route"
            value={form.route}
            onChange={(e) => setForm((f) => ({ ...f, route: e.target.value }))}
            placeholder="e.g. /catalog/products"
            className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="tc-tags" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Tags (comma-separated)
          </label>
          <input
            id="tc-tags"
            value={form.tags}
            onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
            placeholder="e.g. catalog, smoke"
            className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex items-end pb-0.5">
          <label htmlFor="tc-enabled" className="flex items-center gap-2 cursor-pointer select-none">
            <input
              id="tc-enabled"
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              className="w-4 h-4 rounded bg-slate-950 border border-slate-600 accent-indigo-500"
            />
            <span className="text-sm text-slate-300">Enabled</span>
          </label>
        </div>
      </div>
      {error && (
        <p className="text-sm text-red-400 flex items-center gap-1.5">
          <AlertCircle size={14} />
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => onSave(form)}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors"
        >
          <Check size={14} />
          {saving ? 'Saving...' : 'Save'}
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

// ── Test Case Row ─────────────────────────────────────────────────────

function TestCaseRow({
  tc,
  onUpdated,
  onDeleted,
}: {
  tc: TestCase;
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleSave(form: {
    question: string;
    expectedAnswerPattern: string;
    moduleKey: string;
    route: string;
    tags: string;
    enabled: boolean;
  }) {
    setSaving(true);
    setSaveError(null);
    try {
      await adminFetch(`/api/v1/ai-support/test-cases/${tc.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          question: form.question,
          expectedAnswerPattern: form.expectedAnswerPattern,
          moduleKey: form.moduleKey || undefined,
          route: form.route || undefined,
          tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
          enabled: form.enabled,
        }),
      });
      setEditing(false);
      onUpdated();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this test case? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await adminFetch(`/api/v1/ai-support/test-cases/${tc.id}`, { method: 'DELETE' });
      onDeleted();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed');
      setDeleting(false);
    }
  }

  async function handleToggleEnabled() {
    const newEnabled = tc.enabled !== 'true';
    try {
      await adminFetch(`/api/v1/ai-support/test-cases/${tc.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: newEnabled }),
      });
      onUpdated();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Toggle failed');
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
      <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {tc.moduleKey && (
              <span className="text-xs text-indigo-400 bg-indigo-950/50 border border-indigo-800 px-2 py-0.5 rounded-full">
                {tc.moduleKey}
              </span>
            )}
            {tc.tags?.map((tag) => (
              <span key={tag} className="text-xs text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">
                {tag}
              </span>
            ))}
            <button
              onClick={handleToggleEnabled}
              title={tc.enabled === 'true' ? 'Enabled — click to disable' : 'Disabled — click to enable'}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                tc.enabled === 'true'
                  ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700 hover:bg-emerald-900/60'
                  : 'bg-slate-800 text-slate-500 border-slate-700 hover:bg-slate-700'
              }`}
            >
              {tc.enabled === 'true' ? 'enabled' : 'disabled'}
            </button>
          </div>
          <p className="text-sm text-slate-200 font-medium line-clamp-1">{tc.question}</p>
          <p className="text-xs text-slate-500 mt-0.5 font-mono line-clamp-1">
            Pattern: {tc.expectedAnswerPattern}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => { setEditing(true); setExpanded(true); }}
            aria-label="Edit test case"
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            aria-label="Delete test case"
            className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-800 pt-4">
          {editing ? (
            <TestCaseForm
              initial={{
                question: tc.question,
                expectedAnswerPattern: tc.expectedAnswerPattern,
                moduleKey: tc.moduleKey ?? '',
                route: tc.route ?? '',
                tags: (tc.tags ?? []).join(', '),
                enabled: tc.enabled === 'true',
              }}
              onSave={handleSave}
              onCancel={() => { setEditing(false); setSaveError(null); }}
              saving={saving}
              error={saveError}
            />
          ) : (
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Question</span>
                <p className="text-slate-300 mt-0.5">{tc.question}</p>
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Expected Pattern</span>
                <p className="text-slate-300 mt-0.5 font-mono text-xs bg-slate-950 rounded p-2">{tc.expectedAnswerPattern}</p>
              </div>
              {tc.route && (
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Route</span>
                  <p className="text-slate-400 mt-0.5 font-mono text-xs">{tc.route}</p>
                </div>
              )}
              <p className="text-xs text-slate-600">
                Created {tc.createdAt ? new Date(tc.createdAt).toLocaleString() : '—'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Results Modal ────────────────────────────────────────────────────

function ResultsModal({
  runId,
  onClose,
}: {
  runId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await adminFetch<{ data: RunDetail }>(`/api/v1/ai-support/test-runs/${runId}`);
        if (!cancelled) setDetail(res.data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load results');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [runId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">Test Run Results</h2>
            {detail && (
              <p className="text-sm text-slate-400 mt-0.5">
                {detail.run.name} &mdash; <RunStatusBadge status={detail.run.status} />
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-16 bg-slate-800 rounded-lg animate-pulse" />
              ))}
            </div>
          )}

          {error && (
            <div className="bg-red-950 border border-red-700 rounded-lg p-4 text-red-300 text-sm flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {detail && (
            <>
              {/* Summary stats */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-white">{detail.run.totalCases}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Total</p>
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-emerald-400">{detail.run.passed}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Passed</p>
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-red-400">{detail.run.failed}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Failed</p>
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-amber-400">{detail.run.regressed}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Regressions</p>
                </div>
              </div>

              {/* Result rows */}
              <div className="space-y-2">
                {detail.results.map((r) => (
                  <div
                    key={r.id}
                    className={`border rounded-lg overflow-hidden ${
                      r.regression === 'true'
                        ? 'border-amber-700 bg-amber-950/20'
                        : r.passed === 'true'
                          ? 'border-slate-700 bg-slate-900'
                          : 'border-red-800 bg-red-950/20'
                    }`}
                  >
                    <div className="px-4 py-3 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <div className="shrink-0 mt-0.5">
                          {r.passed === 'true' ? (
                            <CheckCircle2 size={16} className="text-emerald-400" />
                          ) : r.regression === 'true' ? (
                            <TrendingDown size={16} className="text-amber-400" />
                          ) : (
                            <XCircle size={16} className="text-red-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-200 line-clamp-1">{r.question}</p>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                            {r.moduleKey && <span className="text-indigo-400">{r.moduleKey}</span>}
                            {r.durationMs != null && (
                              <span className="flex items-center gap-1">
                                <Clock size={10} />
                                {r.durationMs}ms
                              </span>
                            )}
                            {r.regression === 'true' && (
                              <span className="text-amber-400 font-medium">REGRESSION</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setExpandedResult(expandedResult === r.id ? null : r.id)}
                        aria-label={expandedResult === r.id ? 'Collapse' : 'Expand'}
                        className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
                      >
                        {expandedResult === r.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                    {expandedResult === r.id && (
                      <div className="px-4 pb-4 border-t border-slate-800 pt-3 space-y-3">
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Expected Pattern</p>
                          <p className="text-xs text-slate-400 font-mono bg-slate-950 rounded p-2">{r.expectedAnswerPattern}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Actual Answer</p>
                          <div className="text-xs text-slate-300 bg-slate-950 rounded p-2 max-h-40 overflow-y-auto whitespace-pre-wrap">
                            {r.actualAnswer ?? '(no answer)'}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export default function AITestingPage() {
  // Test cases state
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [tcLoading, setTcLoading] = useState(true);
  const [tcError, setTcError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Test runs state
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [viewRunId, setViewRunId] = useState<string | null>(null);

  // ── Data loaders ──

  const loadTestCases = useCallback(async () => {
    setTcLoading(true);
    setTcError(null);
    try {
      const res = await adminFetch<{ data: { items: TestCase[] } }>('/api/v1/ai-support/test-cases');
      setTestCases(res.data.items);
    } catch (e) {
      setTcError(e instanceof Error ? e.message : 'Failed to load test cases');
    } finally {
      setTcLoading(false);
    }
  }, []);

  const loadTestRuns = useCallback(async () => {
    setRunsLoading(true);
    setRunsError(null);
    try {
      const res = await adminFetch<{ data: { items: TestRun[] } }>('/api/v1/ai-support/test-runs');
      setTestRuns(res.data.items);
    } catch (e) {
      setRunsError(e instanceof Error ? e.message : 'Failed to load test runs');
    } finally {
      setRunsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTestCases();
    void loadTestRuns();
  }, [loadTestCases, loadTestRuns]);

  // ── Handlers ──

  async function handleAddTestCase(form: {
    question: string;
    expectedAnswerPattern: string;
    moduleKey: string;
    route: string;
    tags: string;
    enabled: boolean;
  }) {
    if (!form.question.trim() || !form.expectedAnswerPattern.trim()) {
      setAddError('Question and expected pattern are required.');
      return;
    }
    setAddSaving(true);
    setAddError(null);
    try {
      await adminFetch('/api/v1/ai-support/test-cases', {
        method: 'POST',
        body: JSON.stringify({
          question: form.question,
          expectedAnswerPattern: form.expectedAnswerPattern,
          moduleKey: form.moduleKey || undefined,
          route: form.route || undefined,
          tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });
      setShowAddForm(false);
      void loadTestCases();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to create test case');
    } finally {
      setAddSaving(false);
    }
  }

  async function handleRunSuite() {
    setRunning(true);
    setRunError(null);
    try {
      await adminFetch('/api/v1/ai-support/test-runs', {
        method: 'POST',
        body: JSON.stringify({ name: `Suite Run ${new Date().toLocaleString()}` }),
      });
      void loadTestRuns();
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Failed to run suite');
    } finally {
      setRunning(false);
    }
  }

  const enabledCount = testCases.filter((tc) => tc.enabled === 'true').length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-900/40 border border-indigo-800 rounded-lg">
            <FlaskConical size={20} className="text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">AI Testing Suite</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Regression tests for the OppsEra AI assistant
            </p>
          </div>
        </div>
        <button
          onClick={handleRunSuite}
          disabled={running || enabledCount === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50 transition-colors"
        >
          <Play size={14} />
          {running ? 'Running...' : `Run Suite (${enabledCount} cases)`}
        </button>
      </div>

      {runError && (
        <div className="bg-red-950 border border-red-700 rounded-lg p-4 text-red-300 text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          {runError}
        </div>
      )}

      {/* ── Test Cases ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Test Cases</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {testCases.length} total &mdash; {enabledCount} enabled
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadTestCases}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-300 bg-slate-800 border border-slate-700 hover:text-white hover:border-slate-600 transition-colors"
            >
              <RefreshCw size={13} />
              Refresh
            </button>
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              <Plus size={13} />
              Add Test Case
            </button>
          </div>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-5 mb-4">
            <h3 className="text-sm font-semibold text-white mb-4">New Test Case</h3>
            <TestCaseForm
              initial={{ question: '', expectedAnswerPattern: '', moduleKey: '', route: '', tags: '', enabled: true }}
              onSave={handleAddTestCase}
              onCancel={() => { setShowAddForm(false); setAddError(null); }}
              saving={addSaving}
              error={addError}
            />
          </div>
        )}

        {/* Error */}
        {tcError && (
          <div className="bg-red-950 border border-red-700 rounded-lg p-4 text-red-300 text-sm flex items-center gap-2 mb-4">
            <AlertCircle size={16} />
            {tcError}
          </div>
        )}

        {/* Loading */}
        {tcLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-16 bg-slate-900 border border-slate-700 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty */}
        {!tcLoading && testCases.length === 0 && !tcError && (
          <div className="text-center py-12 text-slate-500 border border-slate-800 rounded-lg">
            <FlaskConical size={32} className="mx-auto mb-3 text-slate-700" />
            <p className="text-base font-medium">No test cases yet</p>
            <p className="text-sm mt-1">Add your first test case to start building the suite.</p>
          </div>
        )}

        {/* List */}
        {!tcLoading && testCases.length > 0 && (
          <div className="space-y-2">
            {testCases.map((tc) => (
              <TestCaseRow
                key={tc.id}
                tc={tc}
                onUpdated={loadTestCases}
                onDeleted={loadTestCases}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Test Runs ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Test Runs</h2>
          <button
            onClick={loadTestRuns}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-300 bg-slate-800 border border-slate-700 hover:text-white hover:border-slate-600 transition-colors"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>

        {runsError && (
          <div className="bg-red-950 border border-red-700 rounded-lg p-4 text-red-300 text-sm flex items-center gap-2 mb-4">
            <AlertCircle size={16} />
            {runsError}
          </div>
        )}

        {runsLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-14 bg-slate-900 border border-slate-700 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {!runsLoading && testRuns.length === 0 && !runsError && (
          <div className="text-center py-10 text-slate-500 border border-slate-800 rounded-lg">
            <p className="text-sm">No test runs yet. Click &ldquo;Run Suite&rdquo; to start the first one.</p>
          </div>
        )}

        {!runsLoading && testRuns.length > 0 && (
          <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Passed</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Failed</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Regressions</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {testRuns.map((run, i) => (
                  <tr
                    key={run.id}
                    className={`border-b border-slate-800 hover:bg-slate-800/40 transition-colors ${i === testRuns.length - 1 ? 'border-b-0' : ''}`}
                  >
                    <td className="px-4 py-3 text-slate-200 font-medium max-w-xs truncate">{run.name}</td>
                    <td className="px-4 py-3">
                      <RunStatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-emerald-400 font-semibold">{run.passed}</span>
                      <span className="text-slate-600">/{run.totalCases}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={run.failed > 0 ? 'text-red-400 font-semibold' : 'text-slate-500'}>
                        {run.failed}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={run.regressed > 0 ? 'text-amber-400 font-semibold' : 'text-slate-500'}>
                        {run.regressed}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                      {run.createdAt ? new Date(run.createdAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setViewRunId(run.id)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors whitespace-nowrap"
                      >
                        View Results
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Results modal */}
      {viewRunId && (
        <ResultsModal runId={viewRunId} onClose={() => setViewRunId(null)} />
      )}
    </div>
  );
}
