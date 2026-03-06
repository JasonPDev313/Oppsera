'use client';

import { useState, useMemo } from 'react';
import { AlertTriangle, Package, RefreshCw, ArrowDown, Bell } from 'lucide-react';
import { useStockAlerts } from '@/hooks/use-stock-alerts';
import { useAuthContext } from '@/components/auth-provider';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

type TabKey = 'live' | 'history';
type SeverityFilter = 'all' | 'critical' | 'warning';

export default function StockAlertsContent() {
  const { locations } = useAuthContext();
  const locationId = locations?.[0]?.id;
  const [activeTab, setActiveTab] = useState<TabKey>('live');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [search, setSearch] = useState('');

  const { lowStockItems, negativeStockItems, recentAlerts, summary, isLoading, mutate } = useStockAlerts({ locationId });

  // ── Combined live items with severity ──────────────────────────
  const liveItems = useMemo(() => {
    const items: Array<{
      id: string;
      name: string;
      sku: string | null;
      onHand: number;
      reorderPoint: number | null;
      severity: 'critical' | 'warning';
      suggestedOrderQty?: number;
      preferredVendorName?: string | null;
    }> = [];

    for (const neg of negativeStockItems) {
      items.push({
        id: neg.inventoryItemId,
        name: neg.itemName,
        sku: neg.sku,
        onHand: neg.onHand,
        reorderPoint: null,
        severity: 'critical',
      });
    }

    for (const low of lowStockItems) {
      // Skip if already in negative list
      if (items.some((i) => i.id === low.id)) continue;
      items.push({
        id: low.id,
        name: low.name,
        sku: low.sku,
        onHand: low.onHand,
        reorderPoint: low.reorderPoint,
        severity: 'warning',
        suggestedOrderQty: low.suggestedOrderQty,
        preferredVendorName: low.preferredVendorName,
      });
    }

    return items;
  }, [negativeStockItems, lowStockItems]);

  const filteredLive = useMemo(() => {
    let filtered = liveItems;
    if (severityFilter !== 'all') {
      filtered = filtered.filter((i) => i.severity === severityFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (i) => i.name.toLowerCase().includes(q) || (i.sku?.toLowerCase().includes(q)),
      );
    }
    return filtered;
  }, [liveItems, severityFilter, search]);

  const filteredAlerts = useMemo(() => {
    let filtered = recentAlerts;
    if (severityFilter !== 'all') {
      filtered = filtered.filter((a) => a.severity === severityFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((a) => a.title.toLowerCase().includes(q));
    }
    return filtered;
  }, [recentAlerts, severityFilter, search]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'live', label: `Live Issues (${liveItems.length})` },
    { key: 'history', label: `Alert History (${recentAlerts.length})` },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Stock Alerts</h1>
          <p className="text-sm text-muted-foreground">
            Monitor inventory levels and receive alerts for low and negative stock.
          </p>
        </div>
        <button
          onClick={mutate}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Critical"
          value={summary.criticalCount}
          icon={<AlertTriangle className="h-5 w-5 text-red-400" />}
          color="red"
          description="Negative stock items"
        />
        <SummaryCard
          label="Warning"
          value={summary.warningCount}
          icon={<ArrowDown className="h-5 w-5 text-amber-400" />}
          color="amber"
          description="Below reorder point"
        />
        <SummaryCard
          label="Total Issues"
          value={summary.totalIssues}
          icon={<Package className="h-5 w-5 text-blue-400" />}
          color="blue"
          description="Items needing attention"
        />
        <SummaryCard
          label="Unread Alerts"
          value={summary.unreadAlertCount}
          icon={<Bell className="h-5 w-5 text-indigo-400" />}
          color="indigo"
          description="Pending notifications"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground sm:w-64"
        />
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
        </select>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Loading stock data...
        </div>
      ) : activeTab === 'live' ? (
        <LiveIssuesTable items={filteredLive} />
      ) : (
        <AlertHistoryTable alerts={filteredAlerts} />
      )}
    </div>
  );
}

// ── Summary Card ──────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon,
  color,
  description,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: 'red' | 'amber' | 'blue' | 'indigo';
  description: string;
}) {
  const bgMap = { red: 'bg-red-500/10', amber: 'bg-amber-500/10', blue: 'bg-blue-500/10', indigo: 'bg-indigo-500/10' };
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${bgMap[color]}`}>{icon}</div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

// ── Live Issues Table ─────────────────────────────────────────────

function LiveIssuesTable({ items }: { items: Array<{
  id: string;
  name: string;
  sku: string | null;
  onHand: number;
  reorderPoint: number | null;
  severity: 'critical' | 'warning';
  suggestedOrderQty?: number;
  preferredVendorName?: string | null;
}> }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card py-12 text-center">
        <Package className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No stock issues found. All inventory levels are healthy.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Item</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">SKU</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-muted-foreground">On Hand</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-muted-foreground">Reorder Pt</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-muted-foreground">Suggested Qty</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Vendor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-muted/30">
              <td className="px-4 py-3">
                <SeverityBadge severity={item.severity} />
              </td>
              <td className="px-4 py-3 text-sm font-medium text-foreground">{item.name}</td>
              <td className="px-4 py-3 text-sm text-muted-foreground">{item.sku ?? '—'}</td>
              <td className={`px-4 py-3 text-right text-sm font-medium ${
                item.onHand < 0 ? 'text-red-400' : 'text-amber-400'
              }`}>
                {item.onHand}
              </td>
              <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                {item.reorderPoint ?? '—'}
              </td>
              <td className="px-4 py-3 text-right text-sm text-foreground">
                {item.suggestedOrderQty ?? '—'}
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {item.preferredVendorName ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Alert History Table ───────────────────────────────────────────

function AlertHistoryTable({ alerts }: { alerts: Array<{
  id: string;
  title: string;
  body: string;
  severity: string;
  metricValue: string | null;
  baselineValue: string | null;
  isRead: boolean;
  isDismissed: boolean;
  createdAt: string;
}> }) {
  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card py-12 text-center">
        <Bell className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No recent stock alerts.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Severity</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Alert</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-muted-foreground">Level</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-muted-foreground">Threshold</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">When</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {alerts.map((alert) => (
            <tr key={alert.id} className={`hover:bg-muted/30 ${!alert.isRead ? 'bg-indigo-500/5' : ''}`}>
              <td className="px-4 py-3">
                <SeverityBadge severity={alert.severity as 'critical' | 'warning'} />
              </td>
              <td className="px-4 py-3">
                <p className={`text-sm font-medium ${!alert.isRead ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {alert.title}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-1">{alert.body}</p>
              </td>
              <td className="px-4 py-3 text-right text-sm text-foreground">
                {alert.metricValue ?? '—'}
              </td>
              <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                {alert.baselineValue ?? '—'}
              </td>
              <td className="px-4 py-3">
                {alert.isDismissed ? (
                  <span className="text-xs text-muted-foreground">Dismissed</span>
                ) : alert.isRead ? (
                  <span className="text-xs text-muted-foreground">Read</span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-400 border border-indigo-500/30">
                    Unread
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {timeAgo(alert.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Severity Badge ────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: 'critical' | 'warning' | string }) {
  const styles = severity === 'critical'
    ? 'bg-red-500/10 text-red-400 border-red-500/30'
    : 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  const label = severity === 'critical' ? 'Critical' : 'Warning';

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${styles}`}>
      {label}
    </span>
  );
}
