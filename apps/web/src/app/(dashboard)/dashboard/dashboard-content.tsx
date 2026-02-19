'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  DollarSign,
  ShoppingCart,
  AlertTriangle,
  TrendingUp,
  Loader2,
  ArrowRight,
  StickyNote,
  RefreshCw,
  Package,
  Clock,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useAuthContext } from '@/components/auth-provider';
import type { Order } from '@/types/pos';
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

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

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
  const primaryLocation = locations?.[0];
  const locationId = primaryLocation?.id ?? '';
  const today = getTodayBusinessDate();

  // ── React Query: dashboard metrics ────────────────────────────
  const {
    data: metrics,
    isLoading: metricsLoading,
    dataUpdatedAt: metricsUpdatedAt,
  } = useQuery({
    queryKey: ['dashboard', 'metrics', locationId, today],
    queryFn: ({ signal }) =>
      apiFetch<{ data: DashboardMetrics }>(
        `/api/v1/reports/dashboard?date=${today}`,
        { signal, headers: { 'X-Location-Id': locationId } },
      ).then((r) => r.data),
    enabled: !!locationId,
    staleTime: 60_000,
  });

  // ── React Query: recent orders ────────────────────────────────
  const { data: recentOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['dashboard', 'orders', locationId, today],
    queryFn: ({ signal }) =>
      apiFetch<{ data: Order[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/orders?businessDate=${today}&limit=5`,
        { signal, headers: { 'X-Location-Id': locationId } },
      ).then((r) => r.data),
    enabled: !!locationId,
    staleTime: 60_000,
  });

  // ── React Query: low stock items ──────────────────────────────
  const { data: lowStockItems = [], isLoading: inventoryLoading } = useQuery({
    queryKey: ['dashboard', 'lowStock', locationId],
    queryFn: ({ signal }) =>
      apiFetch<{ data: InventoryItem[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/inventory?lowStockOnly=true&limit=5`,
        { signal, headers: { 'X-Location-Id': locationId } },
      ).then((r) => r.data),
    enabled: !!locationId,
    staleTime: 60_000,
  });

  const isLoading = metricsLoading || ordersLoading || inventoryLoading;

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
  const totalSalesDisplay = metrics
    ? formatDollars(metrics.todaySales)
    : null;
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
          <h1 className="text-2xl font-bold text-gray-900">
            {greeting}, {user?.name?.split(' ')[0] ?? 'there'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {tenant?.name} &middot; {primaryLocation?.name ?? 'No location'} &middot; {formatDate(new Date())}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isLoading}
          className="inline-flex items-center gap-2 self-start rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {prefs.showSales && (
          <MetricCard
            label="Total Sales Today"
            value={metricsLoading && !totalSalesDisplay ? null : totalSalesDisplay}
            icon={DollarSign}
            iconColor="text-green-600 bg-green-100"
            trend={metrics && metrics.todayOrders > 0 ? `${metrics.todayOrders} orders` : undefined}
          />
        )}
        {prefs.showOrders && (
          <MetricCard
            label="Orders Today"
            value={metricsLoading && !orderCountDisplay ? null : orderCountDisplay}
            icon={ShoppingCart}
            iconColor="text-blue-600 bg-blue-100"
            trend={ordersTrend}
          />
        )}
        {prefs.showLowStock && (
          <MetricCard
            label="Low Stock Items"
            value={metricsLoading && !lowStockCountDisplay ? null : (lowStockCountDisplay ?? '0')}
            icon={AlertTriangle}
            iconColor={lowStockItems.length > 0 || (metrics && metrics.lowStockCount > 0)
              ? 'text-amber-600 bg-amber-100'
              : 'text-green-600 bg-green-100'}
            trend={lowStockItems.length > 0 || (metrics && metrics.lowStockCount > 0) ? 'Needs attention' : 'All good'}
            href="/catalog"
          />
        )}
        <MetricCard
          label="Active Location"
          value={primaryLocation?.name ?? '--'}
          icon={TrendingUp}
          iconColor="text-indigo-600 bg-indigo-100"
          trend={locations?.length ? `${locations.length} total` : undefined}
        />
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Orders (2/3 width on desktop) */}
        {prefs.showRecentOrders && (
          <div className="lg:col-span-2">
            <div className="rounded-xl bg-surface shadow-sm ring-1 ring-gray-950/5">
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                <h2 className="text-sm font-semibold text-gray-900">Recent Orders</h2>
                <Link
                  href="/orders"
                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                >
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="divide-y divide-gray-50">
                {ordersLoading && recentOrders.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : recentOrders.length === 0 ? (
                  <div className="px-6 py-8 text-center text-sm text-gray-400">
                    No orders today yet
                  </div>
                ) : (
                  recentOrders.map((order) => (
                    <Link
                      key={order.id}
                      href={`/orders/${order.id}`}
                      className="flex items-center justify-between px-6 py-3 hover:bg-gray-50/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
                          <ShoppingCart className="h-4 w-4 text-gray-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">#{order.orderNumber}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {order.customerId && ' · Customer attached'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">{formatMoney(order.total)}</p>
                        <OrderStatusBadge status={order.status} />
                      </div>
                    </Link>
                  ))
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
              <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-4">
                <StickyNote className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-gray-900">Notes</h2>
              </div>
              <div className="p-4">
                <textarea
                  value={notes}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  placeholder="Quick notes, reminders, daily specials..."
                  className="w-full resize-none rounded-lg border border-gray-200 bg-transparent p-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  rows={5}
                />
                <p className="mt-1 text-right text-xs text-gray-400">Auto-saved locally</p>
              </div>
            </div>
          )}

          {/* Low Stock Alert */}
          {prefs.showLowStock && lowStockItems.length > 0 && (
            <div className="rounded-xl bg-surface shadow-sm ring-1 ring-gray-950/5">
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <h2 className="text-sm font-semibold text-gray-900">Low Stock Alert</h2>
                </div>
                <Link
                  href="/catalog"
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                >
                  View all
                </Link>
              </div>
              <div className="divide-y divide-gray-50">
                {lowStockItems.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
                        <Package className="h-4 w-4 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.name}</p>
                        {item.sku && <p className="text-xs text-gray-500">{item.sku}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${item.onHand <= 0 ? 'text-red-600' : 'text-amber-600'}`}>
                        {item.onHand}
                      </p>
                      <p className="text-xs text-gray-400">on hand</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <p className="text-xs text-gray-400">
        <Clock className="mr-1 inline h-3 w-3" />
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
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-500">{label}</p>
          {value === null ? (
            <div className="mt-1 h-7 w-20 animate-pulse rounded bg-gray-200" />
          ) : (
            <p className="truncate text-2xl font-bold text-gray-900">{value}</p>
          )}
          {trend && <p className="mt-0.5 text-xs text-gray-400">{trend}</p>}
        </div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

function OrderStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; classes: string }> = {
    open: { label: 'Open', classes: 'bg-blue-100 text-blue-700' },
    placed: { label: 'Placed', classes: 'bg-amber-100 text-amber-700' },
    paid: { label: 'Paid', classes: 'bg-green-100 text-green-700' },
    voided: { label: 'Voided', classes: 'bg-red-100 text-red-700' },
  };
  const c = config[status] ?? { label: status, classes: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${c.classes}`}>
      {c.label}
    </span>
  );
}
