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
  iconBg?: string;
  iconColor?: string;
  valueColor?: string;
}

function StatItem({ icon: Icon, value, label, iconBg = 'bg-muted', iconColor = 'text-muted-foreground', valueColor = 'text-foreground' }: StatItemProps) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className={`flex items-center justify-center h-8 w-8 rounded-lg shrink-0 ${iconBg}`}>
        <Icon size={15} className={iconColor} />
      </div>
      <div className="min-w-0">
        <div className={`text-[15px] font-bold leading-none tabular-nums tracking-tight ${valueColor}`}>
          {value}
        </div>
        <div className="text-[9px] font-semibold uppercase tracking-wider leading-tight mt-0.5 text-muted-foreground truncate">
          {label}
        </div>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="w-px h-7 shrink-0 bg-border" />;
}

export function StatsBar({ stats, tableSummary }: StatsBarProps) {
  const hasWaiting = stats != null && stats.currentWaiting > 0;
  const hasDirty = tableSummary != null && tableSummary.dirty > 0;

  return (
    <div className="flex items-stretch gap-3">
      {/* Guest Metrics Group */}
      <div
        className="flex items-center gap-5 px-5 py-3 rounded-xl flex-1 bg-card border border-border shadow-sm"
        role="status"
        aria-live="polite"
        aria-label="Guest metrics"
      >
        <StatItem
          icon={Users}
          value={stats?.totalCoversToday ?? 0}
          label="Covers"
          iconBg="bg-indigo-500/10"
          iconColor="text-indigo-600"
        />
        <Divider />
        <StatItem
          icon={Clock}
          value={stats?.currentWaiting ?? 0}
          label="Waiting"
          iconBg={hasWaiting ? 'bg-amber-500/10' : 'bg-muted'}
          iconColor={hasWaiting ? 'text-amber-500' : 'text-muted-foreground'}
          valueColor={hasWaiting ? 'text-amber-500' : 'text-foreground'}
        />
        <Divider />
        <StatItem
          icon={Timer}
          value={stats ? `${stats.avgWaitMinutes}m` : '0m'}
          label="Avg Wait"
          iconBg="bg-muted"
          iconColor="text-muted-foreground"
        />
      </div>

      {/* Table Metrics Group */}
      <div
        className="flex items-center gap-5 px-5 py-3 rounded-xl flex-1 bg-card border border-border shadow-sm"
        role="status"
        aria-live="polite"
        aria-label="Table metrics"
      >
        <StatItem
          icon={LayoutGrid}
          value={tableSummary?.available ?? 0}
          label="Open"
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-500"
          valueColor="text-emerald-500"
        />
        <Divider />
        <StatItem
          icon={Check}
          value={tableSummary?.seated ?? 0}
          label="Seated"
          iconBg="bg-blue-500/10"
          iconColor="text-blue-500"
          valueColor="text-blue-500"
        />
        <Divider />
        <StatItem
          icon={Calendar}
          value={tableSummary?.reserved ?? 0}
          label="Reserved"
          iconBg="bg-violet-500/10"
          iconColor="text-violet-500"
          valueColor="text-violet-500"
        />
        <Divider />
        <StatItem
          icon={Droplets}
          value={tableSummary?.dirty ?? 0}
          label="Dirty"
          iconBg={hasDirty ? 'bg-red-500/10' : 'bg-muted'}
          iconColor={hasDirty ? 'text-red-500' : 'text-muted-foreground'}
          valueColor={hasDirty ? 'text-red-500' : 'text-foreground'}
        />
      </div>
    </div>
  );
}
