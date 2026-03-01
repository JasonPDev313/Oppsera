'use client';

import { useState } from 'react';
import { Package, Plus, Search, MoreVertical, Pencil, Power } from 'lucide-react';
import { useSpaResources } from '@/hooks/use-spa';
import type { SpaResource } from '@/hooks/use-spa';

const typeFilterOptions = [
  { value: '', label: 'All Types' },
  { value: 'room', label: 'Rooms' },
  { value: 'equipment', label: 'Equipment' },
];

const statusFilterOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const typeBadgeStyles: Record<string, string> = {
  room: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  equipment: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
};

function TypeBadge({ type }: { type: string }) {
  const style = typeBadgeStyles[type] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/30';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${style}`}>
      {type}
    </span>
  );
}

function StatusDot({ isActive }: { isActive: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-sm">
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          isActive ? 'bg-green-500' : 'bg-gray-500'
        }`}
      />
      <span className="text-muted-foreground">{isActive ? 'Active' : 'Inactive'}</span>
    </span>
  );
}

function getCapacityDisplay(resource: SpaResource): string {
  if (resource.capacityJson && typeof resource.capacityJson === 'object') {
    const cap = (resource.capacityJson as Record<string, unknown>).capacity;
    if (typeof cap === 'number') return String(cap);
  }
  return '-';
}

export default function ResourcesContent() {
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [actionsOpenId, setActionsOpenId] = useState<string | null>(null);

  const { items: resources, isLoading } = useSpaResources({
    type: typeFilter || undefined,
    status: statusFilter || undefined,
    search: search || undefined,
  });

  // Client-side status filter (hook sends it to API, but if API doesn't support
  // it we filter here as well)
  const filtered = statusFilter
    ? resources.filter((r) =>
        statusFilter === 'active' ? r.isActive : !r.isActive,
      )
    : resources;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-foreground">Resources</h1>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Resource
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search resources..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-input bg-surface pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          aria-label="Filter by type"
        >
          {typeFilterOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          aria-label="Filter by status"
        >
          {statusFilterOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Resources table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-lg border border-border p-4">
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-16">
          <Package className="h-12 w-12 text-muted-foreground mb-4" aria-hidden="true" />
          <h3 className="text-lg font-semibold text-foreground mb-1">No resources found</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {search || typeFilter || statusFilter
              ? 'Try adjusting your filters.'
              : 'Add your first resource to get started.'}
          </p>
          {!search && !typeFilter && !statusFilter && (
            <button className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors">
              <Plus className="h-4 w-4" />
              Add Resource
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Capacity
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((resource) => (
                <tr key={resource.id} className="hover:bg-accent transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">{resource.name}</div>
                      {resource.description && (
                        <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">
                          {resource.description}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge type={resource.type} />
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground tabular-nums">
                    {getCapacityDisplay(resource)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusDot isActive={resource.isActive} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="relative inline-block">
                      <button
                        onClick={() => setActionsOpenId(actionsOpenId === resource.id ? null : resource.id)}
                        className="rounded p-1 hover:bg-accent transition-colors"
                        aria-label={`Actions for ${resource.name}`}
                      >
                        <MoreVertical className="h-4 w-4 text-muted-foreground" />
                      </button>
                      {actionsOpenId === resource.id && (
                        <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-md border border-border bg-surface py-1 shadow-lg">
                          <button
                            onClick={() => setActionsOpenId(null)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            onClick={() => setActionsOpenId(null)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent"
                          >
                            <Power className="h-3.5 w-3.5" />
                            {resource.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      )}
                    </div>
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
