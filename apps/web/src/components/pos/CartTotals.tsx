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
    <div className="border-t border-gray-200 px-3 py-3">
      {/* Subtotal */}
      <div className="flex items-center justify-between text-sm text-gray-600">
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
        <div className="mt-1 flex items-center justify-between text-sm text-gray-600">
          <span>{chargeLabel}</span>
          <span>{formatMoney(order.serviceChargeTotal)}</span>
        </div>
      )}

      {/* Tax */}
      <div className="mt-1 flex items-center justify-between text-sm text-gray-600">
        <span>Tax{order.taxExempt ? ' (Exempt)' : ''}</span>
        <span className={order.taxExempt ? 'text-purple-600 font-medium' : ''}>
          {order.taxExempt ? '$0.00' : formatMoney(order.taxTotal)}
        </span>
      </div>

      {/* Tax Exempt Reason */}
      {order.taxExempt && order.taxExemptReason && (
        <div className="mt-0.5 text-xs text-purple-600 italic">
          {order.taxExemptReason}
        </div>
      )}

      {/* Divider */}
      <div className="my-2 border-t border-gray-200" />

      {/* Total */}
      <div className="flex items-center justify-between">
        <span className="text-base font-bold text-gray-900">TOTAL</span>
        <span className="text-lg font-bold text-gray-900">
          {formatMoney(order.total)}
        </span>
      </div>
    </div>
  );
});
