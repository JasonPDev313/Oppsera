'use client';

import { memo } from 'react';
import type { Order } from '@/types/pos';

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface CartTotalsProps {
  order: Order | null;
}

export const CartTotals = memo(function CartTotals({ order }: CartTotalsProps) {
  if (!order) return null;

  const hasCharges = order.serviceChargeTotal > 0;
  const hasDiscount = order.discountTotal > 0;

  // Build charge description from order charges
  const chargeLabel = (() => {
    if (!hasCharges || !order.charges || order.charges.length === 0) return 'Service Charge';
    const firstCharge = order.charges[0]!;
    if (firstCharge.calculationType === 'percentage') {
      return `${firstCharge.name} (${firstCharge.value}%)`;
    }
    return firstCharge.name;
  })();

  // Build discount description
  const discountLabel = (() => {
    if (!hasDiscount || !order.discounts || order.discounts.length === 0) return 'Discount';
    const firstDiscount = order.discounts[0]!;
    if (firstDiscount.type === 'percentage') {
      // value is stored as the raw percentage (e.g. 10 for 10%)
      return `Discount (${firstDiscount.value}%)`;
    }
    return `Discount (${formatMoney(firstDiscount.value)})`;
  })();

  return (
    <div className="border-t border-border px-3 py-3">
      {/* Subtotal */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Subtotal</span>
        <span>{formatMoney(order.subtotal)}</span>
      </div>

      {/* Discount (applied first) */}
      {hasDiscount && (
        <div className="mt-1 flex items-center justify-between text-sm text-red-500">
          <span>{discountLabel}</span>
          <span>-{formatMoney(order.discountTotal)}</span>
        </div>
      )}

      {/* Service charges (applied after discount) */}
      {hasCharges && (
        <div className="mt-1 flex items-center justify-between text-sm text-muted-foreground">
          <span>{chargeLabel}</span>
          <span>{formatMoney(order.serviceChargeTotal)}</span>
        </div>
      )}

      {/* Tax */}
      <div className="mt-1 flex items-center justify-between text-sm text-muted-foreground">
        <span>Tax{order.taxExempt ? ' (Exempt)' : ''}</span>
        <span className={order.taxExempt ? 'text-purple-500 font-medium' : ''}>
          {order.taxExempt ? '$0.00' : formatMoney(order.taxTotal)}
        </span>
      </div>

      {/* Tax Exempt Reason */}
      {order.taxExempt && order.taxExemptReason && (
        <div className="mt-0.5 text-xs text-purple-500 italic">
          {order.taxExemptReason}
        </div>
      )}

      {/* Divider */}
      <div className="my-2 border-t border-border" />

      {/* Total */}
      <div className="flex items-center justify-between">
        <span
          className="text-base font-bold text-foreground"
          style={{ fontSize: 'calc(1rem * var(--pos-font-scale, 1))' }}
        >
          TOTAL
        </span>
        <span
          className="text-lg font-bold text-foreground"
          style={{ fontSize: 'calc(1.125rem * var(--pos-font-scale, 1))' }}
        >
          {formatMoney(order.total)}
        </span>
      </div>
    </div>
  );
});
