'use client';

import { useState } from 'react';
import { Search, ChevronRight } from 'lucide-react';
import { useProjects, type ProjectFilters, type Project } from '@/hooks/use-project-costing';

interface ProjectListTabProps {
  onSelect: (projectId: string) => void;
}

export function ProjectListTab({ onSelect }: ProjectListTabProps) {
  const [filters, setFilters] = useState<ProjectFilters>({});
  const [search, setSearch] = useState('');
  const { data: projects, meta, isLoading, mutate: _mutate } = useProjects({
    ...filters,
    search: search || undefined,
  });

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="w-full rounded-md border border-input bg-surface pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <select
          value={filters.status ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined, cursor: undefined }))}
          className="rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="closed">Closed</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 w-full rounded bg-muted" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No projects found. Create your first project to start tracking costs.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Project #</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Budget</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Total Cost</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Variance</th>
                <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Tasks</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {projects.map((p: Project) => {
                const budget = p.budgetAmount ?? 0;
                const variance = budget - p.totalCost;
                const _pct = budget > 0 ? (p.totalCost / budget) * 100 : null;
                return (
                  <tr
                    key={p.id}
                    onClick={() => onSelect(p.id)}
                    className="cursor-pointer hover:bg-accent/50 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{p.projectNumber}</td>
                    <td className="px-4 py-2.5 font-medium text-foreground">{p.name}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground capitalize">{p.projectType?.replace(/_/g, ' ') ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                      {budget > 0 ? formatMoney(budget) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{formatMoney(p.totalCost)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {budget > 0 ? (
                        <span className={`tabular-nums ${variance >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {formatMoney(variance)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center text-muted-foreground">{p.taskCount}</td>
                    <td className="px-4 py-2.5 text-right">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {meta.hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setFilters((f) => ({ ...f, cursor: meta.cursor ?? undefined }))}
            className="rounded-md border border-border px-4 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────

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
    completed: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30',
    closed: 'bg-gray-500/10 text-muted-foreground border-gray-500/30',
    archived: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colors[status] || colors.active}`}>
      {status}
    </span>
  );
}
