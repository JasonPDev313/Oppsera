'use client';

import { useState, useCallback } from 'react';
import { CreditCard, Loader2, AlertCircle } from 'lucide-react';
import { CardPointeIframeTokenizer } from './cardpointe-iframe-tokenizer';
import type { TokenizeResult } from '@oppsera/shared';

interface OnlinePaymentFormProps {
  /** CardPointe site name */
  site: string;
  /** Full iframe URL (optional — overrides site-based URL) */
  iframeUrl?: string;
  /** Amount to display and charge (in cents) */
  amountCents: number;
  /** Label for the amount line (default: "Total") */
  amountLabel?: string;
  /** Called when payment form has a valid token ready to submit */
  onSubmit: (data: { token: string; expiry?: string }) => Promise<void>;
  /** Whether the form is currently submitting */
  isSubmitting?: boolean;
  /** External error message to display */
  error?: string | null;
  /** Button label (default: "Pay Now") */
  buttonLabel?: string;
  /** Whether to show the amount summary (default: true) */
  showAmount?: boolean;
}

/**
 * Shared online payment form — embeds CardPointe iFrame Tokenizer
 * and handles the collect-token → submit flow.
 *
 * Reusable by:
 * - QR pay-at-table guest page
 * - Online ordering checkout
 * - Member portal payments
 * - Invoice payment links
 */
export function OnlinePaymentForm({
  site,
  iframeUrl,
  amountCents,
  amountLabel = 'Total',
  onSubmit,
  isSubmitting = false,
  error,
  buttonLabel = 'Pay Now',
  showAmount = true,
}: OnlinePaymentFormProps) {
  const [token, setToken] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<string | undefined>(undefined);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const handleTokenize = useCallback(
    (result: TokenizeResult) => {
      setToken(result.token);
      // Reconstruct MMYY for backward compat with existing submit handlers
      if (result.expMonth != null && result.expYear != null) {
        const mm = String(result.expMonth).padStart(2, '0');
        const yy = String(result.expYear % 100).padStart(2, '0');
        setExpiry(`${mm}${yy}`);
      } else {
        // Fallback: read raw expiry from metadata
        setExpiry((result.metadata.rawExpiry as string | undefined) ?? undefined);
      }
      setTokenError(null);
    },
    [],
  );

  const handleTokenError = useCallback((msg: string) => {
    setTokenError(msg);
    setToken(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!token) {
      setTokenError('Please enter your card details');
      return;
    }
    await onSubmit({ token, expiry });
  }, [token, expiry, onSubmit]);

  const displayError = error ?? tokenError;

  return (
    <div className="space-y-4">
      {/* Amount display */}
      {showAmount && (
        <div className="rounded-xl bg-muted px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">{amountLabel}</span>
            <span className="text-xl font-bold text-foreground">
              ${(amountCents / 100).toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Card input iframe */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Card Details</span>
        </div>
        <div className="rounded-xl border border-border overflow-hidden">
          <CardPointeIframeTokenizer
            site={site}
            iframeUrl={iframeUrl}
            useExpiry
            useCvv
            onTokenize={handleTokenize}
            onError={handleTokenError}
            placeholder="Card Number"
          />
        </div>
      </div>

      {/* Token status */}
      {token && !displayError && (
        <div className="flex items-center gap-2 text-sm text-green-500">
          <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current">
            <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm3.78 5.22a.75.75 0 00-1.06 0L7 8.94 5.28 7.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l4.25-4.25a.75.75 0 000-1.06z" />
          </svg>
          Card accepted
        </div>
      )}

      {/* Error display */}
      {displayError && (
        <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-500">{displayError}</p>
        </div>
      )}

      {/* Pay button */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!token || isSubmitting}
        className="w-full rounded-2xl bg-green-600 py-4 text-base font-bold text-white shadow-lg transition-all hover:bg-green-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Processing...
          </span>
        ) : (
          buttonLabel
        )}
      </button>
    </div>
  );
}
