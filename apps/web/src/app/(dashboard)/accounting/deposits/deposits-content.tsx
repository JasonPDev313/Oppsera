'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Banknote,
  CheckCircle,
  ArrowUpRight,
  RefreshCw,
  ClipboardCheck,
  X,
} from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { useDepositSlips, useDepositMutations } from '@/hooks/use-deposits';
import type { DenominationBreakdown } from '@/types/accounting';

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const STATUS_TABS = ['all', 'pending', 'prepared', 'deposited', 'reconciled'] as const;

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-500',
    prepared: 'bg-indigo-500/20 text-indigo-500',
    deposited: 'bg-blue-500/20 text-blue-500',
    reconciled: 'bg-green-500/20 text-green-500',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cfg[status] ?? 'bg-muted text-muted-foreground'}`}>
      {status}
    </span>
  );
}

// ── Denomination Counting Grid ──────────────────────────────

const DENOMINATIONS: Array<{ key: keyof DenominationBreakdown; label: string; valueCents: number }> = [
  { key: 'hundreds', label: '$100', valueCents: 10000 },
  { key: 'fifties', label: '$50', valueCents: 5000 },
  { key: 'twenties', label: '$20', valueCents: 2000 },
  { key: 'tens', label: '$10', valueCents: 1000 },
  { key: 'fives', label: '$5', valueCents: 500 },
  { key: 'ones', label: '$1', valueCents: 100 },
  { key: 'quarters', label: '25¢', valueCents: 25 },
  { key: 'dimes', label: '10¢', valueCents: 10 },
  { key: 'nickels', label: '5¢', valueCents: 5 },
  { key: 'pennies', label: '1¢', valueCents: 1 },
];

function emptyBreakdown(): DenominationBreakdown {
  return {
    hundreds: 0, fifties: 0, twenties: 0, tens: 0, fives: 0,
    ones: 0, quarters: 0, dimes: 0, nickels: 0, pennies: 0,
  };
}

function computeTotal(d: DenominationBreakdown): number {
  return DENOMINATIONS.reduce((sum, denom) => sum + d[denom.key] * denom.valueCents, 0);
}

// ── Prepare Deposit Dialog ──────────────────────────────────

function PrepareDepositDialog({
  depositId,
  currentAmountCents,
  onClose,
  onPrepare,
  isPending,
}: {
  depositId: string;
  currentAmountCents: number;
  onClose: () => void;
  onPrepare: (input: {
    depositSlipId: string;
    denominationBreakdown: DenominationBreakdown;
    slipNumber?: string;
    totalAmountCents: number;
  }) => void;
  isPending: boolean;
}) {
  const [breakdown, setBreakdown] = useState<DenominationBreakdown>(emptyBreakdown());
  const [slipNumber, setSlipNumber] = useState('');

  const total = computeTotal(breakdown);

  function updateCount(key: keyof DenominationBreakdown, delta: number) {
    setBreakdown((prev) => ({
      ...prev,
      [key]: Math.max(0, prev[key] + delta),
    }));
  }

  function handleSubmit() {
    onPrepare({
      depositSlipId: depositId,
      denominationBreakdown: breakdown,
      slipNumber: slipNumber || undefined,
      totalAmountCents: total,
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="relative w-full max-w-lg rounded-xl bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-lg font-semibold text-foreground mb-1">Prepare Deposit Slip</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Count denominations and enter the bank deposit slip number.
        </p>

        {/* Slip Number */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground mb-1">Slip Number (optional)</label>
          <input
            type="text"
            value={slipNumber}
            onChange={(e) => setSlipNumber(e.target.value)}
            placeholder="e.g. 000012345"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>

        {/* Denomination Grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {DENOMINATIONS.map((denom) => (
            <div key={denom.key} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span className="text-sm font-medium text-foreground w-12">{denom.label}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateCount(denom.key, -1)}
                  className="h-7 w-7 rounded bg-muted text-muted-foreground hover:bg-accent text-sm font-bold"
                >
                  −
                </button>
                <span className="w-10 text-center text-sm font-mono">{breakdown[denom.key]}</span>
                <button
                  onClick={() => updateCount(denom.key, 1)}
                  className="h-7 w-7 rounded bg-muted text-muted-foreground hover:bg-accent text-sm font-bold"
                >
                  +
                </button>
              </div>
              <span className="text-sm text-muted-foreground text-right w-16 font-mono">
                {formatMoney(breakdown[denom.key] * denom.valueCents)}
              </span>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="rounded-lg bg-muted p-3 mb-4 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Expected</span>
            <span className="font-mono">{formatMoney(currentAmountCents)}</span>
          </div>
          <div className="flex justify-between text-sm font-semibold">
            <span className="text-foreground">Counted</span>
            <span className="font-mono">{formatMoney(total)}</span>
          </div>
          {total !== currentAmountCents && (
            <div className={`flex justify-between text-sm font-medium ${total > currentAmountCents ? 'text-blue-500' : 'text-red-500'}`}>
              <span>Variance</span>
              <span className="font-mono">
                {total > currentAmountCents ? '+' : ''}{formatMoney(total - currentAmountCents)}
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending || total === 0}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isPending ? 'Preparing…' : 'Mark Prepared'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Main Content ────────────────────────────────────────────

export default function DepositsContent() {
  const { locations } = useAuthContext();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('');
  const [prepareId, setPrepareId] = useState<string | null>(null);
  const [prepareAmount, setPrepareAmount] = useState(0);

  const { items, isLoading, refetch } = useDepositSlips({
    locationId: locationFilter || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: 50,
  });

  const { markDeposited, prepareDeposit, reconcileDeposit } = useDepositMutations();

  function openPrepareDialog(id: string, amountCents: number) {
    setPrepareId(id);
    setPrepareAmount(amountCents);
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Deposit Slips</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track cash deposits from daily close batches</p>
        </div>
        <div className="flex items-center gap-3">
          {locations.length > 1 && (
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">All Locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => refetch()}
            className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-accent transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === tab
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface py-12 text-center">
          <Banknote className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No deposit slips found</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Slip #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Batches</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {items.map((d) => (
                <tr key={d.id} className="hover:bg-accent transition-colors">
                  <td className="px-4 py-3 text-sm text-foreground">{d.businessDate}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground capitalize">{d.depositType}</td>
                  <td className="px-4 py-3 text-sm text-foreground text-right font-mono">{formatMoney(d.totalAmountCents)}</td>
                  <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                  <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{d.slipNumber ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {d.retailCloseBatchIds.length > 0 && `${d.retailCloseBatchIds.length} retail`}
                    {d.retailCloseBatchIds.length > 0 && d.fnbCloseBatchId && ', '}
                    {d.fnbCloseBatchId && '1 F&B'}
                    {d.retailCloseBatchIds.length === 0 && !d.fnbCloseBatchId && '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {d.status === 'pending' && (
                        <button
                          onClick={() => openPrepareDialog(d.id, d.totalAmountCents)}
                          className="flex items-center gap-1 rounded-md bg-indigo-500/10 px-2 py-1 text-xs font-medium text-indigo-500 hover:bg-indigo-500/20 transition-colors"
                        >
                          <ClipboardCheck className="h-3 w-3" /> Prepare
                        </button>
                      )}
                      {(d.status === 'pending' || d.status === 'prepared') && (
                        <button
                          onClick={() => markDeposited.mutate(d.id)}
                          disabled={markDeposited.isPending}
                          className="flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-500 hover:bg-blue-500/20 transition-colors"
                        >
                          <ArrowUpRight className="h-3 w-3" /> Deposited
                        </button>
                      )}
                      {d.status === 'deposited' && (
                        <button
                          onClick={() => reconcileDeposit.mutate(d.id)}
                          disabled={reconcileDeposit.isPending}
                          className="flex items-center gap-1 rounded-md bg-green-500/10 px-2 py-1 text-xs font-medium text-green-500 hover:bg-green-500/20 transition-colors"
                        >
                          <CheckCircle className="h-3 w-3" /> Reconcile
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Prepare Dialog */}
      {prepareId && (
        <PrepareDepositDialog
          depositId={prepareId}
          currentAmountCents={prepareAmount}
          onClose={() => setPrepareId(null)}
          onPrepare={(input) => {
            prepareDeposit.mutate(input, {
              onSuccess: () => setPrepareId(null),
            });
          }}
          isPending={prepareDeposit.isPending}
        />
      )}
    </div>
  );
}
