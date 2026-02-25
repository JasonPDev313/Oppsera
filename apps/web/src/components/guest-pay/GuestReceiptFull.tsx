'use client';

interface ReceiptLine {
  name: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

interface GuestReceiptFullProps {
  restaurantName: string | null;
  tableLabel: string | null;
  paidAt: string | null;
  lines: ReceiptLine[];
  subtotalCents: number;
  taxCents: number;
  serviceChargeCents: number;
  discountCents: number;
  totalCents: number;
  tipCents: number;
  grandTotalCents: number;
}

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function GuestReceiptFull({
  restaurantName,
  tableLabel,
  paidAt,
  lines,
  subtotalCents,
  taxCents,
  serviceChargeCents,
  discountCents,
  totalCents,
  tipCents,
  grandTotalCents,
}: GuestReceiptFullProps) {
  const dateStr = paidAt
    ? new Date(paidAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

  return (
    <div id="guest-receipt" className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 text-center border-b border-gray-100">
        {restaurantName && (
          <h2 className="text-lg font-bold text-gray-900">{restaurantName}</h2>
        )}
        {tableLabel && (
          <p className="text-xs text-gray-500 mt-0.5">{tableLabel}</p>
        )}
        {dateStr && (
          <p className="text-xs text-gray-400 mt-0.5">{dateStr}</p>
        )}
      </div>

      {/* Line items */}
      {lines.length > 0 && (
        <div className="px-5 py-3">
          <div className="space-y-2">
            {lines.map((line, i) => (
              <div key={i} className="flex justify-between items-start">
                <div className="flex-1 min-w-0 pr-3">
                  <p className="text-sm text-gray-800">{line.name}</p>
                  {line.qty > 1 && (
                    <p className="text-xs text-gray-500">
                      {line.qty} x {fmt(line.unitPriceCents)}
                    </p>
                  )}
                </div>
                <span className="text-sm text-gray-800 whitespace-nowrap">
                  {fmt(line.lineTotalCents)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="px-5 pb-5 pt-2 border-t border-gray-100">
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm text-gray-500">
            <span>Subtotal</span>
            <span>{fmt(subtotalCents)}</span>
          </div>

          {taxCents > 0 && (
            <div className="flex justify-between text-sm text-gray-500">
              <span>Tax</span>
              <span>{fmt(taxCents)}</span>
            </div>
          )}

          {serviceChargeCents > 0 && (
            <div className="flex justify-between text-sm text-gray-500">
              <span>Service Charge</span>
              <span>{fmt(serviceChargeCents)}</span>
            </div>
          )}

          {discountCents > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Discount</span>
              <span>-{fmt(discountCents)}</span>
            </div>
          )}

          <div className="flex justify-between text-sm font-semibold text-gray-900 pt-1.5 border-t border-gray-200">
            <span>Total</span>
            <span>{fmt(totalCents)}</span>
          </div>

          {tipCents > 0 && (
            <div className="flex justify-between text-sm text-gray-500">
              <span>Tip</span>
              <span>{fmt(tipCents)}</span>
            </div>
          )}

          <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t-2 border-gray-900">
            <span>Amount Paid</span>
            <span>{fmt(grandTotalCents)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
