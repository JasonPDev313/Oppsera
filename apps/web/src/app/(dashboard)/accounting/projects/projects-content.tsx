'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FolderOpen, ListChecks, DollarSign, TrendingUp } from 'lucide-react';
import { AccountingSectionLayout, type SectionTab } from '@/components/accounting/accounting-section-layout';
import { ProjectListTab } from '@/components/accounting/project-list-tab';
import { ProjectDetailPanel } from '@/components/accounting/project-detail-panel';
import { CreateProjectDialog } from '@/components/accounting/create-project-dialog';
import { useProject, useProjectMutations, useProjectProfitability, useProjectCostDetail } from '@/hooks/use-project-costing';

const tabs: SectionTab[] = [
  { id: 'projects', label: 'Projects', icon: FolderOpen },
  { id: 'tasks', label: 'Tasks', icon: ListChecks },
  { id: 'profitability', label: 'Profitability', icon: TrendingUp },
  { id: 'cost-detail', label: 'Cost Detail', icon: DollarSign },
];

export default function ProjectsContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'projects';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <>
      <AccountingSectionLayout
        sectionTitle="Projects"
        tabs={tabs}
        activeTabId={activeTab}
        onTabChange={setActiveTab}
        actions={
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            New Project
          </button>
        }
      >
        {activeTab === 'projects' && (
          <ProjectListTab onSelect={(id) => { setSelectedProjectId(id); setActiveTab('tasks'); }} />
        )}
        {activeTab === 'tasks' && selectedProjectId && (
          <TasksTabContent projectId={selectedProjectId} />
        )}
        {activeTab === 'tasks' && !selectedProjectId && (
          <EmptySelection message="Select a project from the Projects tab to view tasks." />
        )}
        {activeTab === 'profitability' && selectedProjectId && (
          <ProfitabilityTabContent projectId={selectedProjectId} />
        )}
        {activeTab === 'profitability' && !selectedProjectId && (
          <EmptySelection message="Select a project from the Projects tab to view profitability." />
        )}
        {activeTab === 'cost-detail' && selectedProjectId && (
          <CostDetailTabContent projectId={selectedProjectId} />
        )}
        {activeTab === 'cost-detail' && !selectedProjectId && (
          <EmptySelection message="Select a project from the Projects tab to view cost details." />
        )}
      </AccountingSectionLayout>

      {showCreate && (
        <CreateProjectDialog onClose={() => setShowCreate(false)} />
      )}

      {selectedProjectId && activeTab === 'projects' && (
        <ProjectDetailPanel
          projectId={selectedProjectId}
          onClose={() => setSelectedProjectId(null)}
        />
      )}
    </>
  );
}

// ── Inline sub-tab content components ────────────────────────

function EmptySelection({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <FolderOpen className="h-12 w-12 text-muted-foreground/50 mb-3" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function TasksTabContent({ projectId }: { projectId: string }) {
  const { data: project, isLoading } = useProject(projectId);
  const { createTask, closeTask } = useProjectMutations();
  const [showAddTask, setShowAddTask] = useState(false);
  const [taskName, setTaskName] = useState('');
  const [taskBudget, setTaskBudget] = useState('');

  if (isLoading) {
    return <div className="animate-pulse space-y-3 pt-4"><div className="h-8 w-64 rounded bg-muted" /><div className="h-48 w-full rounded bg-muted" /></div>;
  }
  if (!project) return null;

  const tasks = project.tasks ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium text-foreground">
          Tasks for {project.name}
        </h2>
        <button
          type="button"
          onClick={() => setShowAddTask(!showAddTask)}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          Add Task
        </button>
      </div>

      {showAddTask && (
        <div className="flex items-end gap-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex-1">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Task Name</label>
            <input
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="Enter task name"
              className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="w-36">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Budget ($)</label>
            <input
              value={taskBudget}
              onChange={(e) => setTaskBudget(e.target.value)}
              placeholder="0.00"
              type="number"
              step="0.01"
              className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <button
            type="button"
            disabled={!taskName.trim() || createTask.isPending}
            onClick={() => {
              createTask.mutate(
                { projectId, name: taskName.trim(), budgetAmount: taskBudget ? parseFloat(taskBudget) : undefined },
                {
                  onSuccess: () => {
                    setTaskName('');
                    setTaskBudget('');
                    setShowAddTask(false);
                  },
                },
              );
            }}
            className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {createTask.isPending ? 'Adding...' : 'Add'}
          </button>
          <button
            type="button"
            onClick={() => setShowAddTask(false)}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {tasks.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No tasks yet. Add a task to track costs at a more granular level.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Task #</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Budget</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Actual</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Variance</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tasks.map((task: any) => {
                const budget = task.budgetAmount ?? 0;
                const actual = task.actualCost ?? 0;
                const variance = budget - actual;
                return (
                  <tr key={task.id} className="hover:bg-accent/50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{task.taskNumber}</td>
                    <td className="px-4 py-2.5 text-foreground">{task.name}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={task.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{budget ? formatMoney(budget) : '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{formatMoney(actual)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${variance >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {budget ? formatMoney(variance) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {task.status !== 'closed' && (
                        <button
                          type="button"
                          onClick={() => closeTask.mutate({ projectId, taskId: task.id })}
                          disabled={closeTask.isPending}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Close
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProfitabilityTabContent({ projectId }: { projectId: string }) {
  const { data, isLoading } = useProjectProfitability(projectId);

  if (isLoading) {
    return <div className="animate-pulse space-y-3 pt-4"><div className="h-24 w-full rounded bg-muted" /><div className="h-48 w-full rounded bg-muted" /></div>;
  }
  if (!data) return <p className="py-8 text-center text-sm text-muted-foreground">No profitability data available.</p>;

  const { project, totals, budgetVariance, budgetUsedPercent, marginPercent } = data;

  return (
    <div className="space-y-6">
      <h2 className="text-base font-medium text-foreground">Profitability — {project.name}</h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Total Revenue" value={formatMoney(totals.totalRevenue)} />
        <KpiCard label="Total Cost" value={formatMoney(totals.totalDirectCost + totals.totalLaborCost + totals.totalMaterialCost + totals.totalOtherCost)} />
        <KpiCard
          label="Gross Margin"
          value={formatMoney(totals.totalGrossMargin)}
          accent={totals.totalGrossMargin >= 0 ? 'green' : 'red'}
        />
        <KpiCard
          label="Margin %"
          value={marginPercent != null ? `${marginPercent}%` : '—'}
          accent={marginPercent != null && marginPercent >= 0 ? 'green' : 'red'}
        />
      </div>

      {/* Budget section */}
      {project.budgetAmount != null && (
        <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
          <h3 className="text-sm font-medium text-foreground">Budget Analysis</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Budget</span>
              <p className="text-foreground font-medium tabular-nums">{formatMoney(project.budgetAmount)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Used</span>
              <p className="text-foreground font-medium tabular-nums">{budgetUsedPercent != null ? `${budgetUsedPercent}%` : '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Variance</span>
              <p className={`font-medium tabular-nums ${(budgetVariance ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {budgetVariance != null ? formatMoney(budgetVariance) : '—'}
              </p>
            </div>
          </div>
          {budgetUsedPercent != null && (
            <div className="w-full rounded-full bg-muted h-2">
              <div
                className={`h-2 rounded-full transition-all ${budgetUsedPercent > 100 ? 'bg-red-500' : budgetUsedPercent > 80 ? 'bg-amber-500' : 'bg-green-500'}`}
                style={{ width: `${Math.min(budgetUsedPercent, 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Period breakdown */}
      {data.periods.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Period</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Revenue</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Direct Cost</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Labor</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Material</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.periods.map((p: any) => (
                <tr key={p.fiscalPeriod} className="hover:bg-accent/50 transition-colors">
                  <td className="px-4 py-2.5 text-foreground">{p.fiscalPeriod}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{formatMoney(p.revenue)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{formatMoney(p.directCost)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{formatMoney(p.laborCost)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{formatMoney(p.materialCost)}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${p.grossMargin >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {formatMoney(p.grossMargin)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CostDetailTabContent({ projectId }: { projectId: string }) {
  const [filters, setFilters] = useState<any>({});
  const { data, meta, isLoading } = useProjectCostDetail(projectId, filters);

  if (isLoading) {
    return <div className="animate-pulse space-y-3 pt-4"><div className="h-48 w-full rounded bg-muted" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-medium text-foreground">GL Cost Detail</h2>
        <select
          value={filters.accountType ?? ''}
          onChange={(e) => setFilters((f: any) => ({ ...f, accountType: e.target.value || undefined }))}
          className="rounded-md border border-input bg-surface px-2 py-1 text-sm text-foreground"
        >
          <option value="">All Types</option>
          <option value="expense">Expense</option>
          <option value="revenue">Revenue</option>
          <option value="asset">Asset</option>
        </select>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-muted-foreground">Total Debits</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">{formatMoney(meta.totals.totalDebits)}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-muted-foreground">Total Credits</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">{formatMoney(meta.totals.totalCredits)}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-muted-foreground">Net Amount</p>
          <p className={`text-lg font-semibold tabular-nums ${meta.totals.netAmount >= 0 ? 'text-foreground' : 'text-red-500'}`}>
            {formatMoney(meta.totals.netAmount)}
          </p>
        </div>
      </div>

      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No GL entries with this project dimension yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Journal #</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Account</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Description</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Task</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Debit</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((line: any) => (
                <tr key={line.id} className="hover:bg-accent/50 transition-colors">
                  <td className="px-4 py-2.5 text-muted-foreground">{line.entryDate}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{line.journalNumber}</td>
                  <td className="px-4 py-2.5 text-foreground">{line.accountNumber} — {line.accountName}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{line.description || line.memo || '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{line.taskName || '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{line.debitAmount > 0 ? formatMoney(line.debitAmount) : ''}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{line.creditAmount > 0 ? formatMoney(line.creditAmount) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta.hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setFilters((f: any) => ({ ...f, cursor: meta.cursor }))}
            className="rounded-md border border-border px-4 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}

// ── Shared helpers ───────────────────────────────────────────

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-green-500/10 text-green-500 border-green-500/30',
    open: 'bg-green-500/10 text-green-500 border-green-500/30',
    in_progress: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
    completed: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30',
    complete: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30',
    closed: 'bg-gray-500/10 text-muted-foreground border-gray-500/30',
    archived: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colors[status] || colors.active}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: 'green' | 'red' }) {
  const accentColor = accent === 'green' ? 'text-green-500' : accent === 'red' ? 'text-red-500' : 'text-foreground';
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${accentColor}`}>{value}</p>
    </div>
  );
}
