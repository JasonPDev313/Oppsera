'use client';

import { usePortalMinimums } from '@/hooks/use-portal-data';
import { TrendingUp, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

function formatMoney(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

export default function SpendingPage() {
  const { data: minimums, isLoading, error } = usePortalMinimums();
  const params = useParams();
  const tenantSlug = params?.tenantSlug as string;

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="h-48 bg-gray-200 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      </div>
    );
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
        <h1 className="text-2xl font-bold">Minimum Spend</h1>
      </div>

      {!minimums || minimums.length === 0 ? (
        <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-8 text-center">
          <TrendingUp className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-[var(--portal-text-muted)]">No minimum spend requirements for your membership.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {minimums.map((min) => {
            const pct = Math.min(100, Math.round(min.percentComplete));
            return (
              <div
                key={min.policyId}
                className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium">{min.policyName}</h3>
                  <span className="text-sm text-[var(--portal-text-muted)]">
                    {min.periodStart} – {min.periodEnd}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-[var(--portal-text-muted)]">
                      {formatMoney(min.spentCents)} of {formatMoney(min.requiredCents)}
                    </span>
                    <span className="font-medium">{pct}%</span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pct >= 100 ? 'bg-green-500' : pct >= 75 ? 'bg-blue-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-400'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <p className="text-sm text-[var(--portal-text-muted)]">
                  {min.remainingCents > 0
                    ? `${formatMoney(min.remainingCents)} remaining to meet minimum`
                    : 'Minimum spend requirement met!'}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
