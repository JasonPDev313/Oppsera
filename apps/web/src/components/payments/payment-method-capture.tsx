'use client';

import { Loader2 } from 'lucide-react';
import type { TokenizeResult, TokenizerClientConfig } from '@oppsera/shared';
import { TokenizerProvider } from './tokenizer-provider';

interface PaymentMethodCaptureProps {
  /** Tokenizer configuration (null while loading). */
  config: TokenizerClientConfig | null;
  /** Whether the config is still loading. */
  isConfigLoading: boolean;
  /** Error message if config fetch failed. */
  configError: string | null;
  /** Called when any tokenizer produces a normalized result. */
  onTokenize: (result: TokenizeResult) => void;
  /** Called when tokenization fails. */
  onError: (error: string) => void;
  /** Whether to show digital wallet buttons (default: false). */
  showWallets?: boolean;
  /** Amount in cents (required for wallet display). */
  amountCents?: number;
  /** Custom CSS for the iframe tokenizer. */
  css?: string;
}

/**
 * Universal card/wallet capture component.
 *
 * Thin wrapper that handles loading/error states around `TokenizerProvider`.
 * Drop into any payment UI — POS, guest pay, customer profile, member portal.
 *
 * ```tsx
 * const { config, isLoading, error } = useTokenizerConfig({ locationId });
 * <PaymentMethodCapture
 *   config={config}
 *   isConfigLoading={isLoading}
 *   configError={error}
 *   onTokenize={(result) => setCardToken(result.token)}
 *   onError={(msg) => setError(msg)}
 *   showWallets={false}
 * />
 * ```
 */
export function PaymentMethodCapture({
  config,
  isConfigLoading,
  configError,
  onTokenize,
  onError,
  showWallets = false,
  amountCents,
  css,
}: PaymentMethodCaptureProps) {
  // Loading state
  if (isConfigLoading) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-gray-200">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  // Config error
  if (configError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">
        {configError}
      </div>
    );
  }

  // Config loaded but null (no provider configured)
  if (!config) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
        Card payments are not configured for this location.
      </div>
    );
  }

  // Render the provider-specific tokenizer
  return (
    <TokenizerProvider
      config={config}
      onTokenize={onTokenize}
      onError={onError}
      showWallets={showWallets}
      amountCents={amountCents}
      css={css}
    />
  );
}
