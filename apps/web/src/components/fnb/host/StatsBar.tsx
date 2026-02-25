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

interface StatItemProps {
  icon: LucideIcon;
  value: number | string;
  label: string;
  color?: string;
}

function StatItem({ icon: Icon, value, label, color }: StatItemProps) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div
        className="flex items-center justify-center h-7 w-7 rounded-md shrink-0"
        style={{ backgroundColor: `color-mix(in srgb, ${color ?? 'var(--fnb-text-muted)'} 12%, transparent)` }}
      >
        <Icon size={14} style={{ color: color ?? 'var(--fnb-text-muted)' }} />
      </div>
      <div className="min-w-0">
        <div
          className="text-sm font-bold leading-none tabular-nums"
          style={{
            color: color ?? 'var(--fnb-text-primary)',
            fontFamily: 'var(--fnb-font-mono)',
          }}
        >
          {value}
        </div>
        <div
          className="text-[9px] font-semibold uppercase tracking-wide leading-tight mt-0.5 truncate"
          style={{ color: 'var(--fnb-text-muted)' }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

export function StatsBar({ stats, tableSummary }: StatsBarProps) {
  return (
    <div className="flex items-stretch gap-2">
      {/* Guest Metrics Group */}
      <div
        className="flex items-center gap-4 px-4 py-2.5 rounded-lg flex-1"
        style={{
          backgroundColor: 'var(--fnb-bg-surface)',
          border: 'var(--fnb-border-subtle)',
        }}
      >
        <StatItem icon={Users} value={stats?.totalCoversToday ?? 0} label="Covers" />

        <div className="w-px h-6 shrink-0" style={{ backgroundColor: 'var(--fnb-text-disabled)' }} />

        <StatItem
          icon={Clock}
          value={stats?.currentWaiting ?? 0}
          label="Waiting"
          color={stats && stats.currentWaiting > 0 ? 'var(--fnb-warning)' : undefined}
        />

        <div className="w-px h-6 shrink-0" style={{ backgroundColor: 'var(--fnb-text-disabled)' }} />

        <StatItem icon={Timer} value={stats ? `${stats.avgWaitMinutes}m` : '0m'} label="Avg Wait" />
      </div>

      {/* Table Metrics Group */}
      <div
        className="flex items-center gap-4 px-4 py-2.5 rounded-lg flex-1"
        style={{
          backgroundColor: 'var(--fnb-bg-surface)',
          border: 'var(--fnb-border-subtle)',
        }}
      >
        <StatItem
          icon={LayoutGrid}
          value={tableSummary?.available ?? 0}
          label="Open"
          color="var(--fnb-status-available)"
        />

        <div className="w-px h-6 shrink-0" style={{ backgroundColor: 'var(--fnb-text-disabled)' }} />

        <StatItem
          icon={Check}
          value={tableSummary?.seated ?? 0}
          label="Seated"
          color="var(--fnb-status-seated)"
        />

        <div className="w-px h-6 shrink-0" style={{ backgroundColor: 'var(--fnb-text-disabled)' }} />

        <StatItem
          icon={Calendar}
          value={tableSummary?.reserved ?? 0}
          label="Reserved"
          color="var(--fnb-status-reserved)"
        />

        <div className="w-px h-6 shrink-0" style={{ backgroundColor: 'var(--fnb-text-disabled)' }} />

        <StatItem
          icon={Droplets}
          value={tableSummary?.dirty ?? 0}
          label="Dirty"
          color={tableSummary && tableSummary.dirty > 0 ? 'var(--fnb-danger)' : undefined}
        />
      </div>
    </div>
  );
}
