'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import type { Order } from '@/types/pos';

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface ReceiptPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  locationId: string;
  locationName: string;
  /** Specific order to preview. If null, fetches the last order for the terminal. */
  order?: Order | null;
}

export const ReceiptPreviewDialog = memo(function ReceiptPreviewDialog({
  open,
  onClose,
  locationId,
  locationName,
  order: propOrder,
}: ReceiptPreviewDialogProps) {
  const [order, setOrder] = useState<Order | null>(propOrder ?? null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch last order if none provided
  useEffect(() => {
    if (!open) return;
    if (propOrder) {
      setOrder(propOrder);
      return;
    }

    setIsLoading(true);
    apiFetch<{ data: Order[] }>(`/api/v1/orders?locationId=${locationId}&limit=1&status=completed`)
      .then((res) => {
        if (res.data?.[0]) setOrder(res.data[0]);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [open, propOrder, locationId]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (!open) return null;

  const lines = order?.lines ?? [];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="receipt-preview-dialog-title">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        role="presentation"
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md rounded-xl bg-surface shadow-2xl print:shadow-none print:rounded-none print:max-w-full">
        {/* Header (hidden in print) */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 print:hidden">
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
        <div className="px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">Loading receipt...</p>
            </div>
          ) : !order ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">No recent order found</p>
            </div>
          ) : (
            <div className="space-y-4 font-mono text-sm">
              {/* Business info */}
              <div className="text-center">
                <p className="font-bold text-base">{locationName}</p>
                <p className="text-xs text-muted-foreground">
                  Order #{order.orderNumber}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(order.createdAt)}
                </p>
              </div>

              {/* Divider */}
              <div className="border-t border-dashed border-border" />

              {/* Line items */}
              <div className="space-y-1">
                {lines.map((line) => (
                  <div key={line.id} className="flex justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="truncate">
                        {line.qty > 1 ? `${line.qty}x ` : ''}
                        {line.catalogItemName}
                      </span>
                    </div>
                    <span className="shrink-0">{formatMoney(line.lineTotal)}</span>
                  </div>
                ))}
              </div>

              {/* Divider */}
              <div className="border-t border-dashed border-border" />

              {/* Totals */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatMoney(order.subtotal)}</span>
                </div>
                {order.discountTotal > 0 && (
                  <div className="flex justify-between text-green-500">
                    <span>Discount</span>
                    <span>-{formatMoney(order.discountTotal)}</span>
                  </div>
                )}
                {order.serviceChargeTotal > 0 && (
                  <div className="flex justify-between">
                    <span>Charges</span>
                    <span>{formatMoney(order.serviceChargeTotal)}</span>
                  </div>
                )}
                {order.taxTotal > 0 && (
                  <div className="flex justify-between">
                    <span>Tax</span>
                    <span>{formatMoney(order.taxTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base border-t border-border pt-1">
                  <span>TOTAL</span>
                  <span>{formatMoney(order.total)}</span>
                </div>
              </div>

              {/* Footer */}
              <div className="text-center text-xs text-muted-foreground pt-2">
                <p>Thank you!</p>
              </div>
            </div>
          )}
        </div>

        {/* Actions (hidden in print) */}
        <div className="flex gap-3 border-t border-border px-4 py-3 print:hidden">
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
            disabled={!order}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Print
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
});
