'use client';

import { useState, useCallback } from 'react';
import { Shield, AlertTriangle, Ban, Lock, Unlock } from 'lucide-react';
import { useAccountHolds } from '@/hooks/use-membership';
import { apiFetch } from '@/lib/api-client';

interface RiskSubTabProps {
  accountId: string;
  accountStatus?: string;
  creditLimitCents?: number;
  holdCharging?: boolean;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusBadge(status: string) {
  switch (status) {
    case 'active':
      return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">Active</span>;
    case 'frozen':
      return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">Frozen</span>;
    case 'suspended':
      return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">Suspended</span>;
    case 'terminated':
      return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">Terminated</span>;
    default:
      return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600">{status}</span>;
  }
}

export function RiskSubTab({ accountId, accountStatus, creditLimitCents, holdCharging }: RiskSubTabProps) {
  const { data: holds, isLoading, mutate: refreshHolds } = useAccountHolds(accountId);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showHoldForm, setShowHoldForm] = useState(false);
  const [holdReason, setHoldReason] = useState('');
  const [holdType, setHoldType] = useState<'charging' | 'full' | 'billing'>('charging');

  const handlePlaceHold = useCallback(async () => {
    if (!holdReason.trim()) return;
    setActionLoading('place');
    try {
      await apiFetch(`/api/v1/membership/accounts/${accountId}/holds`, {
        method: 'POST',
        body: JSON.stringify({ holdType, reason: holdReason }),
      });
      setShowHoldForm(false);
      setHoldReason('');
      refreshHolds();
    } catch {
      // Error handled at hook level
    } finally {
      setActionLoading(null);
    }
  }, [accountId, holdType, holdReason, refreshHolds]);

  const handleLiftHold = useCallback(async (holdId: string) => {
    const reason = prompt('Reason for lifting the hold:');
    if (!reason) return;
    setActionLoading(holdId);
    try {
      await apiFetch(`/api/v1/membership/accounts/${accountId}/holds/${holdId}/lift`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      refreshHolds();
    } catch {
      // Error handled at hook level
    } finally {
      setActionLoading(null);
    }
  }, [accountId, refreshHolds]);

  const handleFreeze = useCallback(async () => {
    const reason = prompt('Reason for freezing this membership:');
    if (!reason) return;
    setActionLoading('freeze');
    try {
      await apiFetch(`/api/v1/membership/accounts/${accountId}/freeze`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      // Parent should refresh account detail
    } catch {
      // Error handled at hook level
    } finally {
      setActionLoading(null);
    }
  }, [accountId]);

  return (
    <div className="space-y-6">
      {/* Account Risk Summary */}
      <div className="rounded-lg border border-gray-200 bg-surface p-4">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Risk Summary</h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Account Status</span>
            <div className="mt-1">{statusBadge(accountStatus ?? 'unknown')}</div>
          </div>
          <div>
            <span className="text-gray-500">Credit Limit</span>
            <p className="font-medium text-gray-900">
              {creditLimitCents != null ? formatMoney(creditLimitCents) : '--'}
            </p>
          </div>
          <div>
            <span className="text-gray-500">Charging Hold</span>
            <p className="font-medium text-gray-900">
              {holdCharging ? (
                <span className="text-red-600">On Hold</span>
              ) : (
                <span className="text-green-600">Clear</span>
              )}
            </p>
          </div>
        </div>

        {/* Risk Actions */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setShowHoldForm(!showHoldForm)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-surface text-gray-700 hover:bg-gray-200/50 transition-colors"
          >
            <Lock className="h-3 w-3" />
            Place Hold
          </button>
          {accountStatus === 'active' || accountStatus === 'suspended' ? (
            <button
              onClick={handleFreeze}
              disabled={actionLoading === 'freeze'}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-red-500/40 text-red-500 hover:bg-red-500/10 transition-colors"
            >
              <Ban className="h-3 w-3" />
              {actionLoading === 'freeze' ? 'Freezing...' : 'Freeze Account'}
            </button>
          ) : null}
        </div>

        {/* Place Hold Form */}
        {showHoldForm && (
          <div className="mt-4 rounded-md border border-gray-200 bg-surface p-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Hold Type</label>
              <select
                value={holdType}
                onChange={(e) => setHoldType(e.target.value as 'charging' | 'full' | 'billing')}
                className="w-full rounded-md border border-gray-300 bg-surface px-2 py-1.5 text-sm"
              >
                <option value="charging">Charging Hold</option>
                <option value="full">Full Hold</option>
                <option value="billing">Billing Hold</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
              <input
                type="text"
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                placeholder="Enter reason for placing hold"
                className="w-full rounded-md border border-gray-300 bg-surface px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handlePlaceHold}
                disabled={!holdReason.trim() || actionLoading === 'place'}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading === 'place' ? 'Placing...' : 'Confirm Hold'}
              </button>
              <button
                onClick={() => {
                  setShowHoldForm(false);
                  setHoldReason('');
                }}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-surface text-gray-700 hover:bg-gray-200/50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Active Holds */}
      <div className="rounded-lg border border-gray-200 bg-surface p-4">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-900">Active Holds</h3>
          <span className="ml-auto text-xs text-gray-500">
            {holds.length} active
          </span>
        </div>

        {isLoading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-12 bg-gray-200 rounded" />
            ))}
          </div>
        ) : holds.length === 0 ? (
          <p className="text-sm text-gray-500">No active holds on this account.</p>
        ) : (
          <div className="space-y-2">
            {holds.map((hold) => (
              <div
                key={hold.id}
                className="flex items-center justify-between rounded-md border border-gray-200 bg-surface px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-block px-1.5 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-700">
                      {hold.holdType}
                    </span>
                    <span className="text-sm text-gray-900 truncate">{hold.reason}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Placed {formatDate(hold.placedAt)}
                  </p>
                </div>
                <button
                  onClick={() => handleLiftHold(hold.id)}
                  disabled={actionLoading === hold.id}
                  className="flex items-center gap-1 ml-3 px-2 py-1 text-xs font-medium rounded border border-gray-300 bg-surface text-gray-700 hover:bg-gray-200/50 transition-colors"
                >
                  <Unlock className="h-3 w-3" />
                  {actionLoading === hold.id ? 'Lifting...' : 'Lift'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
