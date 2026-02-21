'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { History, MessageSquare, ExternalLink, Download, Star } from 'lucide-react';
import { useSessionHistory, formatRelativeTime } from '@/hooks/use-session-history';
import type { SessionSummary } from '@/hooks/use-session-history';
import { apiFetch } from '@/lib/api-client';
import { exportSessionAsTxt } from '@/lib/export-chat';

// ── Types ──────────────────────────────────────────────────────────

interface SessionDetailTurn {
  id: string;
  turnNumber: number;
  userMessage: string;
  narrative: string | null;
  wasClarification: boolean;
  clarificationMessage: string | null;
  createdAt: string;
}

interface SessionDetailResponse {
  data: {
    session: { id: string; startedAt: string };
    turns: SessionDetailTurn[];
  };
}

// ── HistoryContent ─────────────────────────────────────────────────

export default function HistoryContent() {
  const router = useRouter();
  const { sessions, isLoading, isLoadingMore, error, hasMore, loadMore } = useSessionHistory({ limit: 20 });
  const [exportingId, setExportingId] = useState<string | null>(null);

  const handleOpen = (sessionId: string) => {
    router.push(`/insights?session=${sessionId}`);
  };

  const handleExport = async (session: SessionSummary) => {
    setExportingId(session.id);
    try {
      const res = await apiFetch<SessionDetailResponse>(
        `/api/v1/semantic/sessions/${session.id}`,
      );
      const title = session.firstMessage ?? 'AI Insights Conversation';
      exportSessionAsTxt(title, session.startedAt, res.data.turns);
    } catch {
      // Silently fail — user will notice the download didn't happen
    } finally {
      setExportingId(null);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const truncate = (text: string, max: number) =>
    text.length > max ? text.slice(0, max) + '\u2026' : text;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
          <History className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Chat History</h1>
          <p className="text-sm text-muted-foreground">Past AI Insights conversations</p>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && sessions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mb-4">
            <MessageSquare className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">No conversations yet</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Start asking questions in AI Insights and your conversation history will appear here.
          </p>
        </div>
      )}

      {/* Session list */}
      {!isLoading && sessions.length > 0 && (
        <div className="space-y-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="rounded-xl border border-border bg-card px-4 py-3"
            >
              <div className="flex items-start gap-3">
                <MessageSquare className="h-4 w-4 text-primary shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground line-clamp-2">
                    {session.firstMessage
                      ? truncate(session.firstMessage, 80)
                      : 'Untitled conversation'}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-xs text-muted-foreground">
                      {formatDate(session.startedAt)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(session.startedAt)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-foreground bg-muted px-2 py-0.5 rounded-full">
                      <MessageSquare className="h-3 w-3" />
                      {session.messageCount} {session.messageCount === 1 ? 'message' : 'messages'}
                    </span>
                    {session.avgUserRating != null && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-amber-600 dark:text-amber-400">
                        <Star className="h-3 w-3 fill-current" />
                        {session.avgUserRating.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleOpen(session.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary hover:bg-accent rounded-lg transition-colors"
                    title="Open conversation"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open
                  </button>
                  <button
                    onClick={() => handleExport(session)}
                    disabled={exportingId === session.id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent rounded-lg transition-colors disabled:opacity-50"
                    title="Export as .txt"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center pt-4">
              <button
                onClick={loadMore}
                disabled={isLoadingMore}
                className="px-4 py-2 text-sm font-medium text-primary hover:bg-accent rounded-lg transition-colors disabled:opacity-50"
              >
                {isLoadingMore ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
