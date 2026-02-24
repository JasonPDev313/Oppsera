'use client';

import { useState, useCallback } from 'react';
import { Plus, Lock, Pencil, Trash2, Play, Loader2, Check, BarChart2, Columns } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

export interface MetricDef {
  slug: string;
  displayName: string;
  description: string;
  sqlExpression: string;
  aggregation: string;
  format: string;
  isSystem: boolean;
}

export interface DimensionDef {
  slug: string;
  displayName: string;
  description: string;
  sqlExpression: string;
  isSystem: boolean;
}

interface SemanticAuthoringPanelProps {
  metrics: MetricDef[];
  dimensions: DimensionDef[];
  onSaveMetric: (m: Omit<MetricDef, 'isSystem'>) => void;
  onSaveDimension: (d: Omit<DimensionDef, 'isSystem'>) => void;
  onDeleteMetric?: (slug: string) => void;
  onDeleteDimension?: (slug: string) => void;
  onTestExpression?: (sql: string) => Promise<Record<string, unknown>[]>;
  className?: string;
}

// ── Constants ──────────────────────────────────────────────────────

const AGGREGATION_OPTIONS = ['sum', 'count', 'avg', 'min', 'max', 'count_distinct'];
const FORMAT_OPTIONS = ['currency', 'number', 'percent', 'integer'];

const SQL_KEYWORDS = new Set([
  'select', 'from', 'where', 'and', 'or', 'not', 'in', 'between',
  'like', 'is', 'null', 'as', 'on', 'join', 'left', 'right', 'inner',
  'group', 'by', 'order', 'having', 'limit', 'offset', 'case', 'when',
  'then', 'else', 'end', 'cast', 'coalesce', 'count', 'sum', 'avg',
  'min', 'max', 'distinct', 'true', 'false',
]);

const SLUG_REGEX = /^[a-z][a-z0-9_]*$/;

// ── Helpers ────────────────────────────────────────────────────────

function highlightSql(sql: string): React.ReactNode[] {
  const tokens = sql.split(/(\s+)/);
  return tokens.map((token, idx) => {
    if (SQL_KEYWORDS.has(token.toLowerCase())) {
      return (
        <span key={idx} className="text-blue-500 font-semibold">
          {token}
        </span>
      );
    }
    return <span key={idx}>{token}</span>;
  });
}

function validateSlug(slug: string): string | null {
  if (!slug) return 'Slug is required';
  if (!SLUG_REGEX.test(slug)) return 'Must be lowercase letters, numbers, and underscores';
  if (slug.length < 2) return 'Must be at least 2 characters';
  if (slug.length > 60) return 'Must be 60 characters or fewer';
  return null;
}

// ── Component ──────────────────────────────────────────────────────

export function SemanticAuthoringPanel({
  metrics,
  dimensions,
  onSaveMetric,
  onSaveDimension,
  onDeleteMetric,
  onDeleteDimension,
  onTestExpression,
  className,
}: SemanticAuthoringPanelProps) {
  const [activeTab, setActiveTab] = useState<'metrics' | 'dimensions'>('metrics');
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  return (
    <div className={`rounded-lg border border-border bg-surface ${className ?? ''}`}>
      {/* Tab header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
          <button
            type="button"
            onClick={() => { setActiveTab('metrics'); setEditingSlug(null); setIsAdding(false); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === 'metrics'
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BarChart2 className="h-3.5 w-3.5" />
            Metrics
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('dimensions'); setEditingSlug(null); setIsAdding(false); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === 'dimensions'
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Columns className="h-3.5 w-3.5" />
            Dimensions
          </button>
        </div>

        <button
          type="button"
          onClick={() => { setIsAdding(true); setEditingSlug(null); }}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-primary hover:bg-gray-200/50 rounded-md transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add New
        </button>
      </div>

      {/* Content */}
      <div className="divide-y divide-border">
        {activeTab === 'metrics' && (
          <>
            {isAdding && (
              <MetricForm
                onSave={(m) => { onSaveMetric(m); setIsAdding(false); }}
                onCancel={() => setIsAdding(false)}
                onTestExpression={onTestExpression}
              />
            )}
            {metrics.map((metric) => (
              <div key={metric.slug}>
                {editingSlug === metric.slug && !metric.isSystem ? (
                  <MetricForm
                    initial={metric}
                    onSave={(m) => { onSaveMetric(m); setEditingSlug(null); }}
                    onCancel={() => setEditingSlug(null)}
                    onTestExpression={onTestExpression}
                  />
                ) : (
                  <MetricRow
                    metric={metric}
                    onEdit={() => setEditingSlug(metric.slug)}
                    onDelete={onDeleteMetric}
                  />
                )}
              </div>
            ))}
            {metrics.length === 0 && !isAdding && (
              <EmptyState label="metrics" />
            )}
          </>
        )}

        {activeTab === 'dimensions' && (
          <>
            {isAdding && (
              <DimensionForm
                onSave={(d) => { onSaveDimension(d); setIsAdding(false); }}
                onCancel={() => setIsAdding(false)}
                onTestExpression={onTestExpression}
              />
            )}
            {dimensions.map((dim) => (
              <div key={dim.slug}>
                {editingSlug === dim.slug && !dim.isSystem ? (
                  <DimensionForm
                    initial={dim}
                    onSave={(d) => { onSaveDimension(d); setEditingSlug(null); }}
                    onCancel={() => setEditingSlug(null)}
                    onTestExpression={onTestExpression}
                  />
                ) : (
                  <DimensionRow
                    dimension={dim}
                    onEdit={() => setEditingSlug(dim.slug)}
                    onDelete={onDeleteDimension}
                  />
                )}
              </div>
            ))}
            {dimensions.length === 0 && !isAdding && (
              <EmptyState label="dimensions" />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Metric Row ─────────────────────────────────────────────────────

function MetricRow({
  metric,
  onEdit,
  onDelete,
}: {
  metric: MetricDef;
  onEdit: () => void;
  onDelete?: (slug: string) => void;
}) {
  return (
    <div className="px-4 py-3 flex items-start justify-between gap-3 group">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">{metric.displayName}</p>
          {metric.isSystem && (
            <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
          <span className="px-1.5 py-0 rounded text-[10px] font-medium bg-muted text-muted-foreground">
            {metric.aggregation}
          </span>
          <span className="px-1.5 py-0 rounded text-[10px] font-medium bg-muted text-muted-foreground">
            {metric.format}
          </span>
        </div>
        {metric.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{metric.description}</p>
        )}
        <pre className="mt-1 text-[10px] font-mono text-muted-foreground leading-relaxed">
          {highlightSql(metric.sqlExpression)}
        </pre>
      </div>
      {!metric.isSystem && (
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onEdit}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(metric.slug)}
              className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Dimension Row ──────────────────────────────────────────────────

function DimensionRow({
  dimension,
  onEdit,
  onDelete,
}: {
  dimension: DimensionDef;
  onEdit: () => void;
  onDelete?: (slug: string) => void;
}) {
  return (
    <div className="px-4 py-3 flex items-start justify-between gap-3 group">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">{dimension.displayName}</p>
          {dimension.isSystem && (
            <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
        </div>
        {dimension.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{dimension.description}</p>
        )}
        <pre className="mt-1 text-[10px] font-mono text-muted-foreground leading-relaxed">
          {highlightSql(dimension.sqlExpression)}
        </pre>
      </div>
      {!dimension.isSystem && (
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onEdit}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(dimension.slug)}
              className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Metric Form ────────────────────────────────────────────────────

function MetricForm({
  initial,
  onSave,
  onCancel,
  onTestExpression,
}: {
  initial?: MetricDef;
  onSave: (m: Omit<MetricDef, 'isSystem'>) => void;
  onCancel: () => void;
  onTestExpression?: (sql: string) => Promise<Record<string, unknown>[]>;
}) {
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [sqlExpression, setSqlExpression] = useState(initial?.sqlExpression ?? '');
  const [aggregation, setAggregation] = useState(initial?.aggregation ?? 'sum');
  const [format, setFormat] = useState(initial?.format ?? 'number');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, unknown>[] | null>(null);

  const slugError = validateSlug(slug);
  const canSave = !slugError && displayName.trim() && sqlExpression.trim();

  const handleTest = useCallback(async () => {
    if (!onTestExpression || !sqlExpression.trim()) return;
    setTesting(true);
    try {
      const rows = await onTestExpression(sqlExpression);
      setTestResult(rows.slice(0, 5));
    } catch {
      setTestResult([]);
    } finally {
      setTesting(false);
    }
  }, [onTestExpression, sqlExpression]);

  return (
    <div className="px-4 py-3 bg-muted/20 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Slug" error={slug ? slugError : null}>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="my_metric"
            disabled={!!initial}
            className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground font-mono disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </FormField>
        <FormField label="Display Name">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="My Metric"
            className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </FormField>
      </div>

      <FormField label="Description">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this metric measures..."
          className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
      </FormField>

      <FormField label="SQL Expression">
        <textarea
          value={sqlExpression}
          onChange={(e) => setSqlExpression(e.target.value)}
          placeholder="e.g., SUM(total_amount)"
          rows={2}
          className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring/40 resize-none"
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Aggregation">
          <select
            value={aggregation}
            onChange={(e) => setAggregation(e.target.value)}
            className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            {AGGREGATION_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Format">
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            {FORMAT_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </FormField>
      </div>

      {/* Test results */}
      {testResult && testResult.length > 0 && (
        <div className="overflow-x-auto rounded border border-border bg-surface text-[10px]">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-border">
                {Object.keys(testResult[0]!).map((col) => (
                  <th key={col} className="px-2 py-1 text-left font-medium text-muted-foreground">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {testResult.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-b-0">
                  {Object.values(row).map((val, j) => (
                    <td key={j} className="px-2 py-1 text-foreground">{String(val ?? '-')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 justify-end">
        {onTestExpression && (
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !sqlExpression.trim()}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
          >
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            Test
          </button>
        )}
        <button type="button" onClick={onCancel} className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave({ slug, displayName: displayName.trim(), description: description.trim(), sqlExpression: sqlExpression.trim(), aggregation, format })}
          disabled={!canSave}
          className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Check className="h-3 w-3" />
          Save
        </button>
      </div>
    </div>
  );
}

// ── Dimension Form ─────────────────────────────────────────────────

function DimensionForm({
  initial,
  onSave,
  onCancel,
  onTestExpression,
}: {
  initial?: DimensionDef;
  onSave: (d: Omit<DimensionDef, 'isSystem'>) => void;
  onCancel: () => void;
  onTestExpression?: (sql: string) => Promise<Record<string, unknown>[]>;
}) {
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [sqlExpression, setSqlExpression] = useState(initial?.sqlExpression ?? '');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, unknown>[] | null>(null);

  const slugError = validateSlug(slug);
  const canSave = !slugError && displayName.trim() && sqlExpression.trim();

  const handleTest = useCallback(async () => {
    if (!onTestExpression || !sqlExpression.trim()) return;
    setTesting(true);
    try {
      const rows = await onTestExpression(sqlExpression);
      setTestResult(rows.slice(0, 5));
    } catch {
      setTestResult([]);
    } finally {
      setTesting(false);
    }
  }, [onTestExpression, sqlExpression]);

  return (
    <div className="px-4 py-3 bg-muted/20 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Slug" error={slug ? slugError : null}>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="my_dimension"
            disabled={!!initial}
            className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground font-mono disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </FormField>
        <FormField label="Display Name">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="My Dimension"
            className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </FormField>
      </div>

      <FormField label="Description">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this dimension represents..."
          className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
      </FormField>

      <FormField label="SQL Expression">
        <textarea
          value={sqlExpression}
          onChange={(e) => setSqlExpression(e.target.value)}
          placeholder="e.g., location_name"
          rows={2}
          className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring/40 resize-none"
        />
      </FormField>

      {/* Test results */}
      {testResult && testResult.length > 0 && (
        <div className="overflow-x-auto rounded border border-border bg-surface text-[10px]">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-border">
                {Object.keys(testResult[0]!).map((col) => (
                  <th key={col} className="px-2 py-1 text-left font-medium text-muted-foreground">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {testResult.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-b-0">
                  {Object.values(row).map((val, j) => (
                    <td key={j} className="px-2 py-1 text-foreground">{String(val ?? '-')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 justify-end">
        {onTestExpression && (
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !sqlExpression.trim()}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
          >
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            Test
          </button>
        )}
        <button type="button" onClick={onCancel} className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave({ slug, displayName: displayName.trim(), description: description.trim(), sqlExpression: sqlExpression.trim() })}
          disabled={!canSave}
          className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Check className="h-3 w-3" />
          Save
        </button>
      </div>
    </div>
  );
}

// ── Form Field ─────────────────────────────────────────────────────

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
        {label}
      </label>
      {children}
      {error && <p className="text-[10px] text-red-500 mt-0.5">{error}</p>}
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center px-4">
      <p className="text-sm text-muted-foreground">No custom {label} defined</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        Click &ldquo;Add New&rdquo; to create one
      </p>
    </div>
  );
}
