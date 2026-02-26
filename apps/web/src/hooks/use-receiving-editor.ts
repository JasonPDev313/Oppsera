'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { apiFetch } from '@/lib/api-client';
import {
  computeGrid,
  type AllocationMethod,
  type FreightMode,
  type GridLineInput,
  type GridResult,
} from '@/lib/receiving-calc';
import type { Receipt, ReceiptCharge, ReceivingItemSearchResult } from '@/types/receiving';

// ── Types ──────────────────────────────────────────────────────────

export interface UseReceivingEditorReturn {
  /** Local receipt state (source of truth for display). */
  receipt: Receipt | null;
  isLoading: boolean;
  error: string | null;

  /** Computed grid data: lines with all derived columns + totals. */
  gridData: GridResult;

  /** Whether any line has unsaved changes. */
  isDirty: boolean;

  // ── Line editing ──────────────────────────────────────────────
  /** Update a line's qty or unitCost. Instantly updates computed columns, debounces server save. */
  updateLine: (lineId: string, field: 'quantityReceived' | 'unitCost', value: number) => void;

  // ── Line CRUD ─────────────────────────────────────────────────
  /** Add an item from search results. Returns the new line ID for focus. */
  addItem: (item: ReceivingItemSearchResult) => Promise<string | null>;
  /** Remove a line. Optimistic delete. */
  removeLine: (lineId: string) => Promise<void>;
  /** ID of line currently being removed (for loading state). */
  removingLineId: string | null;

  // ── Header editing ────────────────────────────────────────────
  /** Update a header field. Debounced save to server. */
  updateHeader: (field: string, value: unknown) => void;

  // ── Charge management ────────────────────────────────────────
  addCharge: (charge: { chargeType?: string; description?: string; amount: number; glAccountCode?: string; glAccountName?: string }) => Promise<void>;
  updateCharge: (chargeId: string, updates: Partial<ReceiptCharge>) => Promise<void>;
  removeCharge: (chargeId: string) => Promise<void>;

  // ── Actions ───────────────────────────────────────────────────
  postReceipt: () => Promise<boolean>;
  voidReceipt: (reason: string) => Promise<boolean>;
  isPosting: boolean;
  isVoiding: boolean;

  /** Flush all pending debounced saves immediately. Returns when saves complete. */
  flushPendingSaves: () => Promise<void>;

  /** Refetch from server (e.g., after navigating back). Replaces local state. */
  refetch: () => Promise<void>;
}

const DEBOUNCE_MS = 500;

// ── Hook ───────────────────────────────────────────────────────────

export function useReceivingEditor(receiptId: string): UseReceivingEditorReturn {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingLineId, setRemovingLineId] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);

  // Track pending per-line saves (batched changes within debounce window)
  const pendingLineChanges = useRef<Map<string, Record<string, number>>>(new Map());
  const lineTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Track pending header saves
  const pendingHeaderChanges = useRef<Record<string, unknown>>({});
  const headerTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Store conversion factors per line (derived on load, stable across edits)
  const conversionFactors = useRef<Map<string, number>>(new Map());

  // Track in-flight save promises for flushPendingSaves
  const inFlightSaves = useRef<Set<Promise<void>>>(new Set());

  // ── Initial fetch ─────────────────────────────────────────────

  const applyReceiptData = useCallback((data: Receipt) => {
    setReceipt(data);
    // Compute and cache conversion factors for each line
    for (const line of data.lines) {
      if (!conversionFactors.current.has(line.id)) {
        const factor =
          line.quantityReceived > 0
            ? line.baseQty / line.quantityReceived
            : 1;
        conversionFactors.current.set(line.id, factor);
      }
    }
  }, []);

  const fetchReceipt = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: Receipt }>(
        `/api/v1/inventory/receiving/${receiptId}`,
      );
      applyReceiptData(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load receipt');
    } finally {
      setIsLoading(false);
    }
  }, [receiptId, applyReceiptData]);

  /** Silent refetch — updates data without triggering the full-page loading spinner. */
  const reconcile = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: Receipt }>(
        `/api/v1/inventory/receiving/${receiptId}`,
      );
      applyReceiptData(res.data);
    } catch {
      // Silent — costPreview will hydrate on next interaction
    }
  }, [receiptId, applyReceiptData]);

  useEffect(() => {
    fetchReceipt();
    return () => {
      // Cleanup timers on unmount
      for (const timer of lineTimers.current.values()) clearTimeout(timer);
      if (headerTimer.current) clearTimeout(headerTimer.current);
    };
  }, [fetchReceipt]);

  // ── Computed grid data ────────────────────────────────────────

  const gridData: GridResult = useMemo(() => {
    if (!receipt || receipt.lines.length === 0) {
      return {
        lines: [],
        totals: { totalQtyReceived: 0, productCostTotal: 0, shippingTotal: receipt?.shippingCost ?? 0, invoiceTotal: receipt?.shippingCost ?? 0 },
      };
    }

    const gridLines: GridLineInput[] = receipt.lines.map((l) => ({
      id: l.id,
      itemName: l.itemName,
      itemSku: l.itemSku,
      quantityReceived: l.quantityReceived,
      unitCost: l.unitCost,
      weight: l.weight,
      volume: l.volume ?? null,
      conversionFactor: conversionFactors.current.get(l.id) ?? 1,
      currentOnHand: l.costPreview?.currentOnHand ?? 0,
      currentUnitCost: l.costPreview?.currentCost ?? 0,
    }));

    return computeGrid(
      gridLines,
      receipt.shippingCost,
      (receipt.shippingAllocationMethod as AllocationMethod) ?? 'none',
      (receipt.freightMode as FreightMode) ?? 'allocate',
    );
  }, [receipt]);

  // ── isDirty ───────────────────────────────────────────────────

  const isDirty = useMemo(() => {
    return pendingLineChanges.current.size > 0 || Object.keys(pendingHeaderChanges.current).length > 0;
  }, [receipt]); // re-evaluated when receipt changes (state updates)

  // ── Line editing ──────────────────────────────────────────────

  const updateLine = useCallback(
    (lineId: string, field: 'quantityReceived' | 'unitCost', value: number) => {
      // Update local state immediately
      setReceipt((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lines: prev.lines.map((l) =>
            l.id === lineId ? { ...l, [field]: value } : l,
          ),
        };
      });

      // Accumulate pending changes for this line
      const existing = pendingLineChanges.current.get(lineId) ?? {};
      pendingLineChanges.current.set(lineId, { ...existing, [field]: value });

      // Reset debounce timer for this line
      const existingTimer = lineTimers.current.get(lineId);
      if (existingTimer) clearTimeout(existingTimer);

      lineTimers.current.set(
        lineId,
        setTimeout(() => {
          const changes = pendingLineChanges.current.get(lineId);
          if (!changes) return;
          pendingLineChanges.current.delete(lineId);
          lineTimers.current.delete(lineId);

          const savePromise = apiFetch(
            `/api/v1/inventory/receiving/${receiptId}/lines/${lineId}`,
            { method: 'PATCH', body: JSON.stringify(changes) },
          )
            .then(() => {
              // Save succeeded — server state matches local state
            })
            .catch(() => {
              // Non-critical: toast would be nice but we don't want to disrupt editing.
              // The user can see the value they entered; it'll be re-saved on next edit
              // or validated on post.
            })
            .finally(() => {
              inFlightSaves.current.delete(savePromise);
            });

          inFlightSaves.current.add(savePromise);
        }, DEBOUNCE_MS),
      );
    },
    [receiptId],
  );

  // ── Header editing ────────────────────────────────────────────

  const updateHeader = useCallback(
    (field: string, value: unknown) => {
      // Update local state immediately
      setReceipt((prev) => {
        if (!prev) return prev;
        return { ...prev, [field]: value };
      });

      // Accumulate pending header changes
      pendingHeaderChanges.current = { ...pendingHeaderChanges.current, [field]: value };

      // Reset debounce timer
      if (headerTimer.current) clearTimeout(headerTimer.current);
      headerTimer.current = setTimeout(() => {
        const changes = { ...pendingHeaderChanges.current };
        pendingHeaderChanges.current = {};

        const savePromise = apiFetch(
          `/api/v1/inventory/receiving/${receiptId}`,
          { method: 'PATCH', body: JSON.stringify(changes) },
        )
          .catch(() => {
            // Silent fail — will be validated on post
          })
          .finally(() => {
            inFlightSaves.current.delete(savePromise as Promise<void>);
          });

        inFlightSaves.current.add(savePromise as Promise<void>);
      }, DEBOUNCE_MS);
    },
    [receiptId],
  );

  // ── Add item (optimistic) ────────────────────────────────────

  const addItem = useCallback(
    async (item: ReceivingItemSearchResult): Promise<string | null> => {
      if (!receipt) return null;

      // Generate a temporary optimistic ID (will be replaced by server ID)
      const optimisticId = `_opt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const unitCost = item.vendorCost ?? item.currentCost ?? 0;

      // Build an optimistic line that matches ReceiptLine shape
      const optimisticLine = {
        id: optimisticId,
        inventoryItemId: item.inventoryItemId ?? item.catalogItemId,
        itemName: item.name,
        itemSku: item.sku,
        vendorItemId: null,
        quantityReceived: 1,
        uomCode: item.baseUnit,
        unitCost,
        extendedCost: unitCost,
        allocatedShipping: 0,
        landedCost: unitCost,
        landedUnitCost: unitCost,
        baseQty: 1,
        weight: null,
        volume: null,
        lotNumber: null,
        serialNumbers: null,
        expirationDate: null,
        sortOrder: (receipt.lines.length + 1) * 10,
        notes: null,
        costPreview: null,
      };

      // Optimistic insert — line appears instantly
      const previousReceipt = receipt;
      setReceipt((prev) => {
        if (!prev) return prev;
        return { ...prev, lines: [...prev.lines, optimisticLine] };
      });

      // Set conversion factor for the optimistic line
      conversionFactors.current.set(optimisticId, 1);

      try {
        const res = await apiFetch<{ data: { id: string } }>(
          `/api/v1/inventory/receiving/${receiptId}/lines`,
          {
            method: 'POST',
            body: JSON.stringify({
              inventoryItemId: item.inventoryItemId ?? undefined,
              catalogItemId: item.catalogItemId,
              quantityReceived: 1,
              uomCode: item.baseUnit,
              unitCost,
            }),
          },
        );

        const serverId = res.data?.id;
        if (!serverId) {
          // Rollback optimistic insert if no server ID returned
          setReceipt(previousReceipt);
          conversionFactors.current.delete(optimisticId);
          return null;
        }

        // Replace optimistic ID with real server ID in local state.
        // This avoids a full refetch — the line is already visible.
        conversionFactors.current.set(serverId, 1);
        conversionFactors.current.delete(optimisticId);

        setReceipt((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            lines: prev.lines.map((l) =>
              l.id === optimisticId ? { ...l, id: serverId } : l,
            ),
          };
        });

        // Background: silently reconcile server-computed fields (costPreview, etc.)
        // Uses reconcile() instead of fetchReceipt() to avoid setting isLoading=true,
        // which would replace the entire page with a spinner.
        reconcile();

        return serverId;
      } catch {
        // Rollback optimistic insert on error
        setReceipt(previousReceipt);
        conversionFactors.current.delete(optimisticId);
        return null;
      }
    },
    [receiptId, receipt, reconcile],
  );

  // ── Remove line ───────────────────────────────────────────────

  const removeLine = useCallback(
    async (lineId: string) => {
      // Cancel any pending save for this line
      const timer = lineTimers.current.get(lineId);
      if (timer) clearTimeout(timer);
      lineTimers.current.delete(lineId);
      pendingLineChanges.current.delete(lineId);
      conversionFactors.current.delete(lineId);

      // Optimistic removal
      setRemovingLineId(lineId);
      const previousReceipt = receipt;
      setReceipt((prev) => {
        if (!prev) return prev;
        return { ...prev, lines: prev.lines.filter((l) => l.id !== lineId) };
      });

      try {
        await apiFetch(
          `/api/v1/inventory/receiving/${receiptId}/lines/${lineId}`,
          { method: 'DELETE' },
        );
      } catch {
        // Rollback optimistic removal
        if (previousReceipt) setReceipt(previousReceipt);
      } finally {
        setRemovingLineId(null);
      }
    },
    [receiptId, receipt],
  );

  // ── Charge management ────────────────────────────────────────

  const addCharge = useCallback(
    async (charge: { chargeType?: string; description?: string; amount: number; glAccountCode?: string; glAccountName?: string }) => {
      try {
        await apiFetch(`/api/v1/inventory/receiving/${receiptId}/charges`, {
          method: 'POST',
          body: JSON.stringify(charge),
        });
        await reconcile();
      } catch {
        // Silent — will reconcile on next load
      }
    },
    [receiptId, reconcile],
  );

  const updateCharge = useCallback(
    async (chargeId: string, updates: Partial<ReceiptCharge>) => {
      try {
        await apiFetch(
          `/api/v1/inventory/receiving/${receiptId}/charges/${chargeId}`,
          { method: 'PATCH', body: JSON.stringify(updates) },
        );
        await reconcile();
      } catch {
        // Silent
      }
    },
    [receiptId, reconcile],
  );

  const removeCharge = useCallback(
    async (chargeId: string) => {
      // Optimistic removal
      setReceipt((prev) => {
        if (!prev) return prev;
        return { ...prev, charges: prev.charges.filter((c) => c.id !== chargeId) };
      });
      try {
        await apiFetch(
          `/api/v1/inventory/receiving/${receiptId}/charges/${chargeId}`,
          { method: 'DELETE' },
        );
        await reconcile();
      } catch {
        await reconcile(); // Restore server state on error
      }
    },
    [receiptId, reconcile],
  );

  // ── Post receipt ──────────────────────────────────────────────

  const postReceipt = useCallback(async (): Promise<boolean> => {
    try {
      setIsPosting(true);
      // Flush all pending saves first
      await flushPendingSavesInner();
      await apiFetch(`/api/v1/inventory/receiving/${receiptId}/post`, {
        method: 'POST',
      });
      await fetchReceipt();
      return true;
    } catch {
      return false;
    } finally {
      setIsPosting(false);
    }
  }, [receiptId, fetchReceipt]);

  // ── Void receipt ──────────────────────────────────────────────

  const voidReceipt = useCallback(
    async (reason: string): Promise<boolean> => {
      try {
        setIsVoiding(true);
        await apiFetch(`/api/v1/inventory/receiving/${receiptId}/void`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        });
        await fetchReceipt();
        return true;
      } catch {
        return false;
      } finally {
        setIsVoiding(false);
      }
    },
    [receiptId, fetchReceipt],
  );

  // ── Flush pending saves ───────────────────────────────────────

  async function flushPendingSavesInner() {
    // Fire all pending line saves immediately
    for (const [lineId, timer] of lineTimers.current.entries()) {
      clearTimeout(timer);
      lineTimers.current.delete(lineId);
      const changes = pendingLineChanges.current.get(lineId);
      if (changes) {
        pendingLineChanges.current.delete(lineId);
        const p = apiFetch(
          `/api/v1/inventory/receiving/${receiptId}/lines/${lineId}`,
          { method: 'PATCH', body: JSON.stringify(changes) },
        )
          .catch(() => {})
          .finally(() => {
            inFlightSaves.current.delete(p as Promise<void>);
          });
        inFlightSaves.current.add(p as Promise<void>);
      }
    }

    // Fire pending header save immediately
    if (headerTimer.current) {
      clearTimeout(headerTimer.current);
      headerTimer.current = undefined;
    }
    if (Object.keys(pendingHeaderChanges.current).length > 0) {
      const changes = { ...pendingHeaderChanges.current };
      pendingHeaderChanges.current = {};
      const p = apiFetch(`/api/v1/inventory/receiving/${receiptId}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      })
        .catch(() => {})
        .finally(() => {
          inFlightSaves.current.delete(p as Promise<void>);
        });
      inFlightSaves.current.add(p as Promise<void>);
    }

    // Wait for all in-flight saves
    await Promise.all(Array.from(inFlightSaves.current));
  }

  const flushPendingSaves = useCallback(async () => {
    await flushPendingSavesInner();
  }, [receiptId]);

  return {
    receipt,
    isLoading,
    error,
    gridData,
    isDirty,
    updateLine,
    addItem,
    removeLine,
    removingLineId,
    updateHeader,
    addCharge,
    updateCharge,
    removeCharge,
    postReceipt,
    voidReceipt,
    isPosting,
    isVoiding,
    flushPendingSaves,
    refetch: fetchReceipt,
  };
}
