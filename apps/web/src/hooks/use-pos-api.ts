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
      d.current.setIsLoading(true);
      try {
        await apiFetch(`/api/v1/orders/${order.id}/lines/${lineId}`, {
          method: 'DELETE',
          headers: d.current.locationHeaders,
          body: JSON.stringify({ clientRequestId: crypto.randomUUID() }),
        });
        const refreshed = await d.current.fetchOrder(order.id);
        d.current.setCurrentOrder(refreshed);
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
        d.current.setCurrentOrder(refreshed);
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
        d.current.setCurrentOrder(refreshed);
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
        d.current.setCurrentOrder(refreshed);
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
      apiFetch<{ data: Order }>(`/api/v1/orders/${order.id}`, {
        method: 'PATCH',
        headers: d.current.locationHeaders,
        body: JSON.stringify({
          customerId,
          clientRequestId: crypto.randomUUID(),
        }),
      })
        .then((res) => d.current.setCurrentOrder(res.data))
        .catch((err) => {
          // Revert optimistic update on failure
          d.current.setCurrentOrder((prev) =>
            prev ? { ...prev, customerId: null, customerName: null } : prev,
          );
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
    apiFetch<{ data: Order }>(`/api/v1/orders/${order.id}`, {
      method: 'PATCH',
      headers: d.current.locationHeaders,
      body: JSON.stringify({
        customerId: null,
        clientRequestId: crypto.randomUUID(),
      }),
    })
      .then((res) => d.current.setCurrentOrder(res.data))
      .catch((err) => {
        // Revert optimistic update on failure
        d.current.setCurrentOrder((prev) =>
          prev ? { ...prev, customerId: prevCustomerId, customerName: prevCustomerName } : prev,
        );
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
        d.current.setCurrentOrder(refreshed);
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
