'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  TrendingUp,
  AlertTriangle,
  Star,
  Users,
  User,
  Bot,
  ChevronDown,
  ChevronRight,
  Database,
  Code,
  FileText,
  BarChart3,
  Copy,
  Check,
} from 'lucide-react';
import { useConversations, useConversation } from '@/hooks/use-eval-training';
import type { ConversationSummary, ConversationEvalTurn } from '@/types/eval';

function getQualityColor(score: number | null): string {
  if (score == null) return 'text-slate-500';
  if (score >= 0.7) return 'text-green-400';
  if (score >= 0.4) return 'text-yellow-400';
  return 'text-red-400';
}

function getQualityBgColor(score: number | null): string {
  if (score == null) return 'bg-slate-600/20';
  if (score >= 0.7) return 'bg-green-500/20';
  if (score >= 0.4) return 'bg-yellow-500/20';
  return 'bg-red-500/20';
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Copy Button ──────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
      title="Copy"
    >
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
    </button>
  );
}

// ── Quality Dot ──────────────────────────────────────────────────

function QualityDot({ score, size = 8 }: { score: number | null; size?: number }) {
  const color = score == null ? '#64748b' : score >= 0.7 ? '#4ade80' : score >= 0.4 ? '#fbbf24' : '#f87171';
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={size / 2} fill={color} />
    </svg>
  );
}

// ── Collapsible Section ──────────────────────────────────────────

function CollapsibleSection({
  title,
  icon,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-700/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-slate-300 hover:bg-slate-800/30 transition-colors"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {icon}
        <span className="font-medium">{title}</span>
        {badge && (
          <span className="ml-auto text-xs bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">
            {badge}
          </span>
        )}
      </button>
      {open && <div className="px-3 pb-3 pt-1">{children}</div>}
    </div>
  );
}

// ── Conversation Turn (Full Context) ─────────────────────────────

function ConversationTurnFull({ turn }: { turn: ConversationEvalTurn }) {
  const confidence = turn.llmConfidence ? Number(turn.llmConfidence) : null;

  return (
    <div className="space-y-3">
      {/* ── User Message ── */}
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-indigo-500/20 flex items-center justify-center">
          <User size={14} className="text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-indigo-400">User</span>
            <span className="text-xs text-slate-600">·</span>
            <span className="text-xs text-slate-500">Turn #{turn.turnNumber}</span>
            <span className="text-xs text-slate-600">·</span>
            <span className="text-xs text-slate-500">{formatTimestamp(turn.createdAt)}</span>
          </div>
          <p className="text-sm text-white">{turn.userMessage}</p>
        </div>
      </div>

      {/* ── AI Response ── */}
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <Bot size={14} className="text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-emerald-400">AI Response</span>
            {/* Status pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {confidence !== null && (
                <span className={`text-xs px-1.5 py-0.5 rounded ${confidence >= 0.7 ? 'bg-green-500/10 text-green-400' : confidence >= 0.4 ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400'}`}>
                  {Math.round(confidence * 100)}% conf
                </span>
              )}
              {turn.executionTimeMs !== null && (
                <span className="text-xs bg-slate-700/50 text-slate-400 px-1.5 py-0.5 rounded">
                  {turn.executionTimeMs}ms
                </span>
              )}
              {turn.cacheStatus && (
                <span className={`text-xs px-1.5 py-0.5 rounded ${turn.cacheStatus === 'HIT' ? 'bg-sky-500/10 text-sky-400' : 'bg-slate-700/50 text-slate-400'}`}>
                  Cache {turn.cacheStatus}
                </span>
              )}
              {turn.rowCount !== null && (
                <span className="text-xs bg-slate-700/50 text-slate-400 px-1.5 py-0.5 rounded">
                  {turn.rowCount} rows
                </span>
              )}
              {turn.adminVerdict && (
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  turn.adminVerdict === 'correct' ? 'bg-green-500/10 text-green-400' :
                  turn.adminVerdict === 'partial' ? 'bg-yellow-500/10 text-yellow-400' :
                  turn.adminVerdict === 'incorrect' ? 'bg-red-500/10 text-red-400' :
                  'bg-slate-700/50 text-slate-400'
                }`}>
                  {turn.adminVerdict}
                </span>
              )}
            </div>
          </div>

          {/* Clarification message */}
          {turn.wasClarification && turn.clarificationMessage && (
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-xs text-yellow-400 font-medium mb-1 flex items-center gap-1">
                <AlertTriangle size={11} />
                Clarification Requested
              </p>
              <p className="text-sm text-slate-300">{turn.clarificationMessage}</p>
            </div>
          )}

          {/* Narrative / Analysis Response */}
          {turn.narrative && (
            <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-400 font-medium flex items-center gap-1">
                  <FileText size={11} />
                  Analysis
                </p>
                <CopyButton text={turn.narrative} />
              </div>
              <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto prose-sm">
                {turn.narrative}
              </div>
              {turn.responseSections && turn.responseSections.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-slate-700/50">
                  {turn.responseSections.map((section) => (
                    <span key={section} className="text-xs bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded">
                      {section}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Execution error */}
          {turn.executionError && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
              <p className="text-xs text-red-400 font-medium mb-1">Execution Error</p>
              <p className="text-xs text-red-300 font-mono">{turn.executionError}</p>
            </div>
          )}

          {/* Collapsible sections for technical detail */}
          <div className="space-y-1.5">
            {/* SQL */}
            {turn.compiledSql && (
              <CollapsibleSection title="Generated SQL" icon={<Code size={11} />}>
                <div className="relative">
                  <pre className="text-xs text-emerald-300 bg-slate-950 rounded p-2 overflow-auto max-h-40 font-mono">
                    {turn.compiledSql}
                  </pre>
                  <div className="absolute top-1 right-1">
                    <CopyButton text={turn.compiledSql} />
                  </div>
                </div>
                {turn.compilationErrors && turn.compilationErrors.length > 0 && (
                  <div className="mt-1.5">
                    {turn.compilationErrors.map((err, i) => (
                      <p key={i} className="text-xs text-red-400">{err}</p>
                    ))}
                  </div>
                )}
              </CollapsibleSection>
            )}

            {/* Result sample */}
            {turn.resultSample && turn.resultSample.length > 0 && (
              <CollapsibleSection
                title="Data Returned"
                icon={<Database size={11} />}
                badge={`${turn.rowCount ?? turn.resultSample.length} rows`}
              >
                <div className="overflow-auto max-h-48">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="text-slate-500 border-b border-slate-700/50">
                        {Object.keys(turn.resultSample[0]!).map((col) => (
                          <th key={col} className="text-left pr-4 pb-1 font-medium whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {turn.resultSample.slice(0, 5).map((row, i) => (
                        <tr key={i} className="text-slate-300 border-b border-slate-800/50 last:border-0">
                          {Object.values(row).map((val, j) => (
                            <td key={j} className="pr-4 py-0.5 whitespace-nowrap">{String(val ?? 'null')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CollapsibleSection>
            )}

            {/* LLM Plan */}
            {turn.llmPlan && (
              <CollapsibleSection title="Query Plan" icon={<BarChart3 size={11} />}>
                <pre className="text-xs text-slate-300 bg-slate-950 rounded p-2 overflow-auto max-h-40 font-mono">
                  {JSON.stringify(turn.llmPlan, null, 2)}
                </pre>
              </CollapsibleSection>
            )}

            {/* Metadata row */}
            <div className="flex items-center gap-3 text-xs text-slate-500 pt-1 flex-wrap">
              <span>{turn.llmProvider}/{turn.llmModel}</span>
              <span>{turn.llmTokensInput}↑ {turn.llmTokensOutput}↓ tokens</span>
              {turn.llmLatencyMs > 0 && <span>{turn.llmLatencyMs}ms LLM</span>}
              {turn.narrativeLensId && <span>Lens: {turn.narrativeLensId}</span>}
              {turn.tablesAccessed && turn.tablesAccessed.length > 0 && (
                <span>Tables: {turn.tablesAccessed.join(', ')}</span>
              )}
            </div>
          </div>

          {/* Quality flags */}
          {turn.qualityFlags && turn.qualityFlags.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {turn.qualityFlags.map((flag) => (
                <span key={flag} className="bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded text-xs">
                  {flag}
                </span>
              ))}
            </div>
          )}

          {/* User feedback inline */}
          {(turn.userRating !== null || turn.userFeedbackText) && (
            <div className="flex items-center gap-2 text-xs">
              {turn.userRating !== null && (
                <span className="text-amber-400">{'★'.repeat(Math.round(turn.userRating))}{'☆'.repeat(5 - Math.round(turn.userRating))} {turn.userRating}/5</span>
              )}
              {turn.userFeedbackText && (
                <span className="text-slate-400 italic">"{turn.userFeedbackText}"</span>
              )}
              {turn.userFeedbackTags && turn.userFeedbackTags.length > 0 && (
                <div className="flex gap-1">
                  {turn.userFeedbackTags.map((tag) => (
                    <span key={tag} className="bg-slate-700 text-slate-400 px-1 py-0.5 rounded">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Divider between turns */}
      <div className="border-b border-slate-700/30 ml-10" />
    </div>
  );
}

// ── Expanded Conversation Detail ─────────────────────────────────

function ConversationExpanded({ sessionId }: { sessionId: string }) {
  const { data, isLoading, error, load } = useConversation(sessionId);

  useEffect(() => {
    load();
  }, [load]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Quality trend */}
      {data.qualityTrend.length > 0 && (
        <div className="p-3 bg-slate-900/50 rounded-lg">
          <p className="text-xs text-slate-400 mb-2 flex items-center gap-1">
            <TrendingUp size={11} />
            Quality Trend
          </p>
          <div className="flex items-end gap-1 h-8">
            {data.qualityTrend.map((point) => (
              <div key={point.turnNumber} className="flex flex-col items-center gap-0.5 flex-1">
                <QualityDot score={point.qualityScore} size={8} />
                <span className="text-xs text-slate-600">T{point.turnNumber}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full conversation */}
      <div>
        <p className="text-xs text-slate-400 mb-3 flex items-center gap-1">
          <MessageSquare size={11} />
          Full Conversation ({data.turns.length} turns)
        </p>
        <div className="space-y-4">
          {data.turns.map((turn) => (
            <ConversationTurnFull key={turn.id} turn={turn} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Conversation Card ────────────────────────────────────────────

function ConversationCard({ conversation }: { conversation: ConversationSummary }) {
  const [expanded, setExpanded] = useState(false);

  const qualityScore = conversation.avgQualityScore;

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left p-5 hover:bg-slate-700/30 transition-colors"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {expanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
              <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded">
                {conversation.userRole}
              </span>
              <span className="text-xs text-slate-500">
                {conversation.messageCount} messages
              </span>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              {/* Quality score */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400">Quality:</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${getQualityBgColor(qualityScore)} ${getQualityColor(qualityScore)}`}>
                  {qualityScore != null ? `${Math.round(qualityScore * 100)}%` : '--'}
                </span>
              </div>

              {/* User rating */}
              <div className="flex items-center gap-1.5">
                <Star size={11} className="text-amber-400" />
                <span className="text-xs text-amber-400">
                  {conversation.avgUserRating != null ? conversation.avgUserRating.toFixed(1) : '--'}
                </span>
              </div>

              {/* Clarification count */}
              {conversation.clarificationCount > 0 && (
                <span className="text-xs text-yellow-400 flex items-center gap-1">
                  <AlertTriangle size={10} />
                  {conversation.clarificationCount} clarification{conversation.clarificationCount !== 1 ? 's' : ''}
                </span>
              )}

              {/* Error count */}
              {conversation.errorCount > 0 && (
                <span className="text-xs text-red-400">
                  {conversation.errorCount} error{conversation.errorCount !== 1 ? 's' : ''}
                </span>
              )}

              {/* Cost */}
              {conversation.totalCostUsd != null && (
                <span className="text-xs text-slate-400">
                  ${conversation.totalCostUsd.toFixed(4)}
                </span>
              )}
            </div>
          </div>

          <div className="text-right shrink-0">
            <p className="text-xs text-slate-500">{formatTimestamp(conversation.startedAt)}</p>
            {conversation.endedAt && (
              <p className="text-xs text-slate-600 mt-0.5">
                → {formatTimestamp(conversation.endedAt)}
              </p>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-700 pt-4">
          <ConversationExpanded sessionId={conversation.sessionId} />
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────

export default function ConversationsPage() {
  const { data, isLoading, error, load } = useConversations();
  const [sortBy, setSortBy] = useState('newest');
  const [allConversations, setAllConversations] = useState<ConversationSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const fetchPage = useCallback(async (nextCursor?: string) => {
    const params: Record<string, string> = { sortBy };
    if (nextCursor) params.cursor = nextCursor;
    await load(params);
  }, [load, sortBy]);

  useEffect(() => {
    setAllConversations([]);
    setCursor(null);
    fetchPage();
  }, [sortBy, fetchPage]);

  useEffect(() => {
    if (!data) return;
    setAllConversations((prev) => {
      const existingIds = new Set(prev.map((c) => c.sessionId));
      const newOnes = data.conversations.filter((c) => !existingIds.has(c.sessionId));
      return [...prev, ...newOnes];
    });
    setCursor(data.cursor);
    setHasMore(data.hasMore);
  }, [data]);

  // Summary stats
  const totalConversations = allConversations.length;
  const avgMessages = totalConversations > 0
    ? allConversations.reduce((sum, c) => sum + c.messageCount, 0) / totalConversations
    : 0;
  const avgQuality = totalConversations > 0
    ? allConversations.filter((c) => c.avgQualityScore != null).reduce((sum, c) => sum + (c.avgQualityScore ?? 0), 0) /
      Math.max(allConversations.filter((c) => c.avgQualityScore != null).length, 1)
    : null;
  const clarificationRate = totalConversations > 0
    ? (allConversations.filter((c) => c.clarificationCount > 0).length / totalConversations) * 100
    : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-600/20 flex items-center justify-center">
            <MessageSquare size={18} className="text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Conversation Analysis</h1>
            <p className="text-sm text-slate-400 mt-0.5">Full conversation context — questions, responses, SQL, and data</p>
          </div>
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="newest">Newest first</option>
          <option value="lowest_quality">Lowest quality</option>
          <option value="most_messages">Most messages</option>
          <option value="most_errors">Most errors</option>
        </select>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <Users size={12} className="text-slate-400" />
            <p className="text-xs text-slate-400">Total Conversations</p>
          </div>
          <p className="text-lg font-bold text-white">{totalConversations}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare size={12} className="text-slate-400" />
            <p className="text-xs text-slate-400">Avg Messages</p>
          </div>
          <p className="text-lg font-bold text-white">{avgMessages.toFixed(1)}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={12} className="text-slate-400" />
            <p className="text-xs text-slate-400">Avg Quality</p>
          </div>
          <p className={`text-lg font-bold ${getQualityColor(avgQuality)}`}>
            {avgQuality != null ? `${Math.round(avgQuality * 100)}%` : '--'}
          </p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={12} className="text-slate-400" />
            <p className="text-xs text-slate-400">Clarification Rate</p>
          </div>
          <p className="text-lg font-bold text-yellow-400">{clarificationRate.toFixed(1)}%</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && allConversations.length === 0 && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && allConversations.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <MessageSquare size={24} className="mx-auto mb-3 text-slate-600" />
          <p>No conversations found. Conversations appear after users interact with AI Insights.</p>
        </div>
      )}

      <div className="space-y-3">
        {allConversations.map((conv) => (
          <ConversationCard key={conv.sessionId} conversation={conv} />
        ))}

        {isLoading && allConversations.length > 0 && (
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
