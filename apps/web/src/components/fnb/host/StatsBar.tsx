'use client';

import {
  Users,
  Clock,
  Timer,
  LayoutGrid,
  Check,
  Calendar,
  Droplets,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface StatsBarProps {
  stats: {
    totalCoversToday: number;
    currentWaiting: number;
    avgWaitMinutes: number;
    reservationsToday: number;
    noShowsToday: number;
    seatedFromWaitlist: number;
  } | null;
  tableSummary: {
    total: number;
    available: number;
    seated: number;
    reserved: number;
    dirty: number;
    blocked: number;
  } | null;
}

interface StatCardProps {
  icon: LucideIcon;
  value: number | string;
  label: string;
  color?: string;
}

function StatCard({ icon: Icon, value, label, color }: StatCardProps) {
  const iconColor = color ?? 'var(--fnb-text-muted)';

  return (
    <div
      style={{
        background: 'var(--fnb-bg-elevated)',
        borderRadius: 'var(--fnb-radius-lg)',
        padding: 'var(--fnb-space-3) var(--fnb-space-4)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--fnb-space-3)',
        minWidth: 0,
      }}
    >
      <Icon size={20} style={{ color: iconColor, flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            color: color ?? 'var(--fnb-text-primary)',
            fontSize: 'var(--fnb-text-xl)',
            fontWeight: 'var(--fnb-font-bold)',
            fontFamily: 'var(--fnb-font-mono)',
            lineHeight: 1.1,
          }}
        >
          {value}
        </div>
        <div
          style={{
            color: 'var(--fnb-text-muted)',
            fontSize: 'var(--fnb-text-xs)',
            fontWeight: 'var(--fnb-font-semibold)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

export function StatsBar({ stats, tableSummary }: StatsBarProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: 'var(--fnb-space-2)',
        padding: 'var(--fnb-space-3)',
        background: 'var(--fnb-bg-surface)',
        borderRadius: 'var(--fnb-radius-lg)',
        border: 'var(--fnb-border-subtle)',
      }}
    >
      {/* Guest stats */}
      <StatCard
        icon={Users}
        value={stats?.totalCoversToday ?? 0}
        label="Covers"
      />
      <StatCard
        icon={Clock}
        value={stats?.currentWaiting ?? 0}
        label="Waiting"
        color={
          stats && stats.currentWaiting > 0
            ? 'var(--fnb-warning)'
            : undefined
        }
      />
      <StatCard
        icon={Timer}
        value={stats ? `${stats.avgWaitMinutes}m` : '0m'}
        label="Avg Wait"
      />

      {/* Table stats */}
      <StatCard
        icon={LayoutGrid}
        value={tableSummary?.available ?? 0}
        label="Available"
        color="var(--fnb-status-available)"
      />
      <StatCard
        icon={Check}
        value={tableSummary?.seated ?? 0}
        label="Seated"
        color="var(--fnb-status-seated)"
      />
      <StatCard
        icon={Calendar}
        value={tableSummary?.reserved ?? 0}
        label="Reserved"
        color="var(--fnb-status-reserved)"
      />
      <StatCard
        icon={Droplets}
        value={tableSummary?.dirty ?? 0}
        label="Dirty"
        color={
          tableSummary && tableSummary.dirty > 0
            ? 'var(--fnb-warning)'
            : undefined
        }
      />
    </div>
  );
}
