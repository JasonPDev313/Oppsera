'use client';

import { useState, useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Users,
  CreditCard,
  Ban,
  Percent,
  ArrowDownUp,
  Monitor,
  Banknote,
} from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { useOperationsSummary, useCashDashboard, useDailyReconciliation } from '@/hooks/use-operations';

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function KpiCard({
  label,
  value,
  icon: Icon,
  subtext,
  variant = 'default',
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  subtext?: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
}) {
  const borderColors = {
    default: 'border-gray-200',
    success: 'border-green-200',
    warning: 'border-amber-200',
    error: 'border-red-200',
  };
  const iconColors = {
    default: 'text-gray-500',
    success: 'text-green-600',
    warning: 'text-amber-600',
    error: 'text-red-600',
  };

  return (
    <div className={`rounded-lg border bg-surface p-4 ${borderColors[variant]}`}>
      <div className="flex items-center gap-3">
        <Icon className={`h-5 w-5 ${iconColors[variant]}`} />
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {subtext && <div className="mt-1 text-xs text-gray-400">{subtext}</div>}
    </div>
  );
}

export default function OperationsContent() {
  const { locations } = useAuthContext();
  const [selectedLocationId, setSelectedLocationId] = useState<string>(
    locations?.[0]?.id ?? '',
  );

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [startDate] = useState(today);
  const [endDate] = useState(today);

  const { data: summary, isLoading: summaryLoading } = useOperationsSummary(
    startDate,
    endDate,
    selectedLocationId || null,
  );

  const { data: cashDashboard, isLoading: cashLoading } = useCashDashboard(
    selectedLocationId || null,
    startDate,
    endDate,
  );

  const { data: reconciliation, isLoading: reconLoading } = useDailyReconciliation(
    selectedLocationId || null,
    today,
  );

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold">Operations Dashboard</h1>
        <div className="flex gap-3">
          {locations && locations.length > 1 && (
            <select
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="">All Locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          )}
          <span className="rounded-md bg-gray-100 px-3 py-1.5 text-sm">{today}</span>
        </div>
      </div>

      {/* KPI Cards */}
      {summaryLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <KpiCard
            label="Total Sales"
            value={formatMoney(summary.totalSalesCents)}
            icon={DollarSign}
            subtext={`${summary.orderCount} orders`}
            variant="success"
          />
          <KpiCard
            label="Avg Ticket"
            value={formatMoney(summary.avgTicketCents)}
            icon={TrendingUp}
          />
          <KpiCard
            label="Void Rate"
            value={`${summary.voidRate}%`}
            icon={Ban}
            variant={summary.voidRate > 5 ? 'warning' : 'default'}
          />
          <KpiCard
            label="Discount Rate"
            value={`${summary.discountRate}%`}
            icon={Percent}
            variant={summary.discountRate > 10 ? 'warning' : 'default'}
          />
          <KpiCard
            label="Over/Short"
            value={formatMoney(summary.overShortCents)}
            icon={ArrowDownUp}
            variant={Math.abs(summary.overShortCents) > 500 ? 'error' : 'default'}
          />
        </div>
      ) : null}

      {/* Two-column layout: Cash & Active Sessions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Cash Dashboard */}
        <div className="rounded-lg border bg-surface p-4">
          <h2 className="mb-4 font-semibold">Cash Management</h2>
          {cashLoading ? (
            <div className="h-32 animate-pulse rounded bg-gray-100" />
          ) : cashDashboard ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <KpiCard
                  label="Cash On Hand"
                  value={formatMoney(cashDashboard.cashSummary.expectedCashOnHandCents)}
                  icon={Banknote}
                  variant="success"
                />
                <KpiCard
                  label="Outstanding Tips"
                  value={formatMoney(cashDashboard.outstandingTipsCents)}
                  icon={Users}
                  variant={cashDashboard.outstandingTipsCents > 0 ? 'warning' : 'default'}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="rounded bg-gray-50 p-2 text-center">
                  <div className="text-gray-500">Cash In</div>
                  <div className="font-medium text-green-600">
                    {formatMoney(cashDashboard.cashSummary.totalCashInCents)}
                  </div>
                </div>
                <div className="rounded bg-gray-50 p-2 text-center">
                  <div className="text-gray-500">Cash Out</div>
                  <div className="font-medium text-red-600">
                    {formatMoney(cashDashboard.cashSummary.totalCashOutCents)}
                  </div>
                </div>
                <div className="rounded bg-gray-50 p-2 text-center">
                  <div className="text-gray-500">Drops</div>
                  <div className="font-medium">
                    {formatMoney(cashDashboard.cashSummary.totalCashDropsCents)}
                  </div>
                </div>
              </div>
              {cashDashboard.pendingDeposits > 0 && (
                <div className="flex items-center gap-2 rounded bg-amber-50 p-2 text-sm text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  {cashDashboard.pendingDeposits} pending deposit{cashDashboard.pendingDeposits !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Select a location to view cash data</p>
          )}
        </div>

        {/* Active Sessions */}
        <div className="rounded-lg border bg-surface p-4">
          <h2 className="mb-4 font-semibold">Active Sessions</h2>
          {cashLoading ? (
            <div className="h-32 animate-pulse rounded bg-gray-100" />
          ) : cashDashboard && cashDashboard.activeSessions.length > 0 ? (
            <div className="space-y-2">
              {cashDashboard.activeSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Monitor className="h-4 w-4 text-green-500" />
                    <div>
                      <div className="text-sm font-medium">
                        {session.employeeName ?? session.employeeId}
                      </div>
                      <div className="text-xs text-gray-400">
                        Terminal: {session.terminalId.slice(-6)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-medium">{formatMoney(session.openingBalanceCents)}</div>
                    <div className="text-xs text-gray-400">
                      Since {new Date(session.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Monitor className="h-4 w-4" />
              No active drawer sessions
            </div>
          )}
        </div>
      </div>

      {/* Daily Reconciliation */}
      <div className="rounded-lg border bg-surface p-4">
        <h2 className="mb-4 font-semibold">Daily Reconciliation</h2>
        {reconLoading ? (
          <div className="h-32 animate-pulse rounded bg-gray-100" />
        ) : reconciliation ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Sales Column */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-500">Sales</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Gross Sales</span>
                  <span>{formatMoney(reconciliation.sales.grossSalesCents)}</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>Discounts</span>
                  <span>-{formatMoney(reconciliation.sales.discountsCents)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Net Sales</span>
                  <span>{formatMoney(reconciliation.sales.netSalesCents)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax</span>
                  <span>{formatMoney(reconciliation.sales.taxCents)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tips</span>
                  <span>{formatMoney(reconciliation.sales.tipsCents)}</span>
                </div>
                <div className="mt-1 border-t pt-1">
                  <div className="flex justify-between font-semibold">
                    <span>Total</span>
                    <span>{formatMoney(reconciliation.sales.totalCents)}</span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {reconciliation.sales.orderCount} orders, {reconciliation.sales.voidCount} voids
                  </div>
                </div>
              </div>
            </div>

            {/* Tenders Column */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-500">Tenders</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="flex items-center gap-1">
                    <Banknote className="h-3 w-3" /> Cash
                  </span>
                  <span>{formatMoney(reconciliation.tenders.cashCents)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-1">
                    <CreditCard className="h-3 w-3" /> Card
                  </span>
                  <span>{formatMoney(reconciliation.tenders.cardCents)}</span>
                </div>
                {reconciliation.tenders.otherCents > 0 && (
                  <div className="flex justify-between">
                    <span>Other</span>
                    <span>{formatMoney(reconciliation.tenders.otherCents)}</span>
                  </div>
                )}
                <div className="mt-1 border-t pt-1">
                  <div className="flex justify-between font-semibold">
                    <span>Total</span>
                    <span>{formatMoney(reconciliation.tenders.totalCents)}</span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {reconciliation.tenders.tenderCount} tenders
                  </div>
                </div>
              </div>
            </div>

            {/* GL Column */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-500">GL</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Total Debits</span>
                  <span>${reconciliation.gl.totalDebitsDollars}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Credits</span>
                  <span>${reconciliation.gl.totalCreditsDollars}</span>
                </div>
                <div className="mt-1 border-t pt-1">
                  <div className="flex items-center justify-between font-semibold">
                    <span>Status</span>
                    <span className={reconciliation.gl.isBalanced ? 'text-green-600' : 'text-red-600'}>
                      {reconciliation.gl.isBalanced ? 'Balanced' : 'Out of Balance'}
                    </span>
                  </div>
                </div>
                {reconciliation.reconciliation.salesVsTendersDiffCents > 0 && (
                  <div className="mt-2 flex items-center gap-1 rounded bg-amber-50 p-2 text-xs text-amber-700">
                    <AlertTriangle className="h-3 w-3" />
                    Sales vs tenders diff: {formatMoney(reconciliation.reconciliation.salesVsTendersDiffCents)}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Select a location to view reconciliation</p>
        )}
      </div>
    </div>
  );
}
