'use client';

import { useEffect, useState, useCallback } from 'react';
import type { TokenizeResult } from '@oppsera/shared';
import { apiFetch } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Apple Pay global type declarations
// ---------------------------------------------------------------------------

interface ApplePayPaymentRequest {
  countryCode: string;
  currencyCode: string;
  supportedNetworks: string[];
  merchantCapabilities: string[];
  total: { label: string; amount: string };
}

interface ApplePayValidateMerchantEvent {
  validationURL: string;
  completeMerchantValidation: (session: unknown) => void;
}

interface ApplePayPaymentToken {
  paymentData: unknown;
}

interface ApplePayPayment {
  token: ApplePayPaymentToken;
}

interface ApplePayPaymentAuthorizedEvent {
  payment: ApplePayPayment;
}

interface ApplePaySessionInstance {
  onvalidatemerchant: ((event: ApplePayValidateMerchantEvent) => void) | null;
  onpaymentauthorized: ((event: ApplePayPaymentAuthorizedEvent) => void) | null;
  oncancel: (() => void) | null;
  begin: () => void;
  completePayment: (status: number) => void;
}

interface ApplePaySessionConstructor {
  new (version: number, request: ApplePayPaymentRequest): ApplePaySessionInstance;
  canMakePayments: () => boolean;
  STATUS_SUCCESS: number;
  STATUS_FAILURE: number;
}

declare global {
  interface Window {
    ApplePaySession?: ApplePaySessionConstructor;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ApplePayButtonProps {
  /** Called with a normalized tokenize result on successful Apple Pay authorization. */
  onTokenize: (result: TokenizeResult) => void;
  /** Called when any step of the Apple Pay flow fails. */
  onError: (error: string) => void;
  /** Amount to charge in cents. */
  amountCents: number;
  /** Merchant display name shown on the Apple Pay sheet (default: "OppsEra"). */
  displayName?: string;
}

/**
 * Apple Pay button — renders only when Apple Pay is available in the browser.
 *
 * Flow:
 * 1. Check `window.ApplePaySession.canMakePayments()` on mount.
 * 2. On click, create an ApplePaySession (v14) and call `begin()`.
 * 3. `onvalidatemerchant` → POST to our backend which talks to Apple's servers.
 * 4. `onpaymentauthorized` → POST payment data to our wallet-tokenize endpoint,
 *    normalize the response to `TokenizeResult`, and call `onTokenize`.
 */
export function ApplePayButton({
  onTokenize,
  onError,
  amountCents,
  displayName = 'OppsEra',
}: ApplePayButtonProps) {
  const [isAvailable, setIsAvailable] = useState(false);

  // Check Apple Pay availability on mount
  useEffect(() => {
    try {
      if (window.ApplePaySession?.canMakePayments()) {
        setIsAvailable(true);
      }
    } catch {
      // ApplePaySession.canMakePayments() can throw in non-Safari browsers
      setIsAvailable(false);
    }
  }, []);

  const handleClick = useCallback(async () => {
    if (!window.ApplePaySession) {
      onError('Apple Pay is not available on this device.');
      return;
    }

    let session: ApplePaySessionInstance;
    try {
      session = new window.ApplePaySession(14, {
        countryCode: 'US',
        currencyCode: 'USD',
        supportedNetworks: ['visa', 'masterCard', 'amex', 'discover'],
        merchantCapabilities: ['supports3DS'],
        total: {
          label: displayName,
          amount: (amountCents / 100).toFixed(2),
        },
      });
    } catch (err) {
      onError(
        err instanceof Error
          ? `Failed to create Apple Pay session: ${err.message}`
          : 'Failed to create Apple Pay session.',
      );
      return;
    }

    // -----------------------------------------------------------------------
    // Merchant validation — Apple requires a server-to-server call
    // -----------------------------------------------------------------------
    session.onvalidatemerchant = async (event: ApplePayValidateMerchantEvent) => {
      try {
        const merchantSession = await apiFetch<unknown>(
          '/api/v1/payments/apple-pay/validate-merchant',
          {
            method: 'POST',
            body: JSON.stringify({ validationURL: event.validationURL }),
          },
        );
        event.completeMerchantValidation(merchantSession);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Merchant validation failed.';
        onError(message);
        session.completePayment(window.ApplePaySession!.STATUS_FAILURE);
      }
    };

    // -----------------------------------------------------------------------
    // Payment authorized — tokenize through our backend
    // -----------------------------------------------------------------------
    session.onpaymentauthorized = async (event: ApplePayPaymentAuthorizedEvent) => {
      try {
        const response = await apiFetch<{
          data: {
            token: string;
            last4: string | null;
            brand: string | null;
            expMonth: number | null;
            expYear: number | null;
            metadata?: Record<string, unknown>;
          };
        }>('/api/v1/payments/wallet-tokenize', {
          method: 'POST',
          body: JSON.stringify({
            walletType: 'apple_pay',
            paymentData: event.payment.token.paymentData,
          }),
        });

        const data = response.data;

        const result: TokenizeResult = {
          provider: data.metadata?.provider
            ? String(data.metadata.provider)
            : 'apple_pay',
          token: data.token,
          last4: data.last4 ?? null,
          brand: data.brand ?? null,
          expMonth: data.expMonth ?? null,
          expYear: data.expYear ?? null,
          source: 'apple_pay',
          metadata: data.metadata ?? {},
        };

        onTokenize(result);
        session.completePayment(window.ApplePaySession!.STATUS_SUCCESS);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Apple Pay authorization failed.';
        onError(message);
        session.completePayment(window.ApplePaySession!.STATUS_FAILURE);
      }
    };

    // -----------------------------------------------------------------------
    // User cancelled the Apple Pay sheet
    // -----------------------------------------------------------------------
    session.oncancel = () => {
      // No error — user intentionally dismissed the sheet
    };

    session.begin();
  }, [amountCents, displayName, onTokenize, onError]);

  // Don't render anything when Apple Pay is not available
  if (!isAvailable) return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full rounded-lg bg-black py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 active:opacity-80"
      aria-label="Pay with Apple Pay"
    >
       Pay
    </button>
  );
}
