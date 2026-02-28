'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Mail } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { printReceiptDocument } from '@/lib/receipt-printer';
import { useReceiptBuilder } from '@/hooks/use-receipt-builder';
import { ReceiptPreview } from '@/components/receipts/ReceiptPreview';
import type { Order } from '@/types/pos';
import type { ReceiptVariant } from '@oppsera/shared';

interface ReceiptPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  locationId: string;
  locationName: string;
  /** Specific order to preview. If null, fetches the last order for the terminal. */
  order?: Order | null;
  /** Receipt variant to render */
  variant?: ReceiptVariant;
}

export const ReceiptPreviewDialog = memo(function ReceiptPreviewDialog({
  open,
  onClose,
  locationId,
  locationName,
  order: propOrder,
  variant = 'standard',
}: ReceiptPreviewDialogProps) {
  const [order, setOrder] = useState<Order | null>(propOrder ?? null);
  const [isFetchingOrder, setIsFetchingOrder] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  // Fetch last order if none provided
  useEffect(() => {
    if (!open) return;
    if (propOrder) {
      setOrder(propOrder);
      return;
    }

    setIsFetchingOrder(true);
    apiFetch<{ data: Order[] }>(`/api/v1/orders?locationId=${locationId}&limit=1&status=completed`)
      .then((res) => {
        if (res.data?.[0]) setOrder(res.data[0]);
      })
      .catch(() => {})
      .finally(() => setIsFetchingOrder(false));
  }, [open, propOrder, locationId]);

  // Build receipt document via server API
  const { document: receiptDoc, isLoading: isBuilding } = useReceiptBuilder({
    orderId: order?.id ?? null,
    variant,
    locationId,
    locationName,
    businessName: locationName,
  });

  const isLoading = isFetchingOrder || isBuilding;

  const handlePrint = useCallback(async () => {
    if (!receiptDoc) return;
    setIsPrinting(true);
    try {
      await printReceiptDocument(receiptDoc);
    } catch {
      // Print failed or was cancelled — not critical
    } finally {
      setIsPrinting(false);
    }
  }, [receiptDoc]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="receipt-preview-dialog-title">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        role="presentation"
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md rounded-xl bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="receipt-preview-dialog-title" className="text-base font-semibold text-foreground">Receipt Preview</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Receipt body */}
        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">Loading receipt...</p>
            </div>
          ) : !receiptDoc ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">No recent order found</p>
            </div>
          ) : (
            <ReceiptPreview document={receiptDoc} />
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-input py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!receiptDoc || isPrinting}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            {isPrinting ? 'Printing...' : 'Print'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
});
