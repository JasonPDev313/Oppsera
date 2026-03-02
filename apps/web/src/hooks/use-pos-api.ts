'use client';

import { useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { Order, AddLineItemInput } from '@/types/pos';

// ── Types ────────────────────────────────────────────────────────────

export interface POSApiDeps {
  orderRef: React.MutableRefObject<Order | null>;
  setCurrentOrder: React.Dispatch<React.SetStateAction<Order | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  fetchOrder: (orderId: string) => Promise<Order>;
  handleMutationError: (err: unknown) => Promise<void>;
  locationHeaders: Record<string, string>;
  openOrder: () => Promise<Order>;
  addItem: (input: AddLineItemInput) => void;
  toast: { info: (msg: string) => void };
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Merge a fresh server order with any optimistic temp lines from prev state.
 *  Prevents temp lines (and their contribution to derived subtotal/total) from
 *  being silently dropped when an unrelated mutation refreshes the order. */
function mergeWithTempLines(
  setter: React.Dispatch<React.SetStateAction<Order | null>>,
  refreshed: Order,
): void {
  setter((prev) => {
    const tempLines = (prev?.lines ?? []).filter((l) => l.id.startsWith('temp-'));
    if (tempLines.length === 0) return refreshed;
    return { ...refreshed, lines: [...(refreshed.lines ?? []), ...tempLines] };
  });
}

// ── Hook ─────────────────────────────────────────────────────────────

export function usePOSApi(deps: POSApiDeps) {
  // Stable ref for latest deps — avoids re-creating callbacks on every render
  const d = useRef(deps);
  d.current = deps;

  // ── Remove Line Item ───────────────────────────────────────────

  const removeItem = useCallback(
    async (lineId: string): Promise<void> => {
      const order = d.current.orderRef.current;
      if (!order) return;

      // Temp lines (not yet on server) — remove optimistically, no API call needed
      if (lineId.startsWith('temp-')) {
        d.current.setCurrentOrder((prev) => {
          if (!prev) return prev;
          return { ...prev, lines: (prev.lines ?? []).filter((l) => l.id !== lineId) };
        });
        return;
      }

      d.current.setIsLoading(true);
      try {
        await apiFetch(`/api/v1/orders/${order.id}/lines/${lineId}`, {
          method: 'DELETE',
          headers: d.current.locationHeaders,
          body: JSON.stringify({ clientRequestId: crypto.randomUUID() }),
        });
        const refreshed = await d.current.fetchOrder(order.id);
        mergeWithTempLines(d.current.setCurrentOrder, refreshed);
      } catch (err) {
        await d.current.handleMutationError(err);
      } finally {
        d.current.setIsLoading(false);
      }
    },
    [],
  );

  // ── Update Line Note (optimistic, client-side only) ───────────

  const updateLineNote = useCallback(
    (lineId: string, note: string): void => {
      d.current.setCurrentOrder((prev) => {
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

  // ── Replace Line Item (remove + re-add) ────────────────────────

  const replaceLineItem = useCallback(
    async (lineId: string, newInput: AddLineItemInput): Promise<void> => {
      await removeItem(lineId);
      d.current.addItem(newInput);
    },
    [removeItem],
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
      const order = d.current.orderRef.current;
      if (!order) return;
      d.current.setIsLoading(true);
      try {
        await apiFetch(`/api/v1/orders/${order.id}/charges`, {
          method: 'POST',
          headers: d.current.locationHeaders,
          body: JSON.stringify({
            ...input,
            clientRequestId: crypto.randomUUID(),
          }),
        });
        const refreshed = await d.current.fetchOrder(order.id);
        mergeWithTempLines(d.current.setCurrentOrder, refreshed);
      } catch (err) {
        await d.current.handleMutationError(err);
      } finally {
        d.current.setIsLoading(false);
      }
    },
    [],
  );

  const removeServiceCharge = useCallback(
    async (chargeId: string): Promise<void> => {
      const order = d.current.orderRef.current;
      if (!order) return;
      d.current.setIsLoading(true);
      try {
        await apiFetch(`/api/v1/orders/${order.id}/charges/${chargeId}`, {
          method: 'DELETE',
          headers: d.current.locationHeaders,
          body: JSON.stringify({ clientRequestId: crypto.randomUUID() }),
        });
        const refreshed = await d.current.fetchOrder(order.id);
        mergeWithTempLines(d.current.setCurrentOrder, refreshed);
      } catch (err) {
        await d.current.handleMutationError(err);
      } finally {
        d.current.setIsLoading(false);
      }
    },
    [],
  );

  // ── Discounts ──────────────────────────────────────────────────

  const applyDiscount = useCallback(
    async (type: string, value: number, reason?: string): Promise<void> => {
      const order = d.current.orderRef.current;
      if (!order) return;
      d.current.setIsLoading(true);
      try {
        await apiFetch(`/api/v1/orders/${order.id}/discounts`, {
          method: 'POST',
          headers: d.current.locationHeaders,
          body: JSON.stringify({
            type,
            value,
            reason: reason ?? undefined,
            clientRequestId: crypto.randomUUID(),
          }),
        });
        const refreshed = await d.current.fetchOrder(order.id);
        mergeWithTempLines(d.current.setCurrentOrder, refreshed);
      } catch (err) {
        await d.current.handleMutationError(err);
      } finally {
        d.current.setIsLoading(false);
      }
    },
    [],
  );

  // ── Customer ───────────────────────────────────────────────────

  const attachCustomer = useCallback(
    async (customerId: string, customerName?: string): Promise<void> => {
      // Auto-open an order if none exists
      let order = d.current.orderRef.current;
      if (!order) {
        order = await d.current.openOrder();
      }

      // Optimistic update — appears instant to the user
      d.current.setCurrentOrder((prev) =>
        prev ? { ...prev, customerId, customerName: customerName ?? prev.customerName } : prev,
      );

      // Fire-and-forget server sync — don't block the UI
      // Capture the order ID so we can discard late responses if the user
      // switched tabs before the PATCH completed (fixes tab↔customer desync).
      const patchedOrderId = order.id;
      apiFetch<{ data: Order }>(`/api/v1/orders/${order.id}`, {
        method: 'PATCH',
        headers: d.current.locationHeaders,
        body: JSON.stringify({
          customerId,
          clientRequestId: crypto.randomUUID(),
        }),
      })
        .then((res) => {
          // Only apply server response if user is still viewing this order
          if (d.current.orderRef.current?.id === patchedOrderId) {
            d.current.setCurrentOrder(res.data);
          }
        })
        .catch((err) => {
          // Only revert optimistic update if user is still viewing this order
          if (d.current.orderRef.current?.id === patchedOrderId) {
            d.current.setCurrentOrder((prev) =>
              prev ? { ...prev, customerId: null, customerName: null } : prev,
            );
          }
          d.current.handleMutationError(err).catch(() => {});
        });
    },
    [],
  );

  const detachCustomer = useCallback(async (): Promise<void> => {
    const order = d.current.orderRef.current;
    if (!order) return;

    const prevCustomerId = order.customerId;
    const prevCustomerName = order.customerName;

    // Optimistic update — appears instant to the user
    d.current.setCurrentOrder((prev) =>
      prev ? { ...prev, customerId: null, customerName: null } : prev,
    );

    // Fire-and-forget server sync — don't block the UI
    // Capture the order ID so we can discard late responses if the user
    // switched tabs before the PATCH completed (fixes tab↔customer desync).
    const patchedOrderId = order.id;
    apiFetch<{ data: Order }>(`/api/v1/orders/${order.id}`, {
      method: 'PATCH',
      headers: d.current.locationHeaders,
      body: JSON.stringify({
        customerId: null,
        clientRequestId: crypto.randomUUID(),
      }),
    })
      .then((res) => {
        // Only apply server response if user is still viewing this order
        if (d.current.orderRef.current?.id === patchedOrderId) {
          d.current.setCurrentOrder(res.data);
        }
      })
      .catch((err) => {
        // Only revert optimistic update if user is still viewing this order
        if (d.current.orderRef.current?.id === patchedOrderId) {
          d.current.setCurrentOrder((prev) =>
            prev ? { ...prev, customerId: prevCustomerId, customerName: prevCustomerName } : prev,
          );
        }
        d.current.handleMutationError(err).catch(() => {});
      });
  }, []);

  // ── Tax Exempt ─────────────────────────────────────────────────

  const setTaxExempt = useCallback(
    async (taxExempt: boolean, taxExemptReason?: string | null): Promise<void> => {
      const order = d.current.orderRef.current;
      if (!order) return;
      d.current.setIsLoading(true);
      try {
        await apiFetch<{ data: Order }>(
          `/api/v1/orders/${order.id}/tax-exempt`,
          {
            method: 'POST',
            headers: d.current.locationHeaders,
            body: JSON.stringify({
              taxExempt,
              taxExemptReason: taxExemptReason ?? null,
              clientRequestId: crypto.randomUUID(),
            }),
          },
        );
        const refreshed = await d.current.fetchOrder(order.id);
        mergeWithTempLines(d.current.setCurrentOrder, refreshed);
        d.current.toast.info(taxExempt ? 'Tax exempt applied' : 'Tax exempt removed');
      } catch (err) {
        await d.current.handleMutationError(err);
      } finally {
        d.current.setIsLoading(false);
      }
    },
    [],
  );

  return {
    removeItem,
    updateLineNote,
    replaceLineItem,
    addServiceCharge,
    removeServiceCharge,
    applyDiscount,
    attachCustomer,
    detachCustomer,
    setTaxExempt,
  };
}
