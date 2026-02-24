'use client';

import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, TrendingUp, AlertTriangle, Star, Users } from 'lucide-react';
import { useConversations, useConversation } from '@/hooks/use-eval-training';
import type { ConversationSummary, EvalTurnSummary } from '@/types/eval';

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

// ── Quality Dot ──────────────────────────────────────────────────

function QualityDot({ score, size = 8 }: { score: number | null; size?: number }) {
  const color = score == null ? '#64748b' : score >= 0.7 ? '#4ade80' : score >= 0.4 ? '#fbbf24' : '#f87171';
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={size / 2} fill={color} />
    </svg>
  );
}

// ── Conversation Turn ────────────────────────────────────────────

function ConversationTurn({ turn }: { turn: EvalTurnSummary }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-700/50 last:border-0">
      <div className="shrink-0 mt-0.5">
        <QualityDot score={turn.qualityScore != null ? parseFloat(turn.qualityScore) : null} size={10} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono text-slate-500">#{turn.turnNumber}</span>
          <span className="text-sm text-white line-clamp-1">{turn.userMessage}</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {turn.qualityScore != null && (
            <span className={getQualityColor(parseFloat(turn.qualityScore))}>
              Quality: {Math.round(parseFloat(turn.qualityScore) * 100)}%
            </span>
          )}
          {turn.userRating != null && (
            <span className="text-amber-400">{turn.userRating.toFixed(1)}\u2605</span>
          )}
          {turn.wasClarification && (
            <span className="text-yellow-400 flex items-center gap-1">
              <AlertTriangle size={10} />
              Clarification
            </span>
          )}
          {turn.executionError && (
            <span className="text-red-400">Error</span>
          )}
          {turn.qualityFlags && turn.qualityFlags.length > 0 && (
            <div className="flex gap-1">
              {turn.qualityFlags.map((flag) => (
                <span key={flag} className="bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded text-xs">
                  {flag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
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

      {/* Turn timeline */}
      <div>
        <p className="text-xs text-slate-400 mb-2">Conversation Timeline</p>
        <div className="bg-slate-900/50 rounded-lg px-4">
          {data.turns.map((turn) => (
            <ConversationTurn key={turn.id} turn={turn} />
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
                \u2192 {formatTimestamp(conversation.endedAt)}
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
            <p className="text-sm text-slate-400 mt-0.5">Analyze multi-turn conversations for quality patterns</p>
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

      {/* List */}
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
