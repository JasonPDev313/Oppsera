'use client';

import { useState, useCallback } from 'react';
import {
  Activity,
  MessageSquare,
  Pin,
  PinOff,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  ChevronDown,
  RefreshCw,
  AlertTriangle,
  Clock,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  useActivityFeed,
  useCustomerNotes,
  useNoteMutations,
} from '@/hooks/use-customer-360';
import type { ActivityFeedItem, CustomerNoteEntry } from '@/types/customer-360';

// ── Helpers ──────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function formatDateTime(isoString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(isoString));
}

function activityTypeToVariant(type: string): string {
  if (type.includes('payment') || type.includes('tender')) return 'success';
  if (type.includes('void') || type.includes('refund')) return 'error';
  if (type.includes('communication') || type.includes('email') || type.includes('sms')) return 'info';
  if (type === 'note') return 'warning';
  return 'neutral';
}

function activitySourceIcon(source: 'activity_log' | 'communication'): typeof Activity {
  return source === 'communication' ? MessageSquare : Activity;
}

// ── Skeleton ─────────────────────────────────────────────────────

function FeedSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3 rounded-lg border border-border bg-surface p-4">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 animate-pulse rounded bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Activity Feed Timeline Item ─────────────────────────────────

function FeedItem({ item }: { item: ActivityFeedItem }) {
  const Icon = activitySourceIcon(item.source);
  const variant = activityTypeToVariant(item.type);

  return (
    <div className="flex gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-input">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{item.title}</span>
            <Badge variant={variant}>{item.type.replace(/_/g, ' ')}</Badge>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground" title={formatDateTime(item.createdAt)}>
            {formatRelativeTime(item.createdAt)}
          </span>
        </div>
        {item.details && (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{item.details}</p>
        )}
        {item.createdBy && (
          <p className="mt-1 text-xs text-muted-foreground">by {item.createdBy}</p>
        )}
      </div>
    </div>
  );
}

// ── Notes Section ───────────────────────────────────────────────

function NoteItem({
  note,
  customerId,
  onUpdated,
}: {
  note: CustomerNoteEntry;
  customerId: string;
  onUpdated: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  const { updateNote, removeNote, isLoading } = useNoteMutations();

  const handleTogglePin = async () => {
    try {
      await updateNote(customerId, note.id, { isPinned: !note.isPinned });
      onUpdated();
    } catch {
      // Error handled in hook
    }
  };

  const handleSaveEdit = async () => {
    if (!editContent.trim()) return;
    try {
      await updateNote(customerId, note.id, { content: editContent.trim() });
      setIsEditing(false);
      onUpdated();
    } catch {
      // Error handled in hook
    }
  };

  const handleDelete = async () => {
    try {
      await removeNote(customerId, note.id);
      onUpdated();
    } catch {
      // Error handled in hook
    }
  };

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        note.isPinned ? 'border-amber-500/30 bg-amber-500/10' : 'border-border bg-surface'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        {isEditing ? (
          <div className="flex-1">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              rows={3}
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isLoading}
                className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Check className="h-3 w-3" />
                Save
              </button>
              <button
                type="button"
                onClick={() => { setIsEditing(false); setEditContent(note.content); }}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                <X className="h-3 w-3" />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="flex-1 text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
        )}
        {!isEditing && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={handleTogglePin}
              disabled={isLoading}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-muted-foreground disabled:opacity-50"
              title={note.isPinned ? 'Unpin' : 'Pin'}
            >
              {note.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-muted-foreground"
              title="Edit"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isLoading}
              className="rounded p-1 text-muted-foreground hover:bg-red-500/100/10 hover:text-red-500 disabled:opacity-50"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span>{formatRelativeTime(note.createdAt)}</span>
        {note.visibility !== 'internal' && (
          <Badge variant="info">{note.visibility}</Badge>
        )}
        {note.createdBy && <span>by {note.createdBy}</span>}
      </div>
    </div>
  );
}

function AddNoteForm({
  customerId,
  onAdded,
}: {
  customerId: string;
  onAdded: () => void;
}) {
  const [content, setContent] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const { addNote, isLoading } = useNoteMutations();

  const handleSubmit = async () => {
    if (!content.trim()) return;
    try {
      await addNote(customerId, { content: content.trim(), isPinned });
      setContent('');
      setIsPinned(false);
      onAdded();
    } catch {
      // Error handled in hook
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Add a note..."
        className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        rows={2}
      />
      <div className="mt-2 flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={isPinned}
            onChange={(e) => setIsPinned(e.target.checked)}
            className="rounded border-input text-indigo-600 focus:ring-indigo-500"
          />
          Pin to top
        </label>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!content.trim() || isLoading}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Add Note
        </button>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

export default function ActivityTab({ customerId }: { customerId: string }) {
  const [feedCursor, setFeedCursor] = useState<string | undefined>(undefined);
  const { data: feedData, isLoading: feedLoading, error: feedError, mutate: refreshFeed } = useActivityFeed(customerId, feedCursor);
  const { data: notesData, isLoading: notesLoading, error: notesError, mutate: refreshNotes } = useCustomerNotes(customerId);

  const handleRefreshAll = useCallback(() => {
    refreshFeed();
    refreshNotes();
  }, [refreshFeed, refreshNotes]);

  const pinnedNotes = (notesData?.items ?? []).filter((n) => n.isPinned);
  const unpinnedNotes = (notesData?.items ?? []).filter((n) => !n.isPinned);

  return (
    <div className="space-y-6 p-6">
      {/* Notes Section */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Edit3 className="h-4 w-4 text-muted-foreground" />
            Notes
          </h3>
          <button
            type="button"
            onClick={handleRefreshAll}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        </div>

        <AddNoteForm customerId={customerId} onAdded={refreshNotes} />

        {notesLoading && !notesData ? (
          <div className="mt-3 space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : notesError ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Failed to load notes.
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {/* Pinned notes first */}
            {pinnedNotes.map((note) => (
              <NoteItem
                key={note.id}
                note={note}
                customerId={customerId}
                onUpdated={refreshNotes}
              />
            ))}
            {/* Then unpinned */}
            {unpinnedNotes.map((note) => (
              <NoteItem
                key={note.id}
                note={note}
                customerId={customerId}
                onUpdated={refreshNotes}
              />
            ))}
            {pinnedNotes.length === 0 && unpinnedNotes.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">No notes yet</p>
            )}
          </div>
        )}
      </div>

      {/* Activity Feed */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Activity Timeline
        </h3>

        {feedLoading && !feedData ? (
          <FeedSkeleton />
        ) : feedError ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface px-6 py-12 text-center">
            <AlertTriangle className="mb-3 h-8 w-8 text-red-400" />
            <p className="mb-4 text-sm text-muted-foreground">Failed to load activity feed.</p>
            <button
              type="button"
              onClick={refreshFeed}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {(feedData?.items ?? []).map((item) => (
                <FeedItem key={item.id} item={item} />
              ))}
              {(feedData?.items ?? []).length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">No activity recorded yet</p>
              )}
            </div>

            {feedData?.hasMore && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => setFeedCursor(feedData.cursor ?? undefined)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-input bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                >
                  <ChevronDown className="h-4 w-4" />
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
