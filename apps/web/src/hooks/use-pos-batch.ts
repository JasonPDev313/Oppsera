'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { Order, OrderLine, AddLineItemInput } from '@/types/pos';

// ── Constants ────────────────────────────────────────────────────────

export const BATCH_DEBOUNCE_MS = 50;
export const BATCH_MAX_SIZE = 20;

// ── Types ────────────────────────────────────────────────────────────

export interface BatchItem {
  input: AddLineItemInput;
  tempId: string;
  reqId: string;
}

export interface POSBatchDeps {
  orderRef: React.MutableRefObject<Order | null>;
  setCurrentOrder: React.Dispatch<React.SetStateAction<Order | null>>;
  openOrder: () => Promise<Order>;
  openOrderPromise: React.MutableRefObject<Promise<Order> | null>;
  pendingAddItems: React.MutableRefObject<Promise<void>[]>;
  handleMutationError: (err: unknown) => Promise<void>;
  locationHeaders: Record<string, string>;
  toast: { error: (msg: string) => void };
  locationId: string;
  terminalId: string;
  userId: string | undefined;
  onItemNotFoundRef: React.MutableRefObject<(() => void) | undefined>;
}

export interface POSBatchResult {
  addItem: (input: AddLineItemInput) => void;
  flushBatch: () => Promise<void>;
  /** Drains ALL pending items — waits for in-flight flush, then flushes remaining. */
  drainBatch: () => Promise<void>;
  batchQueue: React.MutableRefObject<BatchItem[]>;
  batchTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  /** Increment to ignore batch responses from a prior order after clearOrder. */
  orderGeneration: React.MutableRefObject<number>;
  /** Number of items added but not yet confirmed by the server. Drives Pay button guard. */
  pendingItemCount: number;
  /** Reset pending count to 0 (called by clearOrder). */
  resetPendingCount: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────

function todayBusinessDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function rollBackTempLines(
  setCurrentOrder: React.Dispatch<React.SetStateAction<Order | null>>,
  tempIds: string[],
): void {
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
}

// ── Hook ─────────────────────────────────────────────────────────────

export function usePOSBatch(deps: POSBatchDeps): POSBatchResult {
  // Stable ref for latest deps — avoids re-creating callbacks on every render
  const d = useRef(deps);
  d.current = deps;

  const batchQueue = useRef<BatchItem[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFlushing = useRef(false);
  const flushingPromise = useRef<Promise<void> | null>(null);
  const orderGeneration = useRef(0);

  // Reactive count of items that have been added but not yet confirmed by the server.
  // Drives the Pay button disabled state — prevents payment while items are in-flight.
  const [pendingItemCount, setPendingItemCount] = useState(0);
  const resetPendingCount = useCallback(() => setPendingItemCount(0), []);

  // Clean up batch timer on unmount
  useEffect(() => {
    return () => {
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }
    };
  }, []);

  // ── Flush Batch ─────────────────────────────────────────────────
  // Sends all queued items to the batch endpoint in a single API call.

  const flushBatch = useCallback(async () => {
    if (isFlushing.current) return;

    const items = batchQueue.current;
    batchQueue.current = [];
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    if (items.length === 0) return;

    // Capture generation so we can skip stale responses after clearOrder
    const gen = orderGeneration.current;

    isFlushing.current = true;

    const doFlush = async () => {
      try {
        // Ensure order exists (deduplicated for rapid taps)
        let order = d.current.orderRef.current;
        if (!order || !order.id) {
          if (!d.current.openOrderPromise.current) {
            d.current.openOrderPromise.current = d.current.openOrder().finally(() => {
              d.current.openOrderPromise.current = null;
            });
          }
          try {
            order = await d.current.openOrderPromise.current;
          } catch {
            rollBackTempLines(d.current.setCurrentOrder, items.map((i) => i.tempId));
            setPendingItemCount((c) => Math.max(0, c - items.length));
            d.current.toast.error('Failed to create order. Tap an item to retry.');
            return;
          }
        }

        if (!order || !order.id) {
          rollBackTempLines(d.current.setCurrentOrder, items.map((i) => i.tempId));
          setPendingItemCount((c) => Math.max(0, c - items.length));
          d.current.toast.error('Failed to create order. Tap an item to retry.');
          return;
        }

        // If order was cleared (generation changed), roll back and skip
        if (orderGeneration.current !== gen) {
          rollBackTempLines(d.current.setCurrentOrder, items.map((i) => i.tempId));
          return;
        }

        const tempIds = items.map((i) => i.tempId);

        const serverCall = apiFetch<{ data: { order: Order; lines: OrderLine[] } }>(
          `/api/v1/orders/${order.id}/lines/batch`,
          {
            method: 'POST',
            headers: d.current.locationHeaders,
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
        d.current.pendingAddItems.current.push(tracked);
        tracked.catch(() => {}).finally(() => {
          d.current.pendingAddItems.current = d.current.pendingAddItems.current.filter((p) => p !== tracked);
        });

        try {
          const res = await serverCall;

          // If order was cleared while the API call was in-flight, discard the response
          if (orderGeneration.current !== gen) return;

          const updatedOrder = res.data.order;
          const newLines = res.data.lines as OrderLine[];

          // Replace all temp lines from this batch with real server lines
          d.current.setCurrentOrder((prev) => {
            if (!prev) return prev; // Order was cleared — don't resurrect
            const existing = prev.lines ?? [];
            const withoutTemps = existing.filter((l) => !tempIds.includes(l.id));
            const newLineIds = new Set(newLines.map((nl) => nl.id));
            const merged = [...withoutTemps.filter((l) => !newLineIds.has(l.id)), ...newLines];

            if (typeof updatedOrder.version === 'number' && prev.version > updatedOrder.version) {
              return { ...prev, lines: merged };
            }

            return {
              ...updatedOrder,
              lines: merged,
              charges: prev.charges ?? [],
              discounts: prev.discounts ?? [],
            };
          });

          // Items confirmed by server — decrement pending count
          if (orderGeneration.current === gen) {
            setPendingItemCount((c) => Math.max(0, c - items.length));
          }
        } catch (err) {
          // If order was cleared, just silently drop — don't roll back or show error
          if (orderGeneration.current !== gen) return;

          rollBackTempLines(d.current.setCurrentOrder, tempIds);

          // Items failed — decrement pending count so Pay can re-enable
          if (orderGeneration.current === gen) {
            setPendingItemCount((c) => Math.max(0, c - items.length));
          }

          if (err instanceof ApiError && err.statusCode === 404) {
            d.current.onItemNotFoundRef.current?.();
          }

          try {
            await d.current.handleMutationError(err);
          } catch {
            // Already shown via toast — swallow so subsequent batches can retry
          }
        }
      } finally {
        isFlushing.current = false;
        flushingPromise.current = null;

        // If items accumulated while we were flushing, flush them immediately
        // (no debounce delay — they've already been waiting)
        if (batchQueue.current.length > 0 && orderGeneration.current === gen) {
          void flushBatch();
        }
      }
    };

    flushingPromise.current = doFlush();
    return flushingPromise.current;
  }, []);

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
        d.current.setCurrentOrder((prev) => {
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
            locationId: d.current.locationId,
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
            terminalId: d.current.terminalId,
            employeeId: d.current.userId ?? null,
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
      if (!d.current.orderRef.current?.id && !d.current.openOrderPromise.current) {
        d.current.openOrderPromise.current = d.current.openOrder().finally(() => {
          d.current.openOrderPromise.current = null;
        });
      }

      // ── Push to batch queue (no API call yet) ─────────────────────
      batchQueue.current.push({ input, tempId, reqId: crypto.randomUUID() });
      setPendingItemCount((c) => c + 1);

      // If a flush is already in-flight, don't start another
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
    [flushBatch],
  );

  // ── Drain Batch ──────────────────────────────────────────────
  // Waits for any in-flight flush AND then flushes remaining items.
  // Called by ensureOrderReady before payment to guarantee all items
  // are on the server.

  const drainBatch = useCallback(async () => {
    // Cancel any pending debounce timer — we'll flush everything now
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }

    // Wait for the in-flight flush to complete first
    if (flushingPromise.current) {
      await flushingPromise.current;
    }

    // The in-flight flush's finally block may have already started flushing
    // the remaining items. Wait for that too if needed.
    while (batchQueue.current.length > 0 || flushingPromise.current) {
      if (flushingPromise.current) {
        await flushingPromise.current;
      }
      if (batchQueue.current.length > 0 && !isFlushing.current) {
        await flushBatch();
      }
    }

    // Finally, wait for all tracked API promises to settle
    if (d.current.pendingAddItems.current.length > 0) {
      await Promise.allSettled(d.current.pendingAddItems.current);
    }
  }, [flushBatch]);

  return { addItem, flushBatch, drainBatch, batchQueue, batchTimerRef, orderGeneration, pendingItemCount, resetPendingCount };
}
