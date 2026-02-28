'use client';

import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import {
  Receipt,
  ClipboardCheck,
  Search,
  Plus,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  Ban,
  RefreshCw,
} from 'lucide-react';
import {
  useExpenses,
  useExpenseSummary,
  usePendingApprovals,
  useExpenseMutations,
  type Expense,
  type ExpenseFilters,
} from '@/hooks/use-expenses';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_STATUSES,
  EXPENSE_PAYMENT_METHODS,
} from '@oppsera/shared';

// ── Helpers ──────────────────────────────────────────────────

function formatMoney(amount: number | null | undefined): string {
  if (amount == null) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function categoryLabel(cat: string): string {
  return cat
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Receipt }> = {
  draft: { label: 'Draft', color: 'text-gray-400 bg-gray-500/10 border-gray-500/30', icon: FileText },
  submitted: { label: 'Submitted', color: 'text-blue-500 bg-blue-500/10 border-blue-500/30', icon: Clock },
  approved: { label: 'Approved', color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/30', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'text-red-500 bg-red-500/10 border-red-500/30', icon: XCircle },
  posted: { label: 'Posted', color: 'text-green-500 bg-green-500/10 border-green-500/30', icon: CheckCircle2 },
  voided: { label: 'Voided', color: 'text-orange-500 bg-orange-500/10 border-orange-500/30', icon: Ban },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft!;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
      <cfg.icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

// ── Tabs ─────────────────────────────────────────────────────

type TabId = 'all' | 'approvals' | 'summary';

const TABS: { id: TabId; label: string; icon: typeof Receipt }[] = [
  { id: 'all', label: 'All Expenses', icon: Receipt },
  { id: 'approvals', label: 'Pending Approvals', icon: ClipboardCheck },
  { id: 'summary', label: 'Summary', icon: DollarSign },
];

// ── Main Component ───────────────────────────────────────────

export default function ExpensesContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabId) || 'all';
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [showCreateForm, setShowCreateForm] = useState(false);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Expenses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage employee expense reports and reimbursements
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          New Expense
        </button>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-indigo-600 text-white'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'all' && <ExpenseListTab />}
      {activeTab === 'approvals' && <ApprovalsTab />}
      {activeTab === 'summary' && <SummaryTab />}

      {/* Create Expense Dialog */}
      {showCreateForm && (
        <CreateExpenseDialog onClose={() => setShowCreateForm(false)} />
      )}
    </div>
  );
}

// ── Expense List Tab ─────────────────────────────────────────

function ExpenseListTab() {
  const [filters, setFilters] = useState<ExpenseFilters>({});
  const { data: expenses, isLoading, meta, mutate: _mutate } = useExpenses({ ...filters, limit: 50 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search expenses..."
            value={filters.search ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value || undefined, cursor: undefined }))}
            className="w-full rounded-lg border border-input bg-surface py-2 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select
          value={filters.status ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined, cursor: undefined }))}
          className="rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground"
        >
          <option value="">All Statuses</option>
          {Object.keys(EXPENSE_STATUSES).map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <select
          value={filters.category ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value || undefined, cursor: undefined }))}
          className="rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground"
        >
          <option value="">All Categories</option>
          {Object.keys(EXPENSE_CATEGORIES).map((c) => (
            <option key={c} value={c}>{categoryLabel(c)}</option>
          ))}
        </select>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {/* Table (Desktop) */}
      {!isLoading && expenses.length > 0 && (
        <>
          <div className="hidden md:block overflow-hidden rounded-lg border border-border bg-surface">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Expense #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Vendor</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {expenses.map((exp) => (
                  <tr
                    key={exp.id}
                    onClick={() => setSelectedId(exp.id)}
                    className="cursor-pointer hover:bg-accent/50"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-indigo-500">{exp.expenseNumber}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{formatDate(exp.expenseDate)}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{categoryLabel(exp.category)}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{exp.vendorName ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium tabular-nums text-foreground">{formatMoney(exp.amount)}</td>
                    <td className="px-4 py-3"><StatusBadge status={exp.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="space-y-3 md:hidden">
            {expenses.map((exp) => (
              <div
                key={exp.id}
                onClick={() => setSelectedId(exp.id)}
                className="cursor-pointer rounded-lg border border-border bg-surface p-4 hover:bg-accent/50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-indigo-500">{exp.expenseNumber}</span>
                  <StatusBadge status={exp.status} />
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">{categoryLabel(exp.category)}</span>
                  <span className="text-sm font-medium tabular-nums text-foreground">{formatMoney(exp.amount)}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {formatDate(exp.expenseDate)} {exp.vendorName ? `· ${exp.vendorName}` : ''}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {meta.hasMore && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setFilters((f) => ({ ...f, cursor: meta.cursor ?? undefined }))}
                className="rounded-md border border-input bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                Load More
              </button>
            </div>
          )}
        </>
      )}

      {/* Empty State */}
      {!isLoading && expenses.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-16">
          <Receipt className="mb-3 h-12 w-12 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No expenses found</p>
          <p className="mt-1 text-xs text-muted-foreground">Create your first expense to get started</p>
        </div>
      )}

      {/* Detail Panel */}
      {selectedId && (
        <ExpenseDetailPanel
          expenseId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// ── Approvals Tab ────────────────────────────────────────────

function ApprovalsTab() {
  const { data: pending, isLoading } = usePendingApprovals();
  const mutations = useExpenseMutations();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const handleApprove = useCallback(async (id: string) => {
    try {
      await mutations.approveExpense.mutateAsync(id);
    } catch {
      // error handled by React Query
    }
  }, [mutations.approveExpense]);

  const handleReject = useCallback(async () => {
    if (!rejectId || !rejectReason.trim()) return;
    try {
      await mutations.rejectExpense.mutateAsync({ id: rejectId, reason: rejectReason });
      setRejectId(null);
      setRejectReason('');
    } catch {
      // error handled by React Query
    }
  }, [rejectId, rejectReason, mutations.rejectExpense]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (pending.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-16">
        <ClipboardCheck className="mb-3 h-12 w-12 text-muted-foreground/50" />
        <p className="text-sm font-medium text-foreground">No pending approvals</p>
        <p className="mt-1 text-xs text-muted-foreground">All submitted expenses have been reviewed</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pending.map((exp) => (
        <div key={exp.id} className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{exp.expenseNumber}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {categoryLabel(exp.category)} · {formatDate(exp.expenseDate)}
                {exp.vendorName ? ` · ${exp.vendorName}` : ''}
              </p>
              {exp.description && (
                <p className="mt-1 text-xs text-muted-foreground">{exp.description}</p>
              )}
            </div>
            <span className="text-sm font-medium tabular-nums text-foreground">{formatMoney(exp.amount)}</span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => handleApprove(exp.id)}
              disabled={mutations.approveExpense.isPending}
              className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-50"
            >
              <CheckCircle2 className="h-3 w-3" />
              Approve
            </button>
            <button
              onClick={() => setRejectId(exp.id)}
              className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/20"
            >
              <XCircle className="h-3 w-3" />
              Reject
            </button>
          </div>
        </div>
      ))}

      {/* Reject Reason Dialog */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setRejectId(null)} />
          <div className="relative z-10 w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">Reject Expense</h3>
            <p className="mt-1 text-sm text-muted-foreground">Provide a reason for rejecting this expense.</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
              rows={3}
              className="mt-3 w-full rounded-lg border border-input bg-surface p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setRejectId(null); setRejectReason(''); }}
                className="rounded-md border border-input bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim() || mutations.rejectExpense.isPending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Summary Tab ──────────────────────────────────────────────

function SummaryTab() {
  const { data: summaries, isLoading } = useExpenseSummary({});

  const totals = useMemo(() => {
    let total = 0;
    let reimbursed = 0;
    let count = 0;
    for (const s of summaries) {
      total += s.totalAmount;
      reimbursed += s.reimbursedAmount;
      count += s.expenseCount;
    }
    return { total, reimbursed, outstanding: total - reimbursed, count };
  }, [summaries]);

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Expenses" value={formatMoney(totals.total)} icon={DollarSign} accent="text-blue-500" />
        <KpiCard label="Expense Count" value={String(totals.count)} icon={Receipt} accent="text-indigo-500" />
        <KpiCard label="Reimbursed" value={formatMoney(totals.reimbursed)} icon={CheckCircle2} accent="text-green-500" />
        <KpiCard label="Outstanding" value={formatMoney(totals.outstanding)} icon={Clock} accent="text-amber-500" />
      </div>

      {/* By Category Table */}
      {summaries.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Period</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Count</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Reimbursed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {summaries.map((s, i) => (
                <tr key={i} className="hover:bg-accent/50">
                  <td className="px-4 py-3 text-sm text-foreground">{categoryLabel(s.category)}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{s.fiscalPeriod}</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">{s.expenseCount}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium tabular-nums text-foreground">{formatMoney(s.totalAmount)}</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-green-500">{formatMoney(s.reimbursedAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summaries.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-12">
          <DollarSign className="mb-3 h-12 w-12 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No expense data yet</p>
        </div>
      )}
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, accent }: {
  label: string;
  value: string;
  icon: typeof Receipt;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${accent}`} />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

// ── Expense Detail Panel ─────────────────────────────────────

function ExpenseDetailPanel({ expenseId, onClose }: { expenseId: string; onClose: () => void }) {
  const { data: expense, isLoading } = useExpense(expenseId);
  const mutations = useExpenseMutations();

  if (isLoading || !expense) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative z-10 w-full max-w-lg rounded-lg bg-surface p-6 shadow-xl">
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-48 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-32 w-full rounded bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  const actions = getAvailableActions(expense);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-lg bg-surface p-6 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{expense.expenseNumber}</h2>
            <StatusBadge status={expense.status} />
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        {/* Details */}
        <div className="mt-4 space-y-3">
          <DetailRow label="Amount" value={formatMoney(expense.amount)} />
          <DetailRow label="Category" value={categoryLabel(expense.category)} />
          <DetailRow label="Date" value={formatDate(expense.expenseDate)} />
          <DetailRow label="Vendor" value={expense.vendorName ?? '—'} />
          <DetailRow label="Payment Method" value={expense.paymentMethod ? categoryLabel(expense.paymentMethod) : '—'} />
          <DetailRow label="Reimbursable" value={expense.isReimbursable ? 'Yes' : 'No'} />
          {expense.description && <DetailRow label="Description" value={expense.description} />}
          {expense.notes && <DetailRow label="Notes" value={expense.notes} />}
          {expense.rejectionReason && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <p className="text-xs font-medium text-red-500">Rejection Reason</p>
              <p className="mt-1 text-sm text-red-400">{expense.rejectionReason}</p>
            </div>
          )}
          {expense.reimbursedAt && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
              <p className="text-xs font-medium text-green-500">Reimbursed</p>
              <p className="mt-1 text-sm text-green-400">
                {formatDate(expense.reimbursedAt)} via {expense.reimbursementMethod ?? 'N/A'}
                {expense.reimbursementReference ? ` (Ref: ${expense.reimbursementReference})` : ''}
              </p>
            </div>
          )}
          {expense.voidReason && (
            <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-3">
              <p className="text-xs font-medium text-orange-500">Void Reason</p>
              <p className="mt-1 text-sm text-orange-400">{expense.voidReason}</p>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="mt-4 rounded-lg border border-border p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Timeline</p>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            <p>Created: {formatDate(expense.createdAt)}</p>
            {expense.submittedAt && <p>Submitted: {formatDate(expense.submittedAt)}</p>}
            {expense.approvedAt && <p>Approved: {formatDate(expense.approvedAt)}</p>}
            {expense.rejectedAt && <p>Rejected: {formatDate(expense.rejectedAt)}</p>}
            {expense.postedAt && <p>Posted: {formatDate(expense.postedAt)}</p>}
            {expense.voidedAt && <p>Voided: {formatDate(expense.voidedAt)}</p>}
            {expense.reimbursedAt && <p>Reimbursed: {formatDate(expense.reimbursedAt)}</p>}
          </div>
        </div>

        {/* Actions */}
        {actions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {actions.map((action) => (
              <ActionButton key={action.key} action={action} expense={expense} mutations={mutations} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

// ── Actions ──────────────────────────────────────────────────

interface ExpenseAction {
  key: string;
  label: string;
  icon: typeof Receipt;
  variant: 'primary' | 'success' | 'danger' | 'neutral';
}

function getAvailableActions(expense: Expense): ExpenseAction[] {
  const actions: ExpenseAction[] = [];
  switch (expense.status) {
    case 'draft':
    case 'rejected':
      actions.push({ key: 'submit', label: 'Submit', icon: Clock, variant: 'primary' });
      break;
    case 'submitted':
      actions.push({ key: 'approve', label: 'Approve', icon: CheckCircle2, variant: 'success' });
      actions.push({ key: 'reject', label: 'Reject', icon: XCircle, variant: 'danger' });
      break;
    case 'approved':
      actions.push({ key: 'post', label: 'Post to GL', icon: FileText, variant: 'primary' });
      break;
    case 'posted':
      if (expense.isReimbursable && !expense.reimbursedAt) {
        actions.push({ key: 'reimburse', label: 'Mark Reimbursed', icon: RefreshCw, variant: 'success' });
      }
      actions.push({ key: 'void', label: 'Void', icon: Ban, variant: 'danger' });
      break;
  }
  return actions;
}

function ActionButton({
  action,
  expense,
  mutations,
}: {
  action: ExpenseAction;
  expense: Expense;
  mutations: ReturnType<typeof useExpenseMutations>;
}) {
  const variantClasses: Record<string, string> = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-500',
    success: 'bg-green-600 text-white hover:bg-green-500',
    danger: 'border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20',
    neutral: 'border border-input bg-surface text-foreground hover:bg-accent',
  };

  const handleClick = async () => {
    try {
      switch (action.key) {
        case 'submit':
          await mutations.submitExpense.mutateAsync(expense.id);
          break;
        case 'approve':
          await mutations.approveExpense.mutateAsync(expense.id);
          break;
        case 'post':
          await mutations.postExpense.mutateAsync(expense.id);
          break;
        case 'reimburse':
          await mutations.reimburseExpense.mutateAsync({ id: expense.id, method: 'direct_deposit' });
          break;
        case 'void':
          await mutations.voidExpense.mutateAsync({ id: expense.id, reason: 'Voided by manager' });
          break;
        // reject is handled inline in approvals tab
      }
    } catch {
      // error handled by React Query
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${variantClasses[action.variant]}`}
    >
      <action.icon className="h-3 w-3" />
      {action.label}
    </button>
  );
}

// ── Create Expense Dialog ────────────────────────────────────

function CreateExpenseDialog({ onClose }: { onClose: () => void }) {
  const mutations = useExpenseMutations();
  const [form, setForm] = useState({
    expenseDate: new Date().toISOString().split('T')[0]!,
    category: 'supplies' as string,
    amount: '',
    vendorName: '',
    description: '',
    paymentMethod: 'personal_card' as string,
    isReimbursable: true,
    notes: '',
  });
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    setError('');
    try {
      await mutations.createExpense.mutateAsync({
        expenseDate: form.expenseDate,
        category: form.category,
        amount: amount.toFixed(2),
        vendorName: form.vendorName || null,
        description: form.description || null,
        paymentMethod: form.paymentMethod,
        isReimbursable: form.isReimbursable,
        notes: form.notes || null,
        clientRequestId: crypto.randomUUID(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create expense');
    }
  };

  const updateField = (field: string, value: unknown) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md max-h-[80vh] overflow-y-auto rounded-lg bg-surface p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">New Expense</h2>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Date *</label>
            <input
              type="date"
              value={form.expenseDate}
              onChange={(e) => updateField('expenseDate', e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground">Category *</label>
            <select
              value={form.category}
              onChange={(e) => updateField('category', e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground"
            >
              {Object.keys(EXPENSE_CATEGORIES).map((c) => (
                <option key={c} value={c}>{categoryLabel(c)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground">Amount *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={form.amount}
              onChange={(e) => updateField('amount', e.target.value)}
              placeholder="0.00"
              className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground">Vendor Name</label>
            <input
              type="text"
              value={form.vendorName}
              onChange={(e) => updateField('vendorName', e.target.value)}
              placeholder="e.g., Office Depot"
              className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Brief description"
              className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground">Payment Method</label>
            <select
              value={form.paymentMethod}
              onChange={(e) => updateField('paymentMethod', e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground"
            >
              {Object.keys(EXPENSE_PAYMENT_METHODS).map((m) => (
                <option key={m} value={m}>{categoryLabel(m)}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isReimbursable"
              checked={form.isReimbursable}
              onChange={(e) => updateField('isReimbursable', e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <label htmlFor="isReimbursable" className="text-sm text-foreground">Reimbursable</label>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              rows={2}
              placeholder="Additional notes..."
              className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-500">{error}</p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-input bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={mutations.createExpense.isPending}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {mutations.createExpense.isPending ? 'Creating...' : 'Create Expense'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helper: useExpense for detail panel ──────────────────────

function useExpense(id: string) {
  const result = useQuery({
    queryKey: ['expense', id],
    queryFn: () => apiFetch<{ data: Expense }>(`/api/v1/expenses/${id}`),
    enabled: !!id,
    staleTime: 15_000,
  });

  return {
    data: result.data?.data ?? null,
    isLoading: result.isLoading,
  };
}
