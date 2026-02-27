'use client';

import { useState } from 'react';
import {
  Clock, Loader2, X, RefreshCw, MapPin, Monitor, Globe, ShieldAlert, CheckCircle2, Lock,
} from 'lucide-react';
import { useLoginHistory } from '@/hooks/use-login-history';

interface LoginHistoryModalProps {
  userId: string;
  userName: string;
  onClose: () => void;
}

const OUTCOME_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Success', value: 'success' },
  { label: 'Failed', value: 'failed' },
  { label: 'Locked', value: 'locked' },
] as const;

function OutcomeBadge({ outcome }: { outcome: string }) {
  switch (outcome) {
    case 'success':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-500 border border-green-500/30">
          <CheckCircle2 className="h-3 w-3" />
          Success
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500 border border-red-500/30">
          <ShieldAlert className="h-3 w-3" />
          Failed
        </span>
      );
    case 'locked':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500 border border-amber-500/30">
          <Lock className="h-3 w-3" />
          Locked
        </span>
      );
    default:
      return <span className="text-xs text-muted-foreground">{outcome}</span>;
  }
}

export function LoginHistoryModal({ userId, userName, onClose }: LoginHistoryModalProps) {
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const { records, hasMore, loadMore, refresh, isLoading } = useLoginHistory({
    userId,
    outcome: outcomeFilter || undefined,
    limit: 20,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-input bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold text-foreground">Login History</h3>
              <p className="text-sm text-muted-foreground">{userName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refresh}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/50"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Outcome filter */}
        <div className="flex items-center gap-1 border-b border-border px-6 py-2">
          {OUTCOME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setOutcomeFilter(opt.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                outcomeFilter === opt.value
                  ? 'bg-indigo-600 text-white'
                  : 'text-muted-foreground hover:bg-accent/50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading && records.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : records.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No login history found for this user.
            </p>
          ) : (
            <div className="space-y-2">
              {records.map((record) => (
                <div
                  key={record.id}
                  className="rounded-lg border border-border bg-muted/50 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: date + outcome */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {new Date(record.createdAt).toLocaleDateString(undefined, {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                        <OutcomeBadge outcome={record.outcome} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(record.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>

                  {/* Details row */}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {/* IP */}
                    {record.ipAddress && (
                      <span className="inline-flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {record.ipAddress}
                      </span>
                    )}

                    {/* Location */}
                    {(record.geoCity || record.geoCountry) && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {[record.geoCity, record.geoRegion, record.geoCountry]
                          .filter(Boolean)
                          .join(', ')}
                      </span>
                    )}

                    {/* Device/Browser */}
                    {record.browser !== 'Unknown' && (
                      <span className="inline-flex items-center gap-1">
                        <Monitor className="h-3 w-3" />
                        {record.browser} / {record.os}
                      </span>
                    )}

                    {/* Terminal */}
                    {record.terminalName && (
                      <span className="inline-flex items-center gap-1 rounded bg-indigo-500/10 px-1.5 py-0.5 text-indigo-500">
                        {record.terminalName}
                      </span>
                    )}
                  </div>

                  {/* Failure reason */}
                  {record.failureReason && (
                    <p className="mt-1 text-xs text-red-500">{record.failureReason}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with Load More */}
        {hasMore && (
          <div className="border-t border-border px-6 py-3 text-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={isLoading}
              className="text-sm font-medium text-indigo-500 hover:text-indigo-400 disabled:opacity-50"
            >
              {isLoading ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
