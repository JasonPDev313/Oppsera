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
      {Icon && <Icon className="mr-1 h-3 w-3" aria-hidden="true" />}
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
      ? 'bg-green-500/20'
      : capped >= 50
        ? 'bg-indigo-500/20'
        : 'bg-amber-500/20';

  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Paid off</span>
        <span className="font-semibold text-muted-foreground">{capped}%</span>
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
  const { recordExtraPrincipal, cancelContract, isLoading: mutating } =
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
        isSelected ? 'border-indigo-500/30 ring-1 ring-indigo-500/30' : 'border-border'
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onSelect}
          className="flex items-center gap-2 text-left"
        >
          <Landmark className="h-5 w-5 text-indigo-600" aria-hidden="true" />
          <span className="text-sm font-semibold text-foreground">
            Initiation Contract
          </span>
          {isSelected ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
        </button>
        <StatusBadge status={contract.status} />
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
        <div>
          <div className="text-xs text-muted-foreground">Contract Date</div>
          <div className="flex items-center gap-1.5 text-sm text-foreground">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            {formatDate(contract.contractDate)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Initiation Fee</div>
          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            {formatMoney(contract.initiationFeeCents)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Financed Amount</div>
          <div className="text-sm font-medium text-foreground">
            {formatMoney(contract.financedPrincipalCents)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Down Payment</div>
          <div className="text-sm text-foreground">
            {formatMoney(contract.downPaymentCents)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">APR</div>
          <div className="flex items-center gap-1.5 text-sm text-foreground">
            <Percent className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            {formatApr(contract.aprBps)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Term</div>
          <div className="flex items-center gap-1.5 text-sm text-foreground">
            <Hash className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            {contract.termMonths} months
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Remaining Principal</div>
          <div className="text-sm font-medium text-foreground">
            {formatMoney(contract.remainingPrincipalCents)}
          </div>
        </div>
        {contract.nextPaymentDate && (
          <div>
            <div className="text-xs text-muted-foreground">Next Payment</div>
            <div className="text-sm text-foreground">
              {formatDate(contract.nextPaymentDate)}
              {contract.nextPaymentCents != null && (
                <span className="ml-1 text-muted-foreground">
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
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={handleBillNext}
            className="rounded-md border border-input px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent"
          >
            Bill Next
          </button>
          <button
            type="button"
            onClick={() => setShowExtraPayment((v) => !v)}
            className="rounded-md border border-input px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent"
          >
            Extra Payment
          </button>
          <button
            type="button"
            onClick={onSelect}
            className="flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent"
          >
            <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
            Payoff Quote
          </button>
          <button
            type="button"
            onClick={() => setShowCancel((v) => !v)}
            className="rounded-md border border-red-500/30 px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-500/10"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Error display */}
      {actionError && (
        <div className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {actionError}
        </div>
      )}

      {/* Extra payment inline form */}
      {showExtraPayment && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-muted p-3">
          <label className="text-sm text-muted-foreground">Amount ($):</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={extraAmount}
            onChange={(e) => setExtraAmount(e.target.value)}
            className="w-32 rounded-md border border-input bg-surface px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="0.00"
          />
          <button
            type="button"
            onClick={handleExtraPayment}
            disabled={mutating || !extraAmount}
            className="rounded-md bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {mutating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
          </button>
          <button
            type="button"
            onClick={() => { setShowExtraPayment(false); setExtraAmount(''); }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Cancel inline form */}
      {showCancel && (
        <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 p-3">
          <label className="mb-1 block text-sm font-medium text-red-500">
            Cancellation Reason
          </label>
          <input
            type="text"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            className="mb-2 w-full rounded-md border border-red-500/30 bg-surface px-2 py-1 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
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
              className="text-sm text-muted-foreground hover:text-foreground"
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
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-indigo-600" aria-hidden="true" />
        <h4 className="text-sm font-semibold text-foreground">Amortization Schedule</h4>
      </div>

      {billError && (
        <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {billError}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-3 font-medium">#</th>
              <th className="pb-2 pr-3 font-medium">Due Date</th>
              <th className="pb-2 pr-3 text-right font-medium">Payment</th>
              <th className="pb-2 pr-3 text-right font-medium">Principal</th>
              <th className="pb-2 pr-3 text-right font-medium">Interest</th>
              <th className="pb-2 pr-3 font-medium">Status</th>
              <th className="pb-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {schedule.map((entry) => {
              const isNext = entry.periodIndex === nextScheduledIndex;
              return (
                <tr
                  key={entry.id}
                  className={isNext ? 'bg-indigo-500/10' : ''}
                >
                  <td className="py-2 pr-3 text-muted-foreground">{entry.periodIndex + 1}</td>
                  <td className="py-2 pr-3 text-foreground">{formatDate(entry.dueDate)}</td>
                  <td className="py-2 pr-3 text-right font-medium text-foreground">
                    {formatMoney(entry.paymentCents)}
                  </td>
                  <td className="py-2 pr-3 text-right text-muted-foreground">
                    {formatMoney(entry.principalCents)}
                  </td>
                  <td className="py-2 pr-3 text-right text-muted-foreground">
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
                        className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
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
    <div className="rounded-lg border border-border bg-surface p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-indigo-600" aria-hidden="true" />
          <h4 className="text-sm font-semibold text-foreground">Payoff Calculator</h4>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Payoff Date
            </label>
            <input
              type="date"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              className="w-48 rounded-md border border-input bg-surface px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Calculating...
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
              {error.message}
            </div>
          )}

          {quote && !isLoading && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">Payoff Amount</div>
                <div className="text-lg font-semibold text-foreground">
                  {formatMoney(quote.payoffAmountCents)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Principal</div>
                <div className="text-sm font-medium text-foreground">
                  {formatMoney(quote.principalCents)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Accrued Interest</div>
                <div className="text-sm font-medium text-foreground">
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
    <div className="rounded-lg border border-border bg-surface p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-indigo-600" aria-hidden="true" />
          <h4 className="text-sm font-semibold text-foreground">Deferred Revenue</h4>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        )}
      </button>

      {expanded && (
        <div className="mt-3">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading...
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
              {error.message}
            </div>
          )}

          {data && !isLoading && (
            <>
              {/* Summary totals */}
              <div className="mb-3 grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">Total Deferred</div>
                  <div className="text-lg font-semibold text-amber-500">
                    {formatMoney(data.totalDeferredCents)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">Total Recognized</div>
                  <div className="text-lg font-semibold text-green-500">
                    {formatMoney(data.totalRecognizedCents)}
                  </div>
                </div>
              </div>

              {(data.entries ?? []).length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">No deferred revenue entries.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="pb-2 pr-3 font-medium">Contract</th>
                        <th className="pb-2 pr-3 text-right font-medium">Total Fee</th>
                        <th className="pb-2 pr-3 text-right font-medium">Recognized</th>
                        <th className="pb-2 pr-3 text-right font-medium">Deferred</th>
                        <th className="pb-2 pr-3 font-medium">Model</th>
                        <th className="pb-2 font-medium">Next Recognition</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(data.entries ?? []).map((entry) => (
                        <tr key={entry.contractId}>
                          <td className="py-2 pr-3 text-foreground">
                            {formatDate(entry.contractDate)}
                          </td>
                          <td className="py-2 pr-3 text-right font-medium text-foreground">
                            {formatMoney(entry.totalFeeCents)}
                          </td>
                          <td className="py-2 pr-3 text-right text-green-500">
                            {formatMoney(entry.recognizedCents)}
                          </td>
                          <td className="py-2 pr-3 text-right text-amber-500">
                            {formatMoney(entry.deferredCents)}
                          </td>
                          <td className="py-2 pr-3">
                            <Badge variant="neutral">
                              {entry.clubModel.replace('_', ' ')}
                            </Badge>
                          </td>
                          <td className="py-2 text-muted-foreground">
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
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 p-4 text-muted-foreground">
        <AlertCircle className="h-6 w-6 text-red-400" aria-hidden="true" />
        <p className="text-sm">Failed to load initiation financing data</p>
        <button
          type="button"
          onClick={mutate}
          className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-500"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  // Empty state
  if (!contracts || contracts.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 p-4 text-muted-foreground">
        <Landmark className="h-6 w-6" aria-hidden="true" />
        <p className="text-sm font-medium text-muted-foreground">No Initiation Contracts</p>
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
