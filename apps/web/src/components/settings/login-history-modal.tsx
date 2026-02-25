'use client';

import { Clock, Loader2, X, RefreshCw } from 'lucide-react';
import { usePaginatedAuditTrail } from '@/hooks/use-audit';

interface LoginHistoryModalProps {
  userId: string;
  userName: string;
  onClose: () => void;
}

export function LoginHistoryModal({ userId, userName, onClose }: LoginHistoryModalProps) {
  const { entries, hasMore, loadMore, refresh, isLoading } = usePaginatedAuditTrail({
    actorUserId: userId,
    action: 'auth.login.success',
    limit: 20,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gray-300 bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-gray-500" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Login History</h3>
              <p className="text-sm text-gray-500">{userName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refresh}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-200/50"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-200/50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No login history found for this user.
            </p>
          ) : (
            <div className="space-y-2">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(entry.createdAt).toLocaleDateString(undefined, {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(entry.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                  {entry.metadata?.ip != null && (
                    <span className="text-xs text-gray-400">
                      {String(entry.metadata.ip)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with Load More */}
        {hasMore && (
          <div className="border-t border-gray-200 px-6 py-3 text-center">
            <button
              type="button"
              onClick={loadMore}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              Load More
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
