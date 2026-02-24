'use client';

import { useState, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

// ── Types ──────────────────────────────────────────────────────────

export interface ImportJob {
  id: string;
  tenantId: string;
  locationId: string | null;
  name: string;
  status: string;
  mode: string;
  fileName: string;
  fileSizeBytes: number;
  fileHash: string;
  rowCount: number | null;
  sourceSystem: string | null;
  detectedColumns: unknown[] | null;
  detectedStructure: string | null;
  groupingKey: string | null;
  totalRows: number;
  processedRows: number;
  importedRows: number;
  skippedRows: number;
  errorRows: number;
  quarantinedRows: number;
  businessDateFrom: string | null;
  businessDateTo: string | null;
  importedBy: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportJobDetail extends ImportJob {
  legacyRevenueCents: number | null;
  legacyPaymentCents: number | null;
  legacyTaxCents: number | null;
  legacyRowCount: number | null;
  oppseraRevenueCents: number | null;
  oppseraPaymentCents: number | null;
  oppseraTaxCents: number | null;
  oppseraOrderCount: number | null;
  columnMappings: ColumnMapping[];
  tenderMappings: TenderMapping[];
  taxMappings: TaxMapping[];
  itemMappings: ItemMapping[];
}

export interface ColumnMapping {
  id: string;
  sourceColumn: string;
  targetEntity: string;
  targetField: string;
  confidence: number;
  confidenceReason: string | null;
  isConfirmed: boolean;
  dataType: string | null;
  transformRule: string | null;
  sampleValues: string[];
}

export interface TenderMapping {
  id: string;
  legacyValue: string;
  oppseraTenderType: string;
  confidence: number;
  isConfirmed: boolean;
  occurrenceCount: number;
}

export interface TaxMapping {
  id: string;
  legacyColumn: string;
  legacyRate: number | null;
  oppseraTaxGroupId: string | null;
  taxMode: string;
  confidence: number;
  isConfirmed: boolean;
}

export interface ItemMapping {
  id: string;
  legacyItemName: string;
  legacyItemSku: string | null;
  oppseraCatalogItemId: string | null;
  strategy: string;
  occurrenceCount: number;
  totalRevenueCents: number;
  isConfirmed: boolean;
}

export interface ImportError {
  id: string;
  importJobId: string;
  rowNumber: number;
  severity: string;
  category: string;
  message: string;
  sourceData: Record<string, unknown> | null;
  createdAt: string;
}

export interface ReconciliationResult {
  legacyRevenueCents: number | null;
  legacyPaymentCents: number | null;
  legacyTaxCents: number | null;
  legacyRowCount: number | null;
  oppseraRevenueCents: number | null;
  oppseraPaymentCents: number | null;
  oppseraTaxCents: number | null;
  oppseraOrderCount: number | null;
  revenueDifferenceCents: number;
  paymentDifferenceCents: number;
  taxDifferenceCents: number;
  isBalanced: boolean;
}

interface ListResult<T> {
  data: T[];
  meta: { cursor: string | null; hasMore: boolean };
}

// ── List Hook ──────────────────────────────────────────────────────

export interface UseImportJobsOptions {
  status?: string;
  limit?: number;
}

export function useImportJobs(options?: UseImportJobsOptions) {
  const [items, setItems] = useState<ImportJob[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const isInitialLoad = useRef(true);

  const fetchJobs = useCallback(
    async (appendCursor?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const qs = buildQueryString({
          status: options?.status,
          limit: options?.limit,
          cursor: appendCursor,
        });
        const res = await apiFetch<ListResult<ImportJob>>(`/api/v1/import/jobs${qs}`);
        if (appendCursor) {
          setItems((prev) => [...prev, ...res.data]);
        } else {
          setItems(res.data);
        }
        setCursor(res.meta.cursor);
        setHasMore(res.meta.hasMore);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load import jobs');
      } finally {
        setIsLoading(false);
        isInitialLoad.current = false;
      }
    },
    [options?.status, options?.limit],
  );

  const loadMore = useCallback(() => {
    if (cursor && hasMore && !isLoading) {
      fetchJobs(cursor);
    }
  }, [cursor, hasMore, isLoading, fetchJobs]);

  const refresh = useCallback(() => {
    setCursor(null);
    setHasMore(false);
    fetchJobs();
  }, [fetchJobs]);

  return { items, isLoading, error, hasMore, loadMore, refresh, fetchJobs };
}

// ── Detail Hook ────────────────────────────────────────────────────

export function useImportJob(jobId: string | null) {
  const [job, setJob] = useState<ImportJobDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: ImportJobDetail }>(`/api/v1/import/jobs/${jobId}`);
      setJob(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load import job');
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  return { job, isLoading, error, fetchJob, setJob };
}

// ── Errors Hook ────────────────────────────────────────────────────

export function useImportErrors(jobId: string | null, severity?: string) {
  const [items, setItems] = useState<ImportError[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const fetchErrors = useCallback(
    async (appendCursor?: string) => {
      if (!jobId) return;
      setIsLoading(true);
      try {
        const qs = buildQueryString({ severity, cursor: appendCursor, limit: 50 });
        const res = await apiFetch<ListResult<ImportError>>(
          `/api/v1/import/jobs/${jobId}/errors${qs}`,
        );
        if (appendCursor) {
          setItems((prev) => [...prev, ...res.data]);
        } else {
          setItems(res.data);
        }
        setCursor(res.meta.cursor);
        setHasMore(res.meta.hasMore);
      } catch {
        // Silent — errors are secondary
      } finally {
        setIsLoading(false);
      }
    },
    [jobId, severity],
  );

  const loadMore = useCallback(() => {
    if (cursor && hasMore && !isLoading) {
      fetchErrors(cursor);
    }
  }, [cursor, hasMore, isLoading, fetchErrors]);

  return { items, isLoading, hasMore, loadMore, fetchErrors };
}

// ── Reconciliation Hook ────────────────────────────────────────────

export function useReconciliation(jobId: string | null) {
  const [data, setData] = useState<ReconciliationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchReconciliation = useCallback(async () => {
    if (!jobId) return;
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: ReconciliationResult }>(
        `/api/v1/import/jobs/${jobId}/reconciliation`,
      );
      setData(res.data);
    } catch {
      // Silent
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  return { data, isLoading, fetchReconciliation };
}
