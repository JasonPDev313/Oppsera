'use client';

import { memo } from 'react';
import type { Order } from '@/types/pos';

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface ReadOnlyOrderSummaryProps {
  order: Order;
}

export const ReadOnlyOrderSummary = memo(function ReadOnlyOrderSummary({ order }: ReadOnlyOrderSummaryProps) {
  const lines = order.lines ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold text-foreground">Order Summary</h2>
        <span className="text-xs text-muted-foreground">
          {lines.length} {lines.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {lines.map((line) => (
          <div
            key={line.id}
            className="flex items-center justify-between gap-2 border-b border-gray-50 px-3 py-1.5"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
              {line.catalogItemName}
            </span>
            <span className="shrink-0 text-sm font-medium text-foreground">
              {formatMoney(line.lineTotal)}
            </span>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="border-t border-border px-3 py-2 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="text-foreground">{formatMoney(order.subtotal)}</span>
        </div>
        {order.discountTotal > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-green-500">Discount</span>
            <span className="text-green-500">-{formatMoney(order.discountTotal)}</span>
          </div>
        )}
        {order.serviceChargeTotal > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Charges</span>
            <span className="text-foreground">{formatMoney(order.serviceChargeTotal)}</span>
          </div>
        )}
        {order.taxTotal > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tax</span>
            <span className="text-foreground">{formatMoney(order.taxTotal)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-border pt-1 text-base font-bold">
          <span className="text-foreground">Total</span>
          <span className="text-foreground">{formatMoney(order.total)}</span>
        </div>
      </div>
    </div>
  );
});
