'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Building2,
  User,
  Users,
  ShoppingCart,
  MapPin,
  Monitor,
  LayoutDashboard,
  Zap,
  HeartPulse,
  Loader2,
  X,
} from 'lucide-react';
import { useCommandPalette } from './CommandPaletteProvider';
import { useGlobalSearch, useRecentSearches } from '@/hooks/use-search';
import type { SearchResults } from '@/hooks/use-search';
import { SearchHighlight } from './SearchHighlight';

const ENTITY_ICONS: Record<string, typeof Building2> = {
  tenant: Building2,
  user: User,
  customer: Users,
  order: ShoppingCart,
  location: MapPin,
  terminal: Monitor,
};

interface QuickAction {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Go to Dashboard', href: '/tenants', icon: LayoutDashboard },
  { label: 'Go to Tenants', href: '/tenants', icon: Building2 },
  { label: 'Go to Dead Letters', href: '/events', icon: Zap },
  { label: 'Go to Health Dashboard', href: '/health', icon: HeartPulse },
  { label: 'Go to Audit Log', href: '/audit', icon: Search },
];

function getEntityHref(type: string, id: string, tenantId?: string): string {
  switch (type) {
    case 'tenant':
      return `/tenants/${id}`;
    case 'user':
      return `/users/global?q=${id}`;
    case 'customer':
      return tenantId ? `/tenants/${tenantId}` : '/users/customers';
    case 'order':
      return '/finance';
    case 'location':
      return tenantId ? `/tenants/${tenantId}` : '/tenants';
    case 'terminal':
      return tenantId ? `/tenants/${tenantId}` : '/tenants';
    default:
      return '/tenants';
  }
}

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const { results, isLoading, search, clear } = useGlobalSearch();
  const { items: recentSearches, save: saveRecent } = useRecentSearches();

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      clear();
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, clear]);

  // Search on query change
  useEffect(() => {
    if (query.trim().length >= 2) {
      search(query);
    } else {
      clear();
    }
  }, [query, search, clear]);

  // Build flat list of navigable items
  const flatItems = buildFlatItems(results, recentSearches, query);

  // Clamp selection
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, results]);

  const handleNavigate = useCallback(
    (item: FlatItem) => {
      // Save to recent
      saveRecent({
        query: query || undefined,
        entityType: item.entityType,
        entityId: item.entityId,
        entityLabel: item.label,
      });
      close();
      router.push(item.href);
    },
    [close, router, saveRecent, query],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = flatItems[selectedIndex];
        if (item) handleNavigate(item);
      }
    },
    [close, flatItems, selectedIndex, handleNavigate],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={close}
      />

      {/* Palette */}
      <div
        className="relative w-full max-w-xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700">
          <Search size={16} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tenants, users, orders..."
            className="flex-1 bg-transparent text-foreground text-sm outline-none placeholder:text-muted-foreground"
          />
          {isLoading && (
            <Loader2 size={14} className="animate-spin text-muted-foreground shrink-0" />
          )}
          <button onClick={close} className="p-1 hover:bg-accent rounded">
            <X size={14} className="text-muted-foreground" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto">
          {flatItems.length === 0 && query.length >= 2 && !isLoading && (
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}

          {flatItems.map((item, i) => {
            if (item.type === 'header') {
              return (
                <div key={item.key} className="px-4 pt-3 pb-1">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {item.label}
                  </span>
                </div>
              );
            }

            const isSelected = i === selectedIndex;
            const Icon = item.icon ?? Search;

            return (
              <button
                key={item.key}
                onClick={() => handleNavigate(item)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                  isSelected ? 'bg-indigo-600/20' : 'hover:bg-accent'
                }`}
              >
                <Icon size={14} className="text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-foreground">
                    <SearchHighlight text={item.label} query={query} />
                  </span>
                  {item.subtitle && (
                    <span className="text-xs text-muted-foreground ml-2">
                      {item.subtitle}
                    </span>
                  )}
                </div>
                {item.badge && (
                  <span className="text-[10px] text-muted-foreground shrink-0">{item.badge}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-700 flex items-center gap-4 text-[10px] text-muted-foreground">
          <span><kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700">Enter</kbd> to select</span>
          <span><kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700">&uarr;&darr;</kbd> to navigate</span>
          <span><kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700">Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}

// ── Flat item builder ────────────────────────────────────────────

interface FlatItem {
  type: 'header' | 'result' | 'action' | 'recent';
  key: string;
  label: string;
  subtitle?: string;
  badge?: string;
  href: string;
  icon?: typeof Building2;
  entityType?: string;
  entityId?: string;
}

function buildFlatItems(
  results: SearchResults | null,
  recentSearches: { entityType: string | null; entityId: string | null; entityLabel: string }[],
  query: string,
): FlatItem[] {
  const items: FlatItem[] = [];

  if (results && query.length >= 2) {
    // Search results mode
    if (results.tenants.length > 0) {
      items.push({ type: 'header', key: 'h-tenants', label: 'Tenants', href: '' });
      for (const t of results.tenants) {
        items.push({
          type: 'result', key: `t-${t.id}`, label: t.name,
          subtitle: `${t.slug} \u00b7 ${t.status}`, badge: 'tenant',
          href: `/tenants/${t.id}`, icon: Building2,
          entityType: 'tenant', entityId: t.id,
        });
      }
    }
    if (results.users.length > 0) {
      items.push({ type: 'header', key: 'h-users', label: 'Users', href: '' });
      for (const u of results.users) {
        items.push({
          type: 'result', key: `u-${u.id}`, label: u.name ?? u.email,
          subtitle: `${u.email} \u00b7 ${u.tenant_name}`, badge: 'user',
          href: `/users/global?q=${encodeURIComponent(u.email)}`, icon: User,
          entityType: 'user', entityId: u.id,
        });
      }
    }
    if (results.customers.length > 0) {
      items.push({ type: 'header', key: 'h-customers', label: 'Customers', href: '' });
      for (const c of results.customers) {
        items.push({
          type: 'result', key: `c-${c.id}`, label: c.display_name,
          subtitle: `${c.email ?? ''} \u00b7 ${c.tenant_name}`, badge: 'customer',
          href: `/tenants/${c.tenant_id}`, icon: Users,
          entityType: 'customer', entityId: c.id,
        });
      }
    }
    if (results.orders.length > 0) {
      items.push({ type: 'header', key: 'h-orders', label: 'Orders', href: '' });
      for (const o of results.orders) {
        items.push({
          type: 'result', key: `o-${o.id}`, label: `#${o.order_number}`,
          subtitle: `${o.tenant_name} \u00b7 $${(Number(o.total) / 100).toFixed(2)} \u00b7 ${o.status}`, badge: 'order',
          href: '/finance', icon: ShoppingCart,
          entityType: 'order', entityId: o.id,
        });
      }
    }
    if (results.locations.length > 0) {
      items.push({ type: 'header', key: 'h-locations', label: 'Locations', href: '' });
      for (const l of results.locations) {
        items.push({
          type: 'result', key: `l-${l.id}`, label: l.name,
          subtitle: `${l.tenant_name}`, badge: 'location',
          href: `/tenants/${l.tenant_id}`, icon: MapPin,
          entityType: 'location', entityId: l.id,
        });
      }
    }
    if (results.terminals.length > 0) {
      items.push({ type: 'header', key: 'h-terminals', label: 'Terminals', href: '' });
      for (const tm of results.terminals) {
        items.push({
          type: 'result', key: `tm-${tm.id}`, label: tm.name,
          subtitle: `${tm.location_name ?? ''} \u00b7 ${tm.tenant_name}`, badge: 'terminal',
          href: `/tenants/${tm.tenant_id}`, icon: Monitor,
          entityType: 'terminal', entityId: tm.id,
        });
      }
    }
  } else {
    // Empty state: recent + quick actions
    if (recentSearches.length > 0) {
      items.push({ type: 'header', key: 'h-recent', label: 'Recent', href: '' });
      for (const r of recentSearches.slice(0, 5)) {
        const Icon = r.entityType ? (ENTITY_ICONS[r.entityType] ?? Search) : Search;
        items.push({
          type: 'recent', key: `r-${r.entityId ?? r.entityLabel}`,
          label: r.entityLabel, badge: r.entityType ?? undefined,
          href: r.entityType && r.entityId ? getEntityHref(r.entityType, r.entityId) : '/search',
          icon: Icon, entityType: r.entityType ?? undefined, entityId: r.entityId ?? undefined,
        });
      }
    }

    items.push({ type: 'header', key: 'h-quick', label: 'Quick Actions', href: '' });
    for (const qa of QUICK_ACTIONS) {
      items.push({
        type: 'action', key: `qa-${qa.label}`, label: qa.label,
        href: qa.href, icon: qa.icon,
      });
    }
  }

  return items;
}
