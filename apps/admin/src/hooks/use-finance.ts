'use client';

import { useState, useCallback } from 'react';
import { adminFetch } from '@/lib/api-fetch';

// ── Types ────────────────────────────────────────────────────────

export interface OrderSearchFilters {
  tenantId?: string;
  orderNumber?: string;
  status?: string;
  businessDateFrom?: string;
  businessDateTo?: string;
  amountMin?: number;
  amountMax?: number;
  hasVoids?: boolean;
  hasRefunds?: boolean;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface OrderRow {
  id: string;
  tenant_id: string;
  location_id: string;
  order_number: string;
  status: string;
  source: string;
  subtotal: number;
  tax_total: number;
  discount_total: number;
  service_charge_total: number;
  total: number;
  void_reason: string | null;
  voided_by: string | null;
  voided_at: string | null;
  business_date: string;
  created_at: string;
  placed_at: string | null;
  paid_at: string | null;
  customer_id: string | null;
  employee_id: string | null;
  return_type: string | null;
  return_order_id: string | null;
  tenant_name: string;
  location_name: string;
  employee_name: string | null;
}

export interface OrderDetail {
  order: Record<string, unknown>;
  lines: Record<string, unknown>[];
  tenders: Record<string, unknown>[];
  glEntries: Array<Record<string, unknown> & { lines: Record<string, unknown>[] }>;
  auditTrail: Record<string, unknown>[];
  timeline: Array<{ event: string; timestamp: unknown; actor?: unknown }>;
}

export interface VoidRow {
  id: string;
  tenant_id: string;
  location_id: string;
  order_number: string;
  source: string;
  subtotal: number;
  tax_total: number;
  discount_total: number;
  total: number;
  void_reason: string | null;
  voided_by: string | null;
  voided_at: string | null;
  business_date: string;
  created_at: string;
  placed_at: string | null;
  employee_id: string | null;
  tenant_name: string;
  location_name: string;
  voided_by_name: string | null;
  employee_name: string | null;
}

export interface RefundRow {
  id: string;
  tenant_id: string;
  location_id: string;
  original_tender_id: string;
  order_id: string;
  reversal_type: string;
  amount: number;
  reason: string | null;
  refund_method: string | null;
  provider_ref: string | null;
  status: string;
  created_at: string;
  created_by: string | null;
  tender_type: string;
  card_last4: string | null;
  card_brand: string | null;
  order_number: string;
  order_total: number;
  business_date: string;
  tenant_name: string;
  location_name: string;
  created_by_name: string | null;
}

export interface GLIssuesData {
  unmappedEvents: Record<string, unknown>[];
  unpostedEntries: Record<string, unknown>[];
  failedPostings: Record<string, unknown>[];
  stats: {
    unmappedCount: number;
    unpostedCount: number;
    failedCount: number;
  };
}

export interface ChargebackRow {
  id: string;
  tenant_id: string;
  location_id: string;
  tender_id: string;
  order_id: string;
  chargeback_reason: string;
  chargeback_amount_cents: number;
  fee_amount_cents: number;
  status: string;
  provider_case_id: string | null;
  provider_ref: string | null;
  customer_id: string | null;
  resolution_reason: string | null;
  resolution_date: string | null;
  business_date: string;
  created_at: string;
  resolved_by: string | null;
  tender_type: string;
  card_last4: string | null;
  card_brand: string | null;
  tender_amount: number;
  order_number: string;
  order_total: number;
  tenant_name: string;
  location_name: string;
  customer_name: string | null;
  resolved_by_name: string | null;
}

export interface CloseBatchRow {
  id: string;
  tenant_id: string;
  location_id: string;
  terminal_id: string | null;
  business_date: string;
  status: string;
  started_at: string | null;
  started_by: string | null;
  reconciled_at: string | null;
  reconciled_by: string | null;
  posted_at: string | null;
  posted_by: string | null;
  locked_at: string | null;
  gl_journal_entry_id: string | null;
  notes: string | null;
  created_at: string;
  batch_type: 'fnb' | 'retail';
  is_overdue: boolean;
  tenant_name: string;
  location_name: string;
}

export interface VoucherRow {
  id: string;
  tenant_id: string;
  voucher_type_id: string;
  voucher_number: string;
  voucher_amount_cents: number;
  redeemed_amount_cents: number;
  tax_cents: number;
  total_cents: number;
  redemption_status: string;
  validity_start_date: string | null;
  validity_end_date: string | null;
  customer_id: string | null;
  first_name: string | null;
  last_name: string | null;
  order_id: string | null;
  refund_order_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  voucher_type_name: string;
  voucher_type_category: string;
  tenant_name: string;
  customer_name: string | null;
}

// ── Paginated Result ────────────────────────────────────────────

interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// ── useOrderSearch ──────────────────────────────────────────────

export function useOrderSearch() {
  const [data, setData] = useState<PaginatedResult<OrderRow> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (filters: OrderSearchFilters = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.tenantId) params.set('tenant_id', filters.tenantId);
      if (filters.orderNumber) params.set('order_number', filters.orderNumber);
      if (filters.status) params.set('status', filters.status);
      if (filters.businessDateFrom) params.set('business_date_from', filters.businessDateFrom);
      if (filters.businessDateTo) params.set('business_date_to', filters.businessDateTo);
      if (filters.amountMin !== undefined) params.set('amount_min', String(filters.amountMin));
      if (filters.amountMax !== undefined) params.set('amount_max', String(filters.amountMax));
      if (filters.hasVoids) params.set('has_voids', 'true');
      if (filters.hasRefunds) params.set('has_refunds', 'true');
      if (filters.sortBy) params.set('sort_by', filters.sortBy);
      if (filters.sortDir) params.set('sort_dir', filters.sortDir);
      if (filters.page) params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));

      const qs = params.toString() ? `?${params.toString()}` : '';
      const json = await adminFetch<{ data: PaginatedResult<OrderRow> }>(
        `/api/v1/finance/orders${qs}`,
      );
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { data, isLoading, error, load };
}

// ── useOrderDetail ──────────────────────────────────────────────

export function useOrderDetail() {
  const [data, setData] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (orderId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const json = await adminFetch<{ data: OrderDetail }>(
        `/api/v1/finance/orders/${orderId}`,
      );
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load order detail');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { data, isLoading, error, load, clear };
}

// ── useVoids ────────────────────────────────────────────────────

export interface VoidFilters {
  tenantId?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  page?: number;
  limit?: number;
}

export function useVoids() {
  const [data, setData] = useState<PaginatedResult<VoidRow> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (filters: VoidFilters = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.tenantId) params.set('tenant_id', filters.tenantId);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);
      if (filters.amountMin !== undefined) params.set('amount_min', String(filters.amountMin));
      if (filters.page) params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));

      const qs = params.toString() ? `?${params.toString()}` : '';
      const json = await adminFetch<{ data: PaginatedResult<VoidRow> }>(
        `/api/v1/finance/voids${qs}`,
      );
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load voids');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { data, isLoading, error, load };
}

// ── useRefunds ──────────────────────────────────────────────────

export interface RefundFilters {
  tenantId?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  page?: number;
  limit?: number;
}

export function useRefunds() {
  const [data, setData] = useState<PaginatedResult<RefundRow> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (filters: RefundFilters = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.tenantId) params.set('tenant_id', filters.tenantId);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);
      if (filters.amountMin !== undefined) params.set('amount_min', String(filters.amountMin));
      if (filters.page) params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));

      const qs = params.toString() ? `?${params.toString()}` : '';
      const json = await adminFetch<{ data: PaginatedResult<RefundRow> }>(
        `/api/v1/finance/refunds${qs}`,
      );
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load refunds');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { data, isLoading, error, load };
}

// ── useGLIssues ─────────────────────────────────────────────────

export interface GLIssueFilters {
  tenantId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function useGLIssues() {
  const [data, setData] = useState<GLIssuesData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (filters: GLIssueFilters = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.tenantId) params.set('tenant_id', filters.tenantId);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);

      const qs = params.toString() ? `?${params.toString()}` : '';
      const json = await adminFetch<{ data: GLIssuesData }>(
        `/api/v1/finance/gl-issues${qs}`,
      );
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load GL issues');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { data, isLoading, error, load };
}

// ── useChargebacks ──────────────────────────────────────────────

export interface ChargebackFilters {
  tenantId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export function useChargebacks() {
  const [data, setData] = useState<PaginatedResult<ChargebackRow> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (filters: ChargebackFilters = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.tenantId) params.set('tenant_id', filters.tenantId);
      if (filters.status) params.set('status', filters.status);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);
      if (filters.page) params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));

      const qs = params.toString() ? `?${params.toString()}` : '';
      const json = await adminFetch<{ data: PaginatedResult<ChargebackRow> }>(
        `/api/v1/finance/chargebacks${qs}`,
      );
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chargebacks');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { data, isLoading, error, load };
}

// ── useCloseBatches ─────────────────────────────────────────────

export interface CloseBatchFilters {
  tenantId?: string;
  locationId?: string;
  businessDate?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export function useCloseBatches() {
  const [data, setData] = useState<PaginatedResult<CloseBatchRow> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (filters: CloseBatchFilters = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.tenantId) params.set('tenant_id', filters.tenantId);
      if (filters.locationId) params.set('location_id', filters.locationId);
      if (filters.businessDate) params.set('business_date', filters.businessDate);
      if (filters.status) params.set('status', filters.status);
      if (filters.page) params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));

      const qs = params.toString() ? `?${params.toString()}` : '';
      const json = await adminFetch<{ data: PaginatedResult<CloseBatchRow> }>(
        `/api/v1/finance/close-batches${qs}`,
      );
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load close batches');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { data, isLoading, error, load };
}

// ── useVouchers ─────────────────────────────────────────────────

export interface VoucherFilters {
  tenantId?: string;
  code?: string;
  status?: string;
  voucherType?: string;
  page?: number;
  limit?: number;
}

export function useVouchers() {
  const [data, setData] = useState<PaginatedResult<VoucherRow> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (filters: VoucherFilters = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.tenantId) params.set('tenant_id', filters.tenantId);
      if (filters.code) params.set('code', filters.code);
      if (filters.status) params.set('status', filters.status);
      if (filters.voucherType) params.set('voucher_type', filters.voucherType);
      if (filters.page) params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));

      const qs = params.toString() ? `?${params.toString()}` : '';
      const json = await adminFetch<{ data: PaginatedResult<VoucherRow> }>(
        `/api/v1/finance/vouchers${qs}`,
      );
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vouchers');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { data, isLoading, error, load };
}
