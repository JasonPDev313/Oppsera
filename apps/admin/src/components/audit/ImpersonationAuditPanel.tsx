'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useImpersonationAudit } from '@/hooks/use-audit';
import type { ImpersonationFilters } from '@/hooks/use-audit';
import { ImpersonationSessionCard } from './ImpersonationSessionCard';

export function ImpersonationAuditPanel() {
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const filters: ImpersonationFilters = useMemo(() => ({
    ...(status ? { status } : {}),
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo ? { date_to: dateTo } : {}),
    page,
    limit: 20,
  }), [status, dateFrom, dateTo, page]);

  const { items, total, isLoading } = useImpersonationAudit(filters);
  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="bg-surface border border-border text-foreground text-xs rounded px-2 py-1.5"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="ended">Ended</option>
          <option value="expired">Expired</option>
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className="bg-surface border border-border text-foreground text-xs rounded px-2 py-1.5"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className="bg-surface border border-border text-foreground text-xs rounded px-2 py-1.5"
        />

        <span className="text-xs text-muted-foreground ml-auto">
          {total} sessions
        </span>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No impersonation sessions found
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ImpersonationSessionCard key={item.session.id} item={item} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} className="text-muted-foreground" />
          </button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
        </div>
      )}
    </div>
  );
}
