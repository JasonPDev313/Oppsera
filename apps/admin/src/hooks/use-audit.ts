'use client';

import { useState, useCallback, useEffect } from 'react';
import { adminFetch } from '@/lib/api-fetch';

// ── Types ────────────────────────────────────────────────────────

export interface PlatformAuditEntry {
  id: string;
  actorAdminId: string;
  actorAdminName: string | null;
  actorAdminEmail: string | null;
  action: string;
  entityType: string;
  entityId: string;
  tenantId: string | null;
  tenantName: string | null;
  beforeSnapshot: Record<string, unknown> | null;
  afterSnapshot: Record<string, unknown> | null;
  reason: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface TenantAuditEntry {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  actorType: string;
  action: string;
  entityType: string;
  entityId: string;
  locationId: string | null;
  locationName: string | null;
  changes: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  isImpersonation: boolean;
  impersonatorAdminName: string | null;
}

export interface ImpersonationSessionItem {
  session: {
    id: string;
    adminId: string;
    adminEmail: string;
    adminName: string;
    tenantId: string;
    tenantName: string;
    targetUserId: string | null;
    targetUserName: string | null;
    targetUserEmail: string | null;
    reason: string | null;
    status: string;
    startedAt: string | null;
    endedAt: string | null;
    expiresAt: string | null;
    endReason: string | null;
    ipAddress: string | null;
    actionCount: number;
    createdAt: string | null;
  };
  actionsDuringSession: {
    action: string;
    entityType: string;
    entityId: string;
    changes: Record<string, unknown> | null;
    createdAt: string | null;
  }[];
}

export interface PlatformAuditFilters {
  actor_admin_id?: string;
  action?: string;
  action_prefix?: string;
  entity_type?: string;
  tenant_id?: string;
  date_from?: string;
  date_to?: string;
  has_reason?: string;
  page?: number;
  limit?: number;
}

export interface TenantAuditFilters {
  actor_user_id?: string;
  actor_type?: string;
  action?: string;
  entity_type?: string;
  entity_id?: string;
  location_id?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

export interface ImpersonationFilters {
  admin_id?: string;
  tenant_id?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

// ── usePlatformAudit ─────────────────────────────────────────────

export function usePlatformAudit(filters: PlatformAuditFilters) {
  const [items, setItems] = useState<PlatformAuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      Object.entries({ ...filters, page: String(filters.page ?? page) }).forEach(([k, v]) => {
        if (v !== undefined && v !== '') params.set(k, String(v));
      });
      const json = await adminFetch<{ data: { items: PlatformAuditEntry[]; total: number; page: number } }>(`/api/v1/admin/audit?${params}`);
      setItems(json.data.items);
      setTotal(json.data.total);
      setPage(json.data.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { fetch(); }, [fetch]);

  return { items, total, page, setPage, isLoading, error, refetch: fetch };
}

// ── useTenantAudit ───────────────────────────────────────────────

export function useTenantAudit(tenantId: string | null, filters: TenantAuditFilters) {
  const [items, setItems] = useState<TenantAuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      Object.entries({ ...filters, page: String(filters.page ?? page) }).forEach(([k, v]) => {
        if (v !== undefined && v !== '') params.set(k, String(v));
      });
      const json = await adminFetch<{ data: { items: TenantAuditEntry[]; total: number; page: number } }>(`/api/v1/audit/tenant/${tenantId}?${params}`);
      setItems(json.data.items);
      setTotal(json.data.total);
      setPage(json.data.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, filters, page]);

  useEffect(() => { fetch(); }, [fetch]);

  return { items, total, page, setPage, isLoading, error, refetch: fetch };
}

// ── useImpersonationAudit ────────────────────────────────────────

export function useImpersonationAudit(filters: ImpersonationFilters) {
  const [items, setItems] = useState<ImpersonationSessionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      Object.entries({ ...filters, page: String(filters.page ?? page) }).forEach(([k, v]) => {
        if (v !== undefined && v !== '') params.set(k, String(v));
      });
      const json = await adminFetch<{ data: { items: ImpersonationSessionItem[]; total: number; page: number } }>(`/api/v1/audit/impersonation?${params}`);
      setItems(json.data.items);
      setTotal(json.data.total);
      setPage(json.data.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { fetch(); }, [fetch]);

  return { items, total, page, setPage, isLoading, error, refetch: fetch };
}

// ── useAuditActions ──────────────────────────────────────────────

export function useAuditActions() {
  const [actions, setActions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    adminFetch<{ data: string[] }>('/api/v1/admin/audit/actions')
      .then((json) => {
        if (!cancelled) setActions(json.data ?? []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { actions, isLoading };
}

// ── useAuditExport ───────────────────────────────────────────────

export function useAuditExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportCsv = useCallback(async (body: {
    source: 'platform' | 'tenant';
    tenant_id?: string;
    filters?: Record<string, string>;
    date_from: string;
    date_to: string;
  }) => {
    setIsExporting(true);
    setError(null);
    try {
      // Use raw fetch for CSV blob download (adminFetch always parses JSON)
      const res = await fetch('/api/v1/audit/export', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message ?? 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_${body.source}_${body.date_from}_${body.date_to}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }, []);

  return { exportCsv, isExporting, error };
}
