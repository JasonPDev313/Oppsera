'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Copy, Check, Trash2, Eye, EyeOff, Code, X } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

export interface EmbedWidget {
  id: string;
  token: string;
  widgetType: string;
  config: Record<string, unknown>;
  viewCount: number;
}

interface EmbedWidgetConfig {
  widgetType: string;
  metricSlug: string;
  title: string;
  style: 'light' | 'dark' | 'auto';
}

interface EmbeddableWidgetProps {
  widgets: EmbedWidget[];
  onCreateWidget: (config: EmbedWidgetConfig) => void;
  onDeleteWidget: (id: string) => void;
  className?: string;
}

// ── Constants ──────────────────────────────────────────────────────

const WIDGET_TYPES = [
  { value: 'metric_card', label: 'Metric Card' },
  { value: 'chart', label: 'Chart' },
  { value: 'kpi_grid', label: 'KPI Grid' },
];

const METRIC_OPTIONS = [
  { value: 'total_sales', label: 'Total Sales' },
  { value: 'order_count', label: 'Order Count' },
  { value: 'avg_order_value', label: 'Avg Order Value' },
  { value: 'gross_profit', label: 'Gross Profit' },
];

const STYLE_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'auto', label: 'Auto' },
] as const;

const TYPE_LABELS: Record<string, string> = {
  metric_card: 'Metric Card',
  chart: 'Chart',
  kpi_grid: 'KPI Grid',
};

// ── Component ──────────────────────────────────────────────────────

export function EmbeddableWidget({
  widgets,
  onCreateWidget,
  onDeleteWidget,
  className,
}: EmbeddableWidgetProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [codeWidgetId, setCodeWidgetId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const handleCopy = useCallback((widgetId: string, token: string) => {
    const embedCode = `<iframe src="${window.location.origin}/embed/${token}" width="400" height="200" frameborder="0" style="border: 1px solid #e5e7eb; border-radius: 8px;" loading="lazy"></iframe>`;
    navigator.clipboard.writeText(embedCode).then(() => {
      setCopiedId(widgetId);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  const handleCreate = useCallback(
    (config: EmbedWidgetConfig) => {
      onCreateWidget(config);
      setShowCreateDialog(false);
    },
    [onCreateWidget],
  );

  return (
    <div className={`rounded-lg border border-border bg-surface ${className ?? ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Embeddable Widgets</h3>
        <button
          type="button"
          onClick={() => setShowCreateDialog(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Create Widget
        </button>
      </div>

      {/* Widget list */}
      <div className="divide-y divide-border">
        {widgets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <Code className="h-6 w-6 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No embed widgets yet</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Create a widget to embed metrics in external dashboards
            </p>
          </div>
        )}

        {widgets.map((widget) => {
          const showingCode = codeWidgetId === widget.id;
          const isCopied = copiedId === widget.id;

          return (
            <div key={widget.id} className="px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                    {TYPE_LABELS[widget.widgetType] ?? widget.widgetType}
                  </span>
                  <span className="text-xs text-foreground font-medium truncate">
                    {(widget.config.title as string) ?? widget.id.slice(0, 12)}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground" title="View count">
                    <Eye className="h-3 w-3" />
                    {widget.viewCount.toLocaleString()}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setCodeWidgetId(showingCode ? null : widget.id)
                    }
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    title={showingCode ? 'Hide embed code' : 'Show embed code'}
                  >
                    {showingCode ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Code className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(widget.id, widget.token)}
                    className="p-1 text-muted-foreground hover:text-primary transition-colors"
                    title="Copy embed code"
                  >
                    {isCopied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteWidget(widget.id)}
                    className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                    title="Delete widget"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Embed code preview */}
              {showingCode && (
                <div className="mt-2 p-2 rounded bg-muted font-mono text-[10px] text-muted-foreground break-all leading-relaxed">
                  {`<iframe src="${window.location.origin}/embed/${widget.token}" width="400" height="200" frameborder="0" style="border: 1px solid #e5e7eb; border-radius: 8px;" loading="lazy"></iframe>`}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create dialog (portal) */}
      {showCreateDialog &&
        typeof document !== 'undefined' &&
        createPortal(
          <CreateWidgetDialog
            onClose={() => setShowCreateDialog(false)}
            onCreate={handleCreate}
          />,
          document.body,
        )}
    </div>
  );
}

// ── Create Widget Dialog ───────────────────────────────────────────

function CreateWidgetDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (config: EmbedWidgetConfig) => void;
}) {
  const [widgetType, setWidgetType] = useState(WIDGET_TYPES[0]!.value);
  const [metricSlug, setMetricSlug] = useState(METRIC_OPTIONS[0]!.value);
  const [title, setTitle] = useState('');
  const [style, setStyle] = useState<'light' | 'dark' | 'auto'>('auto');

  const handleSubmit = useCallback(() => {
    if (title.trim()) {
      onCreate({ widgetType, metricSlug, title: title.trim(), style });
    }
  }, [onCreate, widgetType, metricSlug, title, style]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-md rounded-xl border border-border bg-surface shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Create Embed Widget</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Widget type */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Widget Type
          </label>
          <select
            value={widgetType}
            onChange={(e) => setWidgetType(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            {WIDGET_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Metric */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Metric
          </label>
          <select
            value={metricSlug}
            onChange={(e) => setMetricSlug(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            {METRIC_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Widget title"
            maxLength={80}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>

        {/* Style */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Style
          </label>
          <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
            {STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStyle(opt.value)}
                className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  style === opt.value
                    ? 'bg-surface text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            Create Widget
          </button>
        </div>
      </div>
    </div>
  );
}
