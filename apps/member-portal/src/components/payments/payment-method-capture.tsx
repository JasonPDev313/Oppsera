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
      <div className="flex h-32 items-center justify-center rounded-lg border border-border">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (configError) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-center text-sm text-red-500">
        {configError}
      </div>
    );
  }

  if (!config) {
    return (
      <div className="rounded-lg border border-border bg-muted p-4 text-center text-sm text-muted-foreground">
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
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-center text-sm text-amber-500">
      Card payments are not available at this time.
    </div>
  );
}
