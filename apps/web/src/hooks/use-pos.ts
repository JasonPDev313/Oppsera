'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { useAuthContext } from '@/components/auth-provider';
import type { POSConfig, Order, OrderLine, AddLineItemInput, RecordTenderResult } from '@/types/pos';

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

  // Location header for all POS API calls
  const locationHeaders = useMemo(() => ({ 'X-Location-Id': config.locationId }), [config.locationId]);

  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [heldOrderCount, setHeldOrderCount] = useState(0);

  // Keep a ref to the current order so callbacks always see the latest
  const orderRef = useRef<Order | null>(null);
  orderRef.current = currentOrder;

  // Track in-flight addItem calls so placeOrder can await them
  const pendingAddItems = useRef<Promise<void>[]>([]);

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
      // Use the data length + hasMore as an approximation; for exact count we'd need a count endpoint
      setHeldOrderCount(res.data.length + (res.meta.hasMore ? 1 : 0));
    } catch {
      // Non-critical — silently ignore
    }
  }, [config.locationId]);

  // Refresh held count on mount only (hold/recall call fetchHeldOrderCount explicitly)
  useEffect(() => {
    fetchHeldOrderCount();
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
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: Order }>('/api/v1/orders', {
        method: 'POST',
        headers: locationHeaders,
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
      try {
        // Auto-open order if none exists (this is the only blocking step)
        let order = orderRef.current;
        if (!order) {
          order = await openOrder();
        }

        // ── Optimistic update: show item in cart immediately ──────────
        const display = input._display;
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        if (display) {
          const modifierAdj = (input.modifiers ?? []).reduce((sum, m) => sum + m.priceAdjustment, 0);
          const unitPrice = input.priceOverride?.unitPrice ?? display.unitPrice + modifierAdj;
          const lineSubtotal = Math.round(input.qty * unitPrice);
          const tempLine: OrderLine = {
            id: tempId,
            catalogItemId: input.catalogItemId,
            catalogItemName: display.name,
            catalogItemSku: display.sku ?? null,
            itemType: display.itemType,
            qty: input.qty,
            unitPrice,
            originalUnitPrice: input.priceOverride ? display.unitPrice : null,
            priceOverrideReason: input.priceOverride?.reason ?? null,
            lineSubtotal,
            lineTax: 0,
            lineTotal: lineSubtotal,
            modifiers: input.modifiers ?? null,
            specialInstructions: input.specialInstructions ?? null,
            selectedOptions: input.selectedOptions ?? null,
            packageComponents: null,
            notes: input.specialInstructions ?? null,
            sortOrder: 0,
            taxCalculationMode: 'inclusive',
          };
          setCurrentOrder((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              lines: [...(prev.lines ?? []), tempLine],
              subtotal: prev.subtotal + lineSubtotal,
              total: prev.total + lineSubtotal,
            };
          });
        }

        // ── Server call (background) ─────────────────────────────────
        const reqId = clientRequestId();
        const serverCall = apiFetch<{ data: { order: Order; line: OrderLine } }>(
          `/api/v1/orders/${order.id}/lines`,
          {
            method: 'POST',
            headers: locationHeaders,
            body: JSON.stringify({
              catalogItemId: input.catalogItemId,
              qty: input.qty,
              modifiers: input.modifiers ?? undefined,
              specialInstructions: input.specialInstructions ?? undefined,
              selectedOptions: input.selectedOptions ?? undefined,
              priceOverride: input.priceOverride ?? undefined,
              notes: input.notes ?? undefined,
              clientRequestId: reqId,
            }),
          },
        );

        // Track this in-flight call so placeOrder can wait for it
        const tracked = serverCall.then(() => {}).catch(() => {});
        pendingAddItems.current.push(tracked);
        tracked.finally(() => {
          pendingAddItems.current = pendingAddItems.current.filter((p) => p !== tracked);
        });

        const res = await serverCall;

        // ── Replace optimistic line with real data ───────────────────
        const updatedOrder = res.data.order;
        const newLine = res.data.line;
        setCurrentOrder((prev) => {
          const existing = prev?.lines ?? [];
          return {
            ...updatedOrder,
            lines: [...existing.filter((l) => l.id !== tempId && l.id !== newLine.id), newLine],
            charges: prev?.charges ?? [],
            discounts: prev?.discounts ?? [],
          };
        });
      } catch (err) {
        // ── Rollback optimistic line on error ────────────────────────
        setCurrentOrder((prev) => {
          if (!prev) return prev;
          const rolledBack = (prev.lines ?? []).filter((l) => !l.id.startsWith('temp-'));
          const removedSubtotal = (prev.lines ?? [])
            .filter((l) => l.id.startsWith('temp-'))
            .reduce((sum, l) => sum + l.lineSubtotal, 0);
          return {
            ...prev,
            lines: rolledBack,
            subtotal: prev.subtotal - removedSubtotal,
            total: prev.total - removedSubtotal,
          };
        });
        await handleMutationError(err);
      }
    },
    [openOrder, handleMutationError],
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
          headers: locationHeaders,
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
          headers: locationHeaders,
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
          headers: locationHeaders,
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
          headers: locationHeaders,
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
      // Auto-open an order if none exists (so customer can be attached before adding items)
      let order = orderRef.current;
      if (!order) {
        order = await openOrder();
      }
      setIsLoading(true);
      try {
        await apiFetch(`/api/v1/orders/${order.id}`, {
          method: 'PATCH',
          headers: locationHeaders,
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
    [openOrder, fetchOrder, handleMutationError],
  );

  const detachCustomer = useCallback(async (): Promise<void> => {
    const order = orderRef.current;
    if (!order) return;
    setIsLoading(true);
    try {
      await apiFetch(`/api/v1/orders/${order.id}`, {
        method: 'PATCH',
        headers: locationHeaders,
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

    // Wait for any in-flight addItem calls to complete before placing
    if (pendingAddItems.current.length > 0) {
      await Promise.all(pendingAddItems.current);
    }

    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: { version: number; placedAt: string } }>(`/api/v1/orders/${order.id}/place`, {
        method: 'POST',
        headers: locationHeaders,
        body: JSON.stringify({ clientRequestId: clientRequestId() }),
      });
      // Use the correct post-increment version from the API response
      const placed: Order = {
        ...order,
        status: 'placed',
        version: res.data.version ?? (order.version ?? 0) + 1,
        placedAt: res.data.placedAt ?? new Date().toISOString(),
      };
      setCurrentOrder(placed);
      return placed;
    } catch (err) {
      await handleMutationError(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [toast, handleMutationError]);

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
            headers: locationHeaders,
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
          headers: locationHeaders,
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
    setIsLoading(true);
    try {
      await apiFetch(`/api/v1/orders/${order.id}/hold`, {
        method: 'POST',
        headers: locationHeaders,
        body: JSON.stringify({ clientRequestId: clientRequestId() }),
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
          body: JSON.stringify({ clientRequestId: clientRequestId() }),
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

  // ── Tax Exempt ─────────────────────────────────────────────────

  const setTaxExempt = useCallback(
    async (taxExempt: boolean, taxExemptReason?: string | null): Promise<void> => {
      const order = orderRef.current;
      if (!order) return;
      setIsLoading(true);
      try {
        const res = await apiFetch<{ data: Order }>(
          `/api/v1/orders/${order.id}/tax-exempt`,
          {
            method: 'POST',
            headers: locationHeaders,
            body: JSON.stringify({
              taxExempt,
              taxExemptReason: taxExemptReason ?? null,
              clientRequestId: clientRequestId(),
            }),
          },
        );
        // Refresh order to get recalculated totals
        const refreshed = await fetchOrder(order.id);
        setCurrentOrder(refreshed);
        toast.info(taxExempt ? 'Tax exempt applied' : 'Tax exempt removed');
      } catch (err) {
        await handleMutationError(err);
      } finally {
        setIsLoading(false);
      }
    },
    [fetchOrder, toast, handleMutationError],
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

    // Tax
    setTaxExempt,

    // Order Lifecycle
    placeOrder,
    voidOrder,
    holdOrder,
    recallOrder,
    clearOrder,

    // Tab support
    setOrder: setCurrentOrder,
    fetchOrder,
  };
}
