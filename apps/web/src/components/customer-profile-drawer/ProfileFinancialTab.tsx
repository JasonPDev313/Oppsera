'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign,
  CreditCard,
  Wallet,
  FileText,
  Star,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import type { CustomerFinancial } from '@/types/customers';

interface ProfileFinancialTabProps {
  customerId: string;
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ProfileFinancialTab({ customerId }: ProfileFinancialTabProps) {
  const [data, setData] = useState<CustomerFinancial | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: CustomerFinancial }>(
        `/api/v1/customers/${customerId}/financial`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load financial data'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner label="Loading financial data..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-600">Failed to load financial data.</p>
        <button
          type="button"
          onClick={fetchData}
          className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          Try again
        </button>
      </div>
    );
  }

  const {
    billingAccounts,
    arAging,
    openInvoices,
    recentPayments,
    walletAccounts,
    walletBalanceCents,
    loyaltyTier,
    loyaltyPointsBalance,
  } = data;

  return (
    <div className="space-y-6 p-6">
      {/* AR Aging Summary */}
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Accounts Receivable
        </h3>
        {arAging.total === 0 ? (
          <p className="text-sm text-gray-500">No outstanding balance.</p>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-gray-500">Total Outstanding</span>
              <span className="text-lg font-semibold text-gray-900">
                {formatCurrency(arAging.total)}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2 text-center text-xs">
              <AgingBucket label="Current" cents={arAging.current} />
              <AgingBucket label="30 Day" cents={arAging.thirtyDay} variant="warning" />
              <AgingBucket label="60 Day" cents={arAging.sixtyDay} variant="warning" />
              <AgingBucket label="90 Day" cents={arAging.ninetyDay} variant="error" />
              <AgingBucket label="120+" cents={arAging.overHundredTwenty} variant="error" />
            </div>
          </div>
        )}
      </section>

      {/* Billing Accounts */}
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Billing Accounts
        </h3>
        {billingAccounts.length === 0 ? (
          <p className="text-sm text-gray-500">No billing accounts.</p>
        ) : (
          <div className="space-y-2">
            {billingAccounts.map((acct) => (
              <div
                key={acct.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{acct.name}</p>
                    <p className="text-xs text-gray-500">
                      Balance: {formatCurrency(acct.currentBalanceCents)}
                      {acct.creditLimitCents !== null && (
                        <> / Limit: {formatCurrency(acct.creditLimitCents)}</>
                      )}
                    </p>
                  </div>
                </div>
                <Badge
                  variant={
                    acct.status === 'active'
                      ? 'success'
                      : acct.status === 'suspended'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {acct.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Open Invoices */}
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Open Invoices
        </h3>
        {openInvoices.length === 0 ? (
          <p className="text-sm text-gray-500">No open invoices.</p>
        ) : (
          <div className="space-y-2">
            {openInvoices.map((inv) => {
              const isOverdue =
                inv.dueDate && new Date(inv.dueDate) < new Date() && inv.status !== 'paid';
              return (
                <div
                  key={inv.id}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                    isOverdue
                      ? 'border-red-200 bg-red-50'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileText
                      className={`h-4 w-4 ${
                        isOverdue ? 'text-red-400' : 'text-gray-400'
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {formatDate(inv.periodStart)} - {formatDate(inv.periodEnd)}
                      </p>
                      <p className="text-xs text-gray-500">
                        Due: {formatDate(inv.dueDate)}
                        {isOverdue && (
                          <span className="ml-1 font-medium text-red-600">Overdue</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      {formatCurrency(inv.closingBalanceCents)}
                    </p>
                    <Badge
                      variant={
                        inv.status === 'paid'
                          ? 'success'
                          : inv.status === 'overdue'
                            ? 'error'
                            : 'neutral'
                      }
                    >
                      {inv.status}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Payments */}
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Recent Payments
        </h3>
        {recentPayments.length === 0 ? (
          <p className="text-sm text-gray-500">No recent payments.</p>
        ) : (
          <div className="space-y-2">
            {recentPayments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {formatCurrency(payment.amountCents)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(payment.createdAt)}
                    </p>
                  </div>
                </div>
                {payment.notes && (
                  <p className="max-w-[160px] truncate text-xs text-gray-500">
                    {payment.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Wallet Accounts */}
      {walletAccounts.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Wallet Accounts
          </h3>
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
            <Wallet className="h-5 w-5 text-indigo-600" />
            <div>
              <p className="text-sm font-semibold text-indigo-900">
                Total Wallet Balance: {formatCurrency(walletBalanceCents)}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {walletAccounts.map((wallet) => (
              <div
                key={wallet.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {wallet.walletType}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatCurrency(wallet.balanceCents)} {wallet.currency}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {wallet.expiresAt && (
                    <span className="text-xs text-gray-400">
                      Exp: {formatDate(wallet.expiresAt)}
                    </span>
                  )}
                  <Badge
                    variant={wallet.status === 'active' ? 'success' : 'neutral'}
                  >
                    {wallet.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Loyalty */}
      {(loyaltyTier || loyaltyPointsBalance > 0) && (
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Loyalty
          </h3>
          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <Star className="h-5 w-5 text-amber-500" />
            <div>
              {loyaltyTier && (
                <p className="text-sm font-semibold text-amber-900">
                  {loyaltyTier} Tier
                </p>
              )}
              <p className="text-xs text-amber-700">
                {loyaltyPointsBalance.toLocaleString()} points
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// --- Internal sub-components ---

function AgingBucket({
  label,
  cents,
  variant,
}: {
  label: string;
  cents: number;
  variant?: 'warning' | 'error';
}) {
  const colorClass =
    cents === 0
      ? 'text-gray-500'
      : variant === 'error'
        ? 'text-red-600 font-semibold'
        : variant === 'warning'
          ? 'text-amber-600 font-medium'
          : 'text-gray-900';

  return (
    <div>
      <p className="text-gray-500">{label}</p>
      <p className={`mt-0.5 text-sm ${colorClass}`}>
        {formatCurrency(cents)}
      </p>
    </div>
  );
}
