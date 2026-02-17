'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { useAuthContext } from '@/components/auth-provider';
import type { POSConfig, Order, AddLineItemInput, RecordTenderResult } from '@/types/pos';

// ── Helpers ────────────────────────────────────────────────────────

function clientRequestId(): string {
  return crypto.randomUUID();
}

function todayBusinessDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Hook ───────────────────────────────────────────────────────────

export function usePOS(config: POSConfig) {
  const { user } = useAuthContext();
  const { toast } = useToast();

  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [heldOrderCount, setHeldOrderCount] = useState(0);

  // Keep a ref to the current order so callbacks always see the latest
  const orderRef = useRef<Order | null>(null);
  orderRef.current = currentOrder;

  // ── Fetch order detail ─────────────────────────────────────────

  const fetchOrder = useCallback(
    async (orderId: string): Promise<Order> => {
      const res = await apiFetch<{ data: Order }>(`/api/v1/orders/${orderId}`);
      return res.data;
    },
    [],
  );

  const refreshCurrentOrder = useCallback(async () => {
    const order = orderRef.current;
    if (!order) return;
    try {
      const refreshed = await fetchOrder(order.id);
      setCurrentOrder(refreshed);
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to refresh order');
      toast.error(e.message);
    }
  }, [fetchOrder, toast]);

  // ── Fetch held order count ─────────────────────────────────────

  const fetchHeldOrderCount = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: { orders: Order[] } }>(
        `/api/v1/orders?status=open&locationId=${config.locationId}&terminalId=${config.terminalId}`,
      );
      setHeldOrderCount(res.data.orders.length);
    } catch {
      // Non-critical — silently ignore
    }
  }, [config.locationId, config.terminalId]);

  // Refresh held count on mount and when order changes
  useEffect(() => {
    fetchHeldOrderCount();
  }, [fetchHeldOrderCount, currentOrder?.id]);

  // ── Error handler with 409 auto-refetch ────────────────────────

  const handleMutationError = useCallback(
    async (err: unknown): Promise<void> => {
      if (err instanceof ApiError && err.statusCode === 409) {
        toast.error('Order was modified by another session. Refreshing...');
        await refreshCurrentOrder();
        return;
      }
      const e = err instanceof Error ? err : new Error('An error occurred');
      toast.error(e.message);
      throw e;
    },
    [toast, refreshCurrentOrder],
  );

  // ── Open Order ─────────────────────────────────────────────────

  const openOrder = useCallback(async (): Promise<Order> => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: Order }>('/api/v1/orders', {
        method: 'POST',
        body: JSON.stringify({
          source: 'pos',
          terminalId: config.terminalId,
          employeeId: user?.id ?? null,
          businessDate: todayBusinessDate(),
          clientRequestId: clientRequestId(),
        }),
      });
      const order = res.data;
      setCurrentOrder(order);
      return order;
    } catch (err) {
      await handleMutationError(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [config.terminalId, user?.id, handleMutationError]);

  // ── Add Line Item ──────────────────────────────────────────────

  const addItem = useCallback(
    async (input: AddLineItemInput): Promise<void> => {
      setIsLoading(true);
      try {
        // Auto-open order if none exists
        let order = orderRef.current;
        if (!order) {
          order = await openOrder();
        }

        await apiFetch(`/api/v1/orders/${order.id}/lines`, {
          method: 'POST',
          body: JSON.stringify({
            catalogItemId: input.catalogItemId,
            qty: input.qty,
            modifiers: input.modifiers ?? undefined,
            specialInstructions: input.specialInstructions ?? undefined,
            selectedOptions: input.selectedOptions ?? undefined,
            priceOverride: input.priceOverride ?? undefined,
            notes: input.notes ?? undefined,
            clientRequestId: clientRequestId(),
          }),
        });

        const refreshed = await fetchOrder(order.id);
        setCurrentOrder(refreshed);
      } catch (err) {
        await handleMutationError(err);
      } finally {
        setIsLoading(false);
      }
    },
    [openOrder, fetchOrder, handleMutationError],
  );

  // ── Remove Line Item ───────────────────────────────────────────

  const removeItem = useCallback(
    async (lineId: string): Promise<void> => {
      const order = orderRef.current;
      if (!order) return;
      setIsLoading(true);
      try {
        await apiFetch(`/api/v1/orders/${order.id}/lines/${lineId}`, {
          method: 'DELETE',
          body: JSON.stringify({ clientRequestId: clientRequestId() }),
        });
        const refreshed = await fetchOrder(order.id);
        setCurrentOrder(refreshed);
      } catch (err) {
        await handleMutationError(err);
      } finally {
        setIsLoading(false);
      }
    },
    [fetchOrder, handleMutationError],
  );

  // ── Service Charges ────────────────────────────────────────────

  const addServiceCharge = useCallback(
    async (input: {
      chargeType: string;
      name: string;
      calculationType: string;
      value: number;
      isTaxable: boolean;
    }): Promise<void> => {
      const order = orderRef.current;
      if (!order) return;
      setIsLoading(true);
      try {
        await apiFetch(`/api/v1/orders/${order.id}/charges`, {
          method: 'POST',
          body: JSON.stringify({
            ...input,
            clientRequestId: clientRequestId(),
          }),
        });
        const refreshed = await fetchOrder(order.id);
        setCurrentOrder(refreshed);
      } catch (err) {
        await handleMutationError(err);
      } finally {
        setIsLoading(false);
      }
    },
    [fetchOrder, handleMutationError],
  );

  const removeServiceCharge = useCallback(
    async (chargeId: string): Promise<void> => {
      const order = orderRef.current;
      if (!order) return;
      setIsLoading(true);
      try {
        await apiFetch(`/api/v1/orders/${order.id}/charges/${chargeId}`, {
          method: 'DELETE',
          body: JSON.stringify({ clientRequestId: clientRequestId() }),
        });
        const refreshed = await fetchOrder(order.id);
        setCurrentOrder(refreshed);
      } catch (err) {
        await handleMutationError(err);
      } finally {
        setIsLoading(false);
      }
    },
    [fetchOrder, handleMutationError],
  );

  // ── Discounts ──────────────────────────────────────────────────

  const applyDiscount = useCallback(
    async (type: string, value: number, reason?: string): Promise<void> => {
      const order = orderRef.current;
      if (!order) return;
      setIsLoading(true);
      try {
        await apiFetch(`/api/v1/orders/${order.id}/discounts`, {
          method: 'POST',
          body: JSON.stringify({
            type,
            value,
            reason: reason ?? undefined,
            clientRequestId: clientRequestId(),
          }),
        });
        const refreshed = await fetchOrder(order.id);
        setCurrentOrder(refreshed);
      } catch (err) {
        await handleMutationError(err);
      } finally {
        setIsLoading(false);
      }
    },
    [fetchOrder, handleMutationError],
  );

  // ── Customer ───────────────────────────────────────────────────

  const attachCustomer = useCallback(
    async (customerId: string): Promise<void> => {
      const order = orderRef.current;
      if (!order) return;
      setIsLoading(true);
      try {
        await apiFetch(`/api/v1/orders/${order.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            customerId,
            clientRequestId: clientRequestId(),
          }),
        });
        const refreshed = await fetchOrder(order.id);
        setCurrentOrder(refreshed);
      } catch (err) {
        await handleMutationError(err);
      } finally {
        setIsLoading(false);
      }
    },
    [fetchOrder, handleMutationError],
  );

  const detachCustomer = useCallback(async (): Promise<void> => {
    const order = orderRef.current;
    if (!order) return;
    setIsLoading(true);
    try {
      await apiFetch(`/api/v1/orders/${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          customerId: null,
          clientRequestId: clientRequestId(),
        }),
      });
      const refreshed = await fetchOrder(order.id);
      setCurrentOrder(refreshed);
    } catch (err) {
      await handleMutationError(err);
    } finally {
      setIsLoading(false);
    }
  }, [fetchOrder, handleMutationError]);

  // ── Place Order ────────────────────────────────────────────────

  const placeOrder = useCallback(async (): Promise<Order> => {
    const order = orderRef.current;
    if (!order) throw new Error('No active order to place');
    setIsLoading(true);
    try {
      await apiFetch(`/api/v1/orders/${order.id}/place`, {
        method: 'POST',
        body: JSON.stringify({ clientRequestId: clientRequestId() }),
      });
      const placed = await fetchOrder(order.id);
      setCurrentOrder(null);
      toast.success(`Order ${placed.orderNumber} placed`);
      return placed;
    } catch (err) {
      await handleMutationError(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [fetchOrder, toast, handleMutationError]);

  // ── Record Tender ────────────────────────────────────────────────

  const recordTender = useCallback(
    async (input: {
      amountGiven: number;
      tipAmount?: number;
      shiftId?: string;
    }): Promise<RecordTenderResult> => {
      const order = orderRef.current;
      if (!order) throw new Error('No active order');
      setIsLoading(true);
      try {
        const res = await apiFetch<{ data: RecordTenderResult }>(
          `/api/v1/orders/${order.id}/tenders`,
          {
            method: 'POST',
            body: JSON.stringify({
              clientRequestId: clientRequestId(),
              orderId: order.id,
              tenderType: 'cash',
              amountGiven: input.amountGiven,
              tipAmount: input.tipAmount ?? 0,
              terminalId: config.terminalId,
              employeeId: user?.id ?? '',
              businessDate: todayBusinessDate(),
              shiftId: input.shiftId ?? undefined,
              posMode: config.posMode,
              version: order.version,
            }),
          }
        );
        const result = res.data;
        if (result.isFullyPaid) {
          setCurrentOrder(null);
          toast.success(`Payment complete! Change: $${(result.changeGiven / 100).toFixed(2)}`);
        } else {
          // Refresh order for updated version
          const refreshed = await fetchOrder(order.id);
          setCurrentOrder(refreshed);
        }
        return result;
      } catch (err) {
        await handleMutationError(err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [config.terminalId, config.posMode, user?.id, fetchOrder, toast, handleMutationError],
  );

  // ── Void Order ─────────────────────────────────────────────────

  const voidOrder = useCallback(
    async (reason: string): Promise<void> => {
      const order = orderRef.current;
      if (!order) return;
      setIsLoading(true);
      try {
        await apiFetch(`/api/v1/orders/${order.id}/void`, {
          method: 'POST',
          body: JSON.stringify({
            reason,
            clientRequestId: clientRequestId(),
          }),
        });
        setCurrentOrder(null);
        toast.info(`Order ${order.orderNumber} voided`);
      } catch (err) {
        await handleMutationError(err);
      } finally {
        setIsLoading(false);
      }
    },
    [toast, handleMutationError],
  );

  // ── Hold / Recall / Clear ──────────────────────────────────────

  const holdOrder = useCallback(async (): Promise<void> => {
    const order = orderRef.current;
    if (!order) return;
    // Order stays "open" in the database; we just clear local state
    setCurrentOrder(null);
    toast.info(`Order ${order.orderNumber} held`);
    // Refresh held count
    await fetchHeldOrderCount();
  }, [toast, fetchHeldOrderCount]);

  const recallOrder = useCallback(
    async (orderId: string): Promise<void> => {
      setIsLoading(true);
      try {
        const order = await fetchOrder(orderId);
        setCurrentOrder(order);
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Failed to recall order');
        toast.error(e.message);
      } finally {
        setIsLoading(false);
      }
    },
    [fetchOrder, toast],
  );

  const clearOrder = useCallback((): void => {
    setCurrentOrder(null);
  }, []);

  return {
    // State
    currentOrder,
    isLoading,
    heldOrderCount,

    // Line Items
    openOrder,
    addItem,
    removeItem,

    // Charges & Discounts
    addServiceCharge,
    removeServiceCharge,
    applyDiscount,

    // Customer
    attachCustomer,
    detachCustomer,

    // Tenders
    recordTender,

    // Order Lifecycle
    placeOrder,
    voidOrder,
    holdOrder,
    recallOrder,
    clearOrder,
  };
}
