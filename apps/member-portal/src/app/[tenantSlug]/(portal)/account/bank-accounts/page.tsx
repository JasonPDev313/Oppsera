'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Building2, CheckCircle2, AlertCircle, Loader2, Shield } from 'lucide-react';
import {
  usePortalBankAccounts,
  useRemoveBankAccount,
  useVerifyBankAccount,
  type PortalBankAccount,
} from '@/hooks/use-portal-data';
import { BankAccountForm } from '@/components/bank-account-form';

function VerificationBadge({ status }: { status: PortalBankAccount['verificationStatus'] }) {
  switch (status) {
    case 'verified':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
          <CheckCircle2 className="h-3 w-3" /> Verified
        </span>
      );
    case 'pending_micro':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full">
          <AlertCircle className="h-3 w-3" /> Pending Verification
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
          <AlertCircle className="h-3 w-3" /> Failed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
          Unverified
        </span>
      );
  }
}

function VerifyForm({ account, onVerified }: { account: PortalBankAccount; onVerified: () => void }) {
  const [amount1, setAmount1] = useState('');
  const [amount2, setAmount2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { verify, isSubmitting } = useVerifyBankAccount();

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const a1 = parseInt(amount1, 10);
    const a2 = parseInt(amount2, 10);
    if (isNaN(a1) || isNaN(a2) || a1 < 1 || a1 > 99 || a2 < 1 || a2 > 99) {
      setError('Enter amounts between 1 and 99 cents.');
      return;
    }

    try {
      const result = await verify(account.id, a1, a2);
      if (result.verified) {
        onVerified();
      } else {
        setError(`Incorrect amounts. ${result.remainingAttempts} attempt(s) remaining.`);
      }
    } catch (err: any) {
      setError(err.message ?? 'Verification failed');
    }
  }

  return (
    <form onSubmit={handleVerify} className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
      <p className="text-sm text-yellow-800 mb-2">
        Two small deposits were sent to your bank account. Enter the amounts below to verify ownership.
      </p>
      {error && (
        <p className="text-sm text-red-600 mb-2">{error}</p>
      )}
      <div className="flex items-end gap-2">
        <div>
          <label className="block text-xs font-medium text-yellow-800 mb-1">Deposit 1 (cents)</label>
          <input
            type="number"
            min={1}
            max={99}
            value={amount1}
            onChange={(e) => setAmount1(e.target.value)}
            placeholder="e.g. 32"
            required
            disabled={isSubmitting}
            className="w-24 border border-yellow-300 rounded px-2 py-1.5 text-sm bg-white disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-yellow-800 mb-1">Deposit 2 (cents)</label>
          <input
            type="number"
            min={1}
            max={99}
            value={amount2}
            onChange={(e) => setAmount2(e.target.value)}
            placeholder="e.g. 47"
            required
            disabled={isSubmitting}
            className="w-24 border border-yellow-300 rounded px-2 py-1.5 text-sm bg-white disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-3 py-1.5 text-sm font-medium bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50 flex items-center gap-1"
        >
          {isSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
          Verify
        </button>
      </div>
    </form>
  );
}

function BankAccountCard({
  account,
  onDelete,
  onVerified,
}: {
  account: PortalBankAccount;
  onDelete: (id: string) => void;
  onVerified: () => void;
}) {
  const [showVerify, setShowVerify] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const displayName = account.nickname ?? account.bankName ?? 'Bank Account';
  const accountTypeName = account.bankAccountType === 'savings' ? 'Savings' : 'Checking';

  return (
    <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Building2 className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm">{displayName}</p>
              {account.isDefault && (
                <span className="text-xs font-medium text-[var(--portal-primary)] bg-blue-50 px-2 py-0.5 rounded-full">
                  Default
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--portal-text-muted)]">
              {accountTypeName} ****{account.accountLast4}
              {account.bankRoutingLast4 && ` \u00B7 Routing ****${account.bankRoutingLast4}`}
            </p>
            <div className="mt-1">
              <VerificationBadge status={account.verificationStatus} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {account.verificationStatus === 'pending_micro' && (
            <button
              onClick={() => setShowVerify(!showVerify)}
              className="text-sm font-medium text-[var(--portal-primary)] hover:underline flex items-center gap-1"
            >
              <Shield className="h-3.5 w-3.5" />
              Verify
            </button>
          )}
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors"
              title="Remove bank account"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onDelete(account.id)}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-[var(--portal-text-muted)] hover:underline"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {showVerify && account.verificationStatus === 'pending_micro' && (
        <VerifyForm
          account={account}
          onVerified={() => {
            setShowVerify(false);
            onVerified();
          }}
        />
      )}
    </div>
  );
}

export default function BankAccountsPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const { data: accounts, isLoading, error, refresh } = usePortalBankAccounts();
  const { removeBankAccount } = useRemoveBankAccount();
  const params = useParams();
  const tenantSlug = params?.tenantSlug as string;

  async function handleDelete(paymentMethodId: string) {
    try {
      await removeBankAccount(paymentMethodId);
      refresh();
    } catch {
      // Error handled by hook
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="h-32 bg-gray-200 rounded-lg animate-pulse" />
        <div className="h-32 bg-gray-200 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/${tenantSlug}/account`}
            className="text-[var(--portal-text-muted)] hover:text-[var(--portal-text)]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold">Bank Accounts</h1>
        </div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-[var(--portal-primary)] text-white rounded-lg hover:opacity-90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Bank Account
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-4">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-gray-400" />
            Add Bank Account
          </h2>
          <BankAccountForm
            onSuccess={() => {
              setShowAddForm(false);
              refresh();
            }}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}

      {/* Bank Account List */}
      {accounts && accounts.length > 0 ? (
        <div className="space-y-3">
          {accounts.map((account) => (
            <BankAccountCard
              key={account.id}
              account={account}
              onDelete={handleDelete}
              onVerified={refresh}
            />
          ))}
        </div>
      ) : (
        !showAddForm && (
          <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-8 text-center">
            <Building2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-[var(--portal-text-muted)] mb-4">
              No bank accounts on file. Add one to use for autopay or payments.
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-[var(--portal-primary)] text-white rounded-lg hover:opacity-90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Bank Account
            </button>
          </div>
        )
      )}

      {/* Security Notice */}
      <div className="text-xs text-[var(--portal-text-muted)] flex items-start gap-2">
        <Shield className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          Your bank account information is securely tokenized and never stored in plain text.
          Micro-deposit verification may be required before the account can be used for payments.
        </p>
      </div>
    </div>
  );
}
