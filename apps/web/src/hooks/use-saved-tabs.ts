'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import type { HeldOrder } from '@/types/pos';

export interface SavedTabFilters {
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function useSavedTabs(locationId: string, filters: SavedTabFilters = {}) {
  const [orders, setOrders] = useState<HeldOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const locationHeaders = { 'X-Location-Id': locationId };

  const fetchHeldOrders = useCallback(async () => {
    if (!locationId) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.employeeId) params.set('employeeId', filters.employeeId);
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      params.set('limit', '50');

      const res = await apiFetch<{
        data: HeldOrder[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/orders/held?${params.toString()}`, { headers: locationHeaders });

      setOrders(res.data);
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to load saved tabs');
      toast.error(e.message);
    } finally {
      setIsLoading(false);
    }
  }, [locationId, filters.employeeId, filters.dateFrom, filters.dateTo, toast]);

  useEffect(() => {
    fetchHeldOrders();
  }, [fetchHeldOrders]);

  return { orders, isLoading, mutate: fetchHeldOrders };
}
