'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useEntitlementsContext } from '@/components/entitlements-provider';

// ── Types ──────────────────────────────────────────────────────────

export interface UnifiedImportRecord {
  id: string;
  type: 'transactions' | 'coa' | 'staff';
  typeLabel: string;
  fileName: string;
  status: string;
  createdAt: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
}

// ── Normalizers (turn API shapes into UnifiedImportRecord) ────────

interface GeneralImportJob {
  id: string;
  name: string;
  status: string;
  fileName: string;
  totalRows: number;
  importedRows: number;
  errorRows: number;
  createdAt: string;
}

interface CoaImportLog {
  id: string;
  fileName: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
  status: string;
  startedAt: string;
}

function normalizeGeneralJobs(jobs: GeneralImportJob[]): UnifiedImportRecord[] {
  return jobs.map((j) => ({
    id: j.id,
    type: 'transactions' as const,
    typeLabel: 'Transactions',
    fileName: j.fileName,
    status: j.status,
    createdAt: j.createdAt,
    totalRows: j.totalRows,
    successRows: j.importedRows,
    errorRows: j.errorRows,
  }));
}

function normalizeCoaLogs(logs: CoaImportLog[]): UnifiedImportRecord[] {
  return logs.map((l) => ({
    id: l.id,
    type: 'coa' as const,
    typeLabel: 'Chart of Accounts',
    fileName: l.fileName,
    status: l.status,
    createdAt: l.startedAt,
    totalRows: l.totalRows,
    successRows: l.successRows,
    errorRows: l.errorRows,
  }));
}

// ── Hook ──────────────────────────────────────────────────────────

export function useUnifiedImportHistory(limit = 20) {
  const { isModuleEnabled } = useEntitlementsContext();
  const [records, setRecords] = useState<UnifiedImportRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const fetches: Promise<UnifiedImportRecord[]>[] = [];

    // General import jobs — always fetch
    fetches.push(
      apiFetch<{ data: GeneralImportJob[] }>('/api/v1/import/jobs?limit=10')
        .then((res) => normalizeGeneralJobs(res.data))
        .catch(() => []),
    );

    // COA import logs — only if accounting enabled
    if (isModuleEnabled('accounting')) {
      fetches.push(
        apiFetch<{ data: CoaImportLog[] }>('/api/v1/accounting/import/history')
          .then((res) => normalizeCoaLogs(res.data))
          .catch(() => []),
      );
    }

    const results = await Promise.allSettled(fetches);
    if (!mountedRef.current) return;

    const all: UnifiedImportRecord[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        all.push(...result.value);
      }
    }

    // Sort by createdAt DESC, limit
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setRecords(all.slice(0, limit));
    setIsLoading(false);
  }, [isModuleEnabled, limit]);

  useEffect(() => {
    mountedRef.current = true;
    fetchAll();
    return () => { mountedRef.current = false; };
  }, [fetchAll]);

  return { records, isLoading, error, refresh: fetchAll };
}
