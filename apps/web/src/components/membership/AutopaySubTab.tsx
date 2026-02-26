'use client';

import { useState, useCallback } from 'react';
import { CreditCard, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useAutopayProfile, useCollectionsTimeline } from '@/hooks/use-membership';
import { apiFetch } from '@/lib/api-client';

interface AutopaySubTabProps {
  accountId: string;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function strategyLabel(strategy: string): string {
  switch (strategy) {
    case 'full_balance':
      return 'Full Balance';
    case 'minimum_due':
      return 'Minimum Due';
    case 'fixed_amount':
      return 'Fixed Amount';
    case 'selected_accounts':
      return 'Selected Accounts';
    default:
      return strategy;
  }
}

function timelineIcon(type: string) {
  switch (type) {
    case 'autopay_attempt':
      return <CreditCard className="h-4 w-4 text-blue-500" />;
    case 'late_fee':
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case 'hold_placed':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'hold_lifted':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

export function AutopaySubTab({ accountId }: AutopaySubTabProps) {
  const { data: profile, isLoading: profileLoading, mutate: refreshProfile } = useAutopayProfile(accountId);
  const { data: timeline, isLoading: timelineLoading } = useCollectionsTimeline(accountId);
  const [toggling, setToggling] = useState(false);

  const handleToggle = useCallback(async () => {
    setToggling(true);
    try {
      await apiFetch(`/api/v1/membership/accounts/${accountId}/autopay`, {
        method: 'PUT',
        body: JSON.stringify({
          strategy: profile?.strategy ?? 'full_balance',
          isActive: !profile?.isActive,
        }),
      });
      refreshProfile();
    } catch {
      // Error handled by caller
    } finally {
      setToggling(false);
    }
  }, [accountId, profile, refreshProfile]);

  return (
    <div className="space-y-6">
      {/* Autopay Profile Card */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Autopay Configuration</h3>
          {profile && (
            <button
              onClick={handleToggle}
              disabled={toggling}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                profile.isActive
                  ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {toggling ? 'Updating...' : profile.isActive ? 'Active' : 'Inactive'}
            </button>
          )}
        </div>

        {profileLoading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-4 bg-muted rounded w-1/3" />
          </div>
        ) : profile ? (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Strategy</span>
              <p className="font-medium text-foreground">{strategyLabel(profile.strategy)}</p>
            </div>
            {profile.strategy === 'fixed_amount' && (
              <div>
                <span className="text-muted-foreground">Fixed Amount</span>
                <p className="font-medium text-foreground">{formatMoney(profile.fixedAmountCents)}</p>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Payment Method</span>
              <p className="font-medium text-foreground">
                {profile.paymentMethodId ? `...${profile.paymentMethodId.slice(-4)}` : 'Not set'}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Last Run</span>
              <p className="font-medium text-foreground">{formatDate(profile.lastRunAt)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Next Run</span>
              <p className="font-medium text-foreground">{formatDate(profile.nextRunAt)}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No autopay profile configured for this account.</p>
        )}
      </div>

      {/* Collections Timeline */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold text-foreground mb-4">Collections Timeline</h3>

        {timelineLoading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="h-4 w-4 bg-muted rounded-full" />
                <div className="flex-1 h-4 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : !timeline || timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">No collections activity for this account.</p>
        ) : (
          <div className="space-y-3">
            {timeline.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3">
                <div className="mt-0.5">{timelineIcon(entry.type)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{entry.description}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(entry.occurredAt)}</p>
                </div>
                {entry.amountCents != null && entry.amountCents > 0 && (
                  <span className="text-sm font-medium text-foreground">
                    {formatMoney(entry.amountCents)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
