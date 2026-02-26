'use client';

import { usePortalAccount, usePortalAutopay, useUpdateAutopay } from '@/hooks/use-portal-data';
import { CreditCard, Settings, ArrowLeft, Wallet, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

function formatMoney(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

export default function AccountPage() {
  const { data: account, isLoading, error } = usePortalAccount();
  const { data: autopay, refresh: refreshAutopay } = usePortalAutopay();
  const { updateAutopay, isSubmitting } = useUpdateAutopay();
  const params = useParams();
  const tenantSlug = params?.tenantSlug as string;

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-8 text-center">
          <p className="text-[var(--portal-text-muted)]">No account information available.</p>
        </div>
      </div>
    );
  }

  async function handleToggleAutopay() {
    try {
      await updateAutopay({ enabled: !autopay?.enabled });
      refreshAutopay();
    } catch {
      // Error handled by hook
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/${tenantSlug}/dashboard`}
          className="text-[var(--portal-text-muted)] hover:text-[var(--portal-text)]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold">Account Details</h1>
      </div>

      {/* Account Info */}
      <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-4">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          Membership Account
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-[var(--portal-text-muted)]">Account Number</dt>
            <dd className="font-medium">{account.accountNumber}</dd>
          </div>
          <div>
            <dt className="text-[var(--portal-text-muted)]">Status</dt>
            <dd className="font-medium capitalize">{account.status}</dd>
          </div>
          <div>
            <dt className="text-[var(--portal-text-muted)]">Member Role</dt>
            <dd className="font-medium capitalize">{account.memberRole}</dd>
          </div>
          <div>
            <dt className="text-[var(--portal-text-muted)]">Credit Limit</dt>
            <dd className="font-medium">{formatMoney(account.creditLimitCents)}</dd>
          </div>
          <div>
            <dt className="text-[var(--portal-text-muted)]">Statement Day</dt>
            <dd className="font-medium">{account.statementDayOfMonth} of each month</dd>
          </div>
          <div>
            <dt className="text-[var(--portal-text-muted)]">Member Since</dt>
            <dd className="font-medium">{account.startDate ?? '—'}</dd>
          </div>
        </dl>
      </div>

      {/* Payment Methods */}
      <Link
        href={`/${tenantSlug}/account/payment-methods`}
        className="block bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-4 hover:border-[var(--portal-primary)] transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wallet className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-semibold text-sm">Payment Methods</p>
              <p className="text-sm text-[var(--portal-text-muted)]">
                Manage cards and bank accounts for autopay and payments
              </p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </div>
      </Link>

      {/* Autopay Settings */}
      <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-4">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Settings className="h-5 w-5 text-muted-foreground" />
          Autopay Settings
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Automatic Payments</p>
            <p className="text-sm text-[var(--portal-text-muted)]">
              {autopay?.enabled
                ? `Strategy: ${autopay.strategy ?? 'Default'}`
                : 'Disabled — payments must be made manually'}
            </p>
          </div>
          <button
            onClick={handleToggleAutopay}
            disabled={isSubmitting}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              autopay?.enabled
                ? 'bg-muted text-foreground hover:bg-accent'
                : 'bg-[var(--portal-primary)] text-white hover:opacity-90'
            } disabled:opacity-50`}
          >
            {isSubmitting ? '...' : autopay?.enabled ? 'Disable' : 'Enable'}
          </button>
        </div>
      </div>
    </div>
  );
}
