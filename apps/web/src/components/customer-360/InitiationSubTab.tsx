'use client';

import { useState, useCallback } from 'react';
import {
  Landmark,
  Calendar,
  DollarSign,
  Percent,
  Hash,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2,
  Calculator,
  BookOpen,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  useInitiationContracts,
  useInitiationSchedule,
  usePayoffQuote,
  useInitiationMutations,
  useDeferredRevenue,
} from '@/hooks/use-membership';
import type {
  InitiationContractSummary,
  InitiationScheduleEntry,
} from '@/types/membership';

// ── Helpers ─────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  const abs = Math.abs(cents);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(abs / 100);
  if (cents < 0) return `(${formatted})`;
  return formatted;
}

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

function formatApr(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'destructive' | 'neutral'> = {
  active: 'success',
  paid_off: 'success',
  cancelled: 'destructive',
  defaulted: 'destructive',
  scheduled: 'neutral',
  billed: 'warning',
  paid: 'success',
  late: 'destructive',
  waived: 'neutral',
};

const STATUS_ICONS: Record<string, typeof CheckCircle> = {
  active: CheckCircle,
  paid_off: CheckCircle,
  cancelled: XCircle,
  defaulted: XCircle,
  scheduled: Clock,
  billed: AlertCircle,
  paid: CheckCircle,
  late: AlertCircle,
  waived: Clock,
};

function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_VARIANTS[status] ?? 'neutral';
  const Icon = STATUS_ICONS[status];
  return (
    <Badge variant={variant}>
      {Icon && <Icon className="mr-1 h-3 w-3" />}
      {status.replace('_', ' ')}
    </Badge>
  );
}

// ── Progress Bar ────────────────────────────────────────────────

function ProgressBar({ percent }: { percent: number }) {
  const capped = Math.min(Math.max(percent, 0), 100);
  const color =
    capped >= 100
      ? 'bg-green-500'
      : capped >= 50
        ? 'bg-indigo-500'
        : 'bg-amber-500';
  const bgColor =
    capped >= 100
      ? 'bg-green-100'
      : capped >= 50
        ? 'bg-indigo-100'
        : 'bg-amber-100';

  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-gray-500">Paid off</span>
        <span className="font-semibold text-gray-700">{capped}%</span>
      </div>
      <div className={`h-2.5 w-full overflow-hidden rounded-full ${bgColor}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${capped}%` }}
        />
      </div>
    </div>
  );
}

// ── Contract Summary Card ───────────────────────────────────────

function ContractCard({
  contract,
  isSelected,
  onSelect,
  accountId,
  onRefresh,
}: {
  contract: InitiationContractSummary;
  isSelected: boolean;
  onSelect: () => void;
  accountId: string;
  onRefresh: () => void;
}) {
  const { billInstallment, recordExtraPrincipal, cancelContract, isLoading: mutating } =
    useInitiationMutations();
  const [showExtraPayment, setShowExtraPayment] = useState(false);
  const [extraAmount, setExtraAmount] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const handleBillNext = useCallback(async () => {
    // The next period to bill would be the first scheduled entry
    // We rely on the schedule data; for this card-level action we use periodIndex from nextPayment
    // Since we don't have the exact periodIndex here, we'll let the schedule tab handle it
    setActionError(null);
    try {
      // Bill the next installment — we need the schedule to know the period index
      // For a quick action, we pass periodIndex 0 and let backend find the right one
      // Actually, the bill endpoint requires a specific periodIndex, so this should be
      // done from the schedule view. Show a message.
      onSelect(); // Expand the schedule so user can pick the exact installment
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to bill');
    }
  }, [onSelect]);

  const handleExtraPayment = useCallback(async () => {
    const cents = Math.round(parseFloat(extraAmount) * 100);
    if (isNaN(cents) || cents <= 0) return;
    setActionError(null);
    try {
      await recordExtraPrincipal(accountId, contract.id, cents);
      setShowExtraPayment(false);
      setExtraAmount('');
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to record extra principal');
    }
  }, [accountId, contract.id, extraAmount, recordExtraPrincipal, onRefresh]);

  const handleCancel = useCallback(async () => {
    if (!cancelReason.trim()) return;
    setActionError(null);
    try {
      await cancelContract(accountId, contract.id, cancelReason.trim());
      setShowCancel(false);
      setCancelReason('');
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to cancel contract');
    }
  }, [accountId, contract.id, cancelReason, cancelContract, onRefresh]);

  return (
    <div
      className={`rounded-lg border bg-surface p-4 transition-colors ${
        isSelected ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-gray-200'
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onSelect}
          className="flex items-center gap-2 text-left"
        >
          <Landmark className="h-5 w-5 text-indigo-600" />
          <span className="text-sm font-semibold text-gray-900">
            Initiation Contract
          </span>
          {isSelected ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </button>
        <StatusBadge status={contract.status} />
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
        <div>
          <div className="text-xs text-gray-500">Contract Date</div>
          <div className="flex items-center gap-1.5 text-sm text-gray-900">
            <Calendar className="h-3.5 w-3.5 text-gray-400" />
            {formatDate(contract.contractDate)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Initiation Fee</div>
          <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
            <DollarSign className="h-3.5 w-3.5 text-gray-400" />
            {formatMoney(contract.initiationFeeCents)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Financed Amount</div>
          <div className="text-sm font-medium text-gray-900">
            {formatMoney(contract.financedPrincipalCents)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Down Payment</div>
          <div className="text-sm text-gray-900">
            {formatMoney(contract.downPaymentCents)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">APR</div>
          <div className="flex items-center gap-1.5 text-sm text-gray-900">
            <Percent className="h-3.5 w-3.5 text-gray-400" />
            {formatApr(contract.aprBps)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Term</div>
          <div className="flex items-center gap-1.5 text-sm text-gray-900">
            <Hash className="h-3.5 w-3.5 text-gray-400" />
            {contract.termMonths} months
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Remaining Principal</div>
          <div className="text-sm font-medium text-gray-900">
            {formatMoney(contract.remainingPrincipalCents)}
          </div>
        </div>
        {contract.nextPaymentDate && (
          <div>
            <div className="text-xs text-gray-500">Next Payment</div>
            <div className="text-sm text-gray-900">
              {formatDate(contract.nextPaymentDate)}
              {contract.nextPaymentCents != null && (
                <span className="ml-1 text-gray-500">
                  ({formatMoney(contract.nextPaymentCents)})
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <ProgressBar percent={contract.progressPercent} />

      {/* Action buttons (only for active contracts) */}
      {contract.status === 'active' && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={handleBillNext}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Bill Next
          </button>
          <button
            type="button"
            onClick={() => setShowExtraPayment((v) => !v)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Extra Payment
          </button>
          <button
            type="button"
            onClick={onSelect}
            className="flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Calculator className="h-3.5 w-3.5" />
            Payoff Quote
          </button>
          <button
            type="button"
            onClick={() => setShowCancel((v) => !v)}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Error display */}
      {actionError && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {/* Extra payment inline form */}
      {showExtraPayment && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-3">
          <label className="text-sm text-gray-700">Amount ($):</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={extraAmount}
            onChange={(e) => setExtraAmount(e.target.value)}
            className="w-32 rounded-md border border-gray-300 bg-surface px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="0.00"
          />
          <button
            type="button"
            onClick={handleExtraPayment}
            disabled={mutating || !extraAmount}
            className="rounded-md bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {mutating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
          </button>
          <button
            type="button"
            onClick={() => { setShowExtraPayment(false); setExtraAmount(''); }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Cancel inline form */}
      {showCancel && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3">
          <label className="mb-1 block text-sm font-medium text-red-700">
            Cancellation Reason
          </label>
          <input
            type="text"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            className="mb-2 w-full rounded-md border border-red-300 bg-surface px-2 py-1 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            placeholder="Enter reason for cancellation..."
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={mutating || !cancelReason.trim()}
              className="rounded-md bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {mutating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Cancel'}
            </button>
            <button
              type="button"
              onClick={() => { setShowCancel(false); setCancelReason(''); }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Amortization Schedule Table ─────────────────────────────────

function AmortizationTable({
  schedule,
  accountId,
  contractId,
  onRefresh,
}: {
  schedule: InitiationScheduleEntry[];
  accountId: string;
  contractId: string;
  onRefresh: () => void;
}) {
  const { billInstallment, isLoading: mutating } = useInitiationMutations();
  const [billingIndex, setBillingIndex] = useState<number | null>(null);
  const [billError, setBillError] = useState<string | null>(null);

  // Find the next scheduled entry (the "current" one)
  const nextScheduledIndex = schedule.findIndex((e) => e.status === 'scheduled');

  const handleBill = useCallback(
    async (periodIndex: number) => {
      setBillingIndex(periodIndex);
      setBillError(null);
      try {
        await billInstallment(accountId, contractId, periodIndex);
        onRefresh();
      } catch (err) {
        setBillError(err instanceof Error ? err.message : 'Failed to bill installment');
      } finally {
        setBillingIndex(null);
      }
    },
    [accountId, contractId, billInstallment, onRefresh],
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-indigo-600" />
        <h4 className="text-sm font-semibold text-gray-900">Amortization Schedule</h4>
      </div>

      {billError && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {billError}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="pb-2 pr-3 font-medium">#</th>
              <th className="pb-2 pr-3 font-medium">Due Date</th>
              <th className="pb-2 pr-3 text-right font-medium">Payment</th>
              <th className="pb-2 pr-3 text-right font-medium">Principal</th>
              <th className="pb-2 pr-3 text-right font-medium">Interest</th>
              <th className="pb-2 pr-3 font-medium">Status</th>
              <th className="pb-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {schedule.map((entry) => {
              const isNext = entry.periodIndex === nextScheduledIndex;
              return (
                <tr
                  key={entry.id}
                  className={isNext ? 'bg-indigo-50/50' : ''}
                >
                  <td className="py-2 pr-3 text-gray-600">{entry.periodIndex + 1}</td>
                  <td className="py-2 pr-3 text-gray-900">{formatDate(entry.dueDate)}</td>
                  <td className="py-2 pr-3 text-right font-medium text-gray-900">
                    {formatMoney(entry.paymentCents)}
                  </td>
                  <td className="py-2 pr-3 text-right text-gray-700">
                    {formatMoney(entry.principalCents)}
                  </td>
                  <td className="py-2 pr-3 text-right text-gray-700">
                    {formatMoney(entry.interestCents)}
                  </td>
                  <td className="py-2 pr-3">
                    <StatusBadge status={entry.status} />
                  </td>
                  <td className="py-2">
                    {entry.status === 'scheduled' && (
                      <button
                        type="button"
                        onClick={() => handleBill(entry.periodIndex)}
                        disabled={mutating && billingIndex === entry.periodIndex}
                        className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {mutating && billingIndex === entry.periodIndex ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          'Bill'
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Payoff Calculator ───────────────────────────────────────────

function PayoffCalculator({
  accountId,
  contractId,
}: {
  accountId: string;
  contractId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [dateInput, setDateInput] = useState(
    new Date().toISOString().split('T')[0]!,
  );
  const { data: quote, isLoading, error } = usePayoffQuote(
    expanded ? accountId : null,
    expanded ? contractId : null,
    expanded ? dateInput : undefined,
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-surface p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-indigo-600" />
          <h4 className="text-sm font-semibold text-gray-900">Payoff Calculator</h4>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Payoff Date
            </label>
            <input
              type="date"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              className="w-48 rounded-md border border-gray-300 bg-surface px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Calculating...
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error.message}
            </div>
          )}

          {quote && !isLoading && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <div className="text-xs text-gray-500">Payoff Amount</div>
                <div className="text-lg font-semibold text-gray-900">
                  {formatMoney(quote.payoffAmountCents)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Principal</div>
                <div className="text-sm font-medium text-gray-900">
                  {formatMoney(quote.principalCents)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Accrued Interest</div>
                <div className="text-sm font-medium text-gray-900">
                  {formatMoney(quote.accruedInterestCents)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Deferred Revenue Section ────────────────────────────────────

function DeferredRevenueSection({ accountId }: { accountId: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading, error } = useDeferredRevenue(expanded ? accountId : undefined);

  return (
    <div className="rounded-lg border border-gray-200 bg-surface p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-indigo-600" />
          <h4 className="text-sm font-semibold text-gray-900">Deferred Revenue</h4>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="mt-3">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error.message}
            </div>
          )}

          {data && !isLoading && (
            <>
              {/* Summary totals */}
              <div className="mb-3 grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-xs text-gray-500">Total Deferred</div>
                  <div className="text-lg font-semibold text-amber-600">
                    {formatMoney(data.totalDeferredCents)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">Total Recognized</div>
                  <div className="text-lg font-semibold text-green-600">
                    {formatMoney(data.totalRecognizedCents)}
                  </div>
                </div>
              </div>

              {data.entries.length === 0 ? (
                <p className="text-center text-sm text-gray-400">No deferred revenue entries.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                        <th className="pb-2 pr-3 font-medium">Contract</th>
                        <th className="pb-2 pr-3 text-right font-medium">Total Fee</th>
                        <th className="pb-2 pr-3 text-right font-medium">Recognized</th>
                        <th className="pb-2 pr-3 text-right font-medium">Deferred</th>
                        <th className="pb-2 pr-3 font-medium">Model</th>
                        <th className="pb-2 font-medium">Next Recognition</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {data.entries.map((entry) => (
                        <tr key={entry.contractId}>
                          <td className="py-2 pr-3 text-gray-900">
                            {formatDate(entry.contractDate)}
                          </td>
                          <td className="py-2 pr-3 text-right font-medium text-gray-900">
                            {formatMoney(entry.totalFeeCents)}
                          </td>
                          <td className="py-2 pr-3 text-right text-green-600">
                            {formatMoney(entry.recognizedCents)}
                          </td>
                          <td className="py-2 pr-3 text-right text-amber-600">
                            {formatMoney(entry.deferredCents)}
                          </td>
                          <td className="py-2 pr-3">
                            <Badge variant="neutral">
                              {entry.clubModel.replace('_', ' ')}
                            </Badge>
                          </td>
                          <td className="py-2 text-gray-600">
                            {formatDate(entry.nextRecognitionDate)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────

export default function InitiationSubTab({
  membershipAccountId,
}: {
  membershipAccountId: string;
}) {
  const { data: contracts, isLoading, error, mutate } =
    useInitiationContracts(membershipAccountId);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);

  const { data: scheduleData, mutate: refreshSchedule } = useInitiationSchedule(
    membershipAccountId,
    selectedContractId,
  );

  const handleRefresh = useCallback(() => {
    mutate();
    if (selectedContractId) {
      refreshSchedule();
    }
  }, [mutate, selectedContractId, refreshSchedule]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <div className="h-40 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-24 animate-pulse rounded-lg bg-gray-100" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 p-4 text-gray-500">
        <AlertCircle className="h-6 w-6 text-red-400" />
        <p className="text-sm">Failed to load initiation financing data</p>
        <button
          type="button"
          onClick={mutate}
          className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  }

  // Empty state
  if (!contracts || contracts.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 p-4 text-gray-400">
        <Landmark className="h-6 w-6" />
        <p className="text-sm font-medium text-gray-500">No Initiation Contracts</p>
        <p className="text-xs">
          No initiation fee financing has been set up for this account.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Contract summary cards */}
      {contracts.map((contract) => (
        <ContractCard
          key={contract.id}
          contract={contract}
          isSelected={selectedContractId === contract.id}
          onSelect={() =>
            setSelectedContractId((prev) =>
              prev === contract.id ? null : contract.id,
            )
          }
          accountId={membershipAccountId}
          onRefresh={handleRefresh}
        />
      ))}

      {/* Amortization schedule for selected contract */}
      {selectedContractId && scheduleData && (
        <>
          <AmortizationTable
            schedule={scheduleData.schedule}
            accountId={membershipAccountId}
            contractId={selectedContractId}
            onRefresh={handleRefresh}
          />
          <PayoffCalculator
            accountId={membershipAccountId}
            contractId={selectedContractId}
          />
        </>
      )}

      {/* Deferred revenue section */}
      <DeferredRevenueSection accountId={membershipAccountId} />
    </div>
  );
}
