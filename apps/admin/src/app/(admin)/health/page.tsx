'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  RefreshCw,
  ShoppingCart,
  Users,
  AlertTriangle,
  Inbox,
  Database,
  HardDrive,
  Zap,
  ArrowRight,
  Clock,
  CircleAlert,
  CircleDot,
  Info,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
} from 'recharts';
import { useHealthDashboard } from '@/hooks/use-health-dashboard';
import type { SystemSnapshot, HealthAlert, TopIssue } from '@/hooks/use-health-dashboard';
import { HealthGradePill } from '@/components/health/HealthGradePill';

// ── Helpers ──────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'never';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function useRelativeTime(date: Date | null) {
  if (!date) return 'never';
  return relativeTime(date.toISOString());
}

// ── Sparkline ────────────────────────────────────────────────────

function Sparkline({ data, color = '#6366f1' }: { data: { value: number }[]; color?: string }) {
  if (data.length < 2) return <div className="h-10" />;
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`sparkGrad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          fill={`url(#sparkGrad-${color.replace('#', '')})`}
          strokeWidth={1.5}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Metric Card ──────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
  sparkData,
  sparkColor,
  alert,
}: {
  label: string;
  value: string;
  icon: typeof ShoppingCart;
  color: string;
  sparkData: { value: number }[];
  sparkColor?: string;
  alert?: boolean;
}) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Icon size={15} className={color} />
          <span className="text-sm text-slate-400">{label}</span>
        </div>
        {alert && <CircleAlert size={14} className="text-red-400 animate-pulse" />}
      </div>
      <p className="text-3xl font-bold text-white tabular-nums mb-2">{value}</p>
      <Sparkline data={sparkData} color={sparkColor} />
    </div>
  );
}

// ── Grade Distribution Bars ──────────────────────────────────────

const GRADE_BAR_COLORS: Record<string, string> = {
  A: 'bg-emerald-500',
  B: 'bg-blue-500',
  C: 'bg-amber-500',
  D: 'bg-orange-500',
  F: 'bg-red-500',
};

const GRADE_TEXT_COLORS: Record<string, string> = {
  A: 'text-emerald-400',
  B: 'text-blue-400',
  C: 'text-amber-400',
  D: 'text-orange-400',
  F: 'text-red-400',
};

function GradeDistribution({ grades }: { grades: Record<string, number> }) {
  const total = Object.values(grades).reduce((s, c) => s + c, 0);
  const maxCount = Math.max(...Object.values(grades), 1);

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
      <h3 className="text-sm font-medium text-slate-300 mb-4">Tenant Health Distribution</h3>
      {total === 0 ? (
        <p className="text-sm text-slate-500">No active tenants</p>
      ) : (
        <div className="space-y-3">
          {(['A', 'B', 'C', 'D', 'F'] as const).map((grade) => {
            const count = grades[grade] ?? 0;
            const pct = total > 0 ? (count / maxCount) * 100 : 0;
            return (
              <div key={grade} className="flex items-center gap-3">
                <span className={`w-5 text-sm font-bold ${GRADE_TEXT_COLORS[grade]}`}>{grade}</span>
                <div className="flex-1 h-5 bg-slate-700/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${GRADE_BAR_COLORS[grade]} transition-all duration-500`}
                    style={{ width: `${Math.max(pct, count > 0 ? 3 : 0)}%` }}
                  />
                </div>
                <span className="w-10 text-right text-sm text-slate-300 tabular-nums font-medium">{count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Top Issues ───────────────────────────────────────────────────

function TopIssuesPanel({ issues }: { issues: TopIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Tenants Needing Attention</h3>
        <div className="py-8 text-center">
          <Zap size={20} className="mx-auto text-emerald-500 mb-2" />
          <p className="text-sm text-slate-400">All tenants are healthy</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
      <h3 className="text-sm font-medium text-slate-300 mb-4">Tenants Needing Attention</h3>
      <div className="space-y-3">
        {issues.map((issue) => (
          <Link
            key={issue.tenantId}
            href={`/tenants/${issue.tenantId}`}
            className="block bg-slate-900/50 rounded-lg border border-slate-700/50 p-4 hover:border-slate-600 transition-colors group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <HealthGradePill grade={issue.grade} size="sm" />
                <span className="text-sm font-medium text-white group-hover:text-indigo-400 transition-colors">
                  {issue.tenantName}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span>Score: {issue.score}</span>
                <ArrowRight size={13} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
              </div>
            </div>
            {issue.factors && issue.factors.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {issue.factors.slice(0, 4).map((f, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400"
                    title={f.detail}
                  >
                    {f.factor} ({f.impact > 0 ? `-${f.impact}` : f.impact})
                  </span>
                ))}
                {issue.factors.length > 4 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-500">
                    +{issue.factors.length - 4} more
                  </span>
                )}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── System Resources ─────────────────────────────────────────────

function ProgressBar({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const isHigh = pct > 80;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-slate-400">{label}</span>
        <span className={`text-sm font-medium tabular-nums ${isHigh ? 'text-red-400' : 'text-slate-300'}`}>
          {value} / {max}
        </span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isHigh ? 'bg-red-500' : color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SystemResources({ system }: { system: SystemSnapshot }) {
  const cacheHitPct = system.dbCacheHitPct != null ? Number(system.dbCacheHitPct) : null;
  const cacheIsLow = cacheHitPct != null && cacheHitPct < 95;

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
      <h3 className="text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
        <Database size={14} className="text-slate-400" />
        System Resources
      </h3>
      <div className="space-y-5">
        {/* DB Connections */}
        {system.dbConnectionCount != null && system.dbMaxConnections != null && (
          <ProgressBar
            value={system.dbConnectionCount}
            max={system.dbMaxConnections}
            label="DB Connections"
            color="bg-indigo-500"
          />
        )}

        {/* Cache Hit Rate */}
        {cacheHitPct != null && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm text-slate-400">Cache Hit Rate</span>
              <span className={`text-sm font-medium tabular-nums ${cacheIsLow ? 'text-amber-400' : 'text-slate-300'}`}>
                {cacheHitPct.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${cacheIsLow ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${cacheHitPct}%` }}
              />
            </div>
          </div>
        )}

        {/* DB Size */}
        {system.dbSizeBytes != null && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400 flex items-center gap-2">
              <HardDrive size={13} className="text-slate-500" />
              Database Size
            </span>
            <span className="text-sm font-medium text-slate-300 tabular-nums">
              {formatBytes(system.dbSizeBytes)}
            </span>
          </div>
        )}

        {/* Job Queue */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Queued Jobs</span>
          <span className="text-sm font-medium text-slate-300 tabular-nums">{system.queuedJobs}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Failed Jobs (1h)</span>
          <span className={`text-sm font-medium tabular-nums ${system.failedJobs1h > 0 ? 'text-red-400' : 'text-slate-300'}`}>
            {system.failedJobs1h}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Stuck Consumers</span>
          <span className={`text-sm font-medium tabular-nums ${system.stuckConsumers > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
            {system.stuckConsumers}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Alert Severity ───────────────────────────────────────────────

const ALERT_ICON_COLORS: Record<string, string> = {
  P0: 'text-red-400',
  P1: 'text-amber-400',
  P2: 'text-blue-400',
  P3: 'text-slate-400',
  critical: 'text-red-400',
  warning: 'text-amber-400',
  info: 'text-blue-400',
};

function AlertIcon({ level }: { level: string }) {
  const color = ALERT_ICON_COLORS[level] ?? 'text-slate-400';
  if (level === 'P0' || level === 'critical') return <CircleAlert size={14} className={color} />;
  if (level === 'P1' || level === 'warning') return <AlertTriangle size={14} className={color} />;
  if (level === 'P2' || level === 'info') return <Info size={14} className={color} />;
  return <CircleDot size={14} className={color} />;
}

function AlertsFeed({ alerts }: { alerts: HealthAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Recent Alerts</h3>
        <div className="py-8 text-center">
          <Zap size={20} className="mx-auto text-emerald-500 mb-2" />
          <p className="text-sm text-slate-400">No recent alerts</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
      <h3 className="text-sm font-medium text-slate-300 mb-4">Recent Alerts</h3>
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-slate-900/50 border border-slate-700/50"
          >
            <div className="mt-0.5 shrink-0">
              <AlertIcon level={alert.level} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{alert.title}</p>
              {alert.details && (
                <p className="text-xs text-slate-500 truncate mt-0.5">{alert.details}</p>
              )}
              {alert.tenantId && (
                <Link
                  href={`/tenants/${alert.tenantId}`}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 mt-0.5 inline-block"
                >
                  {alert.tenantId.slice(0, 12)}...
                </Link>
              )}
            </div>
            <div className="shrink-0 flex items-center gap-1.5 text-[10px] text-slate-500">
              <Clock size={10} />
              {relativeTime(alert.sentAt)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────

export default function HealthDashboardPage() {
  const { data, isLoading, error, lastUpdatedAt, refresh } = useHealthDashboard();

  const lastUpdatedText = useRelativeTime(lastUpdatedAt);

  // Build sparkline data from trend (reverse to chronological order)
  const trendChronological = useMemo(
    () => (data?.trend ?? []).slice().reverse(),
    [data?.trend],
  );

  const ordersSpark = useMemo(
    () => trendChronological.map((s) => ({ value: s.totalOrdersToday })),
    [trendChronological],
  );
  const usersSpark = useMemo(
    () => trendChronological.map((s) => ({ value: s.activeUsersToday })),
    [trendChronological],
  );
  const dlqSpark = useMemo(
    () => trendChronological.map((s) => ({ value: s.totalDlqDepth })),
    [trendChronological],
  );
  const errorsSpark = useMemo(
    () => trendChronological.map((s) => ({ value: s.totalErrors1h })),
    [trendChronological],
  );

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">System Health</h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time platform monitoring, tenant grades, and operational alerts.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {lastUpdatedAt && (
            <span className="text-xs text-slate-500 flex items-center gap-1.5">
              <Clock size={11} />
              Last updated: {lastUpdatedText}
            </span>
          )}
          <button
            onClick={refresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 text-slate-200 rounded-lg text-xs hover:bg-slate-600 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-6">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && !data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-slate-800 rounded-xl border border-slate-700 p-5 h-[140px] animate-pulse">
                <div className="h-3 w-20 bg-slate-700 rounded mb-4" />
                <div className="h-7 w-16 bg-slate-700 rounded mb-3" />
                <div className="h-10 w-full bg-slate-700/50 rounded" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[1, 2].map((i) => (
              <div key={i} className="bg-slate-800 rounded-xl border border-slate-700 p-5 h-[300px] animate-pulse">
                <div className="h-3 w-32 bg-slate-700 rounded mb-6" />
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((j) => (
                    <div key={j} className="h-5 bg-slate-700/50 rounded" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      {data && (
        <>
          {/* Top Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <MetricCard
              label="Orders Today"
              value={fmt(data.system?.totalOrdersToday ?? 0)}
              icon={ShoppingCart}
              color="text-blue-400"
              sparkData={ordersSpark}
              sparkColor="#3b82f6"
            />
            <MetricCard
              label="Active Users"
              value={fmt(data.system?.activeUsersToday ?? 0)}
              icon={Users}
              color="text-emerald-400"
              sparkData={usersSpark}
              sparkColor="#10b981"
            />
            <MetricCard
              label="DLQ Depth"
              value={fmt(data.system?.totalDlqDepth ?? 0)}
              icon={Inbox}
              color={(data.system?.totalDlqDepth ?? 0) > 0 ? 'text-red-400' : 'text-slate-400'}
              sparkData={dlqSpark}
              sparkColor={(data.system?.totalDlqDepth ?? 0) > 0 ? '#ef4444' : '#6366f1'}
              alert={(data.system?.totalDlqDepth ?? 0) > 0}
            />
            <MetricCard
              label="Errors (1h)"
              value={fmt(data.system?.totalErrors1h ?? 0)}
              icon={AlertTriangle}
              color={(data.system?.totalErrors1h ?? 0) > 0 ? 'text-amber-400' : 'text-slate-400'}
              sparkData={errorsSpark}
              sparkColor={(data.system?.totalErrors1h ?? 0) > 0 ? '#f59e0b' : '#6366f1'}
              alert={(data.system?.totalErrors1h ?? 0) > 5}
            />
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Left column */}
            <div className="space-y-6">
              <GradeDistribution grades={data.tenantsByGrade} />
              <TopIssuesPanel issues={data.topIssues} />
            </div>

            {/* Right column */}
            <div className="space-y-6">
              {data.system && <SystemResources system={data.system} />}
              <AlertsFeed alerts={data.alerts} />
            </div>
          </div>
        </>
      )}

      {!isLoading && !data && !error && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
          <Database className="mx-auto h-8 w-8 text-slate-600 mb-3" />
          <p className="text-slate-400 text-sm">No health data available</p>
          <p className="text-xs text-slate-500 mt-1">Run the health capture job to populate system metrics.</p>
        </div>
      )}
    </div>
  );
}
