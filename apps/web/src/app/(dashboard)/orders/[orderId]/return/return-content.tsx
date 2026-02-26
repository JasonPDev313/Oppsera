'use client';

import { useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, RotateCcw, ShieldCheck } from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { useOrder } from '@/hooks/use-orders';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import { ManagerPinModal } from '@/components/ui/manager-pin-modal';
import type { OrderLine } from '@/types/pos';

// ── Types ────────────────────────────────────────────────────────

interface ReturnLineState {
  originalLineId: string;
  catalogItemName: string;
  maxQty: number;
  returnQty: number;
  unitPrice: number;
  reason: string;
}

// ── Helpers ──────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  return `$${(Math.abs(cents) / 100).toFixed(2)}`;
}

// ── ReturnLineSelector ──────────────────────────────────────────

function ReturnLineSelector({
  lines,
  onLinesChange,
}: {
  lines: ReturnLineState[];
  onLinesChange: (lines: ReturnLineState[]) => void;
}) {
  const handleQtyChange = (index: number, qty: number) => {
    const updated = [...lines];
    updated[index] = { ...updated[index]!, returnQty: qty };
    onLinesChange(updated);
  };

  const handleReasonChange = (index: number, reason: string) => {
    const updated = [...lines];
    updated[index] = { ...updated[index]!, reason };
    onLinesChange(updated);
  };

  const handleToggle = (index: number) => {
    const updated = [...lines];
    const line = updated[index]!;
    updated[index] = {
      ...line,
      returnQty: line.returnQty > 0 ? 0 : line.maxQty,
    };
    onLinesChange(updated);
  };

  return (
    <div className="space-y-3">
      {lines.map((line, i) => {
        const isSelected = line.returnQty > 0;
        const refundAmount = line.returnQty * line.unitPrice;

        return (
          <div
            key={line.originalLineId}
            className={`rounded-lg border p-4 transition-colors ${
              isSelected
                ? 'border-indigo-500/30 bg-indigo-500/10'
                : 'border-border bg-surface'
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Checkbox */}
              <button
                type="button"
                onClick={() => handleToggle(i)}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-border bg-surface'
                }`}
              >
                {isSelected && (
                  <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>

              {/* Item info */}
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {line.catalogItemName}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatMoney(line.unitPrice)} each
                  </span>
                </div>

                {isSelected && (
                  <div className="mt-3 space-y-2">
                    {/* Qty spinner */}
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-muted-foreground">Qty to return:</label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleQtyChange(i, Math.max(1, line.returnQty - 1))}
                          className="flex h-7 w-7 items-center justify-center rounded border border-border text-sm hover:bg-accent"
                        >
                          -
                        </button>
                        <span className="w-8 text-center text-sm font-medium">
                          {line.returnQty}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleQtyChange(i, Math.min(line.maxQty, line.returnQty + 1))}
                          className="flex h-7 w-7 items-center justify-center rounded border border-border text-sm hover:bg-accent"
                        >
                          +
                        </button>
                        <span className="ml-1 text-xs text-muted-foreground">
                          of {line.maxQty}
                        </span>
                      </div>
                    </div>

                    {/* Reason */}
                    <div>
                      <label className="text-xs text-muted-foreground">Reason:</label>
                      <select
                        value={line.reason}
                        onChange={(e) => handleReasonChange(i, e.target.value)}
                        className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">Select reason...</option>
                        <option value="Defective/damaged">Defective/damaged</option>
                        <option value="Wrong item">Wrong item</option>
                        <option value="Customer changed mind">Customer changed mind</option>
                        <option value="Quality issue">Quality issue</option>
                        <option value="Size/fit issue">Size/fit issue</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    {/* Refund preview */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Line refund:</span>
                      <span className="font-medium text-red-500">
                        -{formatMoney(refundAmount)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Return Page ────────────────────────────────────────────

export default function ReturnContent() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { locations } = useAuthContext();
  const locationId = locations[0]?.id ?? '';
  const orderId = params.orderId as string;

  const { data: order, isLoading } = useOrder(orderId, locationId);

  const [returnLines, setReturnLines] = useState<ReturnLineState[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize return lines from order
  if (order && !isInitialized) {
    const eligibleLines = (order.lines || [])
      .filter((line: OrderLine) => Number(line.qty) > 0 && line.lineTotal > 0)
      .map((line: OrderLine) => ({
        originalLineId: line.id,
        catalogItemName: line.catalogItemName,
        maxQty: Number(line.qty),
        returnQty: 0,
        unitPrice: line.unitPrice,
        reason: '',
      }));
    setReturnLines(eligibleLines);
    setIsInitialized(true);
  }

  // Computed totals
  const selectedLines = useMemo(
    () => returnLines.filter((l) => l.returnQty > 0),
    [returnLines],
  );
  const totalRefund = useMemo(
    () => selectedLines.reduce((sum, l) => sum + l.returnQty * l.unitPrice, 0),
    [selectedLines],
  );
  const allHaveReasons = useMemo(
    () => selectedLines.every((l) => l.reason.length > 0),
    [selectedLines],
  );
  const canSubmit = selectedLines.length > 0 && allHaveReasons && !isSubmitting;

  const handlePinVerify = useCallback(async (_pin: string): Promise<boolean> => {
    setShowPinModal(false);
    setIsSubmitting(true);

    try {
      const clientRequestId = `return-${orderId}-${Date.now()}`;
      const body = {
        clientRequestId,
        returnLines: selectedLines.map((l) => ({
          originalLineId: l.originalLineId,
          qty: l.returnQty,
          reason: l.reason,
        })),
      };

      await apiFetch(`/api/v1/orders/${orderId}/return`, {
        method: 'POST',
        headers: { 'X-Location-Id': locationId },
        body: JSON.stringify(body),
      });

      toast.success('Return processed successfully');
      router.push(`/orders/${orderId}`);
      return true;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to process return');
      toast.error(e.message);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [orderId, locationId, selectedLines, toast, router]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-5 w-48 animate-pulse rounded bg-muted" />
        <div className="space-y-4 rounded-lg border border-border bg-surface p-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  // Order not found or not eligible
  if (!order) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => router.push('/orders')}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Sales History
        </button>
        <div className="py-16 text-center text-sm text-muted-foreground">
          Order not found.
        </div>
      </div>
    );
  }

  if (order.status !== 'paid') {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => router.push(`/orders/${orderId}`)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Order
        </button>
        <div className="py-16 text-center text-sm text-muted-foreground">
          Returns can only be processed for paid orders.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        type="button"
        onClick={() => router.push(`/orders/${orderId}`)}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Order {order.orderNumber}
      </button>

      {/* Header */}
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="flex items-center gap-3">
          <RotateCcw className="h-5 w-5 text-indigo-600" />
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Process Return
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Order {order.orderNumber} &middot; Original total: {formatMoney(order.total)}
            </p>
          </div>
        </div>
      </div>

      {/* Line selector */}
      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Select Items to Return
          </h2>
        </div>
        <div className="p-4">
          <ReturnLineSelector
            lines={returnLines}
            onLinesChange={setReturnLines}
          />
        </div>
      </div>

      {/* Refund summary */}
      {selectedLines.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-muted-foreground">
                {selectedLines.length} item{selectedLines.length !== 1 ? 's' : ''} selected
              </span>
              <span className="mx-2 text-muted-foreground">|</span>
              <span className="text-sm text-muted-foreground">
                {selectedLines.reduce((sum, l) => sum + l.returnQty, 0)} units
              </span>
            </div>
            <div className="text-right">
              <span className="text-sm text-muted-foreground">Total refund: </span>
              <span className="text-lg font-semibold text-red-500">
                -{formatMoney(totalRefund)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Validation messages */}
      {selectedLines.length > 0 && !allHaveReasons && (
        <p className="text-sm text-amber-500">
          Please select a return reason for all selected items.
        </p>
      )}

      {/* Submit button */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setShowPinModal(true)}
          disabled={!canSubmit}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ShieldCheck className="h-4 w-4" />
          {isSubmitting ? 'Processing...' : 'Process Return'}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/orders/${orderId}`)}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Cancel
        </button>
      </div>

      {/* Manager PIN */}
      <ManagerPinModal
        open={showPinModal}
        onClose={() => setShowPinModal(false)}
        onVerify={handlePinVerify}
        title="Authorize Return"
      />
    </div>
  );
}
