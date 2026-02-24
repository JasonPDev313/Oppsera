'use client';

import { Loader2 } from 'lucide-react';
import type { TokenizeResult, TokenizerClientConfig } from '@oppsera/shared';
import { CardPointeIframeTokenizer } from './cardpointe-iframe-tokenizer';

interface PaymentMethodCaptureProps {
  config: TokenizerClientConfig | null;
  isConfigLoading: boolean;
  configError: string | null;
  onTokenize: (result: TokenizeResult) => void;
  onError: (error: string) => void;
  showWallets?: boolean;
  amountCents?: number;
}

/**
 * Member portal card capture component.
 * Same contract as the web app's PaymentMethodCapture.
 * Shows wallets by default (member-facing).
 */
export function PaymentMethodCapture({
  config,
  isConfigLoading,
  configError,
  onTokenize,
  onError,
  showWallets: _showWallets = true,
  amountCents: _amountCents,
}: PaymentMethodCaptureProps) {
  if (isConfigLoading) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-gray-200">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (configError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">
        {configError}
      </div>
    );
  }

  if (!config) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
        Card payments are not configured.
      </div>
    );
  }

  if (config.providerCode === 'cardpointe' && config.iframe) {
    return (
      <CardPointeIframeTokenizer
        site={config.iframe.site}
        iframeUrl={config.iframe.iframeUrl}
        useExpiry
        useCvv
        onTokenize={onTokenize}
        onError={onError}
        formatInput
      />
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-700">
      Card payments are not available at this time.
    </div>
  );
}
