'use client';

import { useState, useEffect, useCallback } from 'react';
import Script from 'next/script';
import type { TokenizeResult } from '@oppsera/shared';
import { apiFetch } from '@/lib/api-client';

// ── Google Pay JS API types (inline) ────────────────────────────────

/* eslint-disable @typescript-eslint/no-namespace */
declare namespace google.payments.api {
  interface PaymentMethodSpecification {
    type: 'CARD';
    parameters: {
      allowedCardNetworks: string[];
      allowedAuthMethods: string[];
    };
    tokenizationSpecification?: {
      type: 'PAYMENT_GATEWAY' | 'DIRECT';
      parameters: Record<string, string>;
    };
  }

  interface PaymentData {
    paymentMethodData: {
      type: string;
      description: string;
      info: {
        cardNetwork: string;
        cardDetails: string;
      };
      tokenizationData: {
        type: string;
        token: string;
      };
    };
  }

  class PaymentsClient {
    constructor(options: { environment: 'TEST' | 'PRODUCTION' });
    isReadyToPay(request: IsReadyToPayRequest): Promise<{ result: boolean }>;
    loadPaymentData(request: PaymentDataRequest): Promise<PaymentData>;
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

interface IsReadyToPayRequest {
  apiVersion: number;
  apiVersionMinor: number;
  allowedPaymentMethods: google.payments.api.PaymentMethodSpecification[];
}

interface PaymentDataRequest extends IsReadyToPayRequest {
  merchantInfo: {
    merchantId?: string;
    merchantName?: string;
  };
  transactionInfo: {
    totalPriceStatus: 'FINAL' | 'ESTIMATED' | 'NOT_CURRENTLY_KNOWN';
    totalPrice: string;
    currencyCode: string;
    countryCode?: string;
  };
}

// ── Constants ────────────────────────────────────────────────────────

const ALLOWED_CARD_NETWORKS = ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'];
const ALLOWED_AUTH_METHODS = ['PAN_ONLY', 'CRYPTOGRAM_3DS'];

const BASE_CARD_PAYMENT_METHOD: google.payments.api.PaymentMethodSpecification = {
  type: 'CARD',
  parameters: {
    allowedCardNetworks: ALLOWED_CARD_NETWORKS,
    allowedAuthMethods: ALLOWED_AUTH_METHODS,
  },
};

// ── Props ────────────────────────────────────────────────────────────

interface GooglePayButtonProps {
  /** Called with normalized token result on successful payment. */
  onTokenize: (result: TokenizeResult) => void;
  /** Called when Google Pay or tokenization fails. */
  onError: (error: string) => void;
  /** Payment amount in cents (e.g. 1299 = $12.99). */
  amountCents: number;
  /** CardConnect merchant ID passed to the gateway. */
  gatewayMerchantId: string;
  /** Google Pay merchant ID (required for PRODUCTION). */
  googlePayMerchantId?: string;
  /** Google Pay environment. Defaults to TEST. */
  environment?: 'TEST' | 'PRODUCTION';
}

// ── Component ────────────────────────────────────────────────────────

export function GooglePayButton({
  onTokenize,
  onError,
  amountCents,
  gatewayMerchantId,
  googlePayMerchantId,
  environment = 'TEST',
}: GooglePayButtonProps) {
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Check readiness once the Google Pay script has loaded.
  useEffect(() => {
    if (!scriptLoaded) return;

    let cancelled = false;

    async function checkReady() {
      try {
        const client = new google.payments.api.PaymentsClient({
          environment,
        });

        const readyResponse = await client.isReadyToPay({
          apiVersion: 2,
          apiVersionMinor: 0,
          allowedPaymentMethods: [BASE_CARD_PAYMENT_METHOD],
        });

        if (!cancelled) {
          setIsReady(readyResponse.result);
        }
      } catch {
        // Google Pay not available — leave isReady as false.
      }
    }

    void checkReady();

    return () => {
      cancelled = true;
    };
  }, [scriptLoaded, environment]);

  const handleClick = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      const client = new google.payments.api.PaymentsClient({
        environment,
      });

      const paymentDataRequest: PaymentDataRequest = {
        apiVersion: 2,
        apiVersionMinor: 0,
        allowedPaymentMethods: [
          {
            ...BASE_CARD_PAYMENT_METHOD,
            tokenizationSpecification: {
              type: 'PAYMENT_GATEWAY',
              parameters: {
                gateway: 'cardconnect',
                gatewayMerchantId,
              },
            },
          },
        ],
        merchantInfo: {
          ...(googlePayMerchantId ? { merchantId: googlePayMerchantId } : {}),
        },
        transactionInfo: {
          totalPriceStatus: 'FINAL',
          totalPrice: (amountCents / 100).toFixed(2),
          currencyCode: 'USD',
          countryCode: 'US',
        },
      };

      const paymentData = await client.loadPaymentData(paymentDataRequest);

      // Send wallet data to the backend for server-side tokenization.
      const response = await apiFetch<{ data: TokenizeResult }>(
        '/api/v1/payments/wallet-tokenize',
        {
          method: 'POST',
          body: JSON.stringify({
            walletType: 'google_pay',
            paymentData: paymentData.paymentMethodData,
          }),
        },
      );

      const serverResult = response.data;

      // Normalize to TokenizeResult, enriching with Google Pay sheet info.
      const result: TokenizeResult = {
        provider: serverResult.provider ?? 'cardpointe',
        token: serverResult.token,
        last4: serverResult.last4 ?? paymentData.paymentMethodData.info.cardDetails ?? null,
        brand: serverResult.brand ?? paymentData.paymentMethodData.info.cardNetwork?.toLowerCase() ?? null,
        expMonth: serverResult.expMonth ?? null,
        expYear: serverResult.expYear ?? null,
        source: 'google_pay',
        metadata: serverResult.metadata ?? {},
      };

      onTokenize(result);
    } catch (err: unknown) {
      // Google Pay returns a statusCode when the user dismisses the sheet.
      if (
        typeof err === 'object' &&
        err !== null &&
        'statusCode' in err &&
        (err as { statusCode: string }).statusCode === 'CANCELED'
      ) {
        // User cancelled — not an error.
        return;
      }

      const message =
        err instanceof Error ? err.message : 'Google Pay payment failed';
      onError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [
    isProcessing,
    environment,
    gatewayMerchantId,
    googlePayMerchantId,
    amountCents,
    onTokenize,
    onError,
  ]);

  return (
    <>
      <Script
        src="https://pay.google.com/gp/p/js/pay.js"
        strategy="lazyOnload"
        onReady={() => setScriptLoaded(true)}
      />

      {isReady && (
        <button
          type="button"
          onClick={handleClick}
          disabled={isProcessing}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Pay with Google Pay"
        >
          {isProcessing ? (
            <span className="text-muted-foreground">Processing...</span>
          ) : (
            <>
              {/* Official Google "G" mark */}
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M19.17 10.23c0-.7-.06-1.37-.18-2.02H10v3.83h5.14a4.39 4.39 0 0 1-1.91 2.88v2.39h3.09c1.81-1.67 2.85-4.12 2.85-7.08z"
                  fill="#4285F4"
                />
                <path
                  d="M10 20c2.58 0 4.74-.86 6.32-2.32l-3.09-2.39c-.85.57-1.94.91-3.23.91-2.48 0-4.58-1.68-5.33-3.93H1.48v2.47A9.99 9.99 0 0 0 10 20z"
                  fill="#34A853"
                />
                <path
                  d="M4.67 12.27A6.01 6.01 0 0 1 4.36 10c0-.79.14-1.55.31-2.27V5.26H1.48A9.99 9.99 0 0 0 0 10c0 1.61.39 3.14 1.07 4.49l3.6-2.22z"
                  fill="#FBBC05"
                />
                <path
                  d="M10 3.96c1.4 0 2.66.48 3.64 1.43l2.73-2.73A9.99 9.99 0 0 0 10 0 9.99 9.99 0 0 0 1.48 5.26l3.19 2.47C5.42 5.64 7.52 3.96 10 3.96z"
                  fill="#EA4335"
                />
              </svg>
              <span>Google Pay</span>
            </>
          )}
        </button>
      )}
    </>
  );
}
