'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, MessageSquare, Brain, FileCode, Database, Table2, Clock, ArrowRight } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

interface DataLineagePanelProps {
  tablesAccessed: string[];
  compiledSql: string;
  mode: string;
  plan?: {
    metrics?: string[];
    dimensions?: string[];
    filters?: { field: string; operator: string; value: string }[];
    dateRange?: { start: string; end: string };
  };
  executionTimeMs?: number;
  className?: string;
}

// ── Constants ──────────────────────────────────────────────────────

const SQL_KEYWORDS = new Set([
  'select', 'from', 'where', 'and', 'or', 'not', 'in', 'between',
  'like', 'is', 'null', 'as', 'on', 'join', 'left', 'right', 'inner',
  'outer', 'cross', 'group', 'by', 'order', 'having', 'limit', 'offset',
  'case', 'when', 'then', 'else', 'end', 'cast', 'coalesce', 'count',
  'sum', 'avg', 'min', 'max', 'distinct', 'asc', 'desc', 'true', 'false',
  'with', 'union', 'all', 'exists', 'insert', 'update', 'delete', 'set',
  'values', 'into', 'create', 'table', 'index', 'primary', 'key',
  'references', 'foreign', 'constraint', 'default', 'not', 'check',
]);

// ── Helpers ────────────────────────────────────────────────────────

function highlightSql(sql: string): React.ReactNode[] {
  // Simple token-based highlighting
  const lines = sql.split('\n');
  return lines.map((line, lineIdx) => {
    const tokens = line.split(/(\s+|,|\(|\)|;)/);
    return (
      <div key={lineIdx} className="leading-relaxed">
        {tokens.map((token, tokIdx) => {
          if (SQL_KEYWORDS.has(token.toLowerCase())) {
            return (
              <span key={tokIdx} className="text-blue-500 font-semibold">
                {token}
              </span>
            );
          }
          // String literals
          if (token.startsWith("'") || token.startsWith('"')) {
            return (
              <span key={tokIdx} className="text-amber-500">
                {token}
              </span>
            );
          }
          // Numbers
          if (/^\d+(\.\d+)?$/.test(token)) {
            return (
              <span key={tokIdx} className="text-emerald-500">
                {token}
              </span>
            );
          }
          return <span key={tokIdx}>{token}</span>;
        })}
      </div>
    );
  });
}

function formatMs(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ── Component ──────────────────────────────────────────────────────

export function DataLineagePanel({
  tablesAccessed,
  compiledSql,
  mode,
  plan,
  executionTimeMs,
  className,
}: DataLineagePanelProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-lg border border-border bg-surface ${className ?? ''}`}>
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Database className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Data Lineage</span>
          {executionTimeMs !== undefined && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[10px] font-mono bg-muted text-muted-foreground">
              <Clock className="h-2.5 w-2.5" />
              {formatMs(executionTimeMs)}
            </span>
          )}
          <span className="px-1.5 py-0 rounded text-[10px] font-medium bg-muted text-muted-foreground">
            {mode}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-3">
          {/* Pipeline flow */}
          <div className="flex items-stretch gap-0 overflow-x-auto pb-1">
            <FlowStep
              icon={MessageSquare}
              label="User Question"
              sublabel="Natural language"
              color="text-blue-500"
            />
            <FlowArrow />
            <FlowStep
              icon={Brain}
              label="Intent Resolution"
              sublabel={plan ? `${plan.metrics?.length ?? 0} metrics, ${plan.dimensions?.length ?? 0} dims` : 'LLM'}
              color="text-violet-500"
            />
            <FlowArrow />
            <FlowStep
              icon={FileCode}
              label="Query Plan"
              sublabel={plan?.filters?.length ? `${plan.filters.length} filters` : 'Compiled'}
              color="text-amber-500"
            />
            <FlowArrow />
            <FlowStep
              icon={Database}
              label="SQL"
              sublabel={`${tablesAccessed.length} table${tablesAccessed.length !== 1 ? 's' : ''}`}
              color="text-emerald-500"
            />
            <FlowArrow />
            <FlowStep
              icon={Table2}
              label="Results"
              sublabel={executionTimeMs !== undefined ? formatMs(executionTimeMs) : 'Returned'}
              color="text-red-500"
            />
          </div>

          {/* Plan details */}
          {plan && (
            <div className="rounded-md border border-border p-3 space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Query Plan
              </p>

              {plan.metrics && plan.metrics.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-muted-foreground w-16 shrink-0">Metrics</span>
                  <div className="flex flex-wrap gap-1">
                    {plan.metrics.map((m) => (
                      <span key={m} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/20 text-emerald-500">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {plan.dimensions && plan.dimensions.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-muted-foreground w-16 shrink-0">Dims</span>
                  <div className="flex flex-wrap gap-1">
                    {plan.dimensions.map((d) => (
                      <span key={d} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-500">
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {plan.filters && plan.filters.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-muted-foreground w-16 shrink-0">Filters</span>
                  <div className="space-y-0.5">
                    {plan.filters.map((f, idx) => (
                      <span key={idx} className="block text-[10px] text-foreground font-mono">
                        {f.field} {f.operator} {f.value}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {plan.dateRange && (
                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-muted-foreground w-16 shrink-0">Dates</span>
                  <span className="text-[10px] text-foreground font-mono">
                    {plan.dateRange.start} to {plan.dateRange.end}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Tables accessed */}
          {tablesAccessed.length > 0 && (
            <div className="rounded-md border border-border p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Tables Accessed
              </p>
              <div className="flex flex-wrap gap-1.5">
                {tablesAccessed.map((table) => (
                  <span
                    key={table}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-muted text-foreground"
                  >
                    <Table2 className="h-2.5 w-2.5 text-muted-foreground" />
                    {table}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Compiled SQL */}
          {compiledSql && (
            <div className="rounded-md border border-border overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b border-border">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Compiled SQL
                </p>
              </div>
              <pre className="px-3 py-2 text-[10px] font-mono text-foreground overflow-x-auto max-h-48">
                {highlightSql(compiledSql)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Flow Step ──────────────────────────────────────────────────────

function FlowStep({
  icon: Icon,
  label,
  sublabel,
  color,
}: {
  icon: typeof MessageSquare;
  label: string;
  sublabel: string;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-2 py-1.5 min-w-[80px]">
      <div className={`p-1.5 rounded-md bg-muted ${color}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <p className="text-[10px] font-medium text-foreground text-center leading-tight">{label}</p>
      <p className="text-[9px] text-muted-foreground text-center leading-tight">{sublabel}</p>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex items-center justify-center px-0.5 pt-1">
      <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
    </div>
  );
}
