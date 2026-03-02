'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign,
  CreditCard,
  Landmark,
  Wallet,
  FileText,
  Star,
  ShieldCheck,
  ShieldAlert,
  Clock,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { usePaymentMethods } from '@/hooks/use-payment-methods';
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
        <p className="text-sm text-red-500">Failed to load financial data.</p>
        <button
          type="button"
          onClick={fetchData}
          className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          Try again
        </button>
      </div>
    );
  }

  const {
    billingAccounts = [],
    arAging = { total: 0, current: 0, thirtyDay: 0, sixtyDay: 0, ninetyDay: 0, overHundredTwenty: 0 },
    openInvoices = [],
    recentPayments = [],
    walletAccounts = [],
    walletBalanceCents = 0,
    loyaltyTier,
    loyaltyPointsBalance = 0,
  } = data;

  const { data: paymentMethods } = usePaymentMethods(customerId);
  const storedCards = paymentMethods?.filter((m) => m.paymentType !== 'bank_account') ?? [];
  const storedBanks = paymentMethods?.filter((m) => m.paymentType === 'bank_account') ?? [];

  return (
    <div className="space-y-6 p-6">
      {/* AR Aging Summary */}
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Accounts Receivable
        </h3>
        {arAging.total === 0 ? (
          <p className="text-sm text-muted-foreground">No outstanding balance.</p>
        ) : (
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Outstanding</span>
              <span className="text-lg font-semibold text-foreground">
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
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Billing Accounts
        </h3>
        {billingAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No billing accounts.</p>
        ) : (
          <div className="space-y-2">
            {billingAccounts.map((acct) => (
              <div
                key={acct.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{acct.name}</p>
                    <p className="text-xs text-muted-foreground">
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
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Open Invoices
        </h3>
        {openInvoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open invoices.</p>
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
                      ? 'border-red-500/30 bg-red-500/10'
                      : 'border-border'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileText
                      className={`h-4 w-4 ${
                        isOverdue ? 'text-red-400' : 'text-muted-foreground'
                      }`}
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {formatDate(inv.periodStart)} - {formatDate(inv.periodEnd)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Due: {formatDate(inv.dueDate)}
                        {isOverdue && (
                          <span className="ml-1 font-medium text-red-500">Overdue</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">
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
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recent Payments
        </h3>
        {recentPayments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent payments.</p>
        ) : (
          <div className="space-y-2">
            {recentPayments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-500" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {formatCurrency(payment.amountCents)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(payment.createdAt)}
                    </p>
                  </div>
                </div>
                {payment.notes && (
                  <p className="max-w-[160px] truncate text-xs text-muted-foreground">
                    {payment.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Stored Payment Methods */}
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Payment Methods
        </h3>
        {storedCards.length === 0 && storedBanks.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-3">
            <CreditCard className="h-5 w-5 text-muted-foreground/30" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">No payment methods on file</p>
          </div>
        ) : (
          <div className="space-y-2">
            {storedCards.map((card) => (
              <div
                key={card.id}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                  card.isDefault
                    ? 'border-indigo-500/30 bg-indigo-500/5'
                    : 'border-border'
                }`}
              >
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-blue-500" aria-hidden="true" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-foreground">
                        {card.brand ?? 'Card'}
                      </span>
                      <span className="text-sm text-muted-foreground">····{card.last4 ?? '????'}</span>
                    </div>
                    {card.expiryMonth != null && (
                      <p className="text-xs text-muted-foreground">
                        Exp {String(card.expiryMonth).padStart(2, '0')}/{String(card.expiryYear ?? '').slice(-2)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {card.providerProfileId && (
                    <ShieldCheck className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
                  )}
                  {card.isDefault && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-indigo-500/20 px-1.5 py-0.5 text-xs font-medium text-indigo-500">
                      <Star className="h-3 w-3" />
                      Default
                    </span>
                  )}
                </div>
              </div>
            ))}
            {storedBanks.map((bank) => {
              const verStatus = bank.verificationStatus ?? 'not_applicable';
              const VerIcon = verStatus === 'verified' ? ShieldCheck
                : verStatus === 'pending_micro' ? Clock
                : verStatus === 'failed' ? ShieldAlert
                : null;
              const verColor = verStatus === 'verified' ? 'text-green-500'
                : verStatus === 'pending_micro' ? 'text-yellow-500'
                : verStatus === 'failed' ? 'text-red-500'
                : '';
              return (
                <div
                  key={bank.id}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                    bank.isDefault
                      ? 'border-indigo-500/30 bg-indigo-500/5'
                      : verStatus === 'failed'
                        ? 'border-red-500/30 bg-red-500/5'
                        : 'border-border'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-foreground">
                          {bank.bankName ?? (bank.bankAccountType === 'checking' ? 'Checking' : bank.bankAccountType === 'savings' ? 'Savings' : 'Bank Account')}
                        </span>
                        <span className="text-sm text-muted-foreground">····{bank.last4 ?? '????'}</span>
                      </div>
                      {bank.bankRoutingLast4 && (
                        <p className="text-xs text-muted-foreground">
                          Routing ····{bank.bankRoutingLast4}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {VerIcon && (
                      <VerIcon className={`h-3.5 w-3.5 ${verColor}`} aria-hidden="true" />
                    )}
                    {bank.isDefault && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-indigo-500/20 px-1.5 py-0.5 text-xs font-medium text-indigo-500">
                        <Star className="h-3 w-3" />
                        Default
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Wallet Accounts */}
      {walletAccounts.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Wallet Accounts
          </h3>
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-3">
            <Wallet className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-indigo-400">
                Total Wallet Balance: {formatCurrency(walletBalanceCents)}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {walletAccounts.map((wallet) => (
              <div
                key={wallet.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {wallet.walletType}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(wallet.balanceCents)} {wallet.currency}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {wallet.expiresAt && (
                    <span className="text-xs text-muted-foreground">
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
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Loyalty
          </h3>
          <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <Star className="h-5 w-5 text-amber-500" aria-hidden="true" />
            <div>
              {loyaltyTier && (
                <p className="text-sm font-semibold text-amber-500">
                  {loyaltyTier} Tier
                </p>
              )}
              <p className="text-xs text-amber-500">
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
      ? 'text-muted-foreground'
      : variant === 'error'
        ? 'text-red-500 font-semibold'
        : variant === 'warning'
          ? 'text-amber-500 font-medium'
          : 'text-foreground';

  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-sm ${colorClass}`}>
        {formatCurrency(cents)}
      </p>
    </div>
  );
}
