'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ShieldCheck, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface VerifyBankAccountDialogProps {
  paymentMethodId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function VerifyBankAccountDialog({
  paymentMethodId,
  onClose,
  onSuccess,
}: VerifyBankAccountDialogProps) {
  const [amount1, setAmount1] = useState('');
  const [amount2, setAmount2] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ verified: boolean; remainingAttempts: number } | null>(null);

  const amount1Cents = parseInt(amount1, 10);
  const amount2Cents = parseInt(amount2, 10);
  const canSubmit =
    amount1Cents >= 1 && amount1Cents <= 99 &&
    amount2Cents >= 1 && amount2Cents <= 99 &&
    !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await apiFetch<{
        data: { verified: boolean; remainingAttempts: number };
      }>(`/api/v1/payments/bank-accounts/${paymentMethodId}/verify`, {
        method: 'POST',
        body: JSON.stringify({
          paymentMethodId,
          amount1Cents,
          amount2Cents,
        }),
      });

      setResult(res.data);

      if (res.data.verified) {
        // Short delay to show success state
        setTimeout(() => onSuccess(), 1200);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onKeyDown={handleKeyDown}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative mx-4 w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-foreground">Verify Bank Account</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {result?.verified ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="rounded-full bg-green-500/20 p-3">
              <ShieldCheck className="h-8 w-8 text-green-500" />
            </div>
            <p className="text-sm font-medium text-green-500">Bank account verified!</p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              Two small deposits were made to your bank account. Enter the exact cent amounts
              to verify ownership. Check your bank statement for two deposits labeled
              &ldquo;Verification&rdquo;.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Deposit 1 (cents)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      $0.
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={2}
                      value={amount1}
                      onChange={(e) => setAmount1(e.target.value.replace(/\D/g, '').slice(0, 2))}
                      placeholder="00"
                      className="w-full rounded-lg border border-input pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Deposit 2 (cents)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      $0.
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={2}
                      value={amount2}
                      onChange={(e) => setAmount2(e.target.value.replace(/\D/g, '').slice(0, 2))}
                      placeholder="00"
                      className="w-full rounded-lg border border-input pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {result && !result.verified && (
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-500">
                  Amounts didn&apos;t match.{' '}
                  {result.remainingAttempts > 0
                    ? `${result.remainingAttempts} attempt${result.remainingAttempts === 1 ? '' : 's'} remaining.`
                    : 'No attempts remaining. Please contact support.'}
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit || (result !== null && result.remainingAttempts === 0)}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Verify
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
