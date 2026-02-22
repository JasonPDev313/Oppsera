'use client';

import { useState, useCallback } from 'react';
import { CreditCard, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useAutopayProfile, useCollectionsTimeline } from '@/hooks/use-membership';
import { apiFetch } from '@/lib/api-client';
import type { AutopayProfile } from '@/types/membership';

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
      return <Clock className="h-4 w-4 text-gray-400" />;
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
      <div className="rounded-lg border border-gray-200 bg-surface p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Autopay Configuration</h3>
          {profile && (
            <button
              onClick={handleToggle}
              disabled={toggling}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                profile.isActive
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {toggling ? 'Updating...' : profile.isActive ? 'Active' : 'Inactive'}
            </button>
          )}
        </div>

        {profileLoading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-200 rounded w-1/2" />
            <div className="h-4 bg-gray-200 rounded w-1/3" />
          </div>
        ) : profile ? (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Strategy</span>
              <p className="font-medium text-gray-900">{strategyLabel(profile.strategy)}</p>
            </div>
            {profile.strategy === 'fixed_amount' && (
              <div>
                <span className="text-gray-500">Fixed Amount</span>
                <p className="font-medium text-gray-900">{formatMoney(profile.fixedAmountCents)}</p>
              </div>
            )}
            <div>
              <span className="text-gray-500">Payment Method</span>
              <p className="font-medium text-gray-900">
                {profile.paymentMethodId ? `...${profile.paymentMethodId.slice(-4)}` : 'Not set'}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Last Run</span>
              <p className="font-medium text-gray-900">{formatDate(profile.lastRunAt)}</p>
            </div>
            <div>
              <span className="text-gray-500">Next Run</span>
              <p className="font-medium text-gray-900">{formatDate(profile.nextRunAt)}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No autopay profile configured for this account.</p>
        )}
      </div>

      {/* Collections Timeline */}
      <div className="rounded-lg border border-gray-200 bg-surface p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Collections Timeline</h3>

        {timelineLoading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="h-4 w-4 bg-gray-200 rounded-full" />
                <div className="flex-1 h-4 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : timeline.length === 0 ? (
          <p className="text-sm text-gray-500">No collections activity for this account.</p>
        ) : (
          <div className="space-y-3">
            {timeline.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3">
                <div className="mt-0.5">{timelineIcon(entry.type)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">{entry.description}</p>
                  <p className="text-xs text-gray-500">{formatDate(entry.occurredAt)}</p>
                </div>
                {entry.amountCents != null && entry.amountCents > 0 && (
                  <span className="text-sm font-medium text-gray-700">
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
