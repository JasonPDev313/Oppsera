'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  DollarSign,
  ShoppingCart,
  AlertTriangle,
  Users,
  Loader2,
  ArrowRight,
  StickyNote,
  RefreshCw,
  Package,
  Clock,
  CheckCircle2,
  Rocket,
  MapPin,
  ChevronDown,
  Building2,
  FileText,
  CreditCard,
  Gift,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useAuthContext } from '@/components/auth-provider';
import { PosInsightCard } from '@/components/insights/PosInsightCard';
import type { InventoryItem } from '@/types/inventory';

// ── Dashboard Preferences (localStorage V1) ─────────────────────

const DASHBOARD_PREFS_KEY = 'dashboard_prefs';
const DASHBOARD_NOTES_KEY = 'dashboard_notes';

interface DashboardPrefs {
  showSales: boolean;
  showOrders: boolean;
  showLowStock: boolean;
  showNotes: boolean;
  showRecentOrders: boolean;
}

const DEFAULT_PREFS: DashboardPrefs = {
  showSales: true,
  showOrders: true,
  showLowStock: true,
  showNotes: true,
  showRecentOrders: true,
};

/** Pre-aggregated KPIs from the reporting read models. */
interface DashboardMetrics {
  todaySales: number;
  todayOrders: number;
  todayVoids: number;
  lowStockCount: number;
  activeCustomers30d: number;
  period?: 'today' | 'all';
  totalBusinessRevenue: number;
  nonPosRevenue: { pms: number; ar: number; membership: number; voucher: number };
}

/** A single revenue activity item from the unified ledger. */
interface RevenueActivityItem {
  id: string;
  source: string;
  sourceId: string;
  sourceLabel: string;
  customerName: string | null;
  amountDollars: number;
  status: string;
  occurredAt: string;
  businessDate: string;
  metadata: Record<string, unknown> | null;
}

// ── Persistence helpers ──────────────────────────────────────────

function loadPrefs(): DashboardPrefs {
  try {
    const raw = localStorage.getItem(DASHBOARD_PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_PREFS;
}

function loadNotes(): string {
  try {
    return localStorage.getItem(DASHBOARD_NOTES_KEY) ?? '';
  } catch { return ''; }
}

function saveNotes(notes: string) {
  try {
    localStorage.setItem(DASHBOARD_NOTES_KEY, notes);
  } catch { /* ignore */ }
}

// ── Formatting helpers ──────────────────────────────────────────

function formatDollars(dollars: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(dollars);
}

function getTodayBusinessDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

// ── Main Dashboard Content ──────────────────────────────────────
// Uses React Query for data fetching — each query gets its own
// AbortSignal. When the user navigates away, all in-flight requests
// are cancelled instantly, freeing the browser's connection pool so
// the new page's fetches can proceed without delay.

export default function DashboardContent() {
  const { user, tenant, locations } = useAuthContext();
  const queryClient = useQueryClient();
  const [prefs] = useState<DashboardPrefs>(() => loadPrefs());
  const [notes, setNotes] = useState(() => loadNotes());
  const [selectedLocationId, setSelectedLocationId] = useState(''); // '' = all locations
  const today = getTodayBusinessDate();

  // Derive the display name for the selected location
  const selectedLocationName = selectedLocationId
    ? locations?.find((l) => l.id === selectedLocationId)?.name ?? 'Unknown'
    : 'All Locations';

  // Build headers — only include X-Location-Id when a specific location is selected
  const locationHeaders: Record<string, string> = selectedLocationId
    ? { 'X-Location-Id': selectedLocationId }
    : {};

  // ── React Query: dashboard metrics ────────────────────────────
  const {
    data: metrics,
    isLoading: metricsLoading,
    dataUpdatedAt: metricsUpdatedAt,
  } = useQuery({
    queryKey: ['dashboard', 'metrics', selectedLocationId, today],
    queryFn: ({ signal }) =>
      apiFetch<{ data: DashboardMetrics }>(
        `/api/v1/reports/dashboard?date=${today}`,
        { signal, headers: locationHeaders },
      ).then((r) => r.data),
    staleTime: 60_000,
  });

  // ── React Query: recent activity ─────────────────────────────
  // Fetch 5 most recent revenue events from the unified ledger
  const { data: recentActivity = [], isLoading: activityLoading } = useQuery({
    queryKey: ['dashboard', 'activity', selectedLocationId],
    queryFn: ({ signal }) =>
      apiFetch<{ data: RevenueActivityItem[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/reports/recent-activity?limit=5`,
        { signal, headers: locationHeaders },
      ).then((r) => r.data),
    staleTime: 60_000,
  });

  // ── React Query: low stock items ──────────────────────────────
  const { data: lowStockItems = [], isLoading: inventoryLoading } = useQuery({
    queryKey: ['dashboard', 'lowStock', selectedLocationId],
    queryFn: ({ signal }) =>
      apiFetch<{ data: InventoryItem[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/inventory?lowStockOnly=true&limit=5`,
        { signal, headers: locationHeaders },
      ).then((r) => r.data),
    staleTime: 60_000,
  });

  const isLoading = metricsLoading || activityLoading || inventoryLoading;

  // Refresh all dashboard queries at once
  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }, [queryClient]);

  const handleNotesChange = useCallback((value: string) => {
    setNotes(value);
    saveNotes(value);
  }, []);

  const greeting = getGreeting();

  // Derive display values — prefer reporting metrics, fall back to order data
  const isAllTime = metrics?.period === 'all';
  const salesLabel = isAllTime ? 'Total Revenue' : 'Total Revenue Today';
  const ordersLabel = isAllTime ? 'Total Orders' : 'Orders Today';
  const nonPosTotal = metrics
    ? metrics.nonPosRevenue.pms + metrics.nonPosRevenue.ar + metrics.nonPosRevenue.membership + metrics.nonPosRevenue.voucher
    : 0;
  const totalSalesDisplay = metrics
    ? formatDollars(nonPosTotal > 0 ? metrics.totalBusinessRevenue : metrics.todaySales)
    : null;
  const salesTrend = metrics && metrics.todayOrders > 0
    ? nonPosTotal > 0
      ? `${metrics.todayOrders} orders · incl. ${formatDollars(nonPosTotal)} non-POS`
      : `${metrics.todayOrders} orders`
    : undefined;
  const orderCountDisplay = metrics
    ? String(metrics.todayOrders)
    : null;
  const lowStockCountDisplay = metrics
    ? String(metrics.lowStockCount)
    : lowStockItems.length > 0
      ? String(lowStockItems.length)
      : null;
  const ordersTrend = metrics && metrics.todayOrders > 0
    ? `${metrics.todayVoids} voided`
    : undefined;

  // Last refreshed from React Query's internal tracking
  const lastRefreshed = metricsUpdatedAt ? new Date(metricsUpdatedAt) : new Date();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {greeting}, {user?.name?.split(' ')[0] ?? 'there'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tenant?.name} &middot; {formatDate(new Date())}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          {/* Location Selector */}
          {locations && locations.length > 1 && (
            <div className="relative">
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                className="appearance-none rounded-lg border border-border bg-surface py-2 pl-8 pr-8 text-sm font-medium text-foreground hover:bg-accent focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">All Locations</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
              <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            </div>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {/* Setup Status */}
      <SetupStatusBanner />

      {/* AI Insight */}
      <PosInsightCard />

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {prefs.showSales && (
          <MetricCard
            label={salesLabel}
            value={metricsLoading && !totalSalesDisplay ? null : totalSalesDisplay}
            icon={DollarSign}
            iconColor="text-green-500 bg-green-500/20"
            trend={salesTrend}
          />
        )}
        {prefs.showOrders && (
          <MetricCard
            label={ordersLabel}
            value={metricsLoading && !orderCountDisplay ? null : orderCountDisplay}
            icon={ShoppingCart}
            iconColor="text-blue-500 bg-blue-500/20"
            trend={ordersTrend}
          />
        )}
        {prefs.showLowStock && (
          <MetricCard
            label="Low Stock Items"
            value={metricsLoading && !lowStockCountDisplay ? null : (lowStockCountDisplay ?? '0')}
            icon={AlertTriangle}
            iconColor={lowStockItems.length > 0 || (metrics && metrics.lowStockCount > 0)
              ? 'text-amber-500 bg-amber-500/20'
              : 'text-green-500 bg-green-500/20'}
            trend={lowStockItems.length > 0 || (metrics && metrics.lowStockCount > 0) ? 'Needs attention' : 'All good'}
            href="/catalog"
          />
        )}
        <MetricCard
          label="Active Customers (30d)"
          value={metricsLoading ? null : String(metrics?.activeCustomers30d ?? 0)}
          icon={Users}
          iconColor="text-indigo-500 bg-indigo-500/20"
          trend={selectedLocationId ? selectedLocationName : 'All locations'}
        />
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Activity (2/3 width on desktop) */}
        {prefs.showRecentOrders && (
          <div className="lg:col-span-2">
            <div className="rounded-xl bg-surface shadow-sm ring-1 ring-gray-950/5">
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
                <Link
                  href="/orders"
                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo-500 hover:text-indigo-400"
                >
                  View all <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </div>
              <div className="divide-y divide-border">
                {activityLoading && recentActivity.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : recentActivity.length === 0 ? (
                  <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                    No activity yet
                  </div>
                ) : (
                  recentActivity.map((item) => {
                    const SourceIcon = getSourceIcon(item.source);
                    const iconColor = getSourceIconColor(item.source);
                    const row = (
                      <div className="flex items-center justify-between px-6 py-3 hover:bg-accent">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconColor}`}>
                            <SourceIcon className="h-4 w-4" aria-hidden="true" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{item.sourceLabel}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(item.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {item.customerName && ` · ${item.customerName}`}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-foreground">{formatDollars(item.amountDollars)}</p>
                          <ActivityStatusBadge status={item.status} />
                        </div>
                      </div>
                    );
                    if (item.source === 'pos_order') {
                      return <Link key={item.id} href={`/orders/${item.sourceId}`}>{row}</Link>;
                    }
                    return <div key={item.id}>{row}</div>;
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* Right Column: Notes + Low Stock */}
        <div className="space-y-6">
          {/* Notes Widget */}
          {prefs.showNotes && (
            <div className="rounded-xl bg-surface shadow-sm ring-1 ring-gray-950/5">
              <div className="flex items-center gap-2 border-b border-border px-6 py-4">
                <StickyNote className="h-4 w-4 text-amber-500" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-foreground">Notes</h2>
              </div>
              <div className="p-4">
                <textarea
                  value={notes}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  placeholder="Quick notes, reminders, daily specials..."
                  className="w-full resize-none rounded-lg border border-border bg-transparent p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  rows={5}
                />
                <p className="mt-1 text-right text-xs text-muted-foreground">Auto-saved locally</p>
              </div>
            </div>
          )}

          {/* Low Stock Alert */}
          {prefs.showLowStock && lowStockItems.length > 0 && (
            <div className="rounded-xl bg-surface shadow-sm ring-1 ring-gray-950/5">
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
                  <h2 className="text-sm font-semibold text-foreground">Low Stock Alert</h2>
                </div>
                <Link
                  href="/catalog"
                  className="text-xs font-medium text-indigo-500 hover:text-indigo-400"
                >
                  View all
                </Link>
              </div>
              <div className="divide-y divide-border">
                {lowStockItems.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                        <Package className="h-4 w-4 text-amber-500" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.name}</p>
                        {item.sku && <p className="text-xs text-muted-foreground">{item.sku}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${item.onHand <= 0 ? 'text-red-500' : 'text-amber-500'}`}>
                        {item.onHand}
                      </p>
                      <p className="text-xs text-muted-foreground">on hand</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <p className="text-xs text-muted-foreground">
        <Clock className="mr-1 inline h-3 w-3" aria-hidden="true" />
        Last refreshed {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function MetricCard({
  label,
  value,
  icon: Icon,
  iconColor,
  trend,
  href,
}: {
  label: string;
  value: string | null;
  icon: typeof DollarSign;
  iconColor: string;
  trend?: string;
  href?: string;
}) {
  const content = (
    <div className="rounded-xl bg-surface p-6 shadow-sm ring-1 ring-gray-950/5 transition-shadow hover:shadow-md">
      <div className="flex items-center gap-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconColor}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {value === null ? (
            <div className="mt-1 h-7 w-20 animate-pulse rounded bg-muted" />
          ) : (
            <p className="truncate text-2xl font-bold text-foreground">{value}</p>
          )}
          {trend && <p className="mt-0.5 text-xs text-muted-foreground">{trend}</p>}
        </div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

// ── Setup Status Banner ──────────────────────────────────────────
// Lightweight — reads localStorage/sessionStorage directly. No API calls.

function getOnboardingProgress(): { completedAt: string | null; percentage: number } {
  if (typeof window === 'undefined') return { completedAt: null, percentage: 0 };
  try {
    const completedAt = localStorage.getItem('oppsera_onboarding_completed_at');
    if (completedAt) return { completedAt, percentage: 100 };

    const cached = sessionStorage.getItem('oppsera_onboarding_cache');
    if (!cached) return { completedAt: null, percentage: 0 };

    const completion = JSON.parse(cached) as Record<string, Record<string, boolean>>;
    let total = 0;
    let done = 0;
    for (const phase of Object.values(completion)) {
      for (const value of Object.values(phase)) {
        total++;
        if (value) done++;
      }
    }
    return { completedAt: null, percentage: total > 0 ? Math.round((done / total) * 100) : 0 };
  } catch {
    return { completedAt: null, percentage: 0 };
  }
}

function SetupStatusBanner() {
  const [progress] = useState(getOnboardingProgress);

  if (progress.completedAt) {
    return (
      <div className="flex items-center gap-4 rounded-xl border border-green-500/30 bg-green-500/10 px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/20">
          <CheckCircle2 className="h-5 w-5 text-green-500" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-green-500">Your system is all set up</p>
          <p className="text-xs text-green-500/70">
            Business went live on{' '}
            {new Date(progress.completedAt).toLocaleDateString(undefined, {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>
        <Link
          href="/settings/onboarding"
          className="shrink-0 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
        >
          View Setup
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 rounded-xl border border-red-400/30 bg-red-400/10 px-5 py-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-400/20">
        <Rocket className="h-5 w-5 text-red-500" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-red-500">Complete your business setup</p>
        <p className="text-xs text-red-500/70">
          {progress.percentage > 0
            ? `You're ${progress.percentage}% of the way there — finish setting up to start taking orders.`
            : 'A few quick steps to get your business up and running.'}
        </p>
        {progress.percentage > 0 && (
          <div className="mt-2 h-1.5 w-full max-w-xs rounded-full bg-red-400/20">
            <div
              className="h-full rounded-full bg-red-500 transition-all"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        )}
      </div>
      <Link
        href="/settings/onboarding"
        className="shrink-0 rounded-lg bg-red-400 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500"
      >
        Complete Setup
      </Link>
    </div>
  );
}

function getSourceIcon(source: string) {
  switch (source) {
    case 'pos_order': return ShoppingCart;
    case 'pms_folio': return Building2;
    case 'ar_invoice': return FileText;
    case 'membership': return CreditCard;
    case 'voucher': return Gift;
    default: return DollarSign;
  }
}

function getSourceIconColor(source: string): string {
  switch (source) {
    case 'pos_order': return 'bg-blue-500/10 text-blue-500';
    case 'pms_folio': return 'bg-purple-500/10 text-purple-500';
    case 'ar_invoice': return 'bg-emerald-500/10 text-emerald-500';
    case 'membership': return 'bg-amber-500/10 text-amber-500';
    case 'voucher': return 'bg-pink-500/10 text-pink-500';
    default: return 'bg-muted text-muted-foreground';
  }
}

function ActivityStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; classes: string }> = {
    completed: { label: 'Completed', classes: 'bg-green-500/20 text-green-500' },
    paid: { label: 'Paid', classes: 'bg-green-500/20 text-green-500' },
    placed: { label: 'Placed', classes: 'bg-amber-500/20 text-amber-500' },
    voided: { label: 'Voided', classes: 'bg-red-500/20 text-red-500' },
    refunded: { label: 'Refunded', classes: 'bg-red-500/20 text-red-500' },
  };
  const c = config[status] ?? { label: status, classes: 'bg-muted text-muted-foreground' };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${c.classes}`}>
      {c.label}
    </span>
  );
}
