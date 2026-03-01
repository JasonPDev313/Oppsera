'use client';

import { useState, useMemo } from 'react';
import { Plus, Clock, DollarSign, Gem, MoreVertical } from 'lucide-react';
import { SearchInput } from '@/components/ui/search-input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  useSpaServices,
  useSpaServiceCategories,
} from '@/hooks/use-spa';
import type { SpaService, SpaServiceCategory } from '@/hooks/use-spa';

// ── Helpers ──────────────────────────────────────────────────────────

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function getStatusBadge(service: SpaService) {
  if (service.archivedAt) {
    return <Badge variant="neutral">Archived</Badge>;
  }
  if (service.isActive) {
    return <Badge variant="success">Active</Badge>;
  }
  return <Badge variant="warning">Inactive</Badge>;
}

function getStatusDot(service: SpaService): string {
  if (service.archivedAt) return 'bg-gray-500';
  if (service.isActive) return 'bg-green-500';
  return 'bg-amber-500';
}

// ── Service Card ─────────────────────────────────────────────────────

function ServiceCard({ service }: { service: SpaService }) {
  const handleClick = () => {
    // Future: open edit panel
    console.log('Edit service:', service.id, service.name);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="group flex w-full flex-col gap-3 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
    >
      {/* Top row: name + status dot */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {service.name}
          </h3>
          {service.categoryName && (
            <span className="mt-0.5 inline-block text-xs text-muted-foreground">
              {service.categoryName}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${getStatusDot(service)}`}
            aria-label={
              service.archivedAt
                ? 'Archived'
                : service.isActive
                  ? 'Active'
                  : 'Inactive'
            }
          />
          <MoreVertical className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </div>

      {/* Description */}
      {service.description && (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {service.description}
        </p>
      )}

      {/* Bottom row: duration + price + status badge */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-400">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {formatDuration(service.durationMinutes)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
          <DollarSign className="h-3 w-3" aria-hidden="true" />
          {formatCents(service.priceCents)}
        </span>
        {service.maxCapacity > 1 && (
          <span className="text-xs text-muted-foreground">
            Max {service.maxCapacity}
          </span>
        )}
        <span className="ml-auto">{getStatusBadge(service)}</span>
      </div>
    </button>
  );
}

// ── Category Tab ─────────────────────────────────────────────────────

function CategoryTab({
  label,
  count,
  isActive,
  onClick,
}: {
  label: string;
  count?: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
        isActive
          ? 'bg-indigo-600 text-white'
          : 'bg-surface text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
            isActive
              ? 'bg-white/20 text-white'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ── Loading Skeleton ─────────────────────────────────────────────────

function ServicesSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1.5">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-2 w-2 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="h-3 w-48 animate-pulse rounded bg-muted" />
          <div className="flex items-center gap-2">
            <div className="h-5 w-16 animate-pulse rounded-md bg-muted" />
            <div className="h-5 w-16 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Content ─────────────────────────────────────────────────────

export default function ServicesContent() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('active');

  const { data: categories, isLoading: categoriesLoading } =
    useSpaServiceCategories();

  const { items: services, isLoading: servicesLoading } = useSpaServices({
    categoryId: selectedCategory ?? undefined,
    status: statusFilter,
    search: search || undefined,
  });

  // Build category counts from current service list (for "All" view)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const svc of services) {
      const key = svc.categoryId ?? '__uncategorized';
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [services]);

  const totalCount = services.length;
  const isLoading = servicesLoading || categoriesLoading;

  // Filter for display (search is already server-side, but do client-side fallback)
  const filteredServices = useMemo(() => {
    if (!search) return services;
    const q = search.toLowerCase();
    return services.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.categoryName ?? '').toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q),
    );
  }, [services, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Services</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage spa services, treatments, and pricing
          </p>
        </div>
        <button
          type="button"
          onClick={() => console.log('Add service')}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Service
        </button>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <CategoryTab
          label="All"
          count={totalCount}
          isActive={selectedCategory === null}
          onClick={() => setSelectedCategory(null)}
        />
        {categories.map((cat: SpaServiceCategory) => (
          <CategoryTab
            key={cat.id}
            label={cat.name}
            count={cat.serviceCount ?? categoryCounts[cat.id] ?? 0}
            isActive={selectedCategory === cat.id}
            onClick={() =>
              setSelectedCategory(selectedCategory === cat.id ? null : cat.id)
            }
          />
        ))}
      </div>

      {/* Search + Status Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search services..."
          className="flex-1 sm:max-w-sm"
        />
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-0.5">
          {(['active', 'archived', 'all'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
                statusFilter === status
                  ? 'bg-indigo-600 text-white'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <ServicesSkeleton />
      ) : filteredServices.length === 0 ? (
        <EmptyState
          icon={Gem}
          title={search ? 'No services found' : 'No services yet'}
          description={
            search
              ? 'Try adjusting your search or filters'
              : 'Create your first service to get started'
          }
          action={
            !search
              ? {
                  label: 'Add Service',
                  onClick: () => console.log('Add service'),
                }
              : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredServices.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      )}
    </div>
  );
}
