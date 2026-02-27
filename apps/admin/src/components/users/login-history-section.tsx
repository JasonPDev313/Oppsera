'use client';

import { useState } from 'react';
import {
  Clock, Loader2, RefreshCw, MapPin, Monitor, Globe, ShieldAlert, CheckCircle2, Lock, ChevronDown,
} from 'lucide-react';
import { useAdminLoginHistory, type LoginRecord } from '@/hooks/use-login-history';

interface LoginHistorySectionProps {
  /** For admin's own login records */
  adminId?: string;
  /** For viewing a tenant user's login records cross-tenant */
  userId?: string;
  tenantId?: string;
  title?: string;
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  switch (outcome) {
    case 'success':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 className="h-3 w-3" />
          Success
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400 border border-red-500/30">
          <ShieldAlert className="h-3 w-3" />
          Failed
        </span>
      );
    case 'locked':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/30">
          <Lock className="h-3 w-3" />
          Locked
        </span>
      );
    default:
      return <span className="text-xs text-slate-400">{outcome}</span>;
  }
}

function LoginRecordRow({ record }: { record: LoginRecord }) {
  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-slate-200">
              {new Date(record.createdAt).toLocaleDateString(undefined, {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </p>
            <OutcomeBadge outcome={record.outcome} />
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            {new Date(record.createdAt).toLocaleTimeString()}
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
        {record.ipAddress && (
          <span className="inline-flex items-center gap-1">
            <Globe className="h-3 w-3" />
            {record.ipAddress}
          </span>
        )}
        {(record.geoCity || record.geoCountry) && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {[record.geoCity, record.geoRegion, record.geoCountry].filter(Boolean).join(', ')}
          </span>
        )}
        {record.browser !== 'Unknown' && (
          <span className="inline-flex items-center gap-1">
            <Monitor className="h-3 w-3" />
            {record.browser} / {record.os}
          </span>
        )}
        {record.terminalName && (
          <span className="inline-flex items-center gap-1 rounded bg-indigo-500/10 px-1.5 py-0.5 text-indigo-400">
            {record.terminalName}
          </span>
        )}
      </div>

      {record.failureReason && (
        <p className="mt-1 text-xs text-red-400">{record.failureReason}</p>
      )}
    </div>
  );
}

export function LoginHistorySection({ adminId, userId, tenantId, title = 'Login History' }: LoginHistorySectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [outcomeFilter, setOutcomeFilter] = useState('');

  const { records, isLoading, hasMore, loadMore, refresh } = useAdminLoginHistory({
    adminId,
    userId,
    tenantId,
    outcome: outcomeFilter || undefined,
    limit: 10,
    enabled: expanded,
  });

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/30">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-200">{title}</span>
          {records.length > 0 && (
            <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
              {records.length}{hasMore ? '+' : ''}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-slate-700/50 px-5 py-4">
          {/* Toolbar */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1">
              {(['', 'success', 'failed', 'locked'] as const).map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setOutcomeFilter(val)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    outcomeFilter === val
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:bg-slate-700/50'
                  }`}
                >
                  {val === '' ? 'All' : val.charAt(0).toUpperCase() + val.slice(1)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={refresh}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700/50"
              title="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Content */}
          {isLoading && records.length === 0 ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : records.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No login history found.</p>
          ) : (
            <div className="space-y-2">
              {records.map((r) => (
                <LoginRecordRow key={r.id} record={r} />
              ))}
            </div>
          )}

          {hasMore && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={isLoading}
                className="text-sm font-medium text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
              >
                {isLoading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
