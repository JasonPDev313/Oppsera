'use client';

import { OnlinePaymentForm } from '@/components/payments/online-payment-form';

interface PaymentButtonProps {
  onPay: () => void;
  onMemberAuth?: () => void;
  disabled?: boolean;
  /** CardPointe tokenizer config — when present, shows real card form in live mode */
  tokenizerConfig?: { site: string; iframeUrl: string } | null;
  /** Amount to charge in cents (required for card form) */
  amountCents?: number;
  /** Called when card form submits with token */
  onCardPay?: (data: { token: string; expiry?: string }) => Promise<void>;
  /** Whether card payment is currently processing */
  isCardProcessing?: boolean;
  /** Card payment error message */
  cardError?: string | null;
}

export function PaymentButton({
  onPay,
  onMemberAuth,
  disabled,
  tokenizerConfig,
  amountCents,
  onCardPay,
  isCardProcessing,
  cardError,
}: PaymentButtonProps) {
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

  // Live mode WITH tokenizer configured — show real card form
  if (tokenizerConfig && amountCents && onCardPay) {
    return (
      <div>
        <OnlinePaymentForm
          site={tokenizerConfig.site}
          iframeUrl={tokenizerConfig.iframeUrl}
          amountCents={amountCents}
          amountLabel="Total Charge"
          onSubmit={onCardPay}
          isSubmitting={isCardProcessing}
          error={cardError}
          buttonLabel={`Pay $${(amountCents / 100).toFixed(2)}`}
          showAmount={false}
        />
        {memberLink}
      </div>
    );
  }

  // Live mode WITHOUT tokenizer — card payments not configured
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
