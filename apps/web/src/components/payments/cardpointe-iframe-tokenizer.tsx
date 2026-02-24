'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { TokenizeResult } from '@oppsera/shared';

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
  /** Called when tokenization succeeds with a normalized result */
  onTokenize: (result: TokenizeResult) => void;
  /** Called when tokenization fails */
  onError: (error: string) => void;
  /** Optional placeholder text for card number */
  placeholder?: string;
  /** Format card number with spaces (CardPointe formatinput param) */
  formatInput?: boolean;
  /** Restrict card number to numeric-only input */
  cardNumberNumericOnly?: boolean;
}

/**
 * Parse a CardPointe MMYY expiry string into month/year numbers.
 * Returns null values when the expiry is missing or malformed.
 */
function parseExpiry(expiry?: string): { expMonth: number | null; expYear: number | null } {
  if (!expiry || expiry.length < 4) return { expMonth: null, expYear: null };
  const mm = parseInt(expiry.slice(0, 2), 10);
  const yy = parseInt(expiry.slice(2, 4), 10);
  if (isNaN(mm) || isNaN(yy)) return { expMonth: null, expYear: null };
  return { expMonth: mm, expYear: 2000 + yy };
}

/**
 * CardPointe tokens end with the last 4 digits of the card number.
 * Extract them for display purposes.
 */
function extractLast4(token: string): string | null {
  if (token.length < 4) return null;
  const last4 = token.slice(-4);
  return /^\d{4}$/.test(last4) ? last4 : null;
}

/**
 * Detect card brand from the first digit of the token.
 * CardPointe tokens preserve the leading digit.
 */
function detectBrandFromToken(token: string): string | null {
  if (!token || token.length < 1) return null;
  const first = token[0];
  if (first === '4') return 'visa';
  if (first === '5') return 'mastercard';
  if (first === '3') return 'amex';
  if (first === '6') return 'discover';
  return null;
}

/**
 * CardPointe Hosted iFrame Tokenizer — PCI-compliant card input.
 *
 * Embeds CardPointe's hosted iframe that captures card data and returns
 * a CardSecure token via window.postMessage. Card data never touches our servers.
 *
 * Outputs a normalized `TokenizeResult` for provider-agnostic downstream handling.
 */
export function CardPointeIframeTokenizer({
  site,
  iframeUrl,
  useExpiry = true,
  useCvv = true,
  css,
  onTokenize,
  onError,
  placeholder = 'Card Number',
  formatInput,
  cardNumberNumericOnly,
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
    if (formatInput) params.set('formatinput', 'true');
    if (cardNumberNumericOnly) params.set('cardnumbernumericonly', 'true');
    // Enable autosubmit — the iframe will fire a postMessage when the card is ready
    params.set('tokenizewheninactive', 'true');
    // Enable enhanced response format for richer error reporting
    params.set('enhancedresponse', 'true');
    // Fire events on invalid input so we can clear stale tokens
    params.set('invalidinputevent', 'true');
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

      // Enhanced response format: { token, errorMessage, errorCode }
      // Legacy format: { message, expiry, validationError }

      // Handle errors from either format
      const errorMsg = data.errorMessage || data.validationError;
      if (errorMsg) {
        onError(String(errorMsg));
        return;
      }

      // Extract token from either format
      const rawToken = data.token || data.message;
      if (rawToken && typeof rawToken === 'string' && rawToken.length > 0) {
        const expiry = data.expiry as string | undefined;
        const { expMonth, expYear } = parseExpiry(expiry);

        onTokenize({
          provider: 'cardpointe',
          token: rawToken,
          last4: extractLast4(rawToken),
          brand: detectBrandFromToken(rawToken),
          expMonth,
          expYear,
          source: 'hosted_iframe',
          metadata: {
            ...(expiry ? { rawExpiry: expiry } : {}),
            ...(data.errorCode ? { errorCode: data.errorCode } : {}),
          },
        });
      }
    },
    [onTokenize, onError],
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
