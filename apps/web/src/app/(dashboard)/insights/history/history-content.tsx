'use client';

import { useState, useEffect } from 'react';
import { History, MessageSquare, ThumbsUp, ThumbsDown, Star } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { RatingStars } from '@/components/insights/RatingStars';

// ── Types ──────────────────────────────────────────────────────────

interface EvalTurnSummary {
  id: string;
  userMessage: string;
  turnNumber: number;
  sessionId: string;
  wasClarification: boolean;
  rowCount: number | null;
  executionError: string | null;
  cacheStatus: string | null;
  userRating: number | null;
  userThumbsUp: boolean | null;
  qualityScore: number | null;
  createdAt: string;
}

interface EvalFeedResponse {
  data: {
    turns: EvalTurnSummary[];
    cursor: string | null;
    hasMore: boolean;
  };
}

// ── HistoryContent ─────────────────────────────────────────────────

export default function HistoryContent() {
  const [turns, setTurns] = useState<EvalTurnSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    apiFetch<EvalFeedResponse>('/api/v1/semantic/eval/feed?limit=25')
      .then((res) => setTurns(res.data.turns))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load history'))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center">
          <History className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Query History</h1>
          <p className="text-sm text-gray-500">Past AI Insights queries and their quality scores</p>
        </div>
      </div>

      {/* Content */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {!isLoading && !error && turns.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4">
            <MessageSquare className="h-7 w-7 text-gray-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">No queries yet</h3>
          <p className="text-sm text-gray-500 max-w-xs">
            Start asking questions in AI Insights Chat and your query history will appear here.
          </p>
        </div>
      )}

      {!isLoading && turns.length > 0 && (
        <div className="space-y-2">
          {turns.map((turn) => (
            <div
              key={turn.id}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3"
            >
              <div className="flex items-start gap-3">
                <MessageSquare className="h-4 w-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-2">{turn.userMessage}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-xs text-gray-400">
                      {new Date(turn.createdAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {turn.wasClarification && (
                      <span className="text-xs text-amber-600 dark:text-amber-400">Clarification</span>
                    )}
                    {turn.executionError && (
                      <span className="text-xs text-red-500">Error</span>
                    )}
                    {turn.cacheStatus === 'HIT' && (
                      <span className="text-xs text-green-600 dark:text-green-400">Cached</span>
                    )}
                    {turn.rowCount != null && (
                      <span className="text-xs text-gray-400">{turn.rowCount} rows</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {turn.userThumbsUp === true && (
                    <ThumbsUp className="h-3.5 w-3.5 text-green-600 fill-current" />
                  )}
                  {turn.userThumbsUp === false && (
                    <ThumbsDown className="h-3.5 w-3.5 text-red-500 fill-current" />
                  )}
                  {turn.userRating != null && (
                    <RatingStars value={turn.userRating} readOnly size="sm" />
                  )}
                  {turn.qualityScore != null && (
                    <div className="flex items-center gap-0.5">
                      <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                      <span className="text-xs text-gray-500">{Math.round(turn.qualityScore * 100)}%</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
