'use client';

interface PaymentButtonProps {
  onPay: () => void;
  onMemberAuth?: () => void;
  disabled?: boolean;
}

export function PaymentButton({ onPay, onMemberAuth, disabled }: PaymentButtonProps) {
  const isLive = process.env.NEXT_PUBLIC_GUEST_PAY_LIVE === 'true';

  const memberLink = onMemberAuth ? (
    <button
      type="button"
      onClick={onMemberAuth}
      className="block w-full text-center text-sm text-green-600 hover:text-green-700 mt-3 font-medium"
    >
      Club Member? Charge to your account &rarr;
    </button>
  ) : null;

  if (!isLive) {
    // Dev/staging: Simulate Payment
    return (
      <div>
        <button
          type="button"
          onClick={onPay}
          disabled={disabled}
          className="w-full rounded-2xl bg-green-600 py-4 text-base font-bold text-white shadow-lg transition-all hover:bg-green-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Simulate Payment
        </button>
        <p className="text-center text-xs text-amber-600 mt-2 font-medium">
          Development Mode — No real charge
        </p>
        {memberLink}
      </div>
    );
  }

  // Production: Coming Soon (card) + member charge link
  return (
    <div className="text-center">
      <div className="w-full rounded-2xl bg-gray-200 py-4 text-base font-bold text-gray-500">
        Card Payments Coming Soon
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Please ask your server for assistance.
      </p>
      {memberLink}
    </div>
  );
}
