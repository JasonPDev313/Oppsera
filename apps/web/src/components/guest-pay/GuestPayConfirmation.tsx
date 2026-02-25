'use client';

import { useState, useEffect } from 'react';
import { CheckCircle } from 'lucide-react';
import { GuestReceiptFull } from './GuestReceiptFull';
import { ReceiptActions } from './ReceiptActions';

interface ReceiptLine {
  name: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

interface ReceiptData {
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

interface GuestPayConfirmationProps {
  totalCents: number;
  tipCents: number;
  restaurantName: string | null;
  memberName?: string;
  paymentMethod?: string;
  token: string;
}

export function GuestPayConfirmation({
  totalCents,
  tipCents,
  restaurantName,
  memberName,
  paymentMethod,
  token,
}: GuestPayConfirmationProps) {
  const isMemberCharge = paymentMethod === 'member_charge';
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/guest-pay/${token}/receipt`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data) {
          setReceipt(json.data as ReceiptData);
        }
      })
      .catch(() => {
        // Receipt fetch is best-effort — confirmation still shows
      })
      .finally(() => setReceiptLoading(false));
  }, [token]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      {/* Animated checkmark */}
      <div className="mb-6 animate-bounce">
        <CheckCircle className="h-20 w-20 text-green-500" />
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        {isMemberCharge && memberName
          ? `Charged to ${memberName}'s Account`
          : 'Payment Confirmed'}
      </h1>

      <div className="text-3xl font-bold text-green-600 mb-4">
        ${(totalCents / 100).toFixed(2)}
      </div>

      {tipCents > 0 && (
        <p className="text-sm text-gray-500 mb-4">
          Includes ${(tipCents / 100).toFixed(2)} tip — thank you!
        </p>
      )}

      <div className="rounded-2xl bg-green-50 border border-green-200 px-6 py-4 text-center max-w-xs mb-6">
        <p className="text-sm font-medium text-green-800">
          Your server has been notified.
        </p>
        <p className="text-xs text-green-600 mt-1">
          {isMemberCharge ? 'Your statement will be updated.' : 'You may close this page.'}
        </p>
      </div>

      {/* Full itemized receipt */}
      {receiptLoading ? (
        <div className="w-full max-w-sm">
          <div className="rounded-2xl bg-gray-50 border border-gray-200 p-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto mb-4" />
            <div className="space-y-2">
              <div className="h-3 bg-gray-200 rounded w-full" />
              <div className="h-3 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-200 rounded w-5/6" />
            </div>
          </div>
        </div>
      ) : receipt ? (
        <div className="w-full max-w-sm space-y-4">
          <GuestReceiptFull
            restaurantName={receipt.restaurantName}
            tableLabel={receipt.tableLabel}
            paidAt={receipt.paidAt}
            lines={receipt.lines}
            subtotalCents={receipt.subtotalCents}
            taxCents={receipt.taxCents}
            serviceChargeCents={receipt.serviceChargeCents}
            discountCents={receipt.discountCents}
            totalCents={receipt.totalCents}
            tipCents={receipt.tipCents}
            grandTotalCents={receipt.grandTotalCents}
          />
          <ReceiptActions token={token} />
        </div>
      ) : null}

      {restaurantName && (
        <p className="mt-8 text-xs text-gray-400 print:mt-4">
          Thank you for dining at {restaurantName}
        </p>
      )}
    </div>
  );
}
