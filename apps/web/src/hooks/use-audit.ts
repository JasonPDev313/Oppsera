'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

// ── Audit Trail (uses existing /api/v1/audit-log) ────────────

interface AuditEntry {
  id: string;
  tenantId: string;
  locationId: string | null;
  actorUserId: string | null;
  actorType: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: Record<string, { old: unknown; new: unknown }> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditTrailFilters {
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  action?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

interface AuditTrailResult {
  entries: AuditEntry[];
  cursor: string | null;
}

export function useAuditTrail(filters: AuditTrailFilters) {
  const qs = buildQueryString(filters);
  return useQuery({
    queryKey: ['audit-trail', filters],
    queryFn: () =>
      apiFetch<{ data: AuditTrailResult }>(`/api/v1/audit-log${qs}`).then((r) => r.data),
    staleTime: 15_000,
  });
}

// ── Audit Coverage (uses /api/v1/accounting/audit/coverage) ──

interface AuditCoverageItem {
  category: string;
  label: string;
  transactionCount: number;
  auditEntryCount: number;
  gapCount: number;
  coveragePercent: number;
}

interface AuditCoverageReport {
  items: AuditCoverageItem[];
  totalTransactions: number;
  totalAuditEntries: number;
  totalGaps: number;
  overallCoveragePercent: number;
}

export function useAuditCoverage(dateRange: { from: string; to: string }) {
  return useQuery({
    queryKey: ['audit-coverage', dateRange],
    queryFn: () =>
      apiFetch<{ data: AuditCoverageReport }>(
        `/api/v1/accounting/audit/coverage?from=${dateRange.from}&to=${dateRange.to}`,
      ).then((r) => r.data),
    staleTime: 60_000,
    enabled: !!dateRange.from && !!dateRange.to,
  });
}

// ── Paginated audit trail with load-more ─────────────────────

export function usePaginatedAuditTrail(baseFilters: Omit<AuditTrailFilters, 'cursor'>) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const query = useQuery({
    queryKey: ['audit-trail-paginated', baseFilters],
    queryFn: async () => {
      const result = await apiFetch<{ data: AuditTrailResult }>(
        `/api/v1/audit-log${buildQueryString(baseFilters)}`,
      ).then((r) => r.data);
      setEntries(result.entries);
      setCursor(result.cursor);
      setHasMore(!!result.cursor);
      return result;
    },
    staleTime: 15_000,
  });

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    const result = await apiFetch<{ data: AuditTrailResult }>(
      `/api/v1/audit-log${buildQueryString({ ...baseFilters, cursor })}`,
    ).then((r) => r.data);
    setEntries((prev) => [...prev, ...result.entries]);
    setCursor(result.cursor);
    setHasMore(!!result.cursor);
  }, [cursor, baseFilters]);

  const refresh = useCallback(() => {
    setCursor(null);
    setEntries([]);
    setHasMore(false);
    query.refetch();
  }, [query]);

  return {
    entries,
    hasMore,
    loadMore,
    refresh,
    isLoading: query.isLoading,
    error: query.error,
  };
}
