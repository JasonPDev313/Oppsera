'use client';

import { useState, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { usePlatformAudit, useAuditActions } from '@/hooks/use-audit';
import type { PlatformAuditFilters } from '@/hooks/use-audit';
import { AuditLogEntry } from './AuditLogEntry';

export function PlatformAuditPanel() {
  const [actorAdminId, setActorAdminId] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const { actions: actionOptions } = useAuditActions();

  const filters: PlatformAuditFilters = useMemo(() => ({
    ...(actorAdminId ? { actor_admin_id: actorAdminId } : {}),
    ...(action ? { action } : {}),
    ...(entityType ? { entity_type: entityType } : {}),
    ...(tenantId ? { tenant_id: tenantId } : {}),
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo ? { date_to: dateTo } : {}),
    page,
    limit: 50,
  }), [actorAdminId, action, entityType, tenantId, dateFrom, dateTo, page]);

  const { items, total, isLoading } = usePlatformAudit(filters);
  const totalPages = Math.ceil(total / 50);

  const handleReset = useCallback(() => {
    setActorAdminId('');
    setAction('');
    setEntityType('');
    setTenantId('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }, []);

  const ENTITY_TYPES = ['tenant', 'user', 'staff', 'customer', 'entitlement', 'impersonation_session', 'role', 'feature_flag'];

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <select
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1); }}
          className="bg-surface border border-border text-foreground text-xs rounded px-2 py-1.5"
        >
          <option value="">All Actions</option>
          {actionOptions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <select
          value={entityType}
          onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
          className="bg-surface border border-border text-foreground text-xs rounded px-2 py-1.5"
        >
          <option value="">All Entity Types</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          placeholder="From"
          className="bg-surface border border-border text-foreground text-xs rounded px-2 py-1.5"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          placeholder="To"
          className="bg-surface border border-border text-foreground text-xs rounded px-2 py-1.5"
        />

        <button
          onClick={handleReset}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear
        </button>

        <span className="text-xs text-muted-foreground ml-auto">
          {total} entries
        </span>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No audit log entries found
        </div>
      ) : (
        <div className="border border-border rounded-lg bg-surface overflow-hidden">
          {items.map((entry) => (
            <AuditLogEntry key={entry.id} entry={entry} />
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
