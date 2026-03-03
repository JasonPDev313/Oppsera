'use client';

import {
  ShoppingCart,
  Users,
  AlertTriangle,
  Inbox,
  BookOpen,
  FolderOpen,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
} from 'recharts';
import { useTenantHealth } from '@/hooks/use-tenant-health';
import type { TenantHealthSnapshot } from '@/hooks/use-tenant-health';
import { HealthGradePill } from '@/components/health/HealthGradePill';

// ── Helpers ──────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── Grade Factor List ────────────────────────────────────────────

function GradeFactors({ factors }: { factors: TenantHealthSnapshot['gradeFactors'] }) {
  if (!factors || factors.length === 0) {
    return <p className="text-xs text-slate-500">No deductions — perfect score</p>;
  }
  return (
    <div className="space-y-2">
      {factors.map((f, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="shrink-0 text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full tabular-nums">
            {f.impact > 0 ? `-${f.impact}` : f.impact}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-300">{f.factor}</p>
            <p className="text-[11px] text-slate-500 truncate">{f.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Score Chart ──────────────────────────────────────────────────

function ScoreChart({ snapshots }: { snapshots: TenantHealthSnapshot[] }) {
  if (snapshots.length < 2) {
    return (
      <div className="h-[160px] flex items-center justify-center">
        <p className="text-xs text-slate-500">Insufficient data for chart (need 2+ snapshots)</p>
      </div>
    );
  }

  const chartData = snapshots.map((s) => ({
    date: formatDate(s.capturedAt),
    score: s.healthScore,
  }));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: '#64748b' }}
          axisLine={{ stroke: '#334155' }}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 10, fill: '#64748b' }}
          axisLine={{ stroke: '#334155' }}
          tickLine={false}
        />
        {/* Grade band reference lines */}
        <ReferenceLine y={90} stroke="#10b981" strokeDasharray="3 3" strokeOpacity={0.3} />
        <ReferenceLine y={75} stroke="#3b82f6" strokeDasharray="3 3" strokeOpacity={0.3} />
        <ReferenceLine y={60} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.3} />
        <ReferenceLine y={40} stroke="#f97316" strokeDasharray="3 3" strokeOpacity={0.3} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '0.5rem',
            fontSize: '12px',
          }}
          labelStyle={{ color: '#94a3b8' }}
          itemStyle={{ color: '#e2e8f0' }}
        />
        <Line
          type="monotone"
          dataKey="score"
          stroke="#6366f1"
          strokeWidth={2}
          dot={{ fill: '#6366f1', r: 3 }}
          activeDot={{ fill: '#818cf8', r: 5 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Mini Metric ──────────────────────────────────────────────────

function MiniMetric({
  label,
  value,
  icon: Icon,
  color,
  alert,
}: {
  label: string;
  value: number;
  icon: typeof ShoppingCart;
  color: string;
  alert?: boolean;
}) {
  return (
    <div className="bg-slate-900/50 rounded-lg border border-slate-700/50 p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className={color} />
        <span className="text-[10px] text-slate-500">{label}</span>
      </div>
      <p className={`text-lg font-bold tabular-nums ${alert ? 'text-red-400' : 'text-white'}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

export function TenantHealthCard({ tenantId }: { tenantId: string }) {
  const { history, isLoading, error } = useTenantHealth(tenantId);

  if (isLoading) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 animate-pulse">
        <div className="h-4 w-32 bg-slate-700 rounded mb-4" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-[160px] bg-slate-700/50 rounded" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-6 bg-slate-700/50 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
        <p className="text-sm text-red-400">Failed to load health data: {error}</p>
      </div>
    );
  }

  if (!history || history.snapshots.length === 0) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <h3 className="text-sm font-medium text-slate-300 mb-2">Health Status</h3>
        <p className="text-xs text-slate-500">No health snapshots available yet. Data appears after the first capture job runs.</p>
      </div>
    );
  }

  const latest = history.snapshots[history.snapshots.length - 1]!;

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-medium text-slate-300">Health Status</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">Score: {latest.healthScore}/100</span>
          <HealthGradePill grade={latest.healthGrade} size="md" />
        </div>
      </div>

      {/* Main layout: chart + factors side-by-side on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        {/* Score trend chart */}
        <div>
          <p className="text-xs text-slate-500 mb-2">7-Day Score Trend</p>
          <ScoreChart snapshots={history.snapshots} />
          <div className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1 text-[10px] text-slate-500">
              <span className="w-3 h-px bg-emerald-500 inline-block" /> A (90+)
            </span>
            <span className="flex items-center gap-1 text-[10px] text-slate-500">
              <span className="w-3 h-px bg-blue-500 inline-block" /> B (75+)
            </span>
            <span className="flex items-center gap-1 text-[10px] text-slate-500">
              <span className="w-3 h-px bg-amber-500 inline-block" /> C (60+)
            </span>
            <span className="flex items-center gap-1 text-[10px] text-slate-500">
              <span className="w-3 h-px bg-orange-500 inline-block" /> D (40+)
            </span>
          </div>
        </div>

        {/* Grade factors */}
        <div>
          <p className="text-xs text-slate-500 mb-2">Score Factors</p>
          <GradeFactors factors={latest.gradeFactors} />
        </div>
      </div>

      {/* Key metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MiniMetric
          label="Orders 24h"
          value={latest.orders24h}
          icon={ShoppingCart}
          color="text-blue-400"
        />
        <MiniMetric
          label="Active Users 24h"
          value={latest.activeUsers24h}
          icon={Users}
          color="text-emerald-400"
        />
        <MiniMetric
          label="Errors 1h"
          value={latest.errorCount1h}
          icon={AlertTriangle}
          color="text-amber-400"
          alert={latest.errorCount1h > 0}
        />
        <MiniMetric
          label="DLQ Depth"
          value={latest.dlqDepth}
          icon={Inbox}
          color="text-red-400"
          alert={latest.dlqDepth > 0}
        />
        <MiniMetric
          label="Unposted GL"
          value={latest.unpostedGlEntries}
          icon={BookOpen}
          color="text-purple-400"
          alert={latest.unpostedGlEntries > 0}
        />
        <MiniMetric
          label="Open Batches"
          value={latest.openCloseBatches}
          icon={FolderOpen}
          color="text-cyan-400"
          alert={latest.openCloseBatches > 0}
        />
      </div>
    </div>
  );
}
