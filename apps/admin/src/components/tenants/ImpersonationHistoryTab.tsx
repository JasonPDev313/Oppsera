'use client';

import { useCallback, useEffect, useState } from 'react';
import { Clock, Loader2, Shield, User } from 'lucide-react';
import { adminFetch } from '@/lib/api-fetch';

interface ImpersonationSessionItem {
  id: string;
  adminId: string;
  adminEmail: string;
  adminName: string;
  tenantId: string;
  tenantName: string;
  targetUserId: string | null;
  reason: string | null;
  maxDurationMinutes: number;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  actionCount: number;
  expiresAt: string;
  createdAt: string;
}

interface ImpersonationHistoryTabProps {
  tenantId?: string;
  adminId?: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  pending: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  ended: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
  expired: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  revoked: 'text-red-400 bg-red-500/10 border-red-500/30',
};

function formatDuration(startedAt: string | null, endedAt: string | null, expiresAt: string): string {
  if (!startedAt) return '—';
  const start = new Date(startedAt);
  const end = endedAt ? new Date(endedAt) : new Date();
  const diffMs = end.getTime() - start.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hours}h ${remainMins}m` : `${hours}h`;
}

function formatTimeRemaining(expiresAt: string): string {
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return 'Expired';
  const mins = Math.ceil(remaining / 60000);
  return `${mins} min remaining`;
}

export function ImpersonationHistoryTab({ tenantId, adminId }: ImpersonationHistoryTabProps) {
  const [sessions, setSessions] = useState<ImpersonationSessionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const load = useCallback(async (append = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (tenantId) params.set('tenantId', tenantId);
      if (adminId) params.set('adminId', adminId);
      if (statusFilter) params.set('status', statusFilter);
      if (append && cursor) params.set('cursor', cursor);
      params.set('limit', '20');

      const res = await adminFetch<{
        data: { items: ImpersonationSessionItem[]; cursor: string | null; hasMore: boolean };
      }>(`/api/v1/impersonation/history?${params}`);

      setSessions((prev) => append ? [...prev, ...res.data.items] : res.data.items);
      setCursor(res.data.cursor);
      setHasMore(res.data.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, adminId, statusFilter, cursor]);

  useEffect(() => {
    load();
  }, [tenantId, adminId, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <Shield size={16} className="text-amber-400" />
        <h3 className="text-sm font-medium text-slate-300">Impersonation Log</h3>
        <div className="ml-auto">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCursor(null);
            }}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="ended">Ended</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-2 text-sm text-red-400">{error}</div>
      )}

      {/* Loading */}
      {isLoading && sessions.length === 0 && (
        <div className="flex items-center justify-center py-8 text-slate-500">
          <Loader2 size={20} className="animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && sessions.length === 0 && (
        <div className="py-8 text-center text-sm text-slate-500">No impersonation sessions found.</div>
      )}

      {/* Session list */}
      <div className="space-y-3">
        {sessions.map((s) => (
          <div key={s.id} className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <User size={14} className="text-slate-400 shrink-0" />
                  <span className="text-sm font-medium text-white">{s.adminName}</span>
                  <span className="text-slate-500 text-xs">→</span>
                  <span className="text-sm text-slate-300">{s.tenantName}</span>
                </div>
                {s.reason && (
                  <p className="mt-1.5 text-xs text-slate-400 line-clamp-2">{s.reason}</p>
                )}
                <div className="mt-2 flex items-center gap-4 flex-wrap text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {new Date(s.createdAt).toLocaleDateString()} {new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {s.startedAt && s.endedAt && (
                      <> – {new Date(s.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>
                    )}
                  </span>
                  {s.startedAt && (
                    <span>Duration: {formatDuration(s.startedAt, s.endedAt, s.expiresAt)}</span>
                  )}
                  <span>{s.actionCount} action{s.actionCount !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[s.status] ?? STATUS_COLORS.ended}`}>
                  {s.status === 'active' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                  {s.status}
                </span>
                {s.status === 'active' && (
                  <span className="text-xs text-amber-400">{formatTimeRemaining(s.expiresAt)}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => load(true)}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-400 hover:text-white hover:border-slate-500 transition-colors disabled:opacity-50"
          >
            {isLoading ? <Loader2 size={12} className="animate-spin" /> : null}
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
