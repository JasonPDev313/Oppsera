/**
 * Receipt Builder Hook
 *
 * Wraps buildReceiptDocument() with server-side data fetching.
 * Returns { document, isLoading, error, rebuild }.
 */

'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { apiFetch } from '@/lib/api-client';
import {
  buildReceiptDocument,
  orderForReceiptToInput,
  DEFAULT_RECEIPT_SETTINGS,
} from '@oppsera/shared';
import type {
  ReceiptDocument,
  ReceiptVariant,
  BuildReceiptInput,
  LegacyOrderForReceipt,
  LegacyTenderForReceipt,
} from '@oppsera/shared';
import type { ReceiptSettings } from '@oppsera/shared';

interface UseReceiptBuilderOptions {
  orderId: string | null;
  variant?: ReceiptVariant;
  locationId?: string;
  /** Pre-fetched order data (skips API call when provided) */
  order?: LegacyOrderForReceipt | null;
  /** Pre-fetched tenders (skips API call when provided) */
  tenders?: LegacyTenderForReceipt[] | null;
  /** Pre-fetched settings (skips API call when provided) */
  settings?: ReceiptSettings | null;
  /** Business name override */
  businessName?: string;
  /** Location name override */
  locationName?: string;
}

interface UseReceiptBuilderResult {
  document: ReceiptDocument | null;
  isLoading: boolean;
  error: string | null;
  rebuild: () => void;
}

export function useReceiptBuilder({
  orderId,
  variant = 'standard',
  locationId,
  order: preOrder,
  tenders: preTenders,
  settings: preSettings,
  businessName,
  locationName,
}: UseReceiptBuilderOptions): UseReceiptBuilderResult {
  const [document, setDocument] = useState<ReceiptDocument | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const buildKeyRef = useRef(0);

  const build = useCallback(async () => {
    if (!orderId && !preOrder) {
      setDocument(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    const key = ++buildKeyRef.current;

    try {
      // If all data is pre-fetched, build client-side
      if (preOrder && preSettings) {
        const input = orderForReceiptToInput(
          preOrder,
          businessName ?? 'Business',
          locationName ?? '',
          preTenders ?? [],
          preSettings,
          { variant, tenantId: '', locationId: locationId ?? '' },
        );
        const doc = buildReceiptDocument(input);
        if (mountedRef.current && key === buildKeyRef.current) {
          setDocument(doc);
          setIsLoading(false);
        }
        return;
      }

      // Otherwise, use the server-side build API
      const res = await apiFetch<{ data: ReceiptDocument }>(
        '/api/v1/receipts/build',
        {
          method: 'POST',
          body: JSON.stringify({
            orderId,
            variant,
          }),
        },
      );

      if (mountedRef.current && key === buildKeyRef.current) {
        setDocument(res.data);
        setIsLoading(false);
      }
    } catch (err) {
      if (mountedRef.current && key === buildKeyRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to build receipt');
        setDocument(null);
        setIsLoading(false);
      }
    }
  }, [orderId, variant, locationId, preOrder, preTenders, preSettings, businessName, locationName]);

  useEffect(() => {
    mountedRef.current = true;
    build();
    return () => {
      mountedRef.current = false;
    };
  }, [build]);

  const rebuild = useCallback(() => {
    build();
  }, [build]);

  return { document, isLoading, error, rebuild };
}
