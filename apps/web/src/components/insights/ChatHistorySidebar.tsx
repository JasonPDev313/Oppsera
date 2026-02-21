'use client';

import { useRef, useEffect } from 'react';
import { MessageSquare, Plus, X, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useSessionHistory, formatRelativeTime } from '@/hooks/use-session-history';
import type { SessionSummary } from '@/hooks/use-session-history';

// ── Props ──────────────────────────────────────────────────────────

interface ChatHistorySidebarProps {
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  onClose?: () => void;
  refreshKey?: number;
}

// ── Component ──────────────────────────────────────────────────────

export function ChatHistorySidebar({
  activeSessionId,
  onSelectSession,
  onNewChat,
  onClose,
  refreshKey,
}: ChatHistorySidebarProps) {
  const { sessions, isLoading, isLoadingMore, hasMore, loadMore, refresh } = useSessionHistory({ limit: 20 });

  // Refresh when parent signals (after sending a message)
  // The refreshKey prop changes → trigger a refresh
  const lastRefreshKey = useRefreshOnChange(refreshKey, refresh);

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold text-foreground">Chat History</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={onNewChat}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-primary hover:bg-accent rounded-md transition-colors"
            title="New conversation"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-muted-foreground hover:text-foreground rounded-md transition-colors"
              title="Close history panel"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
          </div>
        )}

        {!isLoading && sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <MessageSquare className="h-6 w-6 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">No conversations yet</p>
          </div>
        )}

        {!isLoading && sessions.length > 0 && (
          <div className="py-1">
            {sessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={session.id === activeSessionId}
                onSelect={onSelectSession}
              />
            ))}

            {hasMore && (
              <div className="px-3 py-2">
                <button
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="w-full text-xs text-primary hover:text-primary/80 py-1.5 disabled:opacity-50"
                >
                  {isLoadingMore ? 'Loading...' : 'Load more'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-border px-3 py-2">
        <Link
          href="/insights/history"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          View all history
        </Link>
      </div>
    </div>
  );
}

// ── Session item ──────────────────────────────────────────────────

function SessionItem({
  session,
  isActive,
  onSelect,
}: {
  session: SessionSummary;
  isActive: boolean;
  onSelect: (id: string) => void;
}) {
  const title = session.firstMessage
    ? session.firstMessage.length > 60
      ? session.firstMessage.slice(0, 60) + '\u2026'
      : session.firstMessage
    : 'Untitled conversation';

  return (
    <button
      onClick={() => onSelect(session.id)}
      className={`w-full text-left px-3 py-2.5 transition-colors ${
        isActive
          ? 'border-l-2 border-primary bg-primary/10 pl-2.5'
          : 'border-l-2 border-transparent hover:bg-accent pl-2.5'
      }`}
    >
      <p className={`text-sm leading-snug line-clamp-2 ${
        isActive
          ? 'text-primary font-medium'
          : 'text-foreground'
      }`}>
        {title}
      </p>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-[11px] text-muted-foreground">
          {formatRelativeTime(session.startedAt)}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {session.messageCount} {session.messageCount === 1 ? 'msg' : 'msgs'}
        </span>
      </div>
    </button>
  );
}

// ── Refresh on prop change helper ─────────────────────────────────

function useRefreshOnChange(key: number | undefined, refresh: () => void) {
  const prevKey = useRef(key);

  useEffect(() => {
    if (key !== undefined && key !== prevKey.current) {
      prevKey.current = key;
      // Delay refresh to allow the async eval capture to complete
      const timer = setTimeout(refresh, 1000);
      return () => clearTimeout(timer);
    }
  }, [key, refresh]);

  return prevKey.current;
}
