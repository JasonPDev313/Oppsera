'use client';

interface ReceiptTotalsBarProps {
  subtotal: number;
  shippingCost: number;
  taxAmount: number;
  total: number;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export function ReceiptTotalsBar({ subtotal, shippingCost, taxAmount, total }: ReceiptTotalsBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <div>
        <span className="text-xs font-medium text-gray-500 uppercase">Subtotal</span>
        <p className="text-sm font-semibold text-gray-900">{formatMoney(subtotal)}</p>
      </div>
      <div>
        <span className="text-xs font-medium text-gray-500 uppercase">Shipping</span>
        <p className="text-sm font-semibold text-gray-900">{formatMoney(shippingCost)}</p>
      </div>
      <div>
        <span className="text-xs font-medium text-gray-500 uppercase">Tax</span>
        <p className="text-sm font-semibold text-gray-900">{formatMoney(taxAmount)}</p>
      </div>
      <div className="ml-auto">
        <span className="text-xs font-medium text-gray-500 uppercase">Total</span>
        <p className="text-lg font-bold text-gray-900">{formatMoney(total)}</p>
      </div>
    </div>
  );
}
