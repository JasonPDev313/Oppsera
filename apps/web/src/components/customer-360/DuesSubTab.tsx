'use client';

import { useState, useCallback } from 'react';
import {
  CreditCard,
  Calendar,
  RefreshCw,
  ArrowRightLeft,
  AlertCircle,
  CheckCircle,
  XCircle,
  PauseCircle,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useMembershipSubscriptions, useMembershipPlans } from '@/hooks/use-membership';
import { apiFetch } from '@/lib/api-client';
import type { MembershipSubscription, MembershipPlanV2 } from '@/types/membership';

// ── Helpers ─────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '--';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatMoney(cents: number): string {
  const abs = Math.abs(cents);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(abs / 100);
  if (cents < 0) return `(${formatted})`;
  return formatted;
}

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'destructive' | 'neutral'> = {
  active: 'success',
  paused: 'warning',
  canceled: 'destructive',
  pending: 'neutral',
};

const STATUS_ICONS: Record<string, typeof CheckCircle> = {
  active: CheckCircle,
  paused: PauseCircle,
  canceled: XCircle,
  pending: AlertCircle,
};

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semi_annual: 'Semi-Annual',
  annual: 'Annual',
};

function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_VARIANTS[status] ?? 'neutral';
  const Icon = STATUS_ICONS[status];
  return (
    <Badge variant={variant}>
      {Icon && <Icon className="mr-1 h-3 w-3" />}
      {status}
    </Badge>
  );
}

// ── Change Plan Modal ───────────────────────────────────────────

function ChangePlanModal({
  accountId,
  currentPlanId,
  plans,
  onClose,
  onSuccess,
}: {
  accountId: string;
  currentPlanId: string;
  plans: MembershipPlanV2[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [prorationEnabled, setProrationEnabled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availablePlans = plans.filter((p) => p.isActive && p.id !== currentPlanId);

  const handleSubmit = useCallback(async () => {
    if (!selectedPlanId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/membership/accounts/${accountId}/subscriptions/change`, {
        method: 'POST',
        body: JSON.stringify({
          newPlanId: selectedPlanId,
          prorationEnabled,
        }),
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change plan');
    } finally {
      setIsSubmitting(false);
    }
  }, [accountId, selectedPlanId, prorationEnabled, onSuccess, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-foreground">Change Membership Plan</h3>

        {error && (
          <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-foreground">
            Select New Plan
          </label>
          <select
            value={selectedPlanId}
            onChange={(e) => setSelectedPlanId(e.target.value)}
            className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">-- Select a plan --</option>
            {availablePlans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({formatMoney(p.duesAmountCents ?? p.priceCents)} / {FREQUENCY_LABELS[p.billingFrequency] ?? p.billingFrequency})
              </option>
            ))}
          </select>
        </div>

        <div className="mb-6">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={prorationEnabled}
              onChange={(e) => setProrationEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-input text-indigo-600 focus:ring-indigo-500"
            />
            Enable proration for partial period
          </label>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedPlanId || isSubmitting}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Changing...
              </span>
            ) : (
              'Change Plan'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Current Subscription Card ───────────────────────────────────

function CurrentSubscriptionCard({
  subscription,
  onChangePlan,
}: {
  subscription: MembershipSubscription;
  onChangePlan: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-indigo-600" />
          <h3 className="text-sm font-semibold text-foreground">Current Subscription</h3>
        </div>
        <StatusBadge status={subscription.status} />
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        <div>
          <div className="text-xs text-muted-foreground">Plan</div>
          <div className="text-sm font-medium text-foreground">
            {subscription.planName || subscription.planId}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Effective Start</div>
          <div className="flex items-center gap-1.5 text-sm text-foreground">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            {formatDate(subscription.effectiveStart)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Next Bill Date</div>
          <div className="flex items-center gap-1.5 text-sm text-foreground">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            {formatDate(subscription.nextBillDate)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Last Billed</div>
          <div className="text-sm text-foreground">{formatDate(subscription.lastBilledDate)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Billed Through</div>
          <div className="text-sm text-foreground">{formatDate(subscription.billedThroughDate)}</div>
        </div>
      </div>
      {subscription.status === 'active' && (
        <div className="mt-4 border-t border-border pt-3">
          <button
            type="button"
            onClick={onChangePlan}
            className="flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            Change Plan
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────

export default function DuesSubTab({ accountId }: { accountId: string }) {
  const { subscriptions, isLoading, error, mutate } = useMembershipSubscriptions(accountId);
  const { plans } = useMembershipPlans();
  const [showChangePlan, setShowChangePlan] = useState(false);

  const activeSubscription = subscriptions.find((s) => s.status === 'active');
  const pastSubscriptions = subscriptions.filter((s) => s.status !== 'active');

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <div className="h-32 animate-pulse rounded-lg bg-muted" />
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 p-4 text-muted-foreground">
        <AlertCircle className="h-6 w-6 text-red-400" />
        <p className="text-sm">Failed to load subscription data</p>
        <button
          type="button"
          onClick={mutate}
          className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-500"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  }

  if (subscriptions.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 p-4 text-muted-foreground">
        <CreditCard className="h-6 w-6" />
        <p className="text-sm font-medium text-muted-foreground">No Subscriptions</p>
        <p className="text-xs">No dues subscriptions have been assigned to this account.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {activeSubscription && (
        <CurrentSubscriptionCard
          subscription={activeSubscription}
          onChangePlan={() => setShowChangePlan(true)}
        />
      )}

      {pastSubscriptions.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Subscription History ({pastSubscriptions.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Plan</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Start</th>
                  <th className="pb-2 font-medium">End</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pastSubscriptions.map((sub) => (
                  <tr key={sub.id}>
                    <td className="py-2 pr-4 text-foreground">
                      {sub.planName || sub.planId}
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={sub.status} />
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{formatDate(sub.effectiveStart)}</td>
                    <td className="py-2 text-muted-foreground">{formatDate(sub.effectiveEnd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showChangePlan && activeSubscription && (
        <ChangePlanModal
          accountId={accountId}
          currentPlanId={activeSubscription.planId}
          plans={plans}
          onClose={() => setShowChangePlan(false)}
          onSuccess={mutate}
        />
      )}
    </div>
  );
}
