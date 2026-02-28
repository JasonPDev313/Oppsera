'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  Target,
  Check,
  Lock,
  Edit2,
  ArrowLeft,
  Save,
  FileText,
} from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { useBudgets, useBudget, useBudgetMutations } from '@/hooks/use-budgets';
import { formatAccountingMoney } from '@/types/accounting';

// ── Constants ─────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
  approved: { label: 'Approved', color: 'bg-green-500/10 text-green-500 border-green-500/30' },
  locked: { label: 'Locked', color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30' },
};

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MONTH_KEYS = [
  'month1', 'month2', 'month3', 'month4', 'month5', 'month6',
  'month7', 'month8', 'month9', 'month10', 'month11', 'month12',
] as const;

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expenses',
};

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  asset: 'bg-blue-500',
  liability: 'bg-amber-500',
  equity: 'bg-violet-500',
  revenue: 'bg-green-500',
  expense: 'bg-red-500',
};

const currentFiscalYear = new Date().getFullYear();

// ── Status Badge ──────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_LABELS[status] ?? { label: status, color: 'bg-muted text-muted-foreground border-border' };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ── Create Budget Dialog ──────────────────────────────────────

function CreateBudgetDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { createBudget } = useBudgetMutations();
  const [name, setName] = useState('');
  const [fiscalYear, setFiscalYear] = useState(currentFiscalYear);
  const [description, setDescription] = useState('');

  const handleSubmit = async () => {
    if (!name.trim()) return;
    try {
      await createBudget.mutateAsync({ name: name.trim(), fiscalYear, description: description.trim() || undefined });
      setName('');
      setDescription('');
      onCreated();
      onClose();
    } catch {
      // mutation error handled by React Query
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">Create Budget</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="budgetName" className="block text-sm font-medium text-foreground">Name</label>
            <input
              id="budgetName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. FY2026 Operating Budget"
              className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="budgetYear" className="block text-sm font-medium text-foreground">Fiscal Year</label>
            <input
              id="budgetYear"
              type="number"
              value={fiscalYear}
              onChange={(e) => setFiscalYear(Number(e.target.value))}
              min={2020}
              max={2040}
              className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="budgetDesc" className="block text-sm font-medium text-foreground">Description</label>
            <textarea
              id="budgetDesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional description..."
              className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!name.trim() || createBudget.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {createBudget.isPending ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Budget Detail View ────────────────────────────────────────

function BudgetDetailView({
  budgetId,
  onBack,
}: {
  budgetId: string;
  onBack: () => void;
}) {
  const { data: budget, isLoading } = useBudget(budgetId);
  const { approveBudget, lockBudget, upsertLines } = useBudgetMutations();
  const [editingCell, setEditingCell] = useState<{ lineIdx: number; monthIdx: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [pendingChanges, setPendingChanges] = useState<Map<string, Record<string, number>>>(new Map());
  const [search, setSearch] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const isEditable = budget?.status === 'draft';

  // Group lines by account type
  const grouped = useMemo(() => {
    if (!budget) return {};
    const lines = budget.lines.filter((l) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return l.accountName.toLowerCase().includes(q) || l.accountNumber.toLowerCase().includes(q);
    });

    const result: Record<string, typeof lines> = {};
    for (const line of lines) {
      const type = line.accountType.toLowerCase();
      if (!result[type]) result[type] = [];
      result[type].push(line);
    }
    return result;
  }, [budget, search]);

  const activeSections = useMemo(
    () => ['revenue', 'expense', 'asset', 'liability', 'equity'].filter((t) => grouped[t]?.length),
    [grouped],
  );

  const toggleSection = useCallback((section: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  const getCellValue = (line: { glAccountId: string }, monthKey: string): number => {
    const changes = pendingChanges.get(line.glAccountId);
    if (changes && monthKey in changes) return changes[monthKey]!;
    return (line as Record<string, unknown>)[monthKey] as number;
  };

  const startEdit = (lineIdx: number, monthIdx: number, currentValue: number) => {
    if (!isEditable) return;
    setEditingCell({ lineIdx, monthIdx });
    setEditValue(currentValue === 0 ? '' : currentValue.toString());
  };

  const commitEdit = (glAccountId: string) => {
    if (!editingCell) return;
    const monthKey = MONTH_KEYS[editingCell.monthIdx]!;
    const newVal = editValue.trim() === '' ? 0 : parseFloat(editValue);
    if (!isNaN(newVal)) {
      setPendingChanges((prev) => {
        const next = new Map(prev);
        const existing = next.get(glAccountId) ?? {};
        next.set(glAccountId, { ...existing, [monthKey]: newVal });
        return next;
      });
    }
    setEditingCell(null);
  };

  const handleSave = async () => {
    if (!budget || pendingChanges.size === 0) return;
    const lines = Array.from(pendingChanges.entries()).map(([glAccountId, months]) => ({
      glAccountId,
      ...months,
    }));
    try {
      await upsertLines.mutateAsync({ budgetId: budget.id, lines });
      setPendingChanges(new Map());
    } catch {
      // handled by mutation
    }
  };

  const handleApprove = async () => {
    if (!budget) return;
    try {
      await approveBudget.mutateAsync(budget.id);
    } catch {
      // handled by mutation
    }
  };

  const handleLock = async () => {
    if (!budget) return;
    try {
      await lockBudget.mutateAsync(budget.id);
    } catch {
      // handled by mutation
    }
  };

  if (isLoading) {
    return (
      <AccountingPageShell title="Budget Detail" breadcrumbs={[{ label: 'Budgets', href: '/accounting/budgets' }, { label: 'Loading...' }]}>
        <div className="space-y-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </AccountingPageShell>
    );
  }

  if (!budget) {
    return (
      <AccountingPageShell title="Budget Not Found" breadcrumbs={[{ label: 'Budgets', href: '/accounting/budgets' }]}>
        <div className="rounded-lg border border-border bg-surface p-12 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h3 className="mt-3 text-sm font-medium text-foreground">Budget not found</h3>
          <button type="button" onClick={onBack} className="mt-4 text-sm font-medium text-indigo-500 hover:text-indigo-400">
            Back to budgets
          </button>
        </div>
      </AccountingPageShell>
    );
  }

  return (
    <AccountingPageShell
      title={budget.name}
      subtitle={`FY${budget.fiscalYear}`}
      breadcrumbs={[
        { label: 'Budgets', href: '/accounting/budgets' },
        { label: budget.name },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          {isEditable && pendingChanges.size > 0 && (
            <button
              type="button"
              onClick={handleSave}
              disabled={upsertLines.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {upsertLines.isPending ? 'Saving...' : `Save (${pendingChanges.size})`}
            </button>
          )}
          {budget.status === 'draft' && (
            <button
              type="button"
              onClick={handleApprove}
              disabled={approveBudget.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              {approveBudget.isPending ? 'Approving...' : 'Approve'}
            </button>
          )}
          {budget.status === 'approved' && (
            <button
              type="button"
              onClick={handleLock}
              disabled={lockBudget.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Lock className="h-4 w-4" />
              {lockBudget.isPending ? 'Locking...' : 'Lock'}
            </button>
          )}
        </div>
      }
    >
      {/* Header info */}
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={budget.status} />
        <span className="text-sm text-muted-foreground">{budget.lines.length} accounts</span>
        <span className="text-sm text-muted-foreground">
          Total Budget: <span className="font-semibold tabular-nums text-foreground">{formatAccountingMoney(budget.lines.reduce((s, l) => s + l.annualTotal, 0))}</span>
        </span>
        {budget.description && (
          <span className="text-sm text-muted-foreground">{budget.description}</span>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Filter accounts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        {search && (
          <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Budget grid */}
      {budget.lines.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-12 text-center">
          <Target className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h3 className="mt-3 text-sm font-medium text-foreground">No Budget Lines</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add GL accounts and monthly amounts to this budget.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="w-8 px-2 py-3" />
                  <th className="sticky left-0 z-10 bg-muted px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Account
                  </th>
                  {MONTH_LABELS.map((m) => (
                    <th key={m} className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                      {m}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Annual
                  </th>
                </tr>
              </thead>
              {activeSections.map((type) => {
                const items = grouped[type]!;
                const isCollapsed = collapsedSections.has(type);
                const sectionTotal = items.reduce((s, l) => s + l.annualTotal, 0);

                return (
                  <tbody key={type}>
                    <tr
                      className="cursor-pointer select-none border-b border-border bg-muted/60 transition-colors hover:bg-muted"
                      onClick={() => toggleSection(type)}
                    >
                      <td className="w-8 px-2 py-2.5">
                        {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </td>
                      <td className="sticky left-0 z-10 bg-muted/60 px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className={`inline-block h-2.5 w-2.5 rounded-full ${ACCOUNT_TYPE_COLORS[type] ?? 'bg-gray-500'}`} />
                          <span className="text-sm font-semibold text-foreground">{ACCOUNT_TYPE_LABELS[type] ?? type}</span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{items.length}</span>
                        </div>
                      </td>
                      {MONTH_LABELS.map((_, i) => {
                        const monthKey = MONTH_KEYS[i]!;
                        const monthTotal = items.reduce((s, l) => s + getCellValue(l, monthKey), 0);
                        return (
                          <td key={i} className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground">
                            {monthTotal !== 0 ? formatAccountingMoney(monthTotal) : ''}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground">
                        {formatAccountingMoney(sectionTotal)}
                      </td>
                    </tr>
                    {!isCollapsed && items.map((line, lineIdx) => (
                      <tr key={line.id} className="border-b border-border/50 transition-colors last:border-border hover:bg-accent/30">
                        <td />
                        <td className="sticky left-0 z-10 bg-surface py-2 pl-10 pr-4 text-sm text-foreground">
                          <span className="font-mono text-muted-foreground">{line.accountNumber}</span>
                          <span className="ml-2">{line.accountName}</span>
                        </td>
                        {MONTH_KEYS.map((monthKey, monthIdx) => {
                          const value = getCellValue(line, monthKey);
                          const isEditing = editingCell?.lineIdx === lineIdx && editingCell?.monthIdx === monthIdx;
                          const hasChange = pendingChanges.get(line.glAccountId)?.[monthKey] !== undefined;

                          if (isEditing) {
                            return (
                              <td key={monthKey} className="px-1 py-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  autoFocus
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={() => commitEdit(line.glAccountId)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitEdit(line.glAccountId);
                                    if (e.key === 'Escape') setEditingCell(null);
                                  }}
                                  className="w-full rounded border border-indigo-500 bg-surface px-2 py-1 text-right text-sm tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                              </td>
                            );
                          }

                          return (
                            <td
                              key={monthKey}
                              className={`px-3 py-2 text-right text-sm tabular-nums text-foreground ${isEditable ? 'cursor-pointer hover:bg-indigo-500/10' : ''} ${hasChange ? 'bg-indigo-500/5 font-medium' : ''}`}
                              onClick={() => startEdit(lineIdx, monthIdx, value)}
                            >
                              {value !== 0 ? formatAccountingMoney(value) : isEditable ? <span className="text-muted-foreground/50">—</span> : ''}
                            </td>
                          );
                        })}
                        <td className="px-4 py-2 text-right text-sm font-medium tabular-nums text-foreground">
                          {formatAccountingMoney(MONTH_KEYS.reduce((s, mk) => s + getCellValue(line, mk), 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                );
              })}
              <tfoot>
                <tr className="border-t-2 border-border bg-muted font-bold">
                  <td />
                  <td className="sticky left-0 z-10 bg-muted px-4 py-3 text-sm text-foreground">Grand Total</td>
                  {MONTH_KEYS.map((monthKey) => {
                    const total = budget.lines.reduce((s, l) => s + getCellValue(l, monthKey), 0);
                    return (
                      <td key={monthKey} className="px-3 py-3 text-right text-sm tabular-nums text-foreground">
                        {formatAccountingMoney(total)}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">
                    {formatAccountingMoney(budget.lines.reduce((s, l) => s + l.annualTotal, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </AccountingPageShell>
  );
}

// ── Main Component ────────────────────────────────────────────

export default function BudgetsContent() {
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [yearFilter, setYearFilter] = useState<number | undefined>();
  const [search, setSearch] = useState('');

  const { data: budgets, isLoading, mutate } = useBudgets({
    status: statusFilter || undefined,
    fiscalYear: yearFilter,
  });

  const filteredBudgets = useMemo(() => {
    if (!search.trim()) return budgets;
    const q = search.toLowerCase();
    return budgets.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        String(b.fiscalYear).includes(q),
    );
  }, [budgets, search]);

  const openDetail = useCallback((id: string) => {
    setSelectedBudgetId(id);
    setView('detail');
  }, []);

  if (view === 'detail' && selectedBudgetId) {
    return (
      <BudgetDetailView
        budgetId={selectedBudgetId}
        onBack={() => {
          setView('list');
          setSelectedBudgetId(null);
        }}
      />
    );
  }

  return (
    <AccountingPageShell
      title="Budgets"
      subtitle="Manage annual budgets and monthly allocations by GL account"
      breadcrumbs={[{ label: 'Budgets' }]}
      actions={
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          New Budget
        </button>
      }
    >
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search budgets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="locked">Locked</option>
          </select>
          <select
            value={yearFilter ?? ''}
            onChange={(e) => setYearFilter(e.target.value ? Number(e.target.value) : undefined)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">All Years</option>
            {[currentFiscalYear + 1, currentFiscalYear, currentFiscalYear - 1, currentFiscalYear - 2].map((y) => (
              <option key={y} value={y}>FY{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredBudgets.length === 0 && (
        <div className="rounded-lg border border-border bg-surface p-12 text-center">
          <Target className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h3 className="mt-3 text-sm font-medium text-foreground">No Budgets</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a budget to start planning your GL account allocations.
          </p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Create Budget
          </button>
        </div>
      )}

      {/* Budget list */}
      {!isLoading && filteredBudgets.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Year</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Accounts</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Budget</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBudgets.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-border/50 transition-colors hover:bg-accent/30 cursor-pointer"
                  onClick={() => openDetail(b.id)}
                >
                  <td className="px-4 py-3 text-sm text-foreground">
                    <div className="font-medium">{b.name}</div>
                    {b.description && (
                      <div className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{b.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums text-foreground">FY{b.fiscalYear}</td>
                  <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">{b.lineCount}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium tabular-nums text-foreground">
                    {formatAccountingMoney(b.totalBudget)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetail(b.id);
                      }}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-indigo-500 hover:bg-indigo-500/10"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      {b.status === 'draft' ? 'Edit' : 'View'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateBudgetDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => mutate()}
      />
    </AccountingPageShell>
  );
}
