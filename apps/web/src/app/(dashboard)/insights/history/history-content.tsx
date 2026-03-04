'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { History, MessageSquare, ExternalLink, Star, Eye, EyeOff } from 'lucide-react';
import { useSessionHistory, formatRelativeTime } from '@/hooks/use-session-history';
import type { SessionSummary } from '@/hooks/use-session-history';
import type { LoadedTurn } from '@/hooks/use-semantic-chat';
import { apiFetch } from '@/lib/api-client';
import { ConversationToolbar } from '@/components/insights/ConversationToolbar';
import { SessionPreview } from '@/components/insights/SessionPreview';
import type { ExportableTurn } from '@/lib/export-chat';

// ── Helpers ──────────────────────────────────────────────────────

function loadedTurnsToExportable(turns: LoadedTurn[]): ExportableTurn[] {
  return turns.map((t) => ({
    userMessage: t.userMessage,
    narrative: t.narrative,
    wasClarification: t.wasClarification,
    clarificationMessage: t.clarificationMessage,
    compiledSql: t.compiledSql,
    resultSample: t.resultSample,
    rowCount: t.rowCount,
    createdAt: t.createdAt,
  }));
}

// ── HistoryContent ─────────────────────────────────────────────────

export default function HistoryContent({ embedded }: { embedded?: boolean }) {
  const router = useRouter();
  const { sessions, isLoading, isLoadingMore, error, hasMore, loadMore } = useSessionHistory({ limit: 20 });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewCache, setPreviewCache] = useState<Record<string, LoadedTurn[]>>({});
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);

  const handleOpen = (sessionId: string) => {
    router.push(`/insights?session=${sessionId}`);
  };

  const handleTogglePreview = useCallback(async (session: SessionSummary) => {
    // Collapse if already expanded
    if (expandedId === session.id) {
      setExpandedId(null);
      return;
    }

    // If already cached, just expand
    if (previewCache[session.id]) {
      setExpandedId(session.id);
      return;
    }

    // Fetch turns
    setLoadingPreviewId(session.id);
    try {
      const res = await apiFetch<{
        data: {
          session: { id: string; startedAt: string };
          turns: LoadedTurn[];
        };
      }>(`/api/v1/semantic/sessions/${session.id}`);
      setPreviewCache((prev) => ({ ...prev, [session.id]: res.data.turns }));
      setExpandedId(session.id);
    } catch {
      // Silently fail
    } finally {
      setLoadingPreviewId(null);
    }
  }, [expandedId, previewCache]);

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
    <div className={embedded ? '' : 'max-w-4xl mx-auto'}>
      {!embedded && (
        <>
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
        </>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
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
          {sessions.map((session) => {
            const isExpanded = expandedId === session.id;
            const cachedTurns = previewCache[session.id];
            const isLoadingThis = loadingPreviewId === session.id;

            return (
              <div
                key={session.id}
                className="rounded-xl border border-border bg-card overflow-hidden"
              >
                <div className="px-4 py-3">
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
                          <span className="inline-flex items-center gap-0.5 text-xs text-amber-500">
                            <Star className="h-3 w-3 fill-current" />
                            {session.avgUserRating.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Preview toggle */}
                      <button
                        onClick={() => handleTogglePreview(session)}
                        disabled={isLoadingThis}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent rounded-lg transition-colors disabled:opacity-50"
                        title={isExpanded ? 'Hide preview' : 'Preview conversation'}
                      >
                        {isLoadingThis ? (
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-primary" />
                        ) : isExpanded ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                        {isExpanded ? 'Hide' : 'Preview'}
                      </button>

                      {/* Open */}
                      <button
                        onClick={() => handleOpen(session.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary hover:bg-accent rounded-lg transition-colors"
                        title="Open conversation"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open
                      </button>

                      {/* Export/Print/Copy toolbar */}
                      {cachedTurns && (
                        <ConversationToolbar
                          title={session.firstMessage ?? 'AI Insights Conversation'}
                          startedAt={session.startedAt}
                          turns={loadedTurnsToExportable(cachedTurns)}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Inline preview */}
                {isExpanded && cachedTurns && (
                  <div className="border-t border-border px-4 bg-background/50">
                    <SessionPreview turns={cachedTurns} />
                  </div>
                )}
              </div>
            );
          })}

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
