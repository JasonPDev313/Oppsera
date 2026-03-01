'use client';

import { useState, useMemo } from 'react';
import { Plus, UserCheck, MoreVertical } from 'lucide-react';
import { SearchInput } from '@/components/ui/search-input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useSpaProviders } from '@/hooks/use-spa';
import type { SpaProvider } from '@/hooks/use-spa';
import { getInitials } from '@oppsera/shared';

// ── Helpers ──────────────────────────────────────────────────────────

const PROVIDER_COLORS = [
  'bg-indigo-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-orange-500',
  'bg-teal-500',
] as const;

function getProviderColor(index: number): string {
  return PROVIDER_COLORS[index % PROVIDER_COLORS.length] ?? PROVIDER_COLORS[0];
}

function getEmploymentBadge(provider: SpaProvider) {
  // Providers linked to a user account are "staff"; others are "contractor"
  if (provider.userId) {
    return <Badge variant="info">Staff</Badge>;
  }
  return <Badge variant="purple">Contractor</Badge>;
}

// ── Provider Card ────────────────────────────────────────────────────

function ProviderCard({
  provider,
  colorIndex,
}: {
  provider: SpaProvider;
  colorIndex: number;
}) {
  const initials = getInitials(provider.displayName);
  const serviceCount = provider.serviceIds?.length ?? 0;
  const specialtyLabel =
    provider.specialties?.length > 0 ? provider.specialties[0] : null;

  const handleClick = () => {
    // Future: open edit panel
    console.log('Edit provider:', provider.id, provider.displayName);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="group flex w-full flex-col gap-4 rounded-lg border border-border bg-surface p-5 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
    >
      {/* Top section: Avatar + Info + Actions */}
      <div className="flex items-start gap-3">
        {/* Avatar circle */}
        <div className="relative shrink-0">
          {provider.avatarUrl ? (
            <img
              src={provider.avatarUrl}
              alt={provider.displayName}
              className="h-12 w-12 rounded-full object-cover"
            />
          ) : (
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold text-white ${getProviderColor(colorIndex)}`}
            >
              {initials}
            </div>
          )}
          {/* Color indicator dot */}
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface ${getProviderColor(colorIndex)}`}
            aria-hidden="true"
          />
        </div>

        {/* Name + specialty */}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {provider.displayName}
          </h3>
          {specialtyLabel && (
            <p className="truncate text-xs text-muted-foreground">
              {specialtyLabel}
            </p>
          )}
        </div>

        {/* Status + Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              provider.isActive ? 'bg-green-500' : 'bg-gray-500'
            }`}
            aria-label={provider.isActive ? 'Active' : 'Inactive'}
          />
          <MoreVertical className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </div>

      {/* Bio excerpt */}
      {provider.bio && (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {provider.bio}
        </p>
      )}

      {/* Bottom row: badges + stats */}
      <div className="flex flex-wrap items-center gap-2">
        {getEmploymentBadge(provider)}
        {provider.isActive ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="neutral">Inactive</Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {serviceCount} {serviceCount === 1 ? 'service' : 'services'}
        </span>
      </div>

      {/* Specialties chips */}
      {provider.specialties?.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {provider.specialties.slice(0, 4).map((spec) => (
            <span
              key={spec}
              className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              {spec}
            </span>
          ))}
          {provider.specialties.length > 4 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              +{provider.specialties.length - 4}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

// ── Loading Skeleton ─────────────────────────────────────────────────

function ProvidersSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5"
        >
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-28 animate-pulse rounded bg-muted" />
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            </div>
          </div>
          <div className="h-3 w-40 animate-pulse rounded bg-muted" />
          <div className="flex items-center gap-2">
            <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
            <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Content ─────────────────────────────────────────────────────

export default function ProvidersContent() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');

  const providerStatus = statusFilter === 'all' ? undefined : statusFilter;

  const { items: providers, isLoading } = useSpaProviders({
    status: providerStatus,
    search: search || undefined,
  });

  // Client-side search fallback
  const filteredProviders = useMemo(() => {
    if (!search) return providers;
    const q = search.toLowerCase();
    return providers.filter(
      (p) =>
        p.displayName.toLowerCase().includes(q) ||
        p.firstName.toLowerCase().includes(q) ||
        p.lastName.toLowerCase().includes(q) ||
        (p.email ?? '').toLowerCase().includes(q) ||
        p.specialties?.some((s) => s.toLowerCase().includes(q)),
    );
  }, [providers, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Providers</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage spa providers, schedules, and assignments
          </p>
        </div>
        <button
          type="button"
          onClick={() => console.log('Add provider')}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Provider
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search providers..."
          className="flex-1 sm:max-w-sm"
        />
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-0.5">
          {(['active', 'inactive', 'all'] as const).map((status) => (
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
        <ProvidersSkeleton />
      ) : filteredProviders.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title={search ? 'No providers found' : 'No providers yet'}
          description={
            search
              ? 'Try adjusting your search or filters'
              : 'Add your first provider to start scheduling appointments'
          }
          action={
            !search
              ? {
                  label: 'Add Provider',
                  onClick: () => console.log('Add provider'),
                }
              : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProviders.map((provider, index) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              colorIndex={index}
            />
          ))}
        </div>
      )}
    </div>
  );
}
