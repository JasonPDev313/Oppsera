'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, Plus, RefreshCw, ChevronRight } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { formatAccountingMoney, BANK_REC_STATUS_CONFIG, BANK_REC_ITEM_TYPE_CONFIG } from '@/types/accounting';
import type { BankReconciliationItem } from '@/types/accounting';
import { useBankReconciliations, useBankReconciliation, useBankReconciliationMutations } from '@/hooks/use-bank-reconciliation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

// ── Bank Account Selector ────────────────────────────────────

interface BankAccountOption {
  id: string;
  name: string;
  glAccountId: string;
  accountNumber?: string;
  accountName?: string;
  bankName: string | null;
  isDefault: boolean;
  lastReconciledDate: string | null;
}

function useBankAccountOptions() {
  const result = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: async () => {
      const res = await apiFetch<{ data: BankAccountOption[] }>('/api/v1/accounting/bank-accounts');
      return res.data;
    },
    staleTime: 30_000,
  });
  return { accounts: result.data ?? [], isLoading: result.isLoading };
}

// ── Start Dialog ─────────────────────────────────────────────

function StartReconciliationDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { accounts } = useBankAccountOptions();
  const { startReconciliation } = useBankReconciliationMutations();
  const [bankAccountId, setBankAccountId] = useState('');
  const [statementDate, setStatementDate] = useState(() => new Date().toISOString().split('T')[0]!);
  const [statementBalance, setStatementBalance] = useState('');

  const handleSubmit = async () => {
    if (!bankAccountId || !statementBalance) return;
    try {
      const result = await startReconciliation.mutateAsync({
        bankAccountId,
        statementDate,
        statementEndingBalance: statementBalance,
      });
      onCreated(result.id);
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to start reconciliation');
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground mb-4">Start Bank Reconciliation</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Bank Account</label>
            <select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">Select a bank account...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} {a.bankName ? `(${a.bankName})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Statement Date</label>
            <input
              type="date"
              value={statementDate}
              onChange={(e) => setStatementDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Statement Ending Balance</label>
            <input
              type="number"
              step="0.01"
              value={statementBalance}
              onChange={(e) => setStatementBalance(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!bankAccountId || !statementBalance || startReconciliation.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {startReconciliation.isPending ? 'Starting...' : 'Start Reconciliation'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Adjustment Dialog ────────────────────────────────────────

function AddAdjustmentDialog({
  open,
  reconciliationId,
  onClose,
}: {
  open: boolean;
  reconciliationId: string;
  onClose: () => void;
}) {
  const { addAdjustment } = useBankReconciliationMutations();
  const [itemType, setItemType] = useState<string>('fee');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]!);
  const [description, setDescription] = useState('');

  const handleSubmit = async () => {
    if (!amount || !description) return;
    try {
      await addAdjustment.mutateAsync({
        reconciliationId,
        itemType,
        amount,
        date,
        description,
      });
      setAmount('');
      setDescription('');
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add adjustment');
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground mb-4">Add Bank Adjustment</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Type</label>
            <select
              value={itemType}
              onChange={(e) => setItemType(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="fee">Bank Fee</option>
              <option value="interest">Interest Earned</option>
              <option value="adjustment">Other Adjustment</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Amount (negative for deductions)</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="-15.00"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Monthly service charge"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!amount || !description || addAdjustment.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {addAdjustment.isPending ? 'Adding...' : 'Add Adjustment'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Workspace View ───────────────────────────────────────────

function ReconciliationWorkspace({
  reconciliationId,
  onBack,
}: {
  reconciliationId: string;
  onBack: () => void;
}) {
  const { data: recon, isLoading, refetch } = useBankReconciliation(reconciliationId);
  const { clearItems, completeReconciliation } = useBankReconciliationMutations();
  const [showAdjustment, setShowAdjustment] = useState(false);

  const handleToggleItem = useCallback(async (item: BankReconciliationItem) => {
    try {
      await clearItems.mutateAsync({
        reconciliationId,
        itemIds: [item.id],
        cleared: !item.isCleared,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update item');
    }
  }, [reconciliationId, clearItems]);

  const handleComplete = useCallback(async () => {
    if (!confirm('Complete this reconciliation? This action cannot be undone.')) return;
    try {
      await completeReconciliation.mutateAsync({ reconciliationId });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to complete');
    }
  }, [reconciliationId, completeReconciliation]);

  if (isLoading || !recon) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  const difference = Number(recon.difference);
  const isBalanced = Math.abs(difference) < 0.01;
  const isCompleted = recon.status === 'completed';

  const clearedItems = recon.items.filter((i) => i.isCleared);
  const unclearedItems = recon.items.filter((i) => !i.isCleared);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-sm font-medium text-indigo-500 hover:text-indigo-500"
          >
            &larr; Back to List
          </button>
          <span className="text-muted-foreground">|</span>
          <h2 className="text-lg font-semibold text-foreground">
            {recon.bankAccountName ?? 'Bank Reconciliation'} &mdash; {recon.statementDate}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {!isCompleted && (
            <>
              <button
                onClick={() => setShowAdjustment(true)}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                <Plus className="h-4 w-4" />
                Add Adjustment
              </button>
              <button
                onClick={handleComplete}
                disabled={!isBalanced || completeReconciliation.isPending}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {completeReconciliation.isPending ? 'Completing...' : 'Complete Reconciliation'}
              </button>
            </>
          )}
          <button
            onClick={() => refetch()}
            className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-accent"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Difference indicator */}
      <div
        className={`rounded-lg border-2 p-4 text-center ${
          isBalanced
            ? 'border-green-500/30 bg-green-500/10'
            : 'border-red-500/30 bg-red-500/10'
        }`}
      >
        <p className="text-sm font-medium text-muted-foreground">Difference</p>
        <p
          className={`text-3xl font-bold tabular-nums font-mono ${
            isBalanced ? 'text-green-500' : 'text-red-500'
          }`}
        >
          {formatAccountingMoney(difference)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {isBalanced ? 'Balanced — ready to complete' : 'Must be $0.00 to complete'}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium text-muted-foreground">Statement Balance</p>
          <p className="mt-1 text-lg font-semibold font-mono tabular-nums text-foreground">
            {formatAccountingMoney(recon.statementEndingBalance)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium text-muted-foreground">Beginning Balance</p>
          <p className="mt-1 text-lg font-semibold font-mono tabular-nums text-foreground">
            {formatAccountingMoney(recon.beginningBalance)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium text-muted-foreground">Cleared Total</p>
          <p className="mt-1 text-lg font-semibold font-mono tabular-nums text-foreground">
            {formatAccountingMoney(recon.clearedBalance)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium text-muted-foreground">Outstanding</p>
          <p className="mt-1 text-lg font-semibold font-mono tabular-nums text-amber-500">
            {formatAccountingMoney(
              Number(recon.outstandingDeposits) - Number(recon.outstandingWithdrawals),
            )}
          </p>
        </div>
      </div>

      {/* Uncleared items (outstanding) */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2">
          Outstanding Items ({unclearedItems.length})
        </h3>
        {unclearedItems.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">All items are cleared.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="py-2 px-3 text-left font-medium text-muted-foreground w-10"></th>
                  <th className="py-2 px-3 text-left font-medium text-muted-foreground">Date</th>
                  <th className="py-2 px-3 text-left font-medium text-muted-foreground">Description</th>
                  <th className="py-2 px-3 text-left font-medium text-muted-foreground">Type</th>
                  <th className="py-2 px-3 text-right font-medium text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody>
                {unclearedItems.map((item) => (
                  <tr key={item.id} className="border-b border-border hover:bg-accent">
                    <td className="py-2 px-3">
                      {!isCompleted && (
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={() => handleToggleItem(item)}
                          disabled={clearItems.isPending}
                          className="rounded border-border text-indigo-600 focus:ring-indigo-500"
                        />
                      )}
                    </td>
                    <td className="py-2 px-3 text-foreground">{item.date}</td>
                    <td className="py-2 px-3 text-foreground">
                      {item.description ?? '—'}
                      {item.journalNumber && (
                        <span className="ml-2 text-xs text-muted-foreground">J#{item.journalNumber}</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <span className="text-xs font-medium text-muted-foreground">
                        {BANK_REC_ITEM_TYPE_CONFIG[item.itemType]?.label ?? item.itemType}
                      </span>
                    </td>
                    <td className={`py-2 px-3 text-right font-mono tabular-nums ${Number(item.amount) < 0 ? 'text-red-500' : 'text-foreground'}`}>
                      {formatAccountingMoney(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cleared items */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2">
          Cleared Items ({clearedItems.length})
        </h3>
        {clearedItems.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No items cleared yet. Check off items above that appear on your bank statement.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="py-2 px-3 text-left font-medium text-muted-foreground w-10"></th>
                  <th className="py-2 px-3 text-left font-medium text-muted-foreground">Date</th>
                  <th className="py-2 px-3 text-left font-medium text-muted-foreground">Description</th>
                  <th className="py-2 px-3 text-left font-medium text-muted-foreground">Type</th>
                  <th className="py-2 px-3 text-right font-medium text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody>
                {clearedItems.map((item) => (
                  <tr key={item.id} className="border-b border-border bg-green-500/5">
                    <td className="py-2 px-3">
                      {!isCompleted && (
                        <input
                          type="checkbox"
                          checked={true}
                          onChange={() => handleToggleItem(item)}
                          disabled={clearItems.isPending}
                          className="rounded border-border text-green-500 focus:ring-green-500"
                        />
                      )}
                      {isCompleted && <CheckCircle className="h-4 w-4 text-green-500" />}
                    </td>
                    <td className="py-2 px-3 text-foreground">{item.date}</td>
                    <td className="py-2 px-3 text-foreground">
                      {item.description ?? '—'}
                      {item.journalNumber && (
                        <span className="ml-2 text-xs text-muted-foreground">J#{item.journalNumber}</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <span className="text-xs font-medium text-muted-foreground">
                        {BANK_REC_ITEM_TYPE_CONFIG[item.itemType]?.label ?? item.itemType}
                      </span>
                    </td>
                    <td className={`py-2 px-3 text-right font-mono tabular-nums ${Number(item.amount) < 0 ? 'text-red-500' : 'text-foreground'}`}>
                      {formatAccountingMoney(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddAdjustmentDialog
        open={showAdjustment}
        reconciliationId={reconciliationId}
        onClose={() => setShowAdjustment(false)}
      />
    </div>
  );
}

// ── Main Content ─────────────────────────────────────────────

export default function BankReconciliationContent() {
  const [showStart, setShowStart] = useState(false);
  const [activeReconciliationId, setActiveReconciliationId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const { data: reconciliations, isLoading, refetch } = useBankReconciliations({
    status: statusFilter || undefined,
  });

  if (activeReconciliationId) {
    return (
      <AccountingPageShell
        title="Bank Reconciliation"
        breadcrumbs={[
          { label: 'Accounting' },
          { label: 'Bank Reconciliation' },
          { label: 'Workspace' },
        ]}
      >
        <ReconciliationWorkspace
          reconciliationId={activeReconciliationId}
          onBack={() => setActiveReconciliationId(null)}
        />
      </AccountingPageShell>
    );
  }

  return (
    <AccountingPageShell
      title="Bank Reconciliation"
      breadcrumbs={[
        { label: 'Accounting' },
        { label: 'Bank Reconciliation' },
      ]}
    >
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="">All</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setShowStart(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          New Reconciliation
        </button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : reconciliations.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-12 text-center">
          <p className="text-sm text-muted-foreground">No bank reconciliations found.</p>
          <button
            onClick={() => setShowStart(true)}
            className="mt-3 text-sm font-medium text-indigo-500 hover:text-indigo-500"
          >
            Start your first reconciliation
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="py-3 px-4 text-left font-semibold text-muted-foreground">Bank Account</th>
                <th className="py-3 px-4 text-left font-semibold text-muted-foreground">Statement Date</th>
                <th className="py-3 px-4 text-right font-semibold text-muted-foreground">Statement Balance</th>
                <th className="py-3 px-4 text-right font-semibold text-muted-foreground">Difference</th>
                <th className="py-3 px-4 text-center font-semibold text-muted-foreground">Items</th>
                <th className="py-3 px-4 text-center font-semibold text-muted-foreground">Status</th>
                <th className="py-3 px-4 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {reconciliations.map((rec) => {
                const diff = Number(rec.difference);
                const statusConfig = BANK_REC_STATUS_CONFIG[rec.status as keyof typeof BANK_REC_STATUS_CONFIG];

                return (
                  <tr
                    key={rec.id}
                    className="border-b border-border hover:bg-accent cursor-pointer"
                    onClick={() => setActiveReconciliationId(rec.id)}
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-foreground">{rec.bankAccountName}</div>
                      <div className="text-xs text-muted-foreground">{rec.glAccountNumber}</div>
                    </td>
                    <td className="py-3 px-4 text-foreground">{rec.statementDate}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-foreground">
                      {formatAccountingMoney(rec.statementEndingBalance)}
                    </td>
                    <td className={`py-3 px-4 text-right font-mono tabular-nums font-medium ${Math.abs(diff) < 0.01 ? 'text-green-500' : 'text-red-500'}`}>
                      {formatAccountingMoney(diff)}
                    </td>
                    <td className="py-3 px-4 text-center text-muted-foreground">
                      {rec.clearedCount}/{rec.itemCount}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        statusConfig?.variant === 'success'
                          ? 'bg-green-500/10 text-green-500'
                          : 'bg-amber-500/10 text-amber-500'
                      }`}>
                        {statusConfig?.label ?? rec.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <StartReconciliationDialog
        open={showStart}
        onClose={() => setShowStart(false)}
        onCreated={(id) => setActiveReconciliationId(id)}
      />
    </AccountingPageShell>
  );
}
