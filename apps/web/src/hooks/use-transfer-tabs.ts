'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';

export interface TransferableTab {
  id: string;
  terminalId: string;
  tabNumber: number;
  orderId: string;
  label: string | null;
  employeeId: string | null;
  employeeName: string | null;
  createdAt: string;
  orderNumber: string;
  subtotal: number;
  tax: number;
  total: number;
  orderStatus: string;
  orderCreatedAt: string;
  customerId: string | null;
}

export function useTransferTabs(currentTerminalId: string) {
  const [tabs, setTabs] = useState<TransferableTab[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const fetchTabs = useCallback(async () => {
    if (!currentTerminalId) return;
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: TransferableTab[] }>(
        `/api/v1/register-tabs/transfers?terminalId=${encodeURIComponent(currentTerminalId)}`,
      );
      setTabs(res.data);
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to load transferable tabs');
      toast.error(e.message);
    } finally {
      setIsLoading(false);
    }
  }, [currentTerminalId, toast]);

  useEffect(() => {
    fetchTabs();
  }, [fetchTabs]);

  const transferTab = useCallback(
    async (sourceTabId: string, targetTerminalId: string, targetTabNumber: number) => {
      const res = await apiFetch<{ data: { orderId: string } }>(
        `/api/v1/register-tabs/${sourceTabId}/transfer`,
        {
          method: 'POST',
          body: JSON.stringify({ targetTerminalId, targetTabNumber }),
        },
      );
      // Remove the transferred tab from the list
      setTabs((prev) => prev.filter((t) => t.id !== sourceTabId));
      return res.data.orderId;
    },
    [],
  );

  return { tabs, isLoading, mutate: fetchTabs, transferTab };
}
