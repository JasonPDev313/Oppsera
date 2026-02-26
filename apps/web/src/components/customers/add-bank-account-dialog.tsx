'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Landmark, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface AddBankAccountDialogProps {
  customerId: string;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Validates ABA routing number checksum (Luhn-like for ABA).
 * Sum of (3*d1 + 7*d2 + d3 + 3*d4 + 7*d5 + d6 + 3*d7 + 7*d8 + d9) mod 10 === 0
 */
function isValidRoutingNumber(routing: string): boolean {
  if (!/^\d{9}$/.test(routing)) return false;
  const d = routing.split('').map(Number);
  const sum = 3 * (d[0]! + d[3]! + d[6]!) + 7 * (d[1]! + d[4]! + d[7]!) + (d[2]! + d[5]! + d[8]!);
  return sum % 10 === 0;
}

export function AddBankAccountDialog({ customerId, onClose, onSuccess }: AddBankAccountDialogProps) {
  const [routingNumber, setRoutingNumber] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmAccount, setConfirmAccount] = useState('');
  const [accountType, setAccountType] = useState<'checking' | 'savings'>('checking');
  const [bankName, setBankName] = useState('');
  const [nickname, setNickname] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const routingValid = isValidRoutingNumber(routingNumber);
  const accountValid = /^\d{4,17}$/.test(accountNumber);
  const accountsMatch = accountNumber === confirmAccount;
  const canSubmit = routingValid && accountValid && accountsMatch && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // 1. Tokenize the bank account
      const tokenRes = await apiFetch<{ data: { token: string; bankLast4: string } }>(
        '/api/v1/payments/bank-accounts/tokenize',
        {
          method: 'POST',
          body: JSON.stringify({ routingNumber, accountNumber, accountType }),
        },
      );

      // 2. Add the bank account with the token
      await apiFetch('/api/v1/payments/bank-accounts', {
        method: 'POST',
        body: JSON.stringify({
          clientRequestId: `add-bank-${Date.now()}`,
          customerId,
          token: tokenRes.data.token,
          routingLast4: routingNumber.slice(-4),
          accountLast4: accountNumber.slice(-4),
          accountType,
          bankName: bankName || undefined,
          nickname: nickname || undefined,
          isDefault,
        }),
      });

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add bank account');
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
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Dialog */}
      <div className="relative mx-4 w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-foreground">Add Bank Account</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Routing Number */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Routing Number
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={9}
              value={routingNumber}
              onChange={(e) => setRoutingNumber(e.target.value.replace(/\D/g, '').slice(0, 9))}
              placeholder="123456789"
              className={`w-full rounded-lg border px-3 py-2 text-sm ${
                routingNumber.length === 9 && !routingValid
                  ? 'border-red-300 focus:ring-red-500'
                  : 'border-input focus:ring-indigo-500'
              } focus:outline-none focus:ring-2`}
            />
            {routingNumber.length === 9 && !routingValid && (
              <p className="mt-1 text-xs text-red-600">Invalid routing number</p>
            )}
          </div>

          {/* Account Number */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Account Number
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={17}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 17))}
              placeholder="Account number"
              className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Confirm Account Number */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Confirm Account Number
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={17}
              value={confirmAccount}
              onChange={(e) => setConfirmAccount(e.target.value.replace(/\D/g, '').slice(0, 17))}
              placeholder="Re-enter account number"
              className={`w-full rounded-lg border px-3 py-2 text-sm ${
                confirmAccount.length > 0 && !accountsMatch
                  ? 'border-red-300 focus:ring-red-500'
                  : 'border-input focus:ring-indigo-500'
              } focus:outline-none focus:ring-2`}
            />
            {confirmAccount.length > 0 && !accountsMatch && (
              <p className="mt-1 text-xs text-red-600">Account numbers do not match</p>
            )}
          </div>

          {/* Account Type */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Account Type
            </label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="accountType"
                  value="checking"
                  checked={accountType === 'checking'}
                  onChange={() => setAccountType('checking')}
                  className="h-4 w-4 text-indigo-600"
                />
                <span className="text-sm text-foreground">Checking</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="accountType"
                  value="savings"
                  checked={accountType === 'savings'}
                  onChange={() => setAccountType('savings')}
                  className="h-4 w-4 text-indigo-600"
                />
                <span className="text-sm text-foreground">Savings</span>
              </label>
            </div>
          </div>

          {/* Bank Name (optional) */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Bank Name <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="e.g. Chase, Wells Fargo"
              maxLength={100}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Nickname (optional) */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Nickname <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. My Checking"
              maxLength={50}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Default toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 rounded text-indigo-600"
            />
            <span className="text-sm text-foreground">Set as default payment method</span>
          </label>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
              {error}
            </div>
          )}

          {/* Actions */}
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
              disabled={!canSubmit}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Add Bank Account
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
