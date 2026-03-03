'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Loader2, ShieldAlert } from 'lucide-react';
import { useTenantAudit } from '@/hooks/use-audit';
import type { TenantAuditFilters, TenantAuditEntry } from '@/hooks/use-audit';
import { AuditQuickFilters } from './AuditQuickFilters';
import type { QuickFilterPreset } from './AuditQuickFilters';
import { adminFetch } from '@/lib/api-fetch';

interface TenantOption {
  id: string;
  name: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface TenantAuditPanelProps {
  /** Pre-select a tenant (e.g. when embedded in tenant detail) */
  fixedTenantId?: string;
  fixedTenantName?: string;
}

export function TenantAuditPanel({ fixedTenantId, fixedTenantName }: TenantAuditPanelProps) {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState(fixedTenantId ?? '');
  const [actorType, setActorType] = useState('');
  const [entityType, setEntityType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // Load tenant list for selector (only if not fixed)
  useEffect(() => {
    if (fixedTenantId) return;
    adminFetch<{ data: { items?: TenantOption[] } | TenantOption[] }>('/api/v1/tenants?limit=200')
      .then((json) => {
        const d = json.data;
        const list = (Array.isArray(d) ? d : d.items ?? []) as TenantOption[];
        setTenants(list);
      })
      .catch(() => {});
  }, [fixedTenantId]);

  const handleQuickFilter = useCallback((preset: QuickFilterPreset | null) => {
    if (!preset) {
      setActivePreset(null);
      setEntityType('');
      return;
    }
    setActivePreset(preset.label);
    if (preset.filters.entity_type) {
      setEntityType(preset.filters.entity_type.split(',')[0] ?? '');
    }
    setPage(1);
  }, []);

  const filters: TenantAuditFilters = useMemo(() => ({
    ...(actorType ? { actor_type: actorType } : {}),
    ...(entityType ? { entity_type: entityType } : {}),
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo ? { date_to: dateTo } : {}),
    page,
    limit: 50,
  }), [actorType, entityType, dateFrom, dateTo, page]);

  const effectiveTenantId = fixedTenantId ?? selectedTenantId;
  const { items, total, isLoading } = useTenantAudit(
    effectiveTenantId || null,
    filters,
  );
  const totalPages = Math.ceil(total / 50);

  return (
    <div>
      {/* Tenant selector + filters */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {!fixedTenantId && (
          <select
            value={selectedTenantId}
            onChange={(e) => { setSelectedTenantId(e.target.value); setPage(1); }}
            className="bg-surface border border-border text-foreground text-xs rounded px-2 py-1.5"
          >
            <option value="">Select Tenant...</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
        {fixedTenantId && fixedTenantName && (
          <span className="text-xs font-medium text-foreground">
            {fixedTenantName}
          </span>
        )}

        <select
          value={actorType}
          onChange={(e) => { setActorType(e.target.value); setPage(1); }}
          className="bg-surface border border-border text-foreground text-xs rounded px-2 py-1.5"
        >
          <option value="">All Actor Types</option>
          <option value="user">User</option>
          <option value="system">System</option>
          <option value="impersonation">Impersonation</option>
          <option value="api_key">API Key</option>
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
          {total} entries
        </span>
      </div>

      {/* Quick filters */}
      <div className="mb-4">
        <AuditQuickFilters activePreset={activePreset} onSelect={handleQuickFilter} />
      </div>

      {/* No tenant selected */}
      {!effectiveTenantId ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Select a tenant to view audit log
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No audit entries found
        </div>
      ) : (
        <div className="border border-border rounded-lg bg-surface overflow-hidden">
          {items.map((entry) => (
            <TenantAuditRow key={entry.id} entry={entry} />
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

function TenantAuditRow({ entry }: { entry: TenantAuditEntry }) {
  return (
    <div className="px-4 py-3 border-b border-border last:border-0 hover:bg-accent transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">
              {entry.actorName ?? entry.actorUserId ?? 'System'}
            </span>
            <span className="text-xs text-muted-foreground">
              ({entry.actorType})
            </span>
            <span className="text-xs text-muted-foreground">&middot;</span>
            <span className="text-xs font-mono text-indigo-400">
              {entry.action}
            </span>
          </div>
          {entry.isImpersonation && entry.impersonatorAdminName && (
            <div className="flex items-center gap-1 mt-0.5">
              <ShieldAlert size={11} className="text-orange-400" />
              <span className="text-[10px] text-orange-400">
                Impersonated by: {entry.impersonatorAdminName}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground">
              Entity: {entry.entityType}
              {entry.locationName && <> at {entry.locationName}</>}
            </span>
          </div>
          {entry.changes && Object.keys(entry.changes).length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1 font-mono">
              Changes: {JSON.stringify(entry.changes).slice(0, 120)}
              {JSON.stringify(entry.changes).length > 120 ? '...' : ''}
            </p>
          )}
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
          {formatDate(entry.createdAt)}
        </span>
      </div>
    </div>
  );
}
