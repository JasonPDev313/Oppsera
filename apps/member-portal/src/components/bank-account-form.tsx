'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTokenizeBankAccount, useAddBankAccount } from '@/hooks/use-portal-data';

interface BankAccountFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * ABA routing number checksum validation.
 * The 9-digit routing number must satisfy:
 * 3*(d1+d4+d7) + 7*(d2+d5+d8) + (d3+d6+d9) mod 10 == 0
 */
function isValidRoutingNumber(value: string): boolean {
  if (!/^\d{9}$/.test(value)) return false;
  const d = value.split('').map(Number);
  const checksum = 3 * (d[0]! + d[3]! + d[6]!) + 7 * (d[1]! + d[4]! + d[7]!) + (d[2]! + d[5]! + d[8]!);
  return checksum % 10 === 0;
}

export function BankAccountForm({ onSuccess, onCancel }: BankAccountFormProps) {
  const [routingNumber, setRoutingNumber] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('');
  const [accountType, setAccountType] = useState<'checking' | 'savings'>('checking');
  const [bankName, setBankName] = useState('');
  const [nickname, setNickname] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { tokenize, isSubmitting: isTokenizing } = useTokenizeBankAccount();
  const { addBankAccount, isSubmitting: isAdding } = useAddBankAccount();
  const isSubmitting = isTokenizing || isAdding;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side validation
    if (!isValidRoutingNumber(routingNumber)) {
      setError('Invalid routing number. Please enter a valid 9-digit ABA routing number.');
      return;
    }
    if (accountNumber.length < 4 || accountNumber.length > 17) {
      setError('Account number must be between 4 and 17 digits.');
      return;
    }
    if (accountNumber !== confirmAccountNumber) {
      setError('Account numbers do not match.');
      return;
    }

    try {
      // Step 1: Tokenize the bank account
      const { token } = await tokenize({
        routingNumber,
        accountNumber,
        accountType,
      });

      // Step 2: Add the tokenized bank account to the profile
      await addBankAccount({
        clientRequestId: crypto.randomUUID(),
        token,
        routingLast4: routingNumber.slice(-4),
        accountLast4: accountNumber.slice(-4),
        accountType,
        bankName: bankName || undefined,
        nickname: nickname || undefined,
        isDefault,
        skipVerification: false,
      });

      onSuccess();
    } catch (err: any) {
      setError(err.message ?? 'Failed to add bank account');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Routing Number */}
      <div>
        <label className="block text-sm font-medium text-[var(--portal-text)] mb-1">
          Routing Number
        </label>
        <input
          type="text"
          inputMode="numeric"
          pattern="\d{9}"
          maxLength={9}
          value={routingNumber}
          onChange={(e) => setRoutingNumber(e.target.value.replace(/\D/g, ''))}
          placeholder="9-digit ABA routing number"
          required
          disabled={isSubmitting}
          className="w-full border border-[var(--portal-border)] rounded-lg px-3 py-2 text-sm bg-[var(--portal-surface)] focus:ring-2 focus:ring-[var(--portal-primary)] focus:border-transparent disabled:opacity-50"
        />
      </div>

      {/* Account Number */}
      <div>
        <label className="block text-sm font-medium text-[var(--portal-text)] mb-1">
          Account Number
        </label>
        <input
          type="password"
          inputMode="numeric"
          maxLength={17}
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
          placeholder="4-17 digit account number"
          required
          disabled={isSubmitting}
          className="w-full border border-[var(--portal-border)] rounded-lg px-3 py-2 text-sm bg-[var(--portal-surface)] focus:ring-2 focus:ring-[var(--portal-primary)] focus:border-transparent disabled:opacity-50"
        />
      </div>

      {/* Confirm Account Number */}
      <div>
        <label className="block text-sm font-medium text-[var(--portal-text)] mb-1">
          Confirm Account Number
        </label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={17}
          value={confirmAccountNumber}
          onChange={(e) => setConfirmAccountNumber(e.target.value.replace(/\D/g, ''))}
          placeholder="Re-enter account number"
          required
          disabled={isSubmitting}
          className="w-full border border-[var(--portal-border)] rounded-lg px-3 py-2 text-sm bg-[var(--portal-surface)] focus:ring-2 focus:ring-[var(--portal-primary)] focus:border-transparent disabled:opacity-50"
        />
      </div>

      {/* Account Type */}
      <div>
        <label className="block text-sm font-medium text-[var(--portal-text)] mb-1">
          Account Type
        </label>
        <select
          value={accountType}
          onChange={(e) => setAccountType(e.target.value as 'checking' | 'savings')}
          disabled={isSubmitting}
          className="w-full border border-[var(--portal-border)] rounded-lg px-3 py-2 text-sm bg-[var(--portal-surface)] focus:ring-2 focus:ring-[var(--portal-primary)] focus:border-transparent disabled:opacity-50"
        >
          <option value="checking">Checking</option>
          <option value="savings">Savings</option>
        </select>
      </div>

      {/* Bank Name (optional) */}
      <div>
        <label className="block text-sm font-medium text-[var(--portal-text)] mb-1">
          Bank Name <span className="text-[var(--portal-text-muted)]">(optional)</span>
        </label>
        <input
          type="text"
          maxLength={100}
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
          placeholder="e.g. Chase, Wells Fargo"
          disabled={isSubmitting}
          className="w-full border border-[var(--portal-border)] rounded-lg px-3 py-2 text-sm bg-[var(--portal-surface)] focus:ring-2 focus:ring-[var(--portal-primary)] focus:border-transparent disabled:opacity-50"
        />
      </div>

      {/* Nickname (optional) */}
      <div>
        <label className="block text-sm font-medium text-[var(--portal-text)] mb-1">
          Nickname <span className="text-[var(--portal-text-muted)]">(optional)</span>
        </label>
        <input
          type="text"
          maxLength={50}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="e.g. My Checking Account"
          disabled={isSubmitting}
          className="w-full border border-[var(--portal-border)] rounded-lg px-3 py-2 text-sm bg-[var(--portal-surface)] focus:ring-2 focus:ring-[var(--portal-primary)] focus:border-transparent disabled:opacity-50"
        />
      </div>

      {/* Default Toggle */}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          disabled={isSubmitting}
          className="rounded border-[var(--portal-border)]"
        />
        <span className="text-[var(--portal-text)]">Set as default payment method for autopay</span>
      </label>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--portal-text-muted)] hover:bg-gray-100 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--portal-primary)] text-white hover:opacity-90 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? 'Adding...' : 'Add Bank Account'}
        </button>
      </div>
    </form>
  );
}
