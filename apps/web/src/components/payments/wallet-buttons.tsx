'use client';

import { useState, useEffect } from 'react';
import type { TokenizeResult, TokenizerClientConfig } from '@oppsera/shared';
import { ApplePayButton } from './apple-pay-button';
import { GooglePayButton } from './google-pay-button';

interface WalletButtonsProps {
  config: TokenizerClientConfig;
  onTokenize: (result: TokenizeResult) => void;
  onError: (error: string) => void;
  amountCents: number;
  displayName?: string;
}

/**
 * Wallet buttons container — renders Apple Pay and/or Google Pay
 * based on config flags AND device availability.
 *
 * Only renders buttons that are both enabled in config AND available
 * on the current device/browser.
 */
export function WalletButtons({
  config,
  onTokenize,
  onError,
  amountCents,
  displayName = 'Oppsera',
}: WalletButtonsProps) {
  const [hasApplePay, setHasApplePay] = useState(false);
  const [hasGooglePay, setHasGooglePay] = useState(false);

  const applePayEnabled = config.wallets?.applePay === true;
  const googlePayEnabled = config.wallets?.googlePay === true;

  // Check Apple Pay availability
  useEffect(() => {
    if (!applePayEnabled) return;
    try {
      const available =
        typeof window !== 'undefined' &&
        'ApplePaySession' in window &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).ApplePaySession?.canMakePayments?.();
      setHasApplePay(!!available);
    } catch {
      setHasApplePay(false);
    }
  }, [applePayEnabled]);

  // Google Pay availability is checked inside the component itself
  // but we track config enablement here
  useEffect(() => {
    if (googlePayEnabled) setHasGooglePay(true);
  }, [googlePayEnabled]);

  const showApple = applePayEnabled && hasApplePay;
  const showGoogle = googlePayEnabled && hasGooglePay;

  if (!showApple && !showGoogle) return null;

  return (
    <div className="space-y-3">
      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-400">or pay with</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      {/* Wallet buttons */}
      <div className="flex gap-2">
        {showApple && (
          <div className="flex-1">
            <ApplePayButton
              onTokenize={onTokenize}
              onError={onError}
              amountCents={amountCents}
              displayName={displayName}
            />
          </div>
        )}
        {showGoogle && config.wallets?.googlePayGatewayId && (
          <div className="flex-1">
            <GooglePayButton
              onTokenize={onTokenize}
              onError={onError}
              amountCents={amountCents}
              gatewayMerchantId={config.wallets.googlePayGatewayId}
              googlePayMerchantId={config.wallets.googlePayMerchantId}
              environment={config.isSandbox ? 'TEST' : 'PRODUCTION'}
            />
          </div>
        )}
      </div>
    </div>
  );
}
