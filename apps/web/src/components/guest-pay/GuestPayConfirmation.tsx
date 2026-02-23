'use client';

import { CheckCircle } from 'lucide-react';

interface GuestPayConfirmationProps {
  totalCents: number;
  tipCents: number;
  restaurantName: string | null;
  memberName?: string;
  paymentMethod?: string;
}

export function GuestPayConfirmation({
  totalCents,
  tipCents,
  restaurantName,
  memberName,
  paymentMethod,
}: GuestPayConfirmationProps) {
  const isMemberCharge = paymentMethod === 'member_charge';

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

      <div className="rounded-2xl bg-green-50 border border-green-200 px-6 py-4 text-center max-w-xs">
        <p className="text-sm font-medium text-green-800">
          Your server has been notified.
        </p>
        <p className="text-xs text-green-600 mt-1">
          {isMemberCharge ? 'Your statement will be updated.' : 'You may close this page.'}
        </p>
      </div>

      {restaurantName && (
        <p className="mt-8 text-xs text-gray-400">
          Thank you for dining at {restaurantName}
        </p>
      )}
    </div>
  );
}
