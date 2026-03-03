'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Building2,
  User,
  Users,
  ShoppingCart,
  MapPin,
  Monitor,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { useGlobalSearch, useRecentSearches } from '@/hooks/use-search';
import type { SearchResults } from '@/hooks/use-search';
import { SearchHighlight } from '@/components/search/SearchHighlight';

const ENTITY_TYPES = [
  { key: '', label: 'All' },
  { key: 'tenant', label: 'Tenants' },
  { key: 'user', label: 'Users' },
  { key: 'customer', label: 'Customers' },
  { key: 'order', label: 'Orders' },
  { key: 'location', label: 'Locations' },
  { key: 'terminal', label: 'Terminals' },
];

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [scopeType, setScopeType] = useState('');
  const { results, isLoading, search } = useGlobalSearch();
  const { save: saveRecent } = useRecentSearches();
  const router = useRouter();

  useEffect(() => {
    if (query.trim().length >= 2) {
      search(query, { limit: 20 });
    }
  }, [query, search]);

  const handleNavigate = useCallback(
    (href: string, entityType: string, entityId: string, label: string) => {
      saveRecent({ query, entityType, entityId, entityLabel: label });
      router.push(href);
    },
    [router, saveRecent, query],
  );

  const filteredResults = filterByScope(results, scopeType);
  const totalCount = filteredResults
    ? filteredResults.tenants.length +
      filteredResults.users.length +
      filteredResults.customers.length +
      filteredResults.orders.length +
      filteredResults.locations.length +
      filteredResults.terminals.length
    : 0;

  return (
    <div className="p-6 max-w-[1000px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Search</h1>
        <p className="text-sm text-slate-400 mt-1">
          Search across all tenants, users, orders, and more.
        </p>
      </div>

      {/* Search input */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search across all entities..."
          autoFocus
          className="w-full bg-surface border border-border text-foreground text-sm rounded-lg pl-10 pr-4 py-3 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-muted-foreground"
        />
        {isLoading && (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Scope filters */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-xs text-muted-foreground">Scope:</span>
        {ENTITY_TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => setScopeType(t.key)}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              scopeType === t.key
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-surface text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
        {query.length >= 2 && (
          <span className="text-xs text-muted-foreground ml-auto">
            {totalCount} results
          </span>
        )}
      </div>

      {/* Results */}
      {query.length < 2 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          Type at least 2 characters to search
        </div>
      ) : !filteredResults ? null : totalCount === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No results found for &ldquo;{query}&rdquo;
        </div>
      ) : (
        <div className="space-y-6">
          {/* Tenants */}
          <ResultSection
            title="Tenants"
            count={filteredResults.tenants.length}
            icon={Building2}
            hidden={filteredResults.tenants.length === 0}
          >
            {filteredResults.tenants.map((t) => (
              <button
                key={t.id}
                onClick={() => handleNavigate(`/tenants/${t.id}`, 'tenant', t.id, t.name)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors border-b border-border last:border-0"
              >
                <Building2 size={14} className="text-muted-foreground shrink-0" />
                <div className="flex-1 text-left min-w-0">
                  <span className="text-sm font-medium text-foreground">
                    <SearchHighlight text={t.name} query={query} />
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">{t.slug}</span>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  t.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-slate-500/10 text-slate-400'
                }`}>{t.status}</span>
                <ChevronRight size={12} className="text-muted-foreground" />
              </button>
            ))}
          </ResultSection>

          {/* Users */}
          <ResultSection
            title="Users"
            count={filteredResults.users.length}
            icon={User}
            hidden={filteredResults.users.length === 0}
          >
            {filteredResults.users.map((u) => (
              <button
                key={u.id}
                onClick={() => handleNavigate(`/users/global?q=${encodeURIComponent(u.email)}`, 'user', u.id, u.name ?? u.email)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors border-b border-border last:border-0"
              >
                <User size={14} className="text-muted-foreground shrink-0" />
                <div className="flex-1 text-left min-w-0">
                  <span className="text-sm font-medium text-foreground">
                    <SearchHighlight text={u.name ?? ''} query={query} />
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">
                    <SearchHighlight text={u.email} query={query} />
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">{u.tenant_name}</span>
                </div>
                <ChevronRight size={12} className="text-muted-foreground" />
              </button>
            ))}
          </ResultSection>

          {/* Customers */}
          <ResultSection
            title="Customers"
            count={filteredResults.customers.length}
            icon={Users}
            hidden={filteredResults.customers.length === 0}
          >
            {filteredResults.customers.map((c) => (
              <button
                key={c.id}
                onClick={() => handleNavigate(`/tenants/${c.tenant_id}`, 'customer', c.id, c.display_name)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors border-b border-border last:border-0"
              >
                <Users size={14} className="text-muted-foreground shrink-0" />
                <div className="flex-1 text-left min-w-0">
                  <span className="text-sm font-medium text-foreground">
                    <SearchHighlight text={c.display_name} query={query} />
                  </span>
                  {c.email && (
                    <span className="text-xs text-muted-foreground ml-2">
                      <SearchHighlight text={c.email} query={query} />
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground ml-2">{c.tenant_name}</span>
                </div>
                <ChevronRight size={12} className="text-muted-foreground" />
              </button>
            ))}
          </ResultSection>

          {/* Orders */}
          <ResultSection
            title="Orders"
            count={filteredResults.orders.length}
            icon={ShoppingCart}
            hidden={filteredResults.orders.length === 0}
          >
            {filteredResults.orders.map((o) => (
              <button
                key={o.id}
                onClick={() => handleNavigate('/finance', 'order', o.id, `#${o.order_number}`)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors border-b border-border last:border-0"
              >
                <ShoppingCart size={14} className="text-muted-foreground shrink-0" />
                <div className="flex-1 text-left min-w-0">
                  <span className="text-sm font-medium text-foreground">
                    #{o.order_number}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {o.tenant_name} &middot; ${(Number(o.total) / 100).toFixed(2)} &middot; {o.business_date}
                  </span>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  o.status === 'closed' ? 'bg-green-500/10 text-green-500'
                    : o.status === 'voided' ? 'bg-red-500/10 text-red-400'
                    : 'bg-blue-500/10 text-blue-400'
                }`}>{o.status}</span>
                <ChevronRight size={12} className="text-muted-foreground" />
              </button>
            ))}
          </ResultSection>

          {/* Locations */}
          <ResultSection
            title="Locations"
            count={filteredResults.locations.length}
            icon={MapPin}
            hidden={filteredResults.locations.length === 0}
          >
            {filteredResults.locations.map((l) => (
              <button
                key={l.id}
                onClick={() => handleNavigate(`/tenants/${l.tenant_id}`, 'location', l.id, l.name)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors border-b border-border last:border-0"
              >
                <MapPin size={14} className="text-muted-foreground shrink-0" />
                <div className="flex-1 text-left min-w-0">
                  <span className="text-sm font-medium text-foreground">
                    <SearchHighlight text={l.name} query={query} />
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">{l.tenant_name}</span>
                </div>
                <ChevronRight size={12} className="text-muted-foreground" />
              </button>
            ))}
          </ResultSection>

          {/* Terminals */}
          <ResultSection
            title="Terminals"
            count={filteredResults.terminals.length}
            icon={Monitor}
            hidden={filteredResults.terminals.length === 0}
          >
            {filteredResults.terminals.map((tm) => (
              <button
                key={tm.id}
                onClick={() => handleNavigate(`/tenants/${tm.tenant_id}`, 'terminal', tm.id, tm.name)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors border-b border-border last:border-0"
              >
                <Monitor size={14} className="text-muted-foreground shrink-0" />
                <div className="flex-1 text-left min-w-0">
                  <span className="text-sm font-medium text-foreground">
                    <SearchHighlight text={tm.name} query={query} />
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {tm.location_name && `${tm.location_name} \u00b7 `}{tm.tenant_name}
                  </span>
                </div>
                <ChevronRight size={12} className="text-muted-foreground" />
              </button>
            ))}
          </ResultSection>
        </div>
      )}
    </div>
  );
}

function ResultSection({
  title,
  count,
  icon: Icon,
  hidden,
  children,
}: {
  title: string;
  count: number;
  icon: typeof Building2;
  hidden: boolean;
  children: React.ReactNode;
}) {
  if (hidden) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </span>
        <span className="text-[10px] text-muted-foreground">({count})</span>
      </div>
      <div className="border border-border rounded-lg bg-surface overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function filterByScope(results: SearchResults | null, scope: string): SearchResults | null {
  if (!results || !scope) return results;
  return {
    ...results,
    tenants: scope === 'tenant' ? results.tenants : scope ? [] : results.tenants,
    users: scope === 'user' ? results.users : scope ? [] : results.users,
    customers: scope === 'customer' ? results.customers : scope ? [] : results.customers,
    orders: scope === 'order' ? results.orders : scope ? [] : results.orders,
    locations: scope === 'location' ? results.locations : scope ? [] : results.locations,
    terminals: scope === 'terminal' ? results.terminals : scope ? [] : results.terminals,
  };
}
