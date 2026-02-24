'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, CreditCard, Loader2 } from 'lucide-react';
import type { TokenizeResult } from '@oppsera/shared';
import { PaymentMethodCapture } from '@/components/payments/payment-method-capture';
import { useTokenizerConfig } from '@/hooks/use-tokenizer-config';
import { usePaymentMethodMutations } from '@/hooks/use-payment-methods';

interface AddPaymentMethodDialogProps {
  customerId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddPaymentMethodDialog({
  customerId,
  onClose,
  onSuccess,
}: AddPaymentMethodDialogProps) {
  const { addMethod, isLoading: isSaving } = usePaymentMethodMutations();
  const { config, isLoading: configLoading, error: configError } = useTokenizerConfig();

  const [tokenResult, setTokenResult] = useState<TokenizeResult | null>(null);
  const [nickname, setNickname] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTokenize = useCallback((result: TokenizeResult) => {
    setTokenResult(result);
    setError(null);
  }, []);

  const handleTokenError = useCallback((msg: string) => {
    setTokenResult(null);
    setError(msg);
  }, []);

  const handleSubmit = async () => {
    if (!tokenResult) {
      setError('Please enter card details above.');
      return;
    }
    // Reconstruct MMYY expiry from TokenizeResult
    let expiry: string | undefined;
    if (tokenResult.expMonth != null && tokenResult.expYear != null) {
      const mm = String(tokenResult.expMonth).padStart(2, '0');
      const yy = String(tokenResult.expYear % 100).padStart(2, '0');
      expiry = `${mm}${yy}`;
    } else {
      expiry = (tokenResult.metadata.rawExpiry as string | undefined) ?? undefined;
    }
    if (!expiry) {
      setError('Card expiry is required.');
      return;
    }
    setError(null);
    try {
      await addMethod(customerId, {
        clientRequestId: `add-pm-${customerId}-${Date.now()}`,
        token: tokenResult.token,
        expiry,
        nickname: nickname.trim() || undefined,
        isDefault,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save payment method.');
    }
  };

  // Escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Add Payment Method</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4">
          {/* Card input */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Card Details
            </label>
            <PaymentMethodCapture
              config={config}
              isConfigLoading={configLoading}
              configError={configError}
              onTokenize={handleTokenize}
              onError={handleTokenError}
              showWallets={false}
            />
            {tokenResult && (
              <p className="mt-1 text-xs text-green-600">
                Card tokenized successfully.
              </p>
            )}
          </div>

          {/* Nickname */}
          <div>
            <label htmlFor="pm-nickname" className="mb-1 block text-sm font-medium text-gray-700">
              Nickname <span className="text-gray-400">(optional)</span>
            </label>
            <input
              id="pm-nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g., Personal Visa, Business Amex"
              maxLength={50}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          {/* Default toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-700">Set as default payment method</span>
          </label>

          {/* Error */}
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!tokenResult || isSaving || !!configError}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Card
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
