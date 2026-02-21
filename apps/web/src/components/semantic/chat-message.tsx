'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Database, Zap, AlertCircle } from 'lucide-react';
import type { ChatMessage, QueryPlan } from '@/hooks/use-semantic-chat';
import { FeedbackWidget } from '@/components/insights/FeedbackWidget';

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

function QueryResultTable({ rows, rowCount }: { rows: Record<string, unknown>[]; rowCount: number }) {
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? rows : rows.slice(0, 5);

  if (rows.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic mt-2">No data rows returned.</div>
    );
  }

  const columns = Object.keys(rows[0]!);

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
            {visibleRows.map((row, i) => (
              <tr key={i} className="hover:bg-accent">
                {columns.map((col) => (
                  <td key={col} className="px-3 py-2 text-foreground whitespace-nowrap">
                    {String(row[col] ?? '')}
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

// ── ChatMessageBubble ─────────────────────────────────────────────

interface ChatMessageBubbleProps {
  message: ChatMessage;
  showDebug?: boolean;
}

export function ChatMessageBubble({ message, showDebug = false }: ChatMessageBubbleProps) {
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
        {/* Sparkle indicator */}
        <div className="flex items-center gap-1.5 mb-1.5 text-primary">
          <Zap className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">AI Insights</span>
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
            </div>

            {/* Data table (if rows returned) */}
            {message.rows && message.rows.length > 0 && (
              <QueryResultTable rows={message.rows} rowCount={message.rowCount ?? message.rows.length} />
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
          </div>
        )}

        <div className="mt-1 text-xs text-muted-foreground pl-1">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
