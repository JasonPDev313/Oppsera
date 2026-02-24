'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface TokenResult {
  token: string;
  expiry?: string;
}

interface CardPointeIframeTokenizerProps {
  /** CardPointe site name (e.g. 'fts-uat' for sandbox) */
  site: string;
  /** Full iframe URL — if provided, overrides the site-based URL */
  iframeUrl?: string;
  /** Collect expiry date */
  useExpiry?: boolean;
  /** Collect CVV */
  useCvv?: boolean;
  /** Custom CSS to inject into the iframe (CardPointe CSS parameter) */
  css?: string;
  /** Called when tokenization succeeds */
  onToken: (result: TokenResult) => void;
  /** Called when tokenization fails */
  onError: (error: string) => void;
  /** Optional placeholder text for card number */
  placeholder?: string;
}

/**
 * CardPointe Hosted iFrame Tokenizer — PCI-compliant card input.
 *
 * Embeds CardPointe's hosted iframe that captures card data and returns
 * a CardSecure token via window.postMessage. Card data never touches our servers.
 *
 * Usage:
 * ```tsx
 * <CardPointeIframeTokenizer
 *   site="fts-uat"
 *   useExpiry
 *   useCvv
 *   onToken={({ token, expiry }) => { ... }}
 *   onError={(msg) => { ... }}
 * />
 * ```
 */
export function CardPointeIframeTokenizer({
  site,
  iframeUrl,
  useExpiry = true,
  useCvv = true,
  css,
  onToken,
  onError,
  placeholder = 'Card Number',
}: CardPointeIframeTokenizerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Build iframe src URL
  const src = (() => {
    const base = iframeUrl ?? `https://${site}.cardconnect.com/itoke/ajax-tokenizer.html`;
    const params = new URLSearchParams();
    if (useExpiry) params.set('useexpiry', 'true');
    if (useCvv) params.set('usecvv', 'true');
    if (css) params.set('css', css);
    if (placeholder) params.set('placeholder', placeholder);
    // Enable autosubmit — the iframe will fire a postMessage when the card is ready
    params.set('tokenizewheninactive', 'true');
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  })();

  // Listen for postMessage from the CardPointe iframe
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      // Validate origin — must be from CardConnect domain
      if (!event.origin.endsWith('.cardconnect.com')) return;

      const data = event.data;
      if (typeof data !== 'object' || data === null) return;

      // CardPointe sends: { message: "token_value", expiry: "MMYY", validationError: "" }
      if (data.validationError) {
        onError(data.validationError);
        return;
      }

      if (data.message && typeof data.message === 'string' && data.message.length > 0) {
        onToken({
          token: data.message,
          expiry: data.expiry ?? undefined,
        });
      }
    },
    [onToken, onError],
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  return (
    <div className="relative">
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <span className="ml-2 text-sm text-gray-500">Loading card input...</span>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={src}
        title="Card Payment Input"
        onLoad={() => setIsLoaded(true)}
        className="w-full border-0"
        style={{ height: useExpiry || useCvv ? '180px' : '60px', minHeight: '60px' }}
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
    </div>
  );
}
