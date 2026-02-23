'use client';

import { usePortalSummary, usePortalAutopay } from '@/hooks/use-portal-data';
import { CreditCard, FileText, TrendingUp, Calendar, Shield, ChevronRight } from 'lucide-react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

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

export default function DashboardPage() {
  const { data: summary, isLoading, error } = usePortalSummary();
  const { data: autopay } = usePortalAutopay();
  const params = useParams();
  const tenantSlug = params?.tenantSlug as string;

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Unable to load your membership information. {error}</p>
        </div>
      </div>
    );
  }

  if (!summary || !summary.accountId) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-8 text-center">
          <Shield className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h2 className="text-lg font-semibold mb-2">No Active Membership</h2>
          <p className="text-[var(--portal-text-muted)]">
            You don't have an active membership account. Contact the club to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">My Membership</h1>
          <p className="text-sm text-[var(--portal-text-muted)]">Account #{summary.accountNumber}</p>
        </div>
        <StatusBadge status={summary.accountStatus ?? 'unknown'} />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-4">
          <div className="flex items-center gap-3 mb-2">
            <CreditCard className="h-5 w-5 text-[var(--portal-primary)]" />
            <span className="text-sm font-medium text-[var(--portal-text-muted)]">Credit Limit</span>
          </div>
          <p className="text-2xl font-bold">{formatMoney(summary.creditLimitCents)}</p>
        </div>

        <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-4">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="h-5 w-5 text-green-600" />
            <span className="text-sm font-medium text-[var(--portal-text-muted)]">Active Plans</span>
          </div>
          <p className="text-2xl font-bold">{summary.activeSubscriptionCount}</p>
        </div>

        <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-4">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            <span className="text-sm font-medium text-[var(--portal-text-muted)]">Statement Day</span>
          </div>
          <p className="text-2xl font-bold">{summary.statementDayOfMonth}</p>
          <p className="text-xs text-[var(--portal-text-muted)]">of each month</p>
        </div>
      </div>

      {/* Autopay Status */}
      <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-gray-400" />
            <div>
              <p className="font-medium">Autopay</p>
              <p className="text-sm text-[var(--portal-text-muted)]">
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
      <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg">
        <div className="p-4 border-b border-[var(--portal-border)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-gray-400" />
              <h2 className="font-semibold">Recent Statements</h2>
            </div>
            <Link
              href={`/${tenantSlug}/statements`}
              className="text-sm text-[var(--portal-primary)] hover:underline"
            >
              View all
            </Link>
          </div>
        </div>
        {summary.recentStatements.length === 0 ? (
          <div className="p-8 text-center text-[var(--portal-text-muted)]">No statements yet</div>
        ) : (
          <div className="divide-y divide-[var(--portal-border)]">
            {summary.recentStatements.map((stmt) => (
              <div key={stmt.id} className="p-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer">
                <div>
                  <p className="font-medium">{stmt.statementNumber ?? 'Statement'}</p>
                  <p className="text-sm text-[var(--portal-text-muted)]">
                    {stmt.periodStart} – {stmt.periodEnd}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium">{formatMoney(stmt.totalDueCents)}</span>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Member Info */}
      <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-4">
        <h2 className="font-semibold mb-3">Account Details</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-[var(--portal-text-muted)]">Member Role</dt>
            <dd className="font-medium capitalize">{summary.memberRole ?? 'Primary'}</dd>
          </div>
          <div>
            <dt className="text-[var(--portal-text-muted)]">Member Since</dt>
            <dd className="font-medium">{summary.startDate ?? '—'}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
