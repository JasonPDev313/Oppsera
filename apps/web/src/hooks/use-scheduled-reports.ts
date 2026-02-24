'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────

export interface ScheduledReport {
  id: string;
  name: string;
  reportType: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  deliveryHour: number;
  deliveryDayOfWeek: number | null;
  deliveryDayOfMonth: number | null;
  recipientType: 'self' | 'role' | 'custom';
  recipientRoleIds: string[] | null;
  recipientUserIds: string[] | null;
  channel: 'in_app' | 'email' | 'webhook';
  webhookUrl: string | null;
  config: ScheduledReportConfig;
  isActive: boolean;
  lastDeliveredAt: string | null;
  nextDeliveryAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledReportConfig {
  lensSlug?: string;
  metricSlugs?: string[];
  dimensionSlugs?: string[];
  filters?: Record<string, unknown>;
  dateRange?: { start?: string; end?: string };
  format?: 'summary' | 'detailed' | 'csv';
}

export interface CreateScheduledReportInput {
  name: string;
  reportType?: 'digest' | 'custom_report' | 'metric_snapshot';
  frequency?: 'daily' | 'weekly' | 'monthly';
  deliveryHour?: number;
  deliveryDayOfWeek?: number;
  deliveryDayOfMonth?: number;
  recipientType?: 'self' | 'role' | 'custom';
  recipientRoleIds?: string[];
  recipientUserIds?: string[];
  channel?: 'in_app' | 'email' | 'webhook';
  webhookUrl?: string;
  config?: ScheduledReportConfig;
}

export interface UpdateScheduledReportInput {
  name?: string;
  frequency?: 'daily' | 'weekly' | 'monthly';
  deliveryHour?: number;
  deliveryDayOfWeek?: number | null;
  deliveryDayOfMonth?: number | null;
  recipientType?: 'self' | 'role' | 'custom';
  recipientRoleIds?: string[] | null;
  recipientUserIds?: string[] | null;
  channel?: 'in_app' | 'email' | 'webhook';
  webhookUrl?: string | null;
  config?: ScheduledReportConfig;
  isActive?: boolean;
}

interface ScheduledReportsListResponse {
  data: ScheduledReport[];
  meta: { cursor: string | null; hasMore: boolean };
}

interface ScheduledReportResponse {
  data: ScheduledReport;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useScheduledReports() {
  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // ── Fetch scheduled reports ──
  const loadReports = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch<ScheduledReportsListResponse>(
        '/api/v1/semantic/scheduled-reports',
      );
      if (!mountedRef.current) return;
      setReports(res.data);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load scheduled reports');
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // ── Auto-load on mount ──
  useEffect(() => {
    mountedRef.current = true;
    loadReports();
    return () => { mountedRef.current = false; };
  }, [loadReports]);

  // ── Create a scheduled report ──
  const createReport = useCallback(async (input: CreateScheduledReportInput): Promise<ScheduledReport | null> => {
    try {
      const res = await apiFetch<ScheduledReportResponse>('/api/v1/semantic/scheduled-reports', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setReports((prev) => [...prev, res.data]);
      return res.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create scheduled report';
      setError(msg);
      throw err;
    }
  }, []);

  // ── Update a scheduled report ──
  const updateReport = useCallback(async (id: string, updates: UpdateScheduledReportInput): Promise<ScheduledReport | null> => {
    try {
      const res = await apiFetch<ScheduledReportResponse>(`/api/v1/semantic/scheduled-reports/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      setReports((prev) =>
        prev.map((r) => (r.id === id ? res.data : r)),
      );
      return res.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update scheduled report';
      setError(msg);
      throw err;
    }
  }, []);

  // ── Delete a scheduled report ──
  const deleteReport = useCallback(async (id: string): Promise<void> => {
    // Optimistic removal
    setReports((prev) => prev.filter((r) => r.id !== id));

    try {
      await apiFetch(`/api/v1/semantic/scheduled-reports/${id}`, {
        method: 'DELETE',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete scheduled report';
      setError(msg);
      loadReports();
      throw err;
    }
  }, [loadReports]);

  return { reports, createReport, updateReport, deleteReport, isLoading, error, refresh: loadReports };
}
