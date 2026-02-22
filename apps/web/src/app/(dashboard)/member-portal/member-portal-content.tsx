'use client';

import { useMemberPortalSummary, useMemberPortalAutopay } from '@/hooks/use-member-portal';
import { CreditCard, FileText, TrendingUp, Calendar, Shield, ChevronRight } from 'lucide-react';

function formatMoney(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    suspended: 'bg-yellow-100 text-yellow-800',
    frozen: 'bg-blue-100 text-blue-800',
    terminated: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status] ?? 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
}

export default function MemberPortalContent() {
  const { data: summary, isLoading, error } = useMemberPortalSummary();
  const { data: autopay } = useMemberPortalAutopay();

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Unable to load your membership information. {error}</p>
        </div>
      </div>
    );
  }

  if (!summary || !summary.accountId) {
    return (
      <div className="p-6">
        <div className="bg-surface border rounded-lg p-8 text-center">
          <Shield className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No Active Membership</h2>
          <p className="text-gray-500">You don't have an active membership account. Contact the club to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Membership</h1>
          <p className="text-sm text-gray-500">Account #{summary.accountNumber}</p>
        </div>
        <StatusBadge status={summary.accountStatus ?? 'unknown'} />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-surface border rounded-lg p-4">
          <div className="flex items-center gap-3 mb-2">
            <CreditCard className="h-5 w-5 text-indigo-600" />
            <span className="text-sm font-medium text-gray-500">Credit Limit</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatMoney(summary.creditLimitCents)}</p>
        </div>

        <div className="bg-surface border rounded-lg p-4">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="h-5 w-5 text-green-600" />
            <span className="text-sm font-medium text-gray-500">Active Plans</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{summary.activeSubscriptionCount}</p>
        </div>

        <div className="bg-surface border rounded-lg p-4">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            <span className="text-sm font-medium text-gray-500">Statement Day</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{summary.statementDayOfMonth}</p>
          <p className="text-xs text-gray-500">of each month</p>
        </div>
      </div>

      {/* Autopay Status */}
      <div className="bg-surface border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-gray-400" />
            <div>
              <p className="font-medium text-gray-900">Autopay</p>
              <p className="text-sm text-gray-500">
                {summary.autopayEnabled
                  ? autopay?.strategy ? `Strategy: ${autopay.strategy}` : 'Enabled'
                  : 'Not configured'}
              </p>
            </div>
          </div>
          <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
            summary.autopayEnabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
          }`}>
            {summary.autopayEnabled ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      {/* Recent Statements */}
      <div className="bg-surface border rounded-lg">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-gray-400" />
            <h2 className="font-semibold text-gray-900">Recent Statements</h2>
          </div>
        </div>
        {summary.recentStatements.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No statements yet</div>
        ) : (
          <div className="divide-y">
            {summary.recentStatements.map((stmt) => (
              <div key={stmt.id} className="p-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer">
                <div>
                  <p className="font-medium text-gray-900">
                    {stmt.statementNumber ?? `Statement`}
                  </p>
                  <p className="text-sm text-gray-500">
                    {stmt.periodStart} – {stmt.periodEnd}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-900">{formatMoney(stmt.totalDueCents)}</span>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Member Info */}
      <div className="bg-surface border rounded-lg p-4">
        <h2 className="font-semibold text-gray-900 mb-3">Account Details</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-gray-500">Member Role</dt>
            <dd className="font-medium text-gray-900 capitalize">{summary.memberRole ?? 'Primary'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Member Since</dt>
            <dd className="font-medium text-gray-900">{summary.startDate ?? '—'}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
