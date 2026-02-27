'use client';

import { useState, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
  Shield,
  Tag,
  BarChart3,
} from 'lucide-react';
import { useTagHealth, useTagPopulationTrends, useTagOverlapMatrix } from '@/hooks/use-tag-analytics';
import type { TagHealthItem } from '@oppsera/module-customers';

// ── Health Score Badge ──────────────────────────────────────────────

function HealthScoreBadge({ score }: { score: number }) {
  const grade =
    score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
  const color =
    score >= 90
      ? 'text-green-500 bg-green-500/10 ring-green-500/30'
      : score >= 75
        ? 'text-blue-500 bg-blue-500/10 ring-blue-500/30'
        : score >= 60
          ? 'text-amber-500 bg-amber-500/10 ring-amber-500/30'
          : 'text-red-500 bg-red-500/10 ring-red-500/30';

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset ${color}`}>
      <Shield className="h-3.5 w-3.5" />
      {grade} ({score}/100)
    </div>
  );
}

// ── Stat Card ───────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  subLabel,
  accent = 'indigo',
}: {
  icon: typeof Tag;
  label: string;
  value: number | string;
  subLabel?: string;
  accent?: 'indigo' | 'green' | 'amber' | 'purple';
}) {
  const accentColors = {
    indigo: 'text-indigo-500 bg-indigo-500/10',
    green: 'text-green-500 bg-green-500/10',
    amber: 'text-amber-500 bg-amber-500/10',
    purple: 'text-purple-500 bg-purple-500/10',
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <div className={`rounded-md p-1.5 ${accentColors[accent]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {subLabel && (
        <p className="mt-0.5 text-xs text-muted-foreground">{subLabel}</p>
      )}
    </div>
  );
}

// ── Health Item Row ─────────────────────────────────────────────────

function HealthItemRow({ item }: { item: TagHealthItem }) {
  const severityConfig = {
    error: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10' },
    warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    info: { icon: CheckCircle2, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  };

  const cfg = severityConfig[item.severity];
  const SevIcon = cfg.icon;

  return (
    <div className="flex items-start gap-3 rounded-md border border-border px-3 py-2">
      <div className={`mt-0.5 rounded p-1 ${cfg.bg}`}>
        <SevIcon className={`h-3.5 w-3.5 ${cfg.color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{item.tagName}</span>
          {item.ruleName && (
            <span className="text-xs text-muted-foreground">({item.ruleName})</span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${cfg.color} ${cfg.bg} ring-current/30`}>
        {item.type.replace(/_/g, ' ')}
      </span>
    </div>
  );
}

// ── Trend Sparkline (simple SVG) ────────────────────────────────────

function TrendSparkline({
  points,
  color,
}: {
  points: number[];
  color: string;
}) {
  if (points.length < 2) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const w = 120;
  const h = 32;
  const step = w / (points.length - 1);

  const pathParts = points.map((p, i) => {
    const x = i * step;
    const y = h - ((p - min) / range) * (h - 4) - 2;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg width={w} height={h} className="shrink-0">
      <path
        d={pathParts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Population Trend Row ────────────────────────────────────────────

function TrendRow({
  tagName,
  tagColor,
  currentCount,
  previousCount: _previousCount,
  changePercent,
  sparklinePoints,
}: {
  tagName: string;
  tagColor: string;
  currentCount: number;
  previousCount: number;
  changePercent: number;
  sparklinePoints: number[];
}) {
  const isUp = changePercent > 0;
  const isDown = changePercent < 0;

  return (
    <div className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: tagColor }}
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {tagName}
      </span>
      <TrendSparkline points={sparklinePoints} color={tagColor} />
      <span className="w-12 text-right text-sm tabular-nums font-medium text-foreground">
        {currentCount}
      </span>
      <span
        className={`flex w-16 items-center justify-end gap-0.5 text-xs font-medium tabular-nums ${
          isUp ? 'text-green-500' : isDown ? 'text-red-500' : 'text-muted-foreground'
        }`}
      >
        {isUp ? <TrendingUp className="h-3 w-3" /> : isDown ? <TrendingDown className="h-3 w-3" /> : null}
        {changePercent > 0 ? '+' : ''}
        {changePercent}%
      </span>
    </div>
  );
}

// ── Overlap Pair Row ────────────────────────────────────────────────

function OverlapRow({
  tagNameA,
  tagNameB,
  overlapCount,
  overlapPercentA,
  overlapPercentB,
  isRedundant,
}: {
  tagNameA: string;
  tagNameB: string;
  overlapCount: number;
  overlapPercentA: number;
  overlapPercentB: number;
  isRedundant: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
        isRedundant ? 'border-amber-500/30 bg-amber-500/5' : 'border-border'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-sm">
          <span className="font-medium text-foreground">{tagNameA}</span>
          <span className="text-muted-foreground">&amp;</span>
          <span className="font-medium text-foreground">{tagNameB}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{overlapCount} shared</span>
          <span className="text-muted-foreground/50">|</span>
          <span>{overlapPercentA}% of {tagNameA}</span>
          <span className="text-muted-foreground/50">|</span>
          <span>{overlapPercentB}% of {tagNameB}</span>
        </div>
      </div>
      {isRedundant && (
        <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500 ring-1 ring-inset ring-amber-500/30">
          Redundant
        </span>
      )}
    </div>
  );
}

// ── Main Dashboard ──────────────────────────────────────────────────

export function TagDashboard() {
  const { data: health, isLoading: healthLoading } = useTagHealth();
  const { data: trends, isLoading: trendsLoading } = useTagPopulationTrends({ days: 30 });
  const { data: overlap, isLoading: overlapLoading } = useTagOverlapMatrix();

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['health', 'trends']),
  );

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Build sparkline data grouped by tag
  const trendsByTag = useMemo(() => {
    if (!trends) return [];
    const map = new Map<string, {
      tagName: string;
      tagColor: string;
      currentCount: number;
      previousCount: number;
      changePercent: number;
      points: number[];
    }>();

    for (const s of trends.summary) {
      map.set(s.tagId, {
        tagName: s.tagName,
        tagColor: s.tagColor,
        currentCount: s.currentCount,
        previousCount: s.previousCount,
        changePercent: s.changePercent,
        points: [],
      });
    }

    for (const point of trends.trends) {
      const entry = map.get(point.tagId);
      if (entry) entry.points.push(point.count);
    }

    return Array.from(map.values()).sort((a, b) => b.currentCount - a.currentCount);
  }, [trends]);

  if (healthLoading) {
    return <DashboardSkeleton />;
  }

  if (!health) return null;

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Tag} label="Total Tags" value={health.totalTags} subLabel={`${health.activeTags} active`} accent="indigo" />
        <StatCard icon={Zap} label="Smart Rules" value={health.totalRules} subLabel={`${health.activeRules} active`} accent="purple" />
        <StatCard
          icon={Activity}
          label="Recent Activity"
          value={health.recentActivity.reduce((sum, a) => sum + a.count, 0)}
          subLabel="last 7 days"
          accent="green"
        />
        <StatCard
          icon={AlertTriangle}
          label="Health Issues"
          value={health.items.length}
          subLabel={health.items.length === 0 ? 'All clear' : `Score: ${health.overallScore}`}
          accent={health.items.length === 0 ? 'green' : 'amber'}
        />
      </div>

      {/* Health Score */}
      <div className="flex items-center gap-3">
        <HealthScoreBadge score={health.overallScore} />
        {health.items.filter((i) => i.severity === 'error').length > 0 && (
          <span className="text-xs text-red-500">
            {health.items.filter((i) => i.severity === 'error').length} critical issue(s)
          </span>
        )}
      </div>

      {/* Health Issues Section */}
      <CollapsibleSection
        title="Health Issues"
        icon={AlertTriangle}
        count={health.items.length}
        expanded={expandedSections.has('health')}
        onToggle={() => toggleSection('health')}
      >
        {health.items.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/5 px-3 py-3">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-sm text-green-500">No health issues detected</span>
          </div>
        ) : (
          <div className="space-y-2">
            {health.items.map((item, i) => (
              <HealthItemRow key={`${item.tagId}-${item.type}-${i}`} item={item} />
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Population Trends Section */}
      <CollapsibleSection
        title="Population Trends"
        icon={BarChart3}
        count={trendsByTag.length}
        expanded={expandedSections.has('trends')}
        onToggle={() => toggleSection('trends')}
      >
        {trendsLoading ? (
          <SectionSkeleton rows={3} />
        ) : trendsByTag.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No trend data available</p>
        ) : (
          <div className="space-y-2">
            {trendsByTag.slice(0, 10).map((t) => (
              <TrendRow
                key={t.tagName}
                tagName={t.tagName}
                tagColor={t.tagColor}
                currentCount={t.currentCount}
                previousCount={t.previousCount}
                changePercent={t.changePercent}
                sparklinePoints={t.points}
              />
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Overlap Matrix Section */}
      <CollapsibleSection
        title="Tag Overlap"
        icon={Users}
        count={overlap?.overlaps.length ?? 0}
        badge={overlap?.redundantPairs ? `${overlap.redundantPairs} redundant` : undefined}
        expanded={expandedSections.has('overlap')}
        onToggle={() => toggleSection('overlap')}
      >
        {overlapLoading ? (
          <SectionSkeleton rows={3} />
        ) : !overlap || overlap.overlaps.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No tag overlap detected</p>
        ) : (
          <div className="space-y-2">
            {overlap.overlaps.slice(0, 10).map((o) => (
              <OverlapRow
                key={`${o.tagIdA}-${o.tagIdB}`}
                tagNameA={o.tagNameA}
                tagNameB={o.tagNameB}
                overlapCount={o.overlapCount}
                overlapPercentA={o.overlapPercentA}
                overlapPercentB={o.overlapPercentB}
                isRedundant={o.isRedundant}
              />
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Recent Activity */}
      {health.recentActivity.length > 0 && (
        <CollapsibleSection
          title="Recent Activity"
          icon={Activity}
          count={health.recentActivity.length}
          expanded={expandedSections.has('activity')}
          onToggle={() => toggleSection('activity')}
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {health.recentActivity.map((a) => (
              <div
                key={a.action}
                className="rounded-md border border-border px-3 py-2 text-center"
              >
                <p className="text-lg font-semibold tabular-nums text-foreground">{a.count}</p>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {a.action.replace(/_/g, ' ')}
                </p>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

// ── Collapsible Section ─────────────────────────────────────────────

function CollapsibleSection({
  title,
  icon: Icon,
  count,
  badge,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  icon: typeof Tag;
  count: number;
  badge?: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-accent/50"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {count}
        </span>
        {badge && (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
            {badge}
          </span>
        )}
      </button>
      {expanded && <div className="border-t border-border px-4 py-3">{children}</div>}
    </div>
  );
}

// ── Skeletons ───────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-16 animate-pulse rounded bg-muted" />
            </div>
            <div className="mt-3 h-6 w-12 animate-pulse rounded bg-muted" />
            <div className="mt-1 h-3 w-20 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="h-8 w-28 animate-pulse rounded-full bg-muted" />
      <SectionSkeleton rows={3} />
    </div>
  );
}

function SectionSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-md border border-border px-3 py-3">
          <div className="h-4 w-4 animate-pulse rounded bg-muted" />
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="ml-auto h-4 w-16 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
