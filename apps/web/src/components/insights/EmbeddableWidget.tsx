'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Copy,
  Check,
  Trash2,
  Eye,
  Code,
  X,
  BarChart3,
  LayoutGrid,
  CreditCard,
  Globe,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';

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
  { value: 'metric_card', label: 'Metric Card', description: 'Single KPI with trend', icon: CreditCard },
  { value: 'chart', label: 'Chart', description: 'Bar comparison across metrics', icon: BarChart3 },
  { value: 'kpi_grid', label: 'KPI Grid', description: 'Multiple metrics in a grid', icon: LayoutGrid },
];

const METRIC_OPTIONS = [
  { value: 'net_sales', label: 'Net Sales' },
  { value: 'gross_sales', label: 'Gross Sales' },
  { value: 'order_count', label: 'Order Count' },
  { value: 'avg_order_value', label: 'Avg Order Value' },
  { value: 'void_count', label: 'Voids' },
  { value: 'discount_total', label: 'Discounts' },
  { value: 'tax_total', label: 'Tax Collected' },
];

const STYLE_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'auto', label: 'Auto' },
] as const;

const TYPE_META: Record<string, { label: string; icon: typeof CreditCard; accent: string }> = {
  metric_card: { label: 'Metric Card', icon: CreditCard, accent: 'text-indigo-500 bg-indigo-500/10' },
  chart: { label: 'Chart', icon: BarChart3, accent: 'text-amber-500 bg-amber-500/10' },
  kpi_grid: { label: 'KPI Grid', icon: LayoutGrid, accent: 'text-emerald-500 bg-emerald-500/10' },
};

const METRIC_LABELS: Record<string, string> = {
  net_sales: 'Net Sales',
  gross_sales: 'Gross Sales',
  order_count: 'Orders',
  avg_order_value: 'Avg Order',
  void_count: 'Voids',
  discount_total: 'Discounts',
  tax_total: 'Tax',
};

const THEME_LABELS: Record<string, string> = {
  light: 'Light',
  dark: 'Dark',
  auto: 'Auto',
};

// ── Component ──────────────────────────────────────────────────────

export function EmbeddableWidget({
  widgets,
  onCreateWidget,
  onDeleteWidget,
  className,
}: EmbeddableWidgetProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const handleCopy = useCallback((widgetId: string, token: string) => {
    const embedCode = `<iframe src="${window.location.origin}/embed/${token}" width="400" height="220" frameborder="0" style="border-radius: 12px; border: none;" loading="lazy"></iframe>`;
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

  const handleDelete = useCallback(
    (id: string) => {
      onDeleteWidget(id);
      setDeleteConfirmId(null);
    },
    [onDeleteWidget],
  );

  return (
    <div className={className ?? ''}>
      {/* Header with count + create */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            Your Widgets
          </span>
          {widgets.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
              {widgets.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowCreateDialog(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Create Widget
        </button>
      </div>

      {/* Empty state */}
      {widgets.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-surface/50 py-12 px-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-4">
            <Code className="h-6 w-6 text-indigo-500" />
          </div>
          <h3 className="text-sm font-medium text-foreground mb-1">No embed widgets yet</h3>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto mb-4">
            Create embeddable metric cards, charts, and KPI grids to display on external dashboards or websites.
          </p>
          <button
            type="button"
            onClick={() => setShowCreateDialog(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Your First Widget
          </button>
        </div>
      )}

      {/* Widget cards */}
      {widgets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {widgets.map((widget) => {
            const meta = TYPE_META[widget.widgetType] ?? TYPE_META.metric_card!;
            const Icon = meta.icon;
            const title = (widget.config.title as string) || METRIC_LABELS[(widget.config.metricSlugs as string[])?.[0] ?? ''] || 'Untitled';
            const metricSlugs = (widget.config.metricSlugs as string[]) ?? [];
            const theme = (widget.config.theme as string) ?? 'auto';
            const isCopied = copiedId === widget.id;
            const isExpanded = expandedId === widget.id;
            const isDeleting = deleteConfirmId === widget.id;

            return (
              <div
                key={widget.id}
                className="rounded-xl border border-border bg-surface overflow-hidden transition-shadow hover:shadow-sm"
              >
                {/* Card header */}
                <div className="px-4 pt-3.5 pb-2">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg ${meta.accent} flex items-center justify-center shrink-0`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-medium text-foreground truncate">{title}</h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{meta.label}</p>
                    </div>
                  </div>
                </div>

                {/* Card metadata */}
                <div className="px-4 pb-3">
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    {metricSlugs.map((slug) => (
                      <span
                        key={slug}
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground"
                      >
                        {METRIC_LABELS[slug] ?? slug}
                      </span>
                    ))}
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground capitalize">
                      {THEME_LABELS[theme] ?? theme}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-2.5 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {widget.viewCount.toLocaleString()} views
                    </span>
                  </div>
                </div>

                {/* Expanded embed code */}
                {isExpanded && (
                  <div className="px-4 pb-3">
                    <div className="rounded-lg bg-muted/50 border border-border p-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Embed Code</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(widget.id, widget.token)}
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary/80 transition-colors"
                        >
                          {isCopied ? (
                            <>
                              <Check className="h-3 w-3" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                      <code className="block font-mono text-[10px] text-muted-foreground break-all leading-relaxed select-all">
                        {`<iframe src="${typeof window !== 'undefined' ? window.location.origin : ''}/embed/${widget.token}" width="400" height="220" frameborder="0" style="border-radius: 12px; border: none;" loading="lazy"></iframe>`}
                      </code>
                    </div>
                    <a
                      href={`/embed/${widget.token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-2 text-[11px] text-primary hover:text-primary/80 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Preview in new tab
                    </a>
                  </div>
                )}

                {/* Delete confirmation */}
                {isDeleting && (
                  <div className="px-4 pb-3">
                    <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-2.5">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                        <span className="text-xs text-red-500 font-medium">Delete this widget?</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mb-2">
                        Any pages embedding this widget will stop showing data.
                      </p>
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(widget.id)}
                          className="px-2.5 py-1 text-[11px] font-medium text-red-500 bg-red-500/10 border border-red-500/30 rounded hover:bg-red-500/20 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Card actions bar */}
                <div className="flex items-center border-t border-border divide-x divide-border">
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedId(isExpanded ? null : widget.id);
                      setDeleteConfirmId(null);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <Code className="h-3 w-3" />
                    {isExpanded ? 'Hide Code' : 'Embed Code'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(widget.id, widget.token)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium text-muted-foreground hover:text-primary transition-colors"
                  >
                    {isCopied ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-500" />
                        <span className="text-emerald-500">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        Copy Code
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteConfirmId(isDeleting ? null : widget.id);
                      setExpandedId(null);
                    }}
                    className="px-3 flex items-center justify-center py-2 text-muted-foreground hover:text-red-500 transition-colors"
                    title="Delete widget"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
    const finalTitle = title.trim() || METRIC_LABELS[metricSlug] || 'Widget';
    onCreate({ widgetType, metricSlug, title: finalTitle, style });
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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden">
        {/* Dialog header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Globe className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Create Embed Widget</h3>
              <p className="text-[11px] text-muted-foreground">Embed metrics on external sites via iframe</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Widget type — card selector */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">
              Widget Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {WIDGET_TYPES.map((t) => {
                const TypeIcon = t.icon;
                const isSelected = widgetType === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setWidgetType(t.value)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                        : 'border-border bg-surface hover:border-primary/30 hover:bg-accent'
                    }`}
                  >
                    <TypeIcon className={`h-5 w-5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className={`text-xs font-medium ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {t.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground leading-tight">{t.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Metric */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Metric
            </label>
            <select
              value={metricSlug}
              onChange={(e) => setMetricSlug(e.target.value)}
              className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
            >
              {METRIC_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Display Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={METRIC_LABELS[metricSlug] ?? 'Widget title'}
              maxLength={80}
              className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Leave empty to use the metric name
            </p>
          </div>

          {/* Theme style — segmented control */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Theme
            </label>
            <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
              {STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStyle(opt.value)}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
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
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 justify-end px-6 py-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-4 py-2 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Create Widget
          </button>
        </div>
      </div>
    </div>
  );
}
