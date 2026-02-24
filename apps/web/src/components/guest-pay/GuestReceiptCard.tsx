interface GuestReceiptCardProps {
  subtotalCents: number;
  taxCents: number;
  serviceChargeCents: number;
  discountCents: number;
  totalCents: number;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function GuestReceiptCard({
  subtotalCents,
  taxCents,
  serviceChargeCents,
  discountCents,
  totalCents,
}: GuestReceiptCardProps) {
  return (
    <div className="rounded-2xl bg-gray-50 p-4">
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Subtotal</span>
          <span>{formatMoney(subtotalCents)}</span>
        </div>

        {taxCents > 0 && (
          <div className="flex justify-between text-sm text-gray-600">
            <span>Tax</span>
            <span>{formatMoney(taxCents)}</span>
          </div>
        )}

        {serviceChargeCents > 0 && (
          <div className="flex justify-between text-sm text-gray-600">
            <span>Service Charge</span>
            <span>{formatMoney(serviceChargeCents)}</span>
          </div>
        )}

        {discountCents > 0 && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Discount</span>
            <span>-{formatMoney(discountCents)}</span>
          </div>
        )}

        <div className="border-t border-gray-200 pt-2 mt-2">
          <div className="flex justify-between text-base font-semibold text-gray-900">
            <span>Check Total</span>
            <span>{formatMoney(totalCents)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
