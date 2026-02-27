'use client';

import { useState, useEffect } from 'react';
import { DollarSign, Users, ShoppingBag, TrendingUp } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface SalesKpi {
  totalSalesCents: number;
  totalCovers: number;
  openTabCount: number;
  avgCheckCents: number;
}

function formatMoney(cents: number): string {
  if (cents >= 100_000) {
    return `$${(cents / 100).toFixed(0)}`;
  }
  return `$${(cents / 100).toFixed(2)}`;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-xl p-4"
      style={{ backgroundColor: 'var(--fnb-bg-surface)', border: 'var(--fnb-border-subtle)' }}
    >
      <div className="flex items-center gap-2">
        <div
          className="flex items-center justify-center h-8 w-8 rounded-lg"
          style={{ backgroundColor: `${color}18` }}
        >
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        <span className="text-[11px] font-semibold uppercase" style={{ color: 'var(--fnb-text-muted)' }}>
          {label}
        </span>
      </div>
      <span className="text-2xl font-black tracking-tight mt-1" style={{ color: 'var(--fnb-text-primary)' }}>
        {value}
      </span>
    </div>
  );
}

export function SalesSummaryView({ userId: _userId }: { userId: string }) {
  const [kpi, setKpi] = useState<SalesKpi | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiFetch<{ data: SalesKpi }>('/api/v1/fnb/reports/dashboard');
        if (!cancelled) setKpi(res.data);
      } catch {
        // Fallback to zeros
        if (!cancelled) {
          setKpi({ totalSalesCents: 0, totalCovers: 0, openTabCount: 0, avgCheckCents: 0 });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-6 w-6 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--fnb-text-muted)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const data = kpi ?? { totalSalesCents: 0, totalCovers: 0, openTabCount: 0, avgCheckCents: 0 };

  return (
    <div className="flex-1 overflow-y-auto p-3" style={{ backgroundColor: 'var(--fnb-bg-base)' }}>
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          icon={DollarSign}
          label="Total Sales"
          value={formatMoney(data.totalSalesCents)}
          color="var(--fnb-status-available, #22c55e)"
        />
        <KpiCard
          icon={Users}
          label="Covers"
          value={String(data.totalCovers)}
          color="var(--fnb-info, #3b82f6)"
        />
        <KpiCard
          icon={TrendingUp}
          label="Avg Check"
          value={formatMoney(data.avgCheckCents)}
          color="var(--fnb-action-fire, #f97316)"
        />
        <KpiCard
          icon={ShoppingBag}
          label="Open Tabs"
          value={String(data.openTabCount)}
          color="var(--fnb-warning, #eab308)"
        />
      </div>

      <div
        className="mt-4 rounded-xl p-4 text-center"
        style={{ backgroundColor: 'var(--fnb-bg-surface)', border: 'var(--fnb-border-subtle)' }}
      >
        <p className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>
          Today&apos;s shift summary. Detailed reports available in the Reports section.
        </p>
      </div>
    </div>
  );
}
