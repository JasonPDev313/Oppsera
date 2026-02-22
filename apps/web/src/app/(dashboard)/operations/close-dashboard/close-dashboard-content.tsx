'use client';

import { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  Clock,
  Banknote,
  Monitor,
  UtensilsCrossed,
  Plus,
  ChevronRight,
  ArrowUpRight,
  RefreshCw,
} from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { useCloseStatus } from '@/hooks/use-close-status';
import { useDepositSlips, useDepositMutations } from '@/hooks/use-deposits';
import type { TerminalCloseStatusItem, DepositSlipItem } from '@/types/accounting';

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function getToday(): string {
  return new Date().toISOString().split('T')[0]!;
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-gray-400">-</span>;
  const cfg: Record<string, string> = {
    open: 'bg-blue-100 text-blue-700',
    closed: 'bg-green-100 text-green-700',
    posted: 'bg-green-100 text-green-700',
    locked: 'bg-gray-100 text-gray-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    reconciled: 'bg-emerald-100 text-emerald-700',
    pending: 'bg-yellow-100 text-yellow-700',
    deposited: 'bg-blue-100 text-blue-700',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cfg[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function ReadinessIcon({ ready }: { ready: boolean }) {
  return ready ? (
    <CheckCircle className="h-5 w-5 text-green-500" />
  ) : (
    <XCircle className="h-5 w-5 text-red-400" />
  );
}

// ── Terminal Status Grid ──────────────────────────────────────

function TerminalStatusGrid({ terminals }: { terminals: TerminalCloseStatusItem[] }) {
  if (terminals.length === 0) {
    return <p className="text-sm text-gray-400 italic">No active terminals</p>;
  }

  return (
    <div className="space-y-2">
      {terminals.map((t) => (
        <div
          key={t.terminalId}
          className="flex items-center justify-between rounded-lg border border-gray-200 bg-surface px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-900">
              {t.terminalName ?? t.terminalId.slice(0, 8)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-gray-500">Drawer</p>
              <StatusBadge status={t.drawerSessionStatus} />
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Close</p>
              <StatusBadge status={t.closeBatchStatus} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Deposit Slip List ─────────────────────────────────────────

function DepositSlipList({
  deposits,
  onMarkDeposited,
  onReconcile,
  isActing,
}: {
  deposits: DepositSlipItem[];
  onMarkDeposited: (id: string) => void;
  onReconcile: (id: string) => void;
  isActing: boolean;
}) {
  if (deposits.length === 0) {
    return <p className="text-sm text-gray-400 italic">No deposit slips</p>;
  }

  return (
    <div className="space-y-2">
      {deposits.map((d) => (
        <div
          key={d.id}
          className="flex items-center justify-between rounded-lg border border-gray-200 bg-surface px-4 py-3"
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">{d.businessDate}</span>
              <StatusBadge status={d.status} />
            </div>
            <p className="mt-0.5 text-sm text-gray-500">
              {formatMoney(d.totalAmountCents)} &middot; {d.depositType}
              {d.retailCloseBatchIds.length > 0 && ` · ${d.retailCloseBatchIds.length} retail batch${d.retailCloseBatchIds.length !== 1 ? 'es' : ''}`}
              {d.fnbCloseBatchId && ' · F&B batch'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {d.status === 'pending' && (
              <button
                onClick={() => onMarkDeposited(d.id)}
                disabled={isActing}
                className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
              >
                <ArrowUpRight className="h-3 w-3" /> Deposited
              </button>
            )}
            {d.status === 'deposited' && (
              <button
                onClick={() => onReconcile(d.id)}
                disabled={isActing}
                className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500 transition-colors disabled:opacity-50"
              >
                <CheckCircle className="h-3 w-3" /> Reconcile
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Create Deposit Dialog ────────────────────────────────────

function CreateDepositForm({
  locationId,
  businessDate,
  onSubmit,
  isSubmitting,
  onCancel,
}: {
  locationId: string;
  businessDate: string;
  onSubmit: (input: { totalAmountCents: number; depositType: string; notes: string }) => void;
  isSubmitting: boolean;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [depositType, setDepositType] = useState('cash');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cents = Math.round(parseFloat(amount) * 100);
    if (isNaN(cents) || cents <= 0) return;
    onSubmit({ totalAmountCents: cents, depositType, notes });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-surface p-4">
      <h3 className="text-sm font-semibold text-gray-900">New Deposit Slip</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Amount ($)</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            placeholder="0.00"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
          <select
            value={depositType}
            onChange={(e) => setDepositType(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm"
          >
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            placeholder="Optional"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
        >
          Create Deposit Slip
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Main Content ─────────────────────────────────────────────

export default function CloseDashboardContent() {
  const { locations } = useAuthContext();
  const [selectedLocationId, setSelectedLocationId] = useState(locations[0]?.id ?? '');
  const [businessDate, setBusinessDate] = useState(getToday());
  const [showCreateForm, setShowCreateForm] = useState(false);

  const { data: closeStatus, isLoading: statusLoading, refetch: refreshStatus } = useCloseStatus(
    selectedLocationId || null,
    businessDate,
  );

  const { items: deposits, isLoading: depositsLoading, refetch: refreshDeposits } = useDepositSlips({
    locationId: selectedLocationId || undefined,
    limit: 20,
  });

  const { createDeposit, markDeposited, reconcileDeposit } = useDepositMutations();

  const handleCreateDeposit = (input: { totalAmountCents: number; depositType: string; notes: string }) => {
    createDeposit.mutate(
      {
        locationId: selectedLocationId,
        businessDate,
        totalAmountCents: input.totalAmountCents,
        depositType: input.depositType,
        notes: input.notes || undefined,
      },
      {
        onSuccess: () => {
          setShowCreateForm(false);
          refreshStatus();
          refreshDeposits();
        },
      },
    );
  };

  const handleRefresh = () => {
    refreshStatus();
    refreshDeposits();
  };

  const isLoading = statusLoading || depositsLoading;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Close Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Monitor terminal and F&B close status, manage deposits</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(e.target.value)}
            className="rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          >
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
          <input
            type="date"
            value={businessDate}
            onChange={(e) => setBusinessDate(e.target.value)}
            className="rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
          <button
            onClick={handleRefresh}
            className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Readiness Summary Cards */}
      {closeStatus && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-surface p-4">
            <ReadinessIcon ready={closeStatus.allTerminalsClosed} />
            <div>
              <p className="text-sm font-medium text-gray-900">Retail Terminals</p>
              <p className="text-xs text-gray-500">
                {closeStatus.allTerminalsClosed
                  ? 'All closed'
                  : `${closeStatus.retailTerminals.filter((t) => t.closeBatchStatus && ['posted', 'locked'].includes(t.closeBatchStatus)).length} of ${closeStatus.retailTerminals.length} closed`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-surface p-4">
            <ReadinessIcon ready={closeStatus.fnbClosed} />
            <div>
              <p className="text-sm font-medium text-gray-900">F&B Close</p>
              <p className="text-xs text-gray-500">
                {closeStatus.fnbBatchStatus ? `Status: ${closeStatus.fnbBatchStatus}` : 'No F&B batch'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-surface p-4">
            <ReadinessIcon ready={closeStatus.depositReady} />
            <div>
              <p className="text-sm font-medium text-gray-900">Deposit Ready</p>
              <p className="text-xs text-gray-500">
                {closeStatus.depositReady
                  ? closeStatus.depositSlipStatus
                    ? `Deposit: ${closeStatus.depositSlipStatus}`
                    : 'Ready to create deposit'
                  : 'Waiting for closes'}
              </p>
            </div>
          </div>
        </div>
      )}

      {isLoading && !closeStatus && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      )}

      {/* Two-column layout: Terminal Status + Deposits */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Terminal Status */}
        <div className="rounded-lg border border-gray-200 bg-surface p-4">
          <div className="flex items-center gap-2 mb-4">
            <Monitor className="h-4 w-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-900">Retail Terminal Status</h2>
          </div>
          {closeStatus ? (
            <TerminalStatusGrid terminals={closeStatus.retailTerminals} />
          ) : statusLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">Select a location</p>
          )}

          {/* F&B Status */}
          {closeStatus && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <UtensilsCrossed className="h-4 w-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-900">F&B Close Batch</h3>
              </div>
              {closeStatus.fnbBatchStatus ? (
                <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-surface px-3 py-2">
                  <span className="text-sm text-gray-700">Batch {closeStatus.fnbBatchId?.slice(0, 8)}</span>
                  <StatusBadge status={closeStatus.fnbBatchStatus} />
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No F&B close batch for this date</p>
              )}
            </div>
          )}
        </div>

        {/* Deposit Slips */}
        <div className="rounded-lg border border-gray-200 bg-surface p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-900">Deposit Slips</h2>
            </div>
            {!showCreateForm && closeStatus?.depositReady && (
              <button
                onClick={() => setShowCreateForm(true)}
                className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
              >
                <Plus className="h-3 w-3" /> New Deposit
              </button>
            )}
          </div>

          {showCreateForm && (
            <div className="mb-4">
              <CreateDepositForm
                locationId={selectedLocationId}
                businessDate={businessDate}
                onSubmit={handleCreateDeposit}
                isSubmitting={createDeposit.isPending}
                onCancel={() => setShowCreateForm(false)}
              />
            </div>
          )}

          {depositsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          ) : (
            <DepositSlipList
              deposits={deposits}
              onMarkDeposited={(id) => markDeposited.mutate(id)}
              onReconcile={(id) => reconcileDeposit.mutate(id)}
              isActing={markDeposited.isPending || reconcileDeposit.isPending}
            />
          )}
        </div>
      </div>
    </div>
  );
}
