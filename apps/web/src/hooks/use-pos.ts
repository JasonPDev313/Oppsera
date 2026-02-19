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
      // Use the data length + hasMore as an approximation; for exact count we'd need a count endpoint
      setHeldOrderCount(res.data.length + (res.meta.hasMore ? 1 : 0));
    } catch {
      // Non-critical — silently ignore
    }
  }, [config.locationId]);

  // Refresh held count after initial render (deferred so it doesn't block POS load)
  useEffect(() => {
    const id = requestIdleCallback(() => fetchHeldOrderCount());
    return () => cancelIdleCallback(id);
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
          clientRequestId: clientRequestId(),
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

  // ── Add Line Item ──────────────────────────────────────────────

  const addItem = useCallback(
    async (input: AddLineItemInput): Promise<void> => {
      try {
        // ── Optimistic update FIRST — show item in cart immediately ──
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
            if (prev) {
              return {
                ...prev,
                lines: [...(prev.lines ?? []), tempLine],
                subtotal: prev.subtotal + lineSubtotal,
                total: prev.total + lineSubtotal,
              };
            }
            // No order yet — create a placeholder for instant display
            const now = new Date().toISOString();
            return {
              id: '',
              tenantId: '',
              locationId: config.locationId,
              orderNumber: '...',
              status: 'open',
              source: 'pos',
              version: 0,
              subtotal: lineSubtotal,
              taxTotal: 0,
              serviceChargeTotal: 0,
              discountTotal: 0,
              total: lineSubtotal,
              customerId: null,
              businessDate: todayBusinessDate(),
              terminalId: config.terminalId,
              employeeId: user?.id ?? null,
              taxExempt: false,
              taxExemptReason: null,
              notes: null,
              lines: [tempLine],
              charges: [],
              discounts: [],
              createdAt: now,
              updatedAt: now,
              placedAt: null,
              paidAt: null,
              voidedAt: null,
              voidReason: null,
            };
          });
        }

        // Auto-open order if none exists (deduplicated for rapid taps)
        let order = orderRef.current;
        if (!order || !order.id) {
          if (!openOrderPromise.current) {
            openOrderPromise.current = openOrder().finally(() => {
              openOrderPromise.current = null;
            });
          }
          order = await openOrderPromise.current;
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
          const newLines = [...existing.filter((l) => l.id !== tempId && l.id !== newLine.id), newLine];

          // Only apply server totals from newer versions — prevents an out-of-order
          // response (with fewer items) from overwriting a later response's correct totals.
          if (prev && typeof updatedOrder.version === 'number' && prev.version > updatedOrder.version) {
            return { ...prev, lines: newLines };
          }

          return {
            ...updatedOrder,
            lines: newLines,
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

        // Archived/deleted item — trigger catalog refresh to purge stale grid
        if (err instanceof ApiError && err.statusCode === 404) {
          onItemNotFoundRef.current?.();
        }

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

      // Optimistic update — UI reflects the attached customer immediately
      setCurrentOrder((prev) => prev ? { ...prev, customerId } : prev);

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
        // Revert optimistic update on failure
        setCurrentOrder((prev) => prev ? { ...prev, customerId: null, customerName: null } : prev);
        await handleMutationError(err);
      }
    },
    [openOrder, fetchOrder, handleMutationError],
  );

  const detachCustomer = useCallback(async (): Promise<void> => {
    const order = orderRef.current;
    if (!order) return;

    // Optimistic update — UI reflects detachment immediately
    const prevCustomerId = order.customerId;
    const prevCustomerName = order.customerName;
    setCurrentOrder((prev) => prev ? { ...prev, customerId: null, customerName: null } : prev);

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
      // Revert optimistic update on failure
      setCurrentOrder((prev) => prev ? { ...prev, customerId: prevCustomerId, customerName: prevCustomerName } : prev);
      await handleMutationError(err);
    }
  }, [fetchOrder, handleMutationError]);

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

    // Wait for any in-flight addItem calls to complete before placing
    if (pendingAddItems.current.length > 0) {
      await Promise.all(pendingAddItems.current);
      // Re-read after awaiting — addItem may have updated the order
      order = orderRef.current!;
      if (!order || !order.id) throw new Error('Order is still being created');
      if (order.status === 'placed') return order;
    }

    // Capture as const for the closure (TypeScript can't narrow `let` inside async closures)
    const orderToPlace = order;

    const doPlace = async (): Promise<Order> => {
      setIsLoading(true);
      try {
        const res = await apiFetch<{ data: Record<string, unknown> }>(`/api/v1/orders/${orderToPlace.id}/place`, {
          method: 'POST',
          headers: locationHeaders,
          body: JSON.stringify({ clientRequestId: clientRequestId() }),
        });
        // Server returns the full order row with correct financial totals
        // recomputed from DB. Overlay server data on local state, but preserve
        // local lines/charges/discounts arrays (not included in server response).
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
        // fetch the placed order and return it as success — don't clear the POS.
        if (err instanceof ApiError && err.statusCode === 409) {
          try {
            const refreshed = await fetchOrder(orderToPlace.id);
            if (refreshed.status === 'placed') {
              setCurrentOrder(refreshed);
              return refreshed;
            }
          } catch {
            // Fall through to normal error handling
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
      if (!order.id) throw new Error('Order is still being created');
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
        await apiFetch<{ data: Order }>(
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
    isCreatingOrder,
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
