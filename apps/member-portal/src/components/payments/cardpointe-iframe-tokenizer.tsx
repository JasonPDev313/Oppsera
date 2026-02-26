'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { TokenizeResult } from '@oppsera/shared';

interface CardPointeIframeTokenizerProps {
  site: string;
  iframeUrl?: string;
  useExpiry?: boolean;
  useCvv?: boolean;
  css?: string;
  onTokenize: (result: TokenizeResult) => void;
  onError: (error: string) => void;
  placeholder?: string;
  formatInput?: boolean;
  cardNumberNumericOnly?: boolean;
}

function parseExpiry(expiry?: string): { expMonth: number | null; expYear: number | null } {
  if (!expiry || expiry.length < 4) return { expMonth: null, expYear: null };
  const mm = parseInt(expiry.slice(0, 2), 10);
  const yy = parseInt(expiry.slice(2, 4), 10);
  if (isNaN(mm) || isNaN(yy)) return { expMonth: null, expYear: null };
  return { expMonth: mm, expYear: 2000 + yy };
}

function extractLast4(token: string): string | null {
  if (token.length < 4) return null;
  const last4 = token.slice(-4);
  return /^\d{4}$/.test(last4) ? last4 : null;
}

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
 * CardPointe Hosted iFrame Tokenizer for the member portal.
 * Same implementation as the web app version.
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

  const src = (() => {
    const base = iframeUrl ?? `https://${site}.cardconnect.com/itoke/ajax-tokenizer.html`;
    const params = new URLSearchParams();
    if (useExpiry) params.set('useexpiry', 'true');
    if (useCvv) params.set('usecvv', 'true');
    if (css) params.set('css', css);
    if (placeholder) params.set('placeholder', placeholder);
    if (formatInput) params.set('formatinput', 'true');
    if (cardNumberNumericOnly) params.set('cardnumbernumericonly', 'true');
    params.set('tokenizewheninactive', 'true');
    params.set('enhancedresponse', 'true');
    params.set('invalidinputevent', 'true');
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  })();

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (!event.origin.endsWith('.cardconnect.com')) return;
      const data = event.data;
      if (typeof data !== 'object' || data === null) return;

      const errorMsg = data.errorMessage || data.validationError;
      if (errorMsg) {
        onError(String(errorMsg));
        return;
      }

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
        <div className="absolute inset-0 flex items-center justify-center bg-muted rounded-lg border border-border">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <span className="ml-2 text-sm text-muted-foreground">Loading card input...</span>
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
