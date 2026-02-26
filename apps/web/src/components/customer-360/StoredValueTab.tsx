'use client';

import { useState, useMemo } from 'react';
import {
  CreditCard,
  Gift,
  Plus,
  RefreshCw,
  Ban,
  ChevronDown,
  ChevronUp,
  History,
  Wallet,
  Hash,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import {
  useStoredValueInstruments,
  useStoredValueTransactions,
  useStoredValueMutations,
} from '@/hooks/use-customer-360';
import type {
  StoredValueInstrumentEntry,
} from '@/types/customer-360';

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

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

const INSTRUMENT_TYPE_LABELS: Record<string, string> = {
  gift_card: 'Gift Card',
  credit_book: 'Credit Book',
  raincheck: 'Raincheck',
  range_card: 'Range Card',
  rounds_card: 'Rounds Card',
  prepaid_balance: 'Prepaid Balance',
  punchcard: 'Punch Card',
  award: 'Award',
};

const INSTRUMENT_TYPE_ICONS: Record<string, typeof Gift> = {
  gift_card: Gift,
  credit_book: CreditCard,
  raincheck: Clock,
  range_card: CreditCard,
  rounds_card: CreditCard,
  prepaid_balance: Wallet,
  punchcard: Hash,
  award: Gift,
};

function statusVariant(status: string): string {
  const map: Record<string, string> = {
    active: 'success',
    frozen: 'warning',
    expired: 'neutral',
    redeemed: 'info',
    voided: 'error',
  };
  return map[status] ?? 'neutral';
}

function txnTypeVariant(type: string): string {
  const map: Record<string, string> = {
    issue: 'success',
    redeem: 'error',
    reload: 'info',
    transfer_in: 'indigo',
    transfer_out: 'warning',
    void: 'error',
    expire: 'neutral',
    adjustment: 'purple',
  };
  return map[type] ?? 'neutral';
}

// ── Skeleton ────────────────────────────────────────────────────

function SkeletonCard() {
  return <div className="h-24 animate-pulse rounded-lg bg-muted" />;
}

// ── Issue Form ──────────────────────────────────────────────────

function IssueForm({
  customerId,
  onSuccess,
}: {
  customerId: string;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const { issue, isLoading } = useStoredValueMutations();
  const [instrumentType, setInstrumentType] = useState('gift_card');
  const [code, setCode] = useState('');
  const [initialValueCents, setInitialValueCents] = useState('');
  const [unitCount, setUnitCount] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = async () => {
    if (!code.trim()) {
      toast.error('Code is required');
      return;
    }
    try {
      await issue(customerId, {
        instrumentType,
        code: code.trim(),
        initialValueCents: initialValueCents ? Math.round(parseFloat(initialValueCents) * 100) : 0,
        unitCount: unitCount ? parseInt(unitCount, 10) : undefined,
        description: description || undefined,
      });
      toast.success('Stored value instrument issued');
      setCode('');
      setInitialValueCents('');
      setUnitCount('');
      setDescription('');
      onSuccess();
    } catch {
      toast.error('Failed to issue stored value');
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h4 className="mb-3 text-sm font-semibold text-foreground">Issue New Instrument</h4>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Type</label>
          <select
            value={instrumentType}
            onChange={(e) => setInstrumentType(e.target.value)}
            className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {Object.entries(INSTRUMENT_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Code</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g., GC-12345"
            className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Value ($)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={initialValueCents}
            onChange={(e) => setInitialValueCents(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Units (optional)</label>
          <input
            type="number"
            min="1"
            value={unitCount}
            onChange={(e) => setUnitCount(e.target.value)}
            placeholder="e.g., 10"
            className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>
      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Description (optional)</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isLoading || !code.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Issue
        </button>
      </div>
    </div>
  );
}

// ── Instrument Card ─────────────────────────────────────────────

function InstrumentCard({
  instrument,
  isExpanded,
  onToggle,
  customerId,
  onRefresh,
}: {
  instrument: StoredValueInstrumentEntry;
  isExpanded: boolean;
  onToggle: () => void;
  customerId: string;
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const { redeem, reload, voidInstrument, isLoading: mutLoading } = useStoredValueMutations();
  const { data: txnData, isLoading: txnLoading } = useStoredValueTransactions(
    isExpanded ? customerId : null,
    isExpanded ? instrument.id : null,
    { limit: 20 },
  );

  const [showRedeem, setShowRedeem] = useState(false);
  const [showReload, setShowReload] = useState(false);
  const [redeemAmount, setRedeemAmount] = useState('');
  const [reloadAmount, setReloadAmount] = useState('');

  const Icon = INSTRUMENT_TYPE_ICONS[instrument.instrumentType] ?? CreditCard;
  const typeLabel = INSTRUMENT_TYPE_LABELS[instrument.instrumentType] ?? instrument.instrumentType;

  const handleRedeem = async () => {
    if (!redeemAmount) return;
    const cents = Math.round(parseFloat(redeemAmount) * 100);
    try {
      await redeem(customerId, instrument.id, { amountCents: cents });
      toast.success('Redemption successful');
      setRedeemAmount('');
      setShowRedeem(false);
      onRefresh();
    } catch {
      toast.error('Failed to redeem');
    }
  };

  const handleReload = async () => {
    if (!reloadAmount) return;
    const cents = Math.round(parseFloat(reloadAmount) * 100);
    try {
      await reload(customerId, instrument.id, { amountCents: cents });
      toast.success('Reload successful');
      setReloadAmount('');
      setShowReload(false);
      onRefresh();
    } catch {
      toast.error('Failed to reload');
    }
  };

  const handleVoid = async () => {
    const approvedBy = prompt('Enter manager PIN to void this instrument:');
    if (!approvedBy) return;
    try {
      await voidInstrument(customerId, instrument.id, { approvedBy, reason: 'Manual void' });
      toast.success('Instrument voided');
      onRefresh();
    } catch {
      toast.error('Failed to void');
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface">
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{instrument.code}</span>
              <Badge variant={statusVariant(instrument.status) as any}>
                {instrument.status}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{typeLabel}</span>
              {instrument.description && (
                <>
                  <span className="text-gray-300">|</span>
                  <span>{instrument.description}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-semibold text-foreground">
              {formatMoney(instrument.currentBalanceCents)}
            </div>
            {instrument.unitsRemaining != null && (
              <div className="text-xs text-muted-foreground">
                {instrument.unitsRemaining}/{instrument.unitCount} units
              </div>
            )}
          </div>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded Detail */}
      {isExpanded && (
        <div className="border-t border-border p-4">
          {/* Meta info */}
          <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
            <div>
              <span className="text-muted-foreground">Initial Value</span>
              <div className="font-medium text-foreground">{formatMoney(instrument.initialValueCents)}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Issued</span>
              <div className="font-medium text-foreground">{formatDate(instrument.createdAt)}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Expires</span>
              <div className="font-medium text-foreground">
                {instrument.expiresAt ? formatDate(instrument.expiresAt) : 'No expiry'}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Issued By</span>
              <div className="font-medium text-foreground">{instrument.issuedBy ?? 'System'}</div>
            </div>
          </div>

          {/* Action buttons */}
          {instrument.status === 'active' && (
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { setShowRedeem(!showRedeem); setShowReload(false); }}
                className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                <CreditCard className="h-3.5 w-3.5" />
                Redeem
              </button>
              <button
                type="button"
                onClick={() => { setShowReload(!showReload); setShowRedeem(false); }}
                className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reload
              </button>
              <button
                type="button"
                onClick={handleVoid}
                disabled={mutLoading}
                className="inline-flex items-center gap-1 rounded-md border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/100/10"
              >
                <Ban className="h-3.5 w-3.5" />
                Void
              </button>
            </div>
          )}

          {/* Redeem form */}
          {showRedeem && (
            <div className="mb-4 flex items-end gap-2 rounded-md border border-border bg-muted/50 p-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={(instrument.currentBalanceCents / 100).toFixed(2)}
                  value={redeemAmount}
                  onChange={(e) => setRedeemAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <button
                type="button"
                onClick={handleRedeem}
                disabled={mutLoading || !redeemAmount}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => { setShowRedeem(false); setRedeemAmount(''); }}
                className="rounded-md border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Reload form */}
          {showReload && (
            <div className="mb-4 flex items-end gap-2 rounded-md border border-border bg-muted/50 p-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={reloadAmount}
                  onChange={(e) => setReloadAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <button
                type="button"
                onClick={handleReload}
                disabled={mutLoading || !reloadAmount}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => { setShowReload(false); setReloadAmount(''); }}
                className="rounded-md border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Transaction History */}
          <div className="mt-2">
            <h5 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <History className="h-3.5 w-3.5" />
              Transaction History
            </h5>
            {txnLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-8 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : txnData?.transactions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No transactions yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-1.5 pr-4 font-medium">Date</th>
                      <th className="pb-1.5 pr-4 font-medium">Type</th>
                      <th className="pb-1.5 pr-4 font-medium text-right">Amount</th>
                      <th className="pb-1.5 pr-4 font-medium text-right">Balance</th>
                      <th className="pb-1.5 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txnData?.transactions.map((txn) => (
                      <tr key={txn.id} className="border-b border-gray-50">
                        <td className="py-1.5 pr-4 text-muted-foreground">
                          {formatDateTime(txn.createdAt)}
                        </td>
                        <td className="py-1.5 pr-4">
                          <Badge variant={txnTypeVariant(txn.txnType) as any} className="text-[10px]">
                            {txn.txnType.replace(/_/g, ' ')}
                          </Badge>
                        </td>
                        <td className={`py-1.5 pr-4 text-right font-medium ${
                          txn.amountCents >= 0 ? 'text-green-500' : 'text-red-500'
                        }`}>
                          {formatMoney(txn.amountCents)}
                          {txn.unitDelta != null && (
                            <span className="ml-1 text-muted-foreground">
                              ({txn.unitDelta > 0 ? '+' : ''}{txn.unitDelta}u)
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-4 text-right text-foreground">
                          {formatMoney(txn.runningBalanceCents)}
                        </td>
                        <td className="py-1.5 text-muted-foreground">{txn.reason ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Tab ────────────────────────────────────────────────────

export default function StoredValueTab({ customerId }: { customerId: string }) {
  const { data, isLoading, error, mutate } = useStoredValueInstruments(customerId);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showIssue, setShowIssue] = useState(false);
  const [filterType, setFilterType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  const instruments = data?.instruments ?? [];

  const filtered = useMemo(() => {
    let result = instruments;
    if (filterType) result = result.filter((i) => i.instrumentType === filterType);
    if (filterStatus) result = result.filter((i) => i.status === filterStatus);
    return result;
  }, [instruments, filterType, filterStatus]);

  // Summary stats
  const totalBalance = useMemo(
    () => instruments.filter((i) => i.status === 'active').reduce((sum, i) => sum + i.currentBalanceCents, 0),
    [instruments],
  );
  const activeCount = instruments.filter((i) => i.status === 'active').length;
  const expiringCount = instruments.filter((i) => {
    if (i.status !== 'active' || !i.expiresAt) return false;
    const days = (new Date(i.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 30;
  }).length;

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 p-6 text-muted-foreground">
        <AlertTriangle className="h-8 w-8" />
        <p className="text-sm">Failed to load stored value instruments</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Wallet className="h-4 w-4" />
            Total Active Balance
          </div>
          <div className="mt-1 text-xl font-bold text-foreground">{formatMoney(totalBalance)}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CreditCard className="h-4 w-4" />
            Active Instruments
          </div>
          <div className="mt-1 text-xl font-bold text-foreground">{activeCount}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-4 w-4" />
            Expiring Soon (30d)
          </div>
          <div className={`mt-1 text-xl font-bold ${expiringCount > 0 ? 'text-amber-500' : 'text-foreground'}`}>
            {expiringCount}
          </div>
        </div>
      </div>

      {/* Actions + Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-md border border-input bg-surface px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">All Types</option>
            {Object.entries(INSTRUMENT_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-md border border-input bg-surface px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="frozen">Frozen</option>
            <option value="expired">Expired</option>
            <option value="redeemed">Redeemed</option>
            <option value="voided">Voided</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => setShowIssue(!showIssue)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Issue New
        </button>
      </div>

      {/* Issue Form */}
      {showIssue && (
        <IssueForm
          customerId={customerId}
          onSuccess={() => { setShowIssue(false); mutate(); }}
        />
      )}

      {/* Instruments List */}
      {filtered.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-muted-foreground">
          <Gift className="h-8 w-8" />
          <p className="text-sm">No stored value instruments found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((instrument) => (
            <InstrumentCard
              key={instrument.id}
              instrument={instrument}
              isExpanded={expandedId === instrument.id}
              onToggle={() => setExpandedId(expandedId === instrument.id ? null : instrument.id)}
              customerId={customerId}
              onRefresh={mutate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
