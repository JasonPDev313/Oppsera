'use client';

import { useState, useEffect } from 'react';
import { useAuthContext } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api-client';
import { ArrowLeft, TrendingUp, Users, UtensilsCrossed, DollarSign, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface DashboardMetrics {
  grossSalesCents: number;
  netSalesCents: number;
  coverCount: number;
  tabCount: number;
  avgCheckCents: number;
  tipsTotalCents: number;
  voidTotalCents: number;
  compTotalCents: number;
}

export default function ManagerContent() {
  const { locations } = useAuthContext();
  const router = useRouter();
  const locationId = locations[0]?.id ?? '';
  const today = new Date().toISOString().slice(0, 10);

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!locationId) return;
    apiFetch<{ data: DashboardMetrics }>(
      `/api/v1/fnb/reports/dashboard?locationId=${locationId}&businessDate=${today}`,
    )
      .then((res) => setMetrics(res.data))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [locationId, today]);

  const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const kpiCards = metrics
    ? [
        { label: 'Net Sales', value: formatMoney(metrics.netSalesCents), icon: DollarSign, color: 'var(--fnb-status-available)' },
        { label: 'Covers', value: String(metrics.coverCount), icon: Users, color: 'var(--fnb-status-seated)' },
        { label: 'Avg Check', value: formatMoney(metrics.avgCheckCents), icon: TrendingUp, color: 'var(--fnb-status-ordered)' },
        { label: 'Open Tabs', value: String(metrics.tabCount), icon: UtensilsCrossed, color: 'var(--fnb-status-entrees-fired)' },
        { label: 'Tips', value: formatMoney(metrics.tipsTotalCents), icon: DollarSign, color: 'var(--fnb-status-dessert)' },
        { label: 'Voids + Comps', value: formatMoney(metrics.voidTotalCents + metrics.compTotalCents), icon: AlertTriangle, color: 'var(--fnb-status-dirty)' },
      ]
    : [];

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-6 py-4 border-b shrink-0"
        style={{ backgroundColor: 'var(--fnb-bg-surface)', borderColor: 'rgba(148, 163, 184, 0.15)' }}
      >
        <button
          type="button"
          onClick={() => router.push('/pos/fnb')}
          className="flex items-center justify-center rounded-lg h-8 w-8 transition-colors hover:opacity-80"
          style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
          Manager Dashboard
        </h1>
        <span className="text-xs ml-auto" style={{ color: 'var(--fnb-text-muted)' }}>{today}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" style={{ color: 'var(--fnb-text-muted)' }} />
          </div>
        ) : (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-3 gap-3">
              {kpiCards.map(({ label, value, icon: Icon, color }) => (
                <div
                  key={label}
                  className="rounded-xl border p-4"
                  style={{ borderColor: 'rgba(148, 163, 184, 0.15)', backgroundColor: 'var(--fnb-bg-surface)' }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="h-4 w-4" style={{ color }} />
                    <span className="text-[10px] font-bold uppercase" style={{ color: 'var(--fnb-text-muted)' }}>{label}</span>
                  </div>
                  <span
                    className="text-xl font-bold font-mono"
                    style={{ color: 'var(--fnb-text-primary)', fontFamily: 'var(--fnb-font-mono)' }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => router.push('/close-batch')}
                className="rounded-xl border p-4 text-left transition-colors hover:opacity-80"
                style={{ borderColor: 'rgba(148, 163, 184, 0.15)', backgroundColor: 'var(--fnb-bg-surface)' }}
              >
                <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--fnb-text-primary)' }}>Close Batch</h3>
                <p className="text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>End of day close, Z-report, cash count</p>
              </button>
              <button
                type="button"
                onClick={() => router.push('/host')}
                className="rounded-xl border p-4 text-left transition-colors hover:opacity-80"
                style={{ borderColor: 'rgba(148, 163, 184, 0.15)', backgroundColor: 'var(--fnb-bg-surface)' }}
              >
                <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--fnb-text-primary)' }}>Host Stand</h3>
                <p className="text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>Server rotation, cover balance, seating</p>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
