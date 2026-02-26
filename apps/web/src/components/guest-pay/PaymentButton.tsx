'use client';

import { useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { PaymentMethodCapture } from '@/components/payments/payment-method-capture';
import type { TokenizeResult, TokenizerClientConfig } from '@oppsera/shared';

interface PaymentButtonProps {
  onPay: () => void;
  onMemberAuth?: () => void;
  disabled?: boolean;
  /** Tokenizer client config — when present, shows real card form in live mode */
  tokenizerConfig?: TokenizerClientConfig | null;
  /** Whether the tokenizer config is still loading */
  tokenizerLoading?: boolean;
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
  tokenizerLoading,
  amountCents,
  onCardPay,
  isCardProcessing,
  cardError,
}: PaymentButtonProps) {
  const isLive = process.env.NEXT_PUBLIC_GUEST_PAY_LIVE === 'true';

  const [tokenResult, setTokenResult] = useState<TokenizeResult | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const handleTokenize = useCallback((result: TokenizeResult) => {
    setTokenResult(result);
    setTokenError(null);
  }, []);

  const handleTokenError = useCallback((msg: string) => {
    setTokenError(msg);
    setTokenResult(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!tokenResult || !onCardPay) return;
    // Reconstruct MMYY for backward compat with existing charge endpoint
    let expiry: string | undefined;
    if (tokenResult.expMonth != null && tokenResult.expYear != null) {
      const mm = String(tokenResult.expMonth).padStart(2, '0');
      const yy = String(tokenResult.expYear % 100).padStart(2, '0');
      expiry = `${mm}${yy}`;
    } else {
      expiry = (tokenResult.metadata.rawExpiry as string | undefined) ?? undefined;
    }
    await onCardPay({ token: tokenResult.token, expiry });
  }, [tokenResult, onCardPay]);

  const memberLink = onMemberAuth ? (
    <button
      type="button"
      onClick={onMemberAuth}
      className="block w-full text-center text-sm text-green-500 hover:text-green-400 mt-3 font-medium"
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
        <p className="text-center text-xs text-amber-500 mt-2 font-medium">
          Development Mode — No real charge
        </p>
        {memberLink}
      </div>
    );
  }

  // Live mode WITH tokenizer configured — show card form + wallet buttons
  if (tokenizerConfig && amountCents && onCardPay) {
    const displayError = cardError ?? tokenError;
    return (
      <div className="space-y-4">
        <PaymentMethodCapture
          config={tokenizerConfig}
          isConfigLoading={false}
          configError={null}
          onTokenize={handleTokenize}
          onError={handleTokenError}
          showWallets
          amountCents={amountCents}
        />

        {/* Token status */}
        {tokenResult && !displayError && (
          <div className="flex items-center gap-2 text-sm text-green-500">
            <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current">
              <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm3.78 5.22a.75.75 0 00-1.06 0L7 8.94 5.28 7.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l4.25-4.25a.75.75 0 000-1.06z" />
            </svg>
            Card accepted
          </div>
        )}

        {/* Error */}
        {displayError && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{displayError}</p>
        )}

        {/* Pay button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!tokenResult || isCardProcessing}
          className="w-full rounded-2xl bg-green-600 py-4 text-base font-bold text-white shadow-lg transition-all hover:bg-green-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCardProcessing ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Processing...
            </span>
          ) : (
            `Pay $${(amountCents / 100).toFixed(2)}`
          )}
        </button>

        {memberLink}
      </div>
    );
  }

  // Live mode — tokenizer still loading
  if (tokenizerLoading) {
    return (
      <div className="text-center">
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
        {memberLink}
      </div>
    );
  }

  // Live mode WITHOUT tokenizer — card payments not configured
  return (
    <div className="text-center">
      <div className="w-full rounded-2xl bg-muted py-4 text-base font-bold text-muted-foreground">
        Card Payments Coming Soon
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Please ask your server for assistance.
      </p>
      {memberLink}
    </div>
  );
}
