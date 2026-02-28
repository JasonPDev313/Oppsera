'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { useAuthContext } from '@/components/auth-provider';
import { usePOSBatch } from './use-pos-batch';
import { usePOSApi } from './use-pos-api';
import type { POSConfig, Order, RecordTenderResult } from '@/types/pos';

// ── Helpers ────────────────────────────────────────────────────────

function todayBusinessDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Hook ───────────────────────────────────────────────────────────

export interface UsePOSOptions {
  /** Called when addItem gets a 404 — e.g., stale catalog item that was archived */
  onItemNotFound?: () => void;
}

export function usePOS(config: POSConfig, options?: UsePOSOptions) {
  const { user } = useAuthContext();
  const { toast } = useToast();

  // Stable ref for optional callbacks
  const onItemNotFoundRef = useRef(options?.onItemNotFound);
  onItemNotFoundRef.current = options?.onItemNotFound;

  // Location header for all POS API calls
  const locationHeaders = useMemo(() => ({ 'X-Location-Id': config.locationId }), [config.locationId]);

  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // True while openOrder() is creating a new order (addItem uses optimistic updates,
  // so Pay/Send buttons should NOT be disabled during this)
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [heldOrderCount, setHeldOrderCount] = useState(0);

  // Keep a ref to the current order so callbacks always see the latest
  const orderRef = useRef<Order | null>(null);
  orderRef.current = currentOrder;

  // Track in-flight addItem calls so placeOrder can await them
  const pendingAddItems = useRef<Promise<void>[]>([]);

  // Deduplicate concurrent openOrder calls (e.g. rapid item taps before order exists)
  const openOrderPromise = useRef<Promise<Order> | null>(null);
  const placingPromise = useRef<Promise<Order> | null>(null);

  // ── Fetch order detail ─────────────────────────────────────────

  const fetchOrder = useCallback(
    async (orderId: string): Promise<Order> => {
      const res = await apiFetch<{ data: Order }>(`/api/v1/orders/${orderId}`, {
        headers: locationHeaders,
      });
      return res.data;
    },
    [locationHeaders],
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
      const res = await apiFetch<{ data: unknown[]; meta: { hasMore: boolean } }>(
        `/api/v1/orders/held?limit=1`,
        { headers: locationHeaders },
      );
      setHeldOrderCount(res.data.length + (res.meta.hasMore ? 1 : 0));
    } catch {
      // Non-critical — silently ignore
    }
  }, [config.locationId]);

  // Refresh held count after initial render (deferred so it doesn't block POS load)
  useEffect(() => {
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(() => fetchHeldOrderCount());
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(() => fetchHeldOrderCount(), 0);
    return () => clearTimeout(id);
  }, [fetchHeldOrderCount]);

  // ── Error handler with 409 auto-refetch ────────────────────────

  const handleMutationError = useCallback(
    async (err: unknown): Promise<void> => {
      if (err instanceof ApiError && err.statusCode === 409) {
        const msg = err.message || '';
        // If the order status doesn't match (e.g. already placed/paid), clear it
        if (msg.includes('Order is')) {
          toast.error(msg);
          setCurrentOrder(null);
        } else {
          toast.error('Order was modified by another session. Refreshing...');
          await refreshCurrentOrder();
        }
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
    // Use isCreatingOrder instead of isLoading — addItem calls this during
    // optimistic updates, so we don't want to disable Pay/Send buttons.
    setIsCreatingOrder(true);
    try {
      const res = await apiFetch<{ data: Order }>('/api/v1/orders', {
        method: 'POST',
        headers: locationHeaders,
        body: JSON.stringify({
          source: 'pos',
          terminalId: config.terminalId,
          employeeId: user?.id ?? null,
          businessDate: todayBusinessDate(),
          clientRequestId: crypto.randomUUID(),
        }),
      });
      const order = res.data;
      // Preserve any optimistic lines that were added before the order was created
      setCurrentOrder((prev) => {
        const optimisticLines = (prev?.lines ?? []).filter(l => l.id.startsWith('temp-'));
        if (optimisticLines.length === 0) return order;
        const optimisticSubtotal = optimisticLines.reduce((sum, l) => sum + l.lineSubtotal, 0);
        return {
          ...order,
          lines: [...(order.lines ?? []), ...optimisticLines],
          subtotal: order.subtotal + optimisticSubtotal,
          total: order.total + optimisticSubtotal,
        };
      });
      return order;
    } catch (err) {
      await handleMutationError(err);
      throw err;
    } finally {
      setIsCreatingOrder(false);
    }
  }, [config.terminalId, user?.id, handleMutationError]);

  // ── Sub-hooks ──────────────────────────────────────────────────

  const batch = usePOSBatch({
    orderRef,
    setCurrentOrder,
    openOrder,
    openOrderPromise,
    pendingAddItems,
    handleMutationError,
    locationHeaders,
    toast,
    locationId: config.locationId,
    terminalId: config.terminalId,
    userId: user?.id,
    onItemNotFoundRef,
  });

  const api = usePOSApi({
    orderRef,
    setCurrentOrder,
    setIsLoading,
    fetchOrder,
    handleMutationError,
    locationHeaders,
    openOrder,
    addItem: batch.addItem,
    toast,
  });

  // ── Place Order ────────────────────────────────────────────────

  const placeOrder = useCallback(async (): Promise<Order> => {
    let order = orderRef.current;
    if (!order) throw new Error('No active order to place');

    // Already placed — return immediately
    if (order.status === 'placed') return order;

    // Deduplicate: if a place call is already in-flight, await it
    if (placingPromise.current) return placingPromise.current;

    // Wait for openOrder to finish if we still have a placeholder (id === '')
    if (!order.id && openOrderPromise.current) {
      await openOrderPromise.current;
      order = orderRef.current!;
    }

    // Still no valid ID — order creation hasn't started or failed
    if (!order || !order.id) throw new Error('Order is still being created');

    // Already placed (may have resolved after waiting for openOrder)
    if (order.status === 'placed') return order;

    // Flush any pending batch timer so queued items are sent before placing
    if (batch.batchTimerRef.current) {
      clearTimeout(batch.batchTimerRef.current);
      batch.batchTimerRef.current = null;
      if (batch.batchQueue.current.length > 0) {
        void batch.flushBatch();
      }
    }

    // Wait for any in-flight addItem calls to settle before placing.
    if (pendingAddItems.current.length > 0) {
      await Promise.allSettled(pendingAddItems.current);
      order = orderRef.current!;
      if (!order || !order.id) throw new Error('Order is still being created');
      if (order.status === 'placed') return order;
    }

    // Capture as const for the closure
    const orderToPlace = order;

    const doPlace = async (): Promise<Order> => {
      setIsLoading(true);
      try {
        const res = await apiFetch<{ data: Record<string, unknown> }>(`/api/v1/orders/${orderToPlace.id}/place`, {
          method: 'POST',
          headers: locationHeaders,
          body: JSON.stringify({ clientRequestId: crypto.randomUUID() }),
        });
        const placed: Order = {
          ...orderToPlace,
          ...(res.data as Partial<Order>),
          status: 'placed',
          lines: orderToPlace.lines,
          charges: orderToPlace.charges ?? [],
          discounts: orderToPlace.discounts ?? [],
        };
        setCurrentOrder(placed);
        return placed;
      } catch (err) {
        // If the order is already placed (race between preemptive + user click),
        // fetch the placed order and return it as success
        if (err instanceof ApiError && err.statusCode === 409) {
          try {
            const refreshed = await fetchOrder(orderToPlace.id);
            if (refreshed.status === 'placed') {
              setCurrentOrder(refreshed);
              return refreshed;
            }
          } catch {
            throw err;
          }
        }
        await handleMutationError(err);
        throw err;
      } finally {
        setIsLoading(false);
        placingPromise.current = null;
      }
    };

    placingPromise.current = doPlace();
    return placingPromise.current;
  }, [toast, handleMutationError, batch.flushBatch]);

  // ── Record Tender ────────────────────────────────────────────────

  const recordTender = useCallback(
    async (input: {
      amountGiven: number;
      tipAmount?: number;
      shiftId?: string;
    }): Promise<RecordTenderResult> => {
      const order = orderRef.current;
      if (!order) throw new Error('No active order');
      if (!order.id) throw new Error('Order is still being created');
      setIsLoading(true);
      try {
        const res = await apiFetch<{ data: RecordTenderResult }>(
          `/api/v1/orders/${order.id}/tenders`,
          {
            method: 'POST',
            headers: locationHeaders,
            body: JSON.stringify({
              clientRequestId: crypto.randomUUID(),
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
          headers: locationHeaders,
          body: JSON.stringify({
            reason,
            clientRequestId: crypto.randomUUID(),
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
    setIsLoading(true);
    try {
      await apiFetch(`/api/v1/orders/${order.id}/hold`, {
        method: 'POST',
        headers: locationHeaders,
        body: JSON.stringify({ clientRequestId: crypto.randomUUID() }),
      });
      setCurrentOrder(null);
      toast.info(`Order ${order.orderNumber} saved`);
      await fetchHeldOrderCount();
    } catch (err) {
      await handleMutationError(err);
    } finally {
      setIsLoading(false);
    }
  }, [toast, fetchHeldOrderCount, handleMutationError]);

  const recallOrder = useCallback(
    async (orderId: string): Promise<void> => {
      setIsLoading(true);
      try {
        await apiFetch(`/api/v1/orders/${orderId}/recall`, {
          method: 'POST',
          headers: locationHeaders,
          body: JSON.stringify({ clientRequestId: crypto.randomUUID() }),
        });
        const order = await fetchOrder(orderId);
        setCurrentOrder(order);
        await fetchHeldOrderCount();
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Failed to recall order');
        toast.error(e.message);
      } finally {
        setIsLoading(false);
      }
    },
    [fetchOrder, toast, fetchHeldOrderCount],
  );

  const clearOrder = useCallback((): void => {
    // Cancel any pending batch timer so queued items from the prior order
    // don't flush into the next order
    if (batch.batchTimerRef.current) {
      clearTimeout(batch.batchTimerRef.current);
      batch.batchTimerRef.current = null;
    }
    batch.batchQueue.current = [];

    // Clear promise refs so the next order starts with a clean slate
    openOrderPromise.current = null;
    placingPromise.current = null;
    pendingAddItems.current = [];

    setCurrentOrder(null);
  }, []);

  // ── Ensure Order Ready ────────────────────────────────────────
  // Waits for in-flight order creation and pending batch items to settle.

  const ensureOrderReady = useCallback(async (): Promise<Order> => {
    let order = orderRef.current;

    // Wait for openOrder to finish if we still have a placeholder (id === '')
    if (order && !order.id && openOrderPromise.current) {
      const created = await openOrderPromise.current;
      order = (orderRef.current?.id ? orderRef.current : null) ?? created;
    }

    // Flush any queued batch items — this applies whether or not the order
    // already has a server ID.  Previously the `!order.id` guard skipped the
    // flush when the order existed, which caused "Pay Exact" to use a stale
    // pre-tax total when the batch response hadn't arrived yet.
    if (batch.batchQueue.current.length > 0) {
      if (batch.batchTimerRef.current) {
        clearTimeout(batch.batchTimerRef.current);
        batch.batchTimerRef.current = null;
      }
      await batch.flushBatch();
      order = orderRef.current;
    }

    // Wait for any in-flight addItem/batch promises
    if (pendingAddItems.current.length > 0) {
      await Promise.allSettled(pendingAddItems.current);
      order = orderRef.current;
    }

    if (!order || !order.id) {
      throw new Error('Order creation failed');
    }
    return order;
  }, [batch.flushBatch]);

  return {
    // State
    currentOrder,
    isLoading,
    isCreatingOrder,
    heldOrderCount,

    // Line Items
    openOrder,
    addItem: batch.addItem,
    removeItem: api.removeItem,
    replaceLineItem: api.replaceLineItem,
    updateLineNote: api.updateLineNote,

    // Charges & Discounts
    addServiceCharge: api.addServiceCharge,
    removeServiceCharge: api.removeServiceCharge,
    applyDiscount: api.applyDiscount,

    // Customer
    attachCustomer: api.attachCustomer,
    detachCustomer: api.detachCustomer,

    // Tenders
    recordTender,

    // Tax
    setTaxExempt: api.setTaxExempt,

    // Order Lifecycle
    placeOrder,
    voidOrder,
    holdOrder,
    recallOrder,
    clearOrder,
    ensureOrderReady,

    // Tab support
    setOrder: setCurrentOrder,
    fetchOrder,
  };
}
