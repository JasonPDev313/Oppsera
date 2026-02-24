'use client';

import type { TokenizeResult, TokenizerClientConfig } from '@oppsera/shared';
import { CardPointeIframeTokenizer } from './cardpointe-iframe-tokenizer';
import { WalletButtons } from './wallet-buttons';

interface TokenizerProviderProps {
  /** Resolved tokenizer configuration from the backend. */
  config: TokenizerClientConfig;
  /** Called when any tokenizer produces a normalized result. */
  onTokenize: (result: TokenizeResult) => void;
  /** Called when tokenization fails. */
  onError: (error: string) => void;
  /** Whether to show digital wallet buttons (Apple Pay, Google Pay). */
  showWallets?: boolean;
  /** Amount in cents (required for wallet button display). */
  amountCents?: number;
  /** Custom CSS for the iframe tokenizer. */
  css?: string;
}

/**
 * Provider-agnostic tokenizer switch.
 *
 * Renders the correct tokenizer implementation based on `config.providerCode`:
 * - `'cardpointe'` → CardPointeIframeTokenizer + optional WalletButtons
 * - Future: `'stripe'` → StripeElements, `'adyen'` → AdyenComponent
 *
 * All tokenizers funnel through the same `onTokenize(TokenizeResult)` callback,
 * so downstream components never know which provider is active.
 */
export function TokenizerProvider({
  config,
  onTokenize,
  onError,
  showWallets = false,
  amountCents,
  css,
}: TokenizerProviderProps) {
  if (config.providerCode === 'cardpointe' && config.iframe) {
    return (
      <div className="space-y-4">
        <CardPointeIframeTokenizer
          site={config.iframe.site}
          iframeUrl={config.iframe.iframeUrl}
          useExpiry
          useCvv
          css={css}
          onTokenize={onTokenize}
          onError={onError}
          formatInput
        />
        {showWallets && config.wallets && (config.wallets.applePay || config.wallets.googlePay) && (
          <WalletButtons
            config={config}
            onTokenize={onTokenize}
            onError={onError}
            amountCents={amountCents ?? 0}
          />
        )}
      </div>
    );
  }

  // Unknown provider — graceful fallback
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-700">
      Payment provider &ldquo;{config.providerCode}&rdquo; is not yet supported for online card entry.
    </div>
  );
}
