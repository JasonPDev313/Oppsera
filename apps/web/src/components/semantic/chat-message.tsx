'use client';

import { useState, useCallback, useMemo, memo } from 'react';
import { ChevronDown, ChevronRight, Database, Zap, AlertCircle, Code2, Info, Search, TrendingUp, GitBranch, Lightbulb, Pin, Check } from 'lucide-react';
import type { ChatMessage, QueryPlan } from '@/hooks/use-semantic-chat';
import { FeedbackWidget } from '@/components/insights/FeedbackWidget';
import { InlineChart } from '@/components/insights/InlineChart';
import { FollowUpChips } from '@/components/insights/FollowUpChips';
import { DataQualityBadge } from '@/components/insights/DataQualityBadge';
import { DataLineagePanel } from '@/components/insights/DataLineagePanel';
import { apiFetch } from '@/lib/api-client';

// ── Simple markdown renderer ──────────────────────────────────────
// Renders bold, italics, code spans, and block code from LLM narrative.
// No external dep — covers the subset the narrative generator produces.

function renderMarkdown(text: string): React.ReactNode {
  // Split by newlines, render each line
  return text.split('\n').map((line, i) => {
    // Headings: ## or ###
    if (/^###\s+/.test(line)) {
      return <h4 key={i} className="text-sm font-semibold mt-3 mb-1 text-foreground">{line.replace(/^###\s+/, '')}</h4>;
    }
    if (/^##\s+/.test(line)) {
      return <h3 key={i} className="text-base font-semibold mt-3 mb-1 text-foreground">{line.replace(/^##\s+/, '')}</h3>;
    }
    // Bullet list
    if (/^[-*]\s+/.test(line)) {
      return <li key={i} className="ml-4 list-disc text-sm">{formatInline(line.replace(/^[-*]\s+/, ''))}</li>;
    }
    // Empty line = paragraph break
    if (line.trim() === '') {
      return <br key={i} />;
    }
    return <p key={i} className="text-sm leading-relaxed">{formatInline(line)}</p>;
  });
}

function formatInline(text: string): React.ReactNode {
  // Bold: **text**
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

// ── QueryResultTable ──────────────────────────────────────────────

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    // Flatten nested objects/arrays for display instead of [object Object]
    return JSON.stringify(value);
  }
  return String(value);
}

function QueryResultTable({ rows, rowCount }: { rows: Record<string, unknown>[]; rowCount: number }) {
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? rows : rows.slice(0, 5);

  // Flatten nested object columns — memoized to avoid recomputation on re-renders.
  const flattenedRows = useMemo(() => {
    if (visibleRows.length === 0) return [];
    return visibleRows.map((row) => {
      const flat: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
            flat[`${key}_${subKey}`] = subValue;
          }
        } else {
          flat[key] = value;
        }
      }
      return flat;
    });
  }, [visibleRows]);

  if (rows.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic mt-2">No data rows returned.</div>
    );
  }

  const columns = Object.keys(flattenedRows[0]!);

  return (
    <div className="mt-2">
      <div className="overflow-x-auto rounded border border-border">
        <table className="min-w-full text-xs">
          <thead className="bg-muted">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                >
                  {col.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {flattenedRows.map((row, i) => (
              <tr key={i} className="hover:bg-accent">
                {columns.map((col) => (
                  <td key={col} className="px-3 py-2 text-foreground whitespace-nowrap">
                    {formatCellValue(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rowCount > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-xs text-primary hover:text-primary/80"
        >
          {expanded ? 'Show fewer rows' : `Show all ${rowCount} rows`}
        </button>
      )}
    </div>
  );
}

// ── Query explanation builder ─────────────────────────────────────
// Generates a human-readable explanation of what the query looked at and why.

function buildQueryExplanation(
  plan: QueryPlan | null | undefined,
  sqlExplanation: string | null | undefined,
  mode: 'metrics' | 'sql' | undefined,
  tablesAccessed: string[] | undefined,
): string | null {
  // SQL mode — use the LLM-generated explanation directly
  if (mode === 'sql' && sqlExplanation) {
    return sqlExplanation;
  }

  // Metrics mode — build from the query plan
  if (!plan) return null;

  const parts: string[] = [];

  // What metrics were analyzed
  if (plan.metrics.length > 0) {
    const metricNames = plan.metrics.map((m) => m.replace(/_/g, ' '));
    parts.push(`Analyzed **${metricNames.join('**, **')}**`);
  }

  // How data was grouped
  if (plan.dimensions.length > 0) {
    const dimNames = plan.dimensions.map((d) => d.replace(/_/g, ' '));
    parts.push(`grouped by **${dimNames.join('**, **')}**`);
  }

  // Date range
  if (plan.dateRange) {
    parts.push(`for **${plan.dateRange.start}** to **${plan.dateRange.end}**`);
  }

  // Time granularity
  if (plan.timeGranularity) {
    parts.push(`at **${plan.timeGranularity}** granularity`);
  }

  // Filters
  if (Array.isArray(plan.filters) && plan.filters.length > 0) {
    const filterDescs = plan.filters
      .map((f: unknown) => {
        if (f && typeof f === 'object' && 'dimensionSlug' in f) {
          const filter = f as { dimensionSlug: string; operator: string; value: unknown };
          return `${filter.dimensionSlug.replace(/_/g, ' ')} ${filter.operator} ${String(filter.value)}`;
        }
        return null;
      })
      .filter(Boolean);
    if (filterDescs.length > 0) {
      parts.push(`filtered by ${filterDescs.join(', ')}`);
    }
  }

  // Sort & limit
  if (plan.sort && plan.sort.length > 0) {
    const sortDesc = plan.sort
      .map((s) => `${s.metricSlug.replace(/_/g, ' ')} (${s.direction === 'desc' ? 'highest first' : 'lowest first'})`)
      .join(', ');
    parts.push(`sorted by ${sortDesc}`);
  }
  if (plan.limit) {
    parts.push(`limited to top **${plan.limit}** results`);
  }

  // Tables accessed
  if (tablesAccessed && tablesAccessed.length > 0) {
    const tableNames = tablesAccessed.map((t) => t.replace(/_/g, ' '));
    parts.push(`from the **${tableNames.join('**, **')}** tables`);
  }

  if (parts.length === 0) return null;

  // Join with commas and periods
  let explanation = parts[0]!;
  if (parts.length > 1) {
    explanation += ', ' + parts.slice(1).join(', ');
  }
  return explanation + '.';
}

// ── QueryTransparencyPanel ───────────────────────────────────────
// User-facing panel showing the SQL query and explanation of field choices.

function QueryTransparencyPanel({
  compiledSql,
  sqlExplanation,
  plan,
  mode,
  tablesAccessed,
}: {
  compiledSql: string | null | undefined;
  sqlExplanation: string | null | undefined;
  plan: QueryPlan | null | undefined;
  mode: 'metrics' | 'sql' | undefined;
  tablesAccessed: string[] | undefined;
}) {
  const [open, setOpen] = useState(false);

  // Only show if we have a SQL query
  if (!compiledSql) return null;

  const explanation = buildQueryExplanation(plan, sqlExplanation, mode, tablesAccessed);

  return (
    <div className="mt-3 border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <Code2 className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">How this was calculated</span>
        {open ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronRight className="h-3 w-3 ml-auto" />}
      </button>

      {open && (
        <div className="border-t border-border">
          {/* Explanation section */}
          {explanation && (
            <div className="px-3 py-2.5 bg-accent/30">
              <div className="flex items-start gap-2">
                <Info className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                <div className="text-xs text-foreground leading-relaxed">
                  {formatInline(explanation)}
                </div>
              </div>
              {plan?.intent && (
                <div className="mt-1.5 ml-6 text-xs text-muted-foreground italic">
                  Intent: {plan.intent}
                </div>
              )}
            </div>
          )}

          {/* SQL section */}
          <div className="px-3 py-2.5 bg-muted/50">
            <div className="text-xs text-muted-foreground mb-1.5 font-medium">SQL Query</div>
            <pre className="text-xs font-mono text-foreground whitespace-pre-wrap overflow-x-auto leading-relaxed bg-muted rounded p-2">
              {formatSql(compiledSql)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

/** Light SQL formatter — adds line breaks at keywords for readability */
function formatSql(sql: string): string {
  return sql
    .replace(/\bSELECT\b/gi, '\nSELECT')
    .replace(/\bFROM\b/gi, '\nFROM')
    .replace(/\bWHERE\b/gi, '\nWHERE')
    .replace(/\bAND\b/gi, '\n  AND')
    .replace(/\bOR\b/gi, '\n  OR')
    .replace(/\bGROUP BY\b/gi, '\nGROUP BY')
    .replace(/\bORDER BY\b/gi, '\nORDER BY')
    .replace(/\bLIMIT\b/gi, '\nLIMIT')
    .replace(/\bJOIN\b/gi, '\nJOIN')
    .replace(/\bLEFT JOIN\b/gi, '\nLEFT JOIN')
    .replace(/\bINNER JOIN\b/gi, '\nINNER JOIN')
    .replace(/\bHAVING\b/gi, '\nHAVING')
    .replace(/\bWITH\b/gi, 'WITH')
    .trim();
}

// ── PlanDebugPanel ────────────────────────────────────────────────

function PlanDebugPanel({
  plan,
  compiledSql,
  compilationErrors,
  llmConfidence,
  llmLatencyMs,
  cacheStatus,
}: {
  plan: QueryPlan | null | undefined;
  compiledSql: string | null | undefined;
  compilationErrors: string[] | undefined;
  llmConfidence: number | null | undefined;
  llmLatencyMs: number | undefined;
  cacheStatus: 'HIT' | 'MISS' | 'SKIP' | undefined;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2 text-xs">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Database className="h-3 w-3" />
        <span>Debug</span>
        {cacheStatus === 'HIT' && (
          <span className="ml-1 px-1 py-0.5 bg-green-500/10 text-green-500 rounded">
            cached
          </span>
        )}
        {llmConfidence != null && (
          <span className="ml-1 text-muted-foreground">
            {Math.round(llmConfidence * 100)}% confidence
          </span>
        )}
      </button>

      {open && (
        <div className="mt-2 space-y-2 bg-muted rounded p-2 font-mono">
          {plan && (
            <div>
              <div className="text-muted-foreground mb-1">Plan:</div>
              <pre className="text-foreground whitespace-pre-wrap text-xs overflow-x-auto">
                {JSON.stringify(plan, null, 2)}
              </pre>
            </div>
          )}
          {compiledSql && (
            <div>
              <div className="text-muted-foreground mb-1">SQL:</div>
              <pre className="text-foreground whitespace-pre-wrap text-xs overflow-x-auto">
                {compiledSql}
              </pre>
            </div>
          )}
          {compilationErrors && compilationErrors.length > 0 && (
            <div>
              <div className="text-red-500 mb-1">Compilation errors:</div>
              <ul className="list-disc ml-3 text-red-400">
                {compilationErrors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          <div className="text-muted-foreground text-xs pt-1 border-t border-border">
            {llmLatencyMs != null && <span>LLM: {llmLatencyMs}ms</span>}
            {cacheStatus && <span className="ml-3">Cache: {cacheStatus}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── AnalysisActionBar ────────────────────────────────────────────
// One-click analysis actions that leverage the current message's data context.

function AnalysisActionBar({
  message,
  onFollowUpSelect,
}: {
  message: ChatMessage;
  onFollowUpSelect?: (question: string) => void;
}) {
  if (!onFollowUpSelect) return null;

  // Only show for responses with actual data
  const hasData = message.rows && message.rows.length > 0;
  const hasMetrics = message.plan?.metrics && message.plan.metrics.length > 0;
  if (!hasData && !hasMetrics) return null;

  const metricName = message.plan?.metrics?.[0]?.replace(/_/g, ' ') ?? 'this metric';
  const dateRange = message.plan?.dateRange;
  const period = dateRange ? `from ${dateRange.start} to ${dateRange.end}` : 'this week';

  const actions = [
    {
      label: 'Root Cause',
      icon: Search,
      prompt: `Why did ${metricName} change ${period}? Analyze the root causes.`,
    },
    {
      label: 'Forecast',
      icon: TrendingUp,
      prompt: `Forecast ${metricName} for the next 7 days based on recent trends.`,
    },
    {
      label: 'Correlations',
      icon: GitBranch,
      prompt: `What metrics are most correlated with ${metricName}?`,
    },
    {
      label: 'Deeper Analysis',
      icon: Lightbulb,
      prompt: `Give me a deeper multi-step analysis of ${metricName} ${period}. Look for patterns, anomalies, and actionable insights.`,
    },
  ];

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={() => onFollowUpSelect(action.prompt)}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-muted-foreground bg-muted/50 border border-border rounded-full hover:border-primary/50 hover:text-primary transition-colors"
        >
          <action.icon className="h-3 w-3" />
          {action.label}
        </button>
      ))}
    </div>
  );
}

// ── PinMetricButton ───────────────────────────────────────────────
// Inline button for each metric in a response's plan. Calls the
// pinned-metrics API directly — no hook needed (fire-and-forget).

function PinMetricButton({
  metricSlug,
  format,
}: {
  metricSlug: string;
  format?: 'currency' | 'number' | 'percent';
}) {
  const [state, setState] = useState<'idle' | 'pinning' | 'pinned' | 'already'>('idle');

  const handlePin = useCallback(async () => {
    if (state !== 'idle') return;
    setState('pinning');
    try {
      await apiFetch('/api/v1/semantic/pinned-metrics', {
        method: 'POST',
        body: JSON.stringify({
          metricSlug,
          displayName: metricSlug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          config: { format: format ?? 'number' },
        }),
      });
      setState('pinned');
    } catch (err) {
      // 409 = already pinned
      if (err instanceof Error && err.message.includes('already pinned')) {
        setState('already');
      } else {
        setState('idle');
      }
    }
  }, [metricSlug, format, state]);

  if (state === 'pinned' || state === 'already') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-emerald-500 bg-emerald-500/10 rounded-full">
        <Check className="h-3 w-3" />
        {state === 'already' ? 'Already pinned' : 'Pinned'}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handlePin}
      disabled={state === 'pinning'}
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-muted-foreground bg-muted/50 border border-border rounded-full hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50"
      title={`Pin "${metricSlug.replace(/_/g, ' ')}" to watchlist`}
    >
      <Pin className="h-3 w-3" />
      {state === 'pinning' ? 'Pinning...' : metricSlug.replace(/_/g, ' ')}
    </button>
  );
}

// ── PinMetricsBar ─────────────────────────────────────────────────
// Shows pin buttons for all metrics found in the message's query plan.

function PinMetricsBar({ message }: { message: ChatMessage }) {
  const metrics = message.plan?.metrics;
  if (!metrics || metrics.length === 0) return null;

  // Infer format from the chart config or default to number
  const format = message.chartConfig?.yFormat ?? 'number';

  return (
    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-muted-foreground mr-0.5">Pin to watchlist:</span>
      {metrics.map((slug) => (
        <PinMetricButton
          key={slug}
          metricSlug={slug}
          format={format}
        />
      ))}
    </div>
  );
}

// ── ThinkingIndicator ─────────────────────────────────────────────
// Shows pipeline stage progress while the AI is "thinking".

export function ThinkingIndicator({
  currentStatus,
  completedStages,
}: {
  currentStatus: string | null;
  completedStages: string[];
}) {
  if (!currentStatus && completedStages.length === 0) return null;

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] w-full">
        <div className="flex items-center gap-1.5 mb-1.5 text-primary">
          <Zap className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">AI Insights</span>
        </div>
        <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
          <div className="space-y-1.5">
            {completedStages.map((stage, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                <svg className="h-3.5 w-3.5 text-emerald-500 shrink-0" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{stage}</span>
              </div>
            ))}
            {currentStatus && (
              <div className="flex items-center gap-2 text-xs text-foreground font-medium">
                <svg className="h-3.5 w-3.5 text-primary shrink-0 animate-spin" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
                  <path d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span>{currentStatus}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ChatMessageBubble ─────────────────────────────────────────────

interface ChatMessageBubbleProps {
  message: ChatMessage;
  showDebug?: boolean;
  isStreaming?: boolean;
  onFollowUpSelect?: (question: string) => void;
}

export const ChatMessageBubble = memo(function ChatMessageBubble({ message, showDebug = false, isStreaming = false, onFollowUpSelect }: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm">
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] w-full">
        {/* Sparkle indicator + data quality badge */}
        <div className="flex items-center gap-1.5 mb-1.5 text-primary">
          <Zap className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">AI Insights</span>
          {message.dataQuality && (
            <DataQualityBadge
              grade={message.dataQuality.grade}
              score={message.dataQuality.score}
              factors={message.dataQuality.factors}
            />
          )}
        </div>

        {/* Error state */}
        {message.error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
            <span className="text-sm text-red-500">{message.content}</span>
          </div>
        )}

        {/* Normal response */}
        {!message.error && (
          <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
            {/* Clarification badge */}
            {message.isClarification && (
              <div className="mb-2 text-xs text-amber-500 bg-amber-500/10 px-2 py-1 rounded inline-block">
                Clarification needed
              </div>
            )}

            {/* Narrative */}
            <div className="prose prose-sm max-w-none text-card-foreground">
              {renderMarkdown(message.content)}
              {isStreaming && (
                <span className="inline-block w-2 h-4 ml-0.5 bg-primary/70 rounded-sm animate-pulse align-text-bottom" />
              )}
            </div>

            {/* Clarification option buttons — clickable guided responses */}
            {message.isClarification && message.clarificationOptions && message.clarificationOptions.length > 0 && onFollowUpSelect && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {message.clarificationOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onFollowUpSelect(option)}
                    className="text-left px-3 py-2.5 text-sm bg-surface border border-border rounded-xl hover:border-primary/50 hover:bg-accent transition-colors text-foreground"
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}

            {/* Inline chart (if chart config returned) */}
            {message.chartConfig && message.rows && message.rows.length > 0 && (
              <InlineChart
                config={message.chartConfig}
                data={message.rows}
                className="mt-2"
              />
            )}

            {/* Data table (if rows returned and chart type is not table) */}
            {message.rows && message.rows.length > 0 && message.chartConfig?.type !== 'table' && (
              <QueryResultTable rows={message.rows} rowCount={message.rowCount ?? message.rows.length} />
            )}

            {/* Query transparency — how this was calculated */}
            {message.compiledSql && (
              <QueryTransparencyPanel
                compiledSql={message.compiledSql}
                sqlExplanation={message.sqlExplanation}
                plan={message.plan}
                mode={message.mode}
                tablesAccessed={message.tablesAccessed}
              />
            )}

            {/* Data lineage */}
            {message.tablesAccessed && message.tablesAccessed.length > 0 && message.compiledSql && (
              <DataLineagePanel
                tablesAccessed={message.tablesAccessed}
                compiledSql={message.compiledSql!}
                mode={message.mode ?? 'metrics'}
                plan={message.plan ? {
                  metrics: message.plan.metrics,
                  dimensions: message.plan.dimensions,
                  filters: message.plan.filters as { field: string; operator: string; value: string }[] | undefined,
                  dateRange: message.plan.dateRange ?? undefined,
                } : undefined}
              />
            )}

            {/* Debug panel */}
            {showDebug && (
              <PlanDebugPanel
                plan={message.plan}
                compiledSql={message.compiledSql}
                compilationErrors={message.compilationErrors}
                llmConfidence={message.llmConfidence}
                llmLatencyMs={message.llmLatencyMs}
                cacheStatus={message.cacheStatus}
              />
            )}

            {/* Feedback widget — only for non-error assistant messages with an eval turn */}
            {message.evalTurnId && (
              <FeedbackWidget evalTurnId={message.evalTurnId} />
            )}

            {/* Pin to watchlist — show when the response has metrics */}
            {!message.isClarification && <PinMetricsBar message={message} />}
          </div>
        )}

        {/* Follow-up suggestion chips */}
        {!message.error && message.suggestedFollowUps && message.suggestedFollowUps.length > 0 && onFollowUpSelect && (
          <FollowUpChips
            suggestions={message.suggestedFollowUps}
            onSelect={onFollowUpSelect}
            className="mt-2 pl-1"
          />
        )}

        {/* Analysis action bar — one-click deeper analysis */}
        {!message.error && !message.isClarification && (
          <AnalysisActionBar message={message} onFollowUpSelect={onFollowUpSelect} />
        )}

        <div className="mt-1 text-xs text-muted-foreground pl-1">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
});
