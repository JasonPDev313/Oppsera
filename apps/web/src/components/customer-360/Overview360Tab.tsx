'use client';

import {
  DollarSign,
  CreditCard,
  Activity,
  Flag,
  BarChart3,
  AlertTriangle,
  ShoppingCart,
  Calendar,
  Tag,
  TrendingDown,
  RefreshCw,
  Award,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useCustomerOverview } from '@/hooks/use-customer-360';

// ── Helpers ──────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(dollars);
}

function formatMoneyDollars(dollars: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(dollars);
}

function formatDate(isoString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(isoString));
}

function severityToVariant(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'error';
    case 'high':
      return 'orange';
    case 'medium':
      return 'warning';
    case 'low':
      return 'info';
    default:
      return 'neutral';
  }
}

function utilizationColor(pct: number): string {
  if (pct > 80) return 'bg-red-500';
  if (pct > 50) return 'bg-amber-500';
  return 'bg-green-500';
}

function utilizationTextColor(pct: number): string {
  if (pct > 80) return 'text-red-600';
  if (pct > 50) return 'text-amber-600';
  return 'text-green-600';
}

function churnRiskColor(score: number): string {
  if (score >= 70) return 'text-red-600';
  if (score >= 40) return 'text-amber-600';
  return 'text-green-600';
}

function churnRiskBarColor(score: number): string {
  if (score >= 70) return 'bg-red-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-green-500';
}

// ── Skeleton ─────────────────────────────────────────────────────

function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-surface p-5">
      <div className="mb-4 h-4 w-32 animate-pulse rounded bg-gray-200" />
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-3 animate-pulse rounded bg-gray-200"
            style={{ width: `${70 + Math.random() * 30}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <SkeletonCard lines={4} />
      <SkeletonCard lines={2} />
      <SkeletonCard lines={5} />
      <SkeletonCard lines={3} />
      <SkeletonCard lines={4} />
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────

interface CardProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function Card({ title, icon, children }: CardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-surface p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function FinancialSnapshotCard({
  outstandingBalance,
  creditLimit,
  creditUtilization,
  totalSpend,
}: {
  outstandingBalance: number;
  creditLimit: number;
  creditUtilization: number;
  totalSpend: number;
}) {
  const balanceColor =
    outstandingBalance > 0 ? 'text-red-600' : 'text-green-600';

  return (
    <Card
      title="Financial Snapshot"
      icon={<DollarSign className="h-4 w-4 text-gray-500" />}
    >
      <div className="space-y-4">
        {/* Outstanding Balance */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Outstanding Balance</span>
          <span className={`text-sm font-semibold ${balanceColor}`}>
            {formatMoneyDollars(outstandingBalance)}
          </span>
        </div>

        {/* Credit Limit */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Credit Limit</span>
          <span className="text-sm font-medium text-gray-900">
            {formatMoneyDollars(creditLimit)}
          </span>
        </div>

        {/* Credit Utilization */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm text-gray-500">Credit Utilization</span>
            <span
              className={`text-sm font-medium ${utilizationTextColor(creditUtilization)}`}
            >
              {creditUtilization.toFixed(0)}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full transition-all ${utilizationColor(creditUtilization)}`}
              style={{ width: `${Math.min(creditUtilization, 100)}%` }}
            />
          </div>
        </div>

        {/* Total Lifetime Spend */}
        <div className="flex items-center justify-between border-t border-gray-100 pt-3">
          <span className="text-sm text-gray-500">Total Lifetime Spend</span>
          <span className="text-sm font-semibold text-gray-900">
            {formatMoney(totalSpend)}
          </span>
        </div>
      </div>
    </Card>
  );
}

function MembershipCard({
  membership,
}: {
  membership: {
    planName: string;
    status: string;
    startDate: string | null;
  } | null;
}) {
  const statusVariant =
    membership?.status === 'active'
      ? 'success'
      : membership?.status === 'paused'
        ? 'warning'
        : 'neutral';

  return (
    <Card
      title="Membership"
      icon={<Award className="h-4 w-4 text-gray-500" />}
    >
      {!membership ? (
        <p className="text-sm text-gray-400">No active membership</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-900">
              {membership.planName}
            </span>
            <Badge variant={statusVariant}>{membership.status}</Badge>
          </div>
          {membership.startDate && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Start Date</span>
              <span className="text-sm text-gray-700">
                {formatDate(membership.startDate)}
              </span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function RecentActivityCard({
  transactions,
}: {
  transactions: Array<{
    id: string;
    type: string;
    description: string;
    amountCents: number;
    createdAt: string;
  }>;
}) {
  return (
    <Card
      title="Recent Activity"
      icon={<Activity className="h-4 w-4 text-gray-500" />}
    >
      {transactions.length === 0 ? (
        <p className="text-sm text-gray-400">No recent transactions</p>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <span className="shrink-0 text-xs text-gray-400">
                  {formatDate(tx.createdAt)}
                </span>
                <span className="text-gray-700">{tx.description}</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`font-medium ${tx.amountCents >= 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  {formatMoney(Math.abs(tx.amountCents))}
                  {tx.amountCents < 0 ? '' : ''}
                </span>
                <Badge variant="neutral">{tx.type}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function FlagsAlertsCard({
  flags,
  alerts,
}: {
  flags: Array<{
    id: string;
    flagType: string;
    severity: string;
    description: string | null;
  }>;
  alerts: Array<{
    id: string;
    alertType: string;
    severity: string;
    title: string;
    message: string | null;
  }>;
}) {
  const hasContent = flags.length > 0 || alerts.length > 0;

  return (
    <Card
      title="Flags & Alerts"
      icon={<Flag className="h-4 w-4 text-gray-500" />}
    >
      {!hasContent ? (
        <p className="text-sm text-gray-400">No active flags or alerts</p>
      ) : (
        <div className="space-y-4">
          {flags.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Service Flags
              </span>
              {flags.map((flag) => (
                <div
                  key={flag.id}
                  className="flex items-start gap-2 rounded-md border border-gray-100 px-3 py-2"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">
                        {flag.flagType}
                      </span>
                      <Badge variant={severityToVariant(flag.severity)}>
                        {flag.severity}
                      </Badge>
                    </div>
                    {flag.description && (
                      <p className="mt-0.5 text-xs text-gray-500">
                        {flag.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {alerts.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Alerts
              </span>
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-2 rounded-md border border-gray-100 px-3 py-2"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">
                        {alert.title}
                      </span>
                      <Badge variant={severityToVariant(alert.severity)}>
                        {alert.severity}
                      </Badge>
                    </div>
                    {alert.message && (
                      <p className="mt-0.5 text-xs text-gray-500">
                        {alert.message}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function LifetimeMetricsCard({
  metrics,
}: {
  metrics: {
    totalOrderCount: number;
    avgOrderValue: number;
    daysSinceLastVisit: number | null;
    topCategory: string | null;
    churnRiskScore: number | null;
  } | null;
}) {
  return (
    <Card
      title="Lifetime Metrics"
      icon={<BarChart3 className="h-4 w-4 text-gray-500" />}
    >
      {!metrics ? (
        <p className="text-sm text-gray-400">No metrics available</p>
      ) : (
        <div className="space-y-3">
          {/* Total Orders */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-sm text-gray-500">Total Orders</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">
              {metrics.totalOrderCount.toLocaleString()}
            </span>
          </div>

          {/* Average Order Value */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-sm text-gray-500">Avg Order Value</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">
              {formatMoney(metrics.avgOrderValue)}
            </span>
          </div>

          {/* Days Since Last Visit */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-sm text-gray-500">
                Days Since Last Visit
              </span>
            </div>
            <span className="text-sm font-semibold text-gray-900">
              {metrics.daysSinceLastVisit !== null
                ? metrics.daysSinceLastVisit
                : 'Never'}
            </span>
          </div>

          {/* Top Category */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-sm text-gray-500">Top Category</span>
            </div>
            <span className="text-sm font-medium text-gray-700">
              {metrics.topCategory ?? '\u2014'}
            </span>
          </div>

          {/* Churn Risk Score */}
          {metrics.churnRiskScore !== null && (
            <div className="border-t border-gray-100 pt-3">
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-sm text-gray-500">
                    Churn Risk Score
                  </span>
                </div>
                <span
                  className={`text-sm font-semibold ${churnRiskColor(metrics.churnRiskScore)}`}
                >
                  {metrics.churnRiskScore}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full transition-all ${churnRiskBarColor(metrics.churnRiskScore)}`}
                  style={{ width: `${metrics.churnRiskScore}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Main Component ───────────────────────────────────────────────

export default function Overview360Tab({
  customerId,
}: {
  customerId: string;
}) {
  const { data, isLoading, error, mutate } = useCustomerOverview(customerId);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-surface px-6 py-12 text-center">
        <AlertTriangle className="mb-3 h-8 w-8 text-red-400" />
        <p className="mb-4 text-sm text-gray-600">
          Failed to load customer overview.
        </p>
        <button
          type="button"
          onClick={() => mutate()}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FinancialSnapshotCard
        outstandingBalance={data.outstandingBalance}
        creditLimit={data.creditLimit}
        creditUtilization={data.creditUtilization}
        totalSpend={data.totalSpend}
      />

      <MembershipCard membership={data.activeMembership} />

      <RecentActivityCard transactions={data.recentTransactions} />

      <FlagsAlertsCard flags={data.activeFlags} alerts={data.activeAlerts} />

      <LifetimeMetricsCard metrics={data.lifetimeMetrics} />
    </div>
  );
}
