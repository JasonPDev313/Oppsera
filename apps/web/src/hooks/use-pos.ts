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

  // ── Batch queue for rapid item adds ──────────────────────────────
  // Instead of firing one API call per click, collect rapid clicks and
  // flush them as a single batch API call. Optimistic UI is unchanged.
  const BATCH_DEBOUNCE_MS = 50;
  const BATCH_MAX_SIZE = 20;

  interface BatchItem {
    input: AddLineItemInput;
    tempId: string;
    reqId: string;
  }
  const batchQueue = useRef<BatchItem[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guard: true while a flushBatch call is in-flight. Prevents concurrent
  // flushes from racing when BATCH_MAX_SIZE triggers an immediate flush
  // while the debounce timer is also pending.
  const isFlushing = useRef(false);

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

  // Clean up batch timer on unmount to prevent stale timer firing after teardown
  useEffect(() => {
    return () => {
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }
    };
  }, []);

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

  // ── Flush Batch (internal) ─────────────────────────────────────
  // Sends all queued items to the batch endpoint in a single API call.

  const flushBatch = useCallback(async () => {
    // Prevent concurrent flushes — if already flushing, the current items
    // stay in the queue and will be picked up by the next flush cycle.
    if (isFlushing.current) return;

    // Atomically snapshot and clear the queue
    const items = batchQueue.current;
    batchQueue.current = [];
    batchTimerRef.current = null;
    if (items.length === 0) return;

    isFlushing.current = true;
    try {
      // Ensure order exists (deduplicated for rapid taps)
      let order = orderRef.current;
      if (!order || !order.id) {
        if (!openOrderPromise.current) {
          openOrderPromise.current = openOrder().finally(() => {
            openOrderPromise.current = null;
          });
        }
        try {
          order = await openOrderPromise.current;
        } catch {
          // openOrder failed — roll back temp lines and bail.
          // Don't re-throw: allow future addItem calls to retry.
          const tempIds = items.map((i) => i.tempId);
          setCurrentOrder((prev) => {
            if (!prev) return prev;
            const rolledBack = (prev.lines ?? []).filter((l) => !tempIds.includes(l.id));
            const removedSubtotal = (prev.lines ?? [])
              .filter((l) => tempIds.includes(l.id))
              .reduce((sum, l) => sum + l.lineSubtotal, 0);
            return {
              ...prev,
              lines: rolledBack,
              subtotal: prev.subtotal - removedSubtotal,
              total: prev.total - removedSubtotal,
            };
          });
          toast.error('Failed to create order. Tap an item to retry.');
          return;
        }
      }

      // Safety: if order is still null after awaiting (shouldn't happen, but guard)
      if (!order || !order.id) {
        const tempIds = items.map((i) => i.tempId);
        setCurrentOrder((prev) => {
          if (!prev) return prev;
          const rolledBack = (prev.lines ?? []).filter((l) => !tempIds.includes(l.id));
          const removedSubtotal = (prev.lines ?? [])
            .filter((l) => tempIds.includes(l.id))
            .reduce((sum, l) => sum + l.lineSubtotal, 0);
          return {
            ...prev,
            lines: rolledBack,
            subtotal: prev.subtotal - removedSubtotal,
            total: prev.total - removedSubtotal,
          };
        });
        toast.error('Failed to create order. Tap an item to retry.');
        return;
      }

      const tempIds = items.map((i) => i.tempId);

      const serverCall = apiFetch<{ data: { order: Order; lines: OrderLine[] } }>(
        `/api/v1/orders/${order.id}/lines/batch`,
        {
          method: 'POST',
          headers: locationHeaders,
          body: JSON.stringify({
            items: items.map((i) => ({
              catalogItemId: i.input.catalogItemId,
              qty: i.input.qty,
              modifiers: i.input.modifiers ?? undefined,
              specialInstructions: i.input.specialInstructions ?? undefined,
              selectedOptions: i.input.selectedOptions ?? undefined,
              priceOverride: i.input.priceOverride ?? undefined,
              notes: i.input.notes ?? undefined,
              clientRequestId: i.reqId,
            })),
          }),
        },
      );

      // Track in pendingAddItems so placeOrder can await it
      const tracked = serverCall.then(() => {});
      pendingAddItems.current.push(tracked);
      tracked.catch(() => {}).finally(() => {
        pendingAddItems.current = pendingAddItems.current.filter((p) => p !== tracked);
      });

      try {
        const res = await serverCall;
        const updatedOrder = res.data.order;
        const newLines = res.data.lines as OrderLine[];

        // Replace all temp lines from this batch with real server lines
        setCurrentOrder((prev) => {
          const existing = prev?.lines ?? [];
          const withoutTemps = existing.filter((l) => !tempIds.includes(l.id));
          const newLineIds = new Set(newLines.map((nl) => nl.id));
          const merged = [...withoutTemps.filter((l) => !newLineIds.has(l.id)), ...newLines];

          // Only apply server totals if this is the latest version
          if (prev && typeof updatedOrder.version === 'number' && prev.version > updatedOrder.version) {
            return { ...prev, lines: merged };
          }

          return {
            ...updatedOrder,
            lines: merged,
            charges: prev?.charges ?? [],
            discounts: prev?.discounts ?? [],
          };
        });
      } catch (err) {
        // Roll back ALL temp lines from this batch
        setCurrentOrder((prev) => {
          if (!prev) return prev;
          const rolledBack = (prev.lines ?? []).filter((l) => !tempIds.includes(l.id));
          const removedSubtotal = (prev.lines ?? [])
            .filter((l) => tempIds.includes(l.id))
            .reduce((sum, l) => sum + l.lineSubtotal, 0);
          return {
            ...prev,
            lines: rolledBack,
            subtotal: prev.subtotal - removedSubtotal,
            total: prev.total - removedSubtotal,
          };
        });

        if (err instanceof ApiError && err.statusCode === 404) {
          onItemNotFoundRef.current?.();
        }

        // Show the error but DON'T re-throw — handleMutationError throws on
        // non-409 errors which would leave flushBatch in a permanently broken
        // state. Swallowing the throw here lets future addItem calls retry.
        try {
          await handleMutationError(err);
        } catch {
          // Already shown via toast — swallow so subsequent batches can retry
        }
      }
    } finally {
      isFlushing.current = false;

      // If items accumulated while we were flushing, schedule another flush
      if (batchQueue.current.length > 0) {
        batchTimerRef.current = setTimeout(() => {
          void flushBatch();
        }, BATCH_DEBOUNCE_MS);
      }
    }
  }, [openOrder, handleMutationError, locationHeaders, toast]);

  // ── Add Line Item ──────────────────────────────────────────────
  // Optimistic UI is instant. Server sync is batched — rapid clicks
  // within 50ms are collected into a single API call.

  const addItem = useCallback(
    (input: AddLineItemInput): void => {
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

      // ── Eagerly start order creation on first item ──────────────────
      // Don't wait for the batch debounce — fire openOrder() now so it runs
      // in parallel with the 50ms collection window. flushBatch() will await
      // the already-in-flight promise instead of starting fresh.
      if (!orderRef.current?.id && !openOrderPromise.current) {
        openOrderPromise.current = openOrder().finally(() => {
          openOrderPromise.current = null;
        });
      }

      // ── Push to batch queue (no API call yet) ─────────────────────
      batchQueue.current.push({ input, tempId, reqId: clientRequestId() });

      // If a flush is already in-flight, don't start another — the finally
      // block in flushBatch will re-schedule when it finishes.
      if (isFlushing.current) return;

      // Flush immediately if queue hits max size
      if (batchQueue.current.length >= BATCH_MAX_SIZE) {
        if (batchTimerRef.current) {
          clearTimeout(batchTimerRef.current);
          batchTimerRef.current = null;
        }
        void flushBatch();
        return;
      }

      // Otherwise, debounce: reset timer so rapid clicks batch together
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
      }
      batchTimerRef.current = setTimeout(() => {
        void flushBatch();
      }, BATCH_DEBOUNCE_MS);
    },
    [flushBatch, config.locationId, config.terminalId, user?.id],
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

  // ── Update Line Note (optimistic, client-side only) ───────────

  const updateLineNote = useCallback(
    (lineId: string, note: string): void => {
      setCurrentOrder((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lines: (prev.lines ?? []).map((l) =>
            l.id === lineId ? { ...l, notes: note || null } : l,
          ),
        };
      });
    },
    [],
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
    async (customerId: string, customerName?: string): Promise<void> => {
      // Auto-open an order if none exists (so customer can be attached before adding items)
      let order = orderRef.current;
      if (!order) {
        order = await openOrder();
      }

      // Optimistic update — UI reflects the attached customer immediately
      setCurrentOrder((prev) => prev ? { ...prev, customerId, customerName: customerName ?? prev.customerName } : prev);

      try {
        const res = await apiFetch<{ data: Order }>(`/api/v1/orders/${order.id}`, {
          method: 'PATCH',
          headers: locationHeaders,
          body: JSON.stringify({
            customerId,
            clientRequestId: clientRequestId(),
          }),
        });
        // Use the PATCH response directly — no need for a second fetchOrder round-trip
        setCurrentOrder(res.data);
      } catch (err) {
        // Revert optimistic update on failure
        setCurrentOrder((prev) => prev ? { ...prev, customerId: null, customerName: null } : prev);
        await handleMutationError(err);
      }
    },
    [openOrder, handleMutationError],
  );

  const detachCustomer = useCallback(async (): Promise<void> => {
    const order = orderRef.current;
    if (!order) return;

    // Optimistic update — UI reflects detachment immediately
    const prevCustomerId = order.customerId;
    const prevCustomerName = order.customerName;
    setCurrentOrder((prev) => prev ? { ...prev, customerId: null, customerName: null } : prev);

    try {
      const res = await apiFetch<{ data: Order }>(`/api/v1/orders/${order.id}`, {
        method: 'PATCH',
        headers: locationHeaders,
        body: JSON.stringify({
          customerId: null,
          clientRequestId: clientRequestId(),
        }),
      });
      // Use the PATCH response directly — no need for a second fetchOrder round-trip
      setCurrentOrder(res.data);
    } catch (err) {
      // Revert optimistic update on failure
      setCurrentOrder((prev) => prev ? { ...prev, customerId: prevCustomerId, customerName: prevCustomerName } : prev);
      await handleMutationError(err);
    }
  }, [handleMutationError]);

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
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
      if (batchQueue.current.length > 0) {
        void flushBatch();
      }
    }

    // Wait for any in-flight addItem calls to settle before placing.
    // Use allSettled so failed addItems (already shown to user) don't block placeOrder.
    if (pendingAddItems.current.length > 0) {
      await Promise.allSettled(pendingAddItems.current);
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
            // fetchOrder failed (network hiccup) but the order IS likely placed.
            // Do NOT fall through to handleMutationError — it would clear the order
            // via setCurrentOrder(null) and undermine the caller's recovery logic.
            // Throw directly so the caller (TenderDialog) can attempt its own recovery.
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
  }, [toast, handleMutationError, flushBatch]);

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
    // Cancel any pending batch timer so queued items from the prior order
    // don't flush into the next order
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    batchQueue.current = [];

    // Clear promise refs so the next order starts with a clean slate
    openOrderPromise.current = null;
    placingPromise.current = null;
    pendingAddItems.current = [];

    setCurrentOrder(null);
  }, []);

  // ── Ensure Order Ready ────────────────────────────────────────
  // Waits for in-flight order creation and pending batch items to settle.
  // Payment flows call this instead of bailing with a toast when order.id
  // is empty (the order is just not created on the server yet).

  const ensureOrderReady = useCallback(async (): Promise<Order> => {
    let order = orderRef.current;

    // Wait for openOrder to finish if we still have a placeholder (id === '')
    if (order && !order.id && openOrderPromise.current) {
      // Use the promise's return value directly — orderRef may not be
      // updated yet since React batches state updates
      const created = await openOrderPromise.current;
      order = (orderRef.current?.id ? orderRef.current : null) ?? created;
    }

    // If openOrder hasn't started yet but there are queued items, flush now
    if (order && !order.id && batchQueue.current.length > 0) {
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }
      await flushBatch();
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
  }, [flushBatch]);

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
    updateLineNote,

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
    ensureOrderReady,

    // Tab support
    setOrder: setCurrentOrder,
    fetchOrder,
  };
}
