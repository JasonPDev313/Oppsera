'use client';

import type { FreightMode, GridTotals } from '@/lib/receiving-calc';

interface ReceiptTotalsBarProps {
  totals: GridTotals;
  freightMode?: FreightMode;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export function ReceiptTotalsBar({ totals, freightMode = 'allocate' }: ReceiptTotalsBarProps) {
  return (
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
      <div>
        <span className="text-xs font-medium text-gray-500 uppercase">
          Qty Received
        </span>
        <p className="text-sm font-semibold text-gray-900 tabular-nums">
          {totals.totalQtyReceived}
        </p>
      </div>
      <div>
        <span className="text-xs font-medium text-gray-500 uppercase">
          Product Cost
        </span>
        <p className="text-sm font-semibold text-gray-900 tabular-nums">
          {formatMoney(totals.productCostTotal)}
        </p>
      </div>
      <div>
        <span className="text-xs font-medium text-gray-500 uppercase">
          {freightMode === 'expense' ? 'Charges (GL)' : 'Shipping'}
        </span>
        <p className="text-sm font-semibold text-gray-900 tabular-nums">
          {formatMoney(totals.shippingTotal)}
        </p>
      </div>
      <div className="ml-auto">
        <span className="text-xs font-medium text-gray-500 uppercase">
          Invoice Total
        </span>
        <p className="text-lg font-bold text-gray-900 tabular-nums">
          {formatMoney(totals.invoiceTotal)}
        </p>
      </div>
    </div>
  );
}
