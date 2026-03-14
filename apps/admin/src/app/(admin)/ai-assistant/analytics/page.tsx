'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  RefreshCw,
  MessageSquare,
  CheckCircle,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  BookOpen,
  Clock,
  TrendingUp,
  BarChart3,
} from 'lucide-react';
import {
  useAiSupportAnalytics,
  type AiAnalyticsData,
  type AiAnalyticsDailyPoint,
  type AiAnalyticsTierBucket,
  type AiAnalyticsTopScreen,
  type AiAnalyticsTopQuestion,
  type AiAnalyticsFailureCluster,
} from '@/hooks/use-ai-support';

// ── Helpers ────────────────────────────────────────────────────────

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ── KPI Tiles ──────────────────────────────────────────────────────

interface KpiTile {
  label: string;
  value: string;
  icon: typeof MessageSquare;
  color: string;
  bg: string;
  sub?: string;
}

function KpiRow({ data }: { data: AiAnalyticsData }) {
  const tiles: KpiTile[] = [
    {
      label: 'Total Questions',
      value: fmtNum(data.totalQuestions),
      icon: MessageSquare,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/20',
      sub: `${fmtNum(data.answeredCount)} answered`,
    },
    {
      label: 'Answer Rate',
      value: fmtPct(data.answerRate),
      icon: CheckCircle,
      color: data.answerRate >= 80 ? 'text-emerald-400' : 'text-amber-400',
      bg: data.answerRate >= 80 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20',
    },
    {
      label: 'Positive Feedback',
      value: fmtPct(data.positiveFeedbackRate),
      icon: ThumbsUp,
      color: data.positiveFeedbackRate >= 70 ? 'text-emerald-400' : 'text-amber-400',
      bg: data.positiveFeedbackRate >= 70 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20',
    },
    {
      label: 'Negative Feedback',
      value: fmtPct(data.negativeFeedbackRate),
      icon: ThumbsDown,
      color: data.negativeFeedbackRate > 20 ? 'text-red-400' : 'text-slate-300',
      bg: data.negativeFeedbackRate > 20 ? 'bg-red-500/10 border-red-500/20' : 'bg-slate-700/50 border-slate-600/30',
    },
    {
      label: 'Low Confidence',
      value: fmtPct(data.lowConfidenceRate),
      icon: AlertTriangle,
      color: data.lowConfidenceRate > 25 ? 'text-red-400' : data.lowConfidenceRate > 10 ? 'text-amber-400' : 'text-emerald-400',
      bg: data.lowConfidenceRate > 25 ? 'bg-red-500/10 border-red-500/20' : 'bg-slate-700/50 border-slate-600/30',
    },
    {
      label: 'Escalation Rate',
      value: fmtPct(data.escalationRate),
      icon: TrendingUp,
      color: data.escalationRate > 15 ? 'text-red-400' : 'text-slate-300',
      bg: data.escalationRate > 15 ? 'bg-red-500/10 border-red-500/20' : 'bg-slate-700/50 border-slate-600/30',
    },
    {
      label: 'Approved Answer Hit',
      value: fmtPct(data.approvedAnswerHitRate),
      icon: BookOpen,
      color: data.approvedAnswerHitRate >= 50 ? 'text-emerald-400' : 'text-amber-400',
      bg: data.approvedAnswerHitRate >= 50 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20',
      sub: 'T2/T3 tier answers',
    },
    {
      label: 'Median Review Time',
      value: data.medianTimeToReview > 0 ? `${data.medianTimeToReview.toFixed(1)}h` : '—',
      icon: Clock,
      color: 'text-slate-300',
      bg: 'bg-slate-700/50 border-slate-600/30',
      sub: `${fmtNum(data.pendingReviewCount)} pending`,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {tiles.map((tile) => (
        <div key={tile.label} className={`${tile.bg} rounded-lg border p-4`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-slate-500">{tile.label}</p>
            <tile.icon size={14} className={tile.color} aria-hidden="true" />
          </div>
          <p className={`text-2xl font-bold ${tile.color}`}>{tile.value}</p>
          {tile.sub && <p className="text-xs text-slate-500 mt-1">{tile.sub}</p>}
        </div>
      ))}
    </div>
  );
}

// ── Deflection Banner ──────────────────────────────────────────────

function DeflectionBanner({ pct }: { pct: number }) {
  return (
    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-4 py-3 mb-6 flex items-center gap-3">
      <BarChart3 size={18} className="text-indigo-400 shrink-0" aria-hidden="true" />
      <div>
        <span className="text-sm font-semibold text-indigo-300">{fmtPct(pct)} Deflection Estimate</span>
        <span className="text-xs text-slate-400 ml-2">— questions resolved without human escalation</span>
      </div>
    </div>
  );
}

// ── Daily Trend Chart ──────────────────────────────────────────────

const CHART_COLORS = {
  questions: '#6366f1',
  answered: '#10b981',
  lowConfidence: '#f59e0b',
  thumbsDown: '#ef4444',
};

function DailyTrendChart({ data }: { data: AiAnalyticsDailyPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 flex items-center justify-center h-48">
        <p className="text-sm text-slate-500">No trend data for this period</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
      <h3 className="text-sm font-medium text-slate-300 mb-4">Daily Trends</h3>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="gradQ" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.questions} stopOpacity={0.25} />
              <stop offset="95%" stopColor={CHART_COLORS.questions} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradA" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.answered} stopOpacity={0.25} />
              <stop offset="95%" stopColor={CHART_COLORS.answered} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradL" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.lowConfidence} stopOpacity={0.25} />
              <stop offset="95%" stopColor={CHART_COLORS.lowConfidence} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradD" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.thumbsDown} stopOpacity={0.25} />
              <stop offset="95%" stopColor={CHART_COLORS.thumbsDown} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            tickFormatter={(v: string) => v.slice(5)}
            axisLine={{ stroke: '#475569' }}
            tickLine={false}
          />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#cbd5e1', fontSize: 11 }}
            itemStyle={{ fontSize: 11 }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 8 }} />
          <Area type="monotone" dataKey="questions" name="Questions" stroke={CHART_COLORS.questions} fill="url(#gradQ)" strokeWidth={1.5} dot={false} />
          <Area type="monotone" dataKey="answered" name="Answered" stroke={CHART_COLORS.answered} fill="url(#gradA)" strokeWidth={1.5} dot={false} />
          <Area type="monotone" dataKey="lowConfidence" name="Low Confidence" stroke={CHART_COLORS.lowConfidence} fill="url(#gradL)" strokeWidth={1.5} dot={false} />
          <Area type="monotone" dataKey="thumbsDown" name="Thumbs Down" stroke={CHART_COLORS.thumbsDown} fill="url(#gradD)" strokeWidth={1.5} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Source Tier Pie ────────────────────────────────────────────────

const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];

function SourceTierPie({ data }: { data: AiAnalyticsTierBucket[] }) {
  if (data.length === 0) {
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 flex items-center justify-center h-48">
        <p className="text-sm text-slate-500">No source tier data yet</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
      <h3 className="text-sm font-medium text-slate-300 mb-4">Source Tier Distribution</h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="tier"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            itemStyle={{ fontSize: 11 }}
            formatter={(value, name) => [`${value ?? 0} (${data.find((d) => d.tier === name)?.percentage ?? 0}%)`, name ?? '']}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: '#94a3b8' }}
            formatter={(value: string) => {
              const d = data.find((x) => x.tier === value);
              return `${value} (${d?.percentage ?? 0}%)`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Top Screens Table ──────────────────────────────────────────────

function TopScreensTable({ data }: { data: AiAnalyticsTopScreen[] }) {
  const maxCount = data[0]?.count ?? 1;
  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700">
        <h3 className="text-sm font-medium text-slate-300">Top Screens</h3>
      </div>
      {data.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm">No screen data yet</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/50">
              <th className="text-left px-4 py-2 font-medium text-slate-400 text-xs">#</th>
              <th className="text-left px-4 py-2 font-medium text-slate-400 text-xs">Route</th>
              <th className="text-left px-4 py-2 font-medium text-slate-400 text-xs">Module</th>
              <th className="text-right px-4 py-2 font-medium text-slate-400 text-xs">Questions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {data.map((row, i) => (
              <tr key={row.route} className="hover:bg-slate-700/40 transition-colors">
                <td className="px-4 py-2.5 text-slate-500 text-xs">{i + 1}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-slate-200 font-mono truncate max-w-55">{row.route}</span>
                    <div className="h-1 bg-slate-700 rounded-full overflow-hidden w-full max-w-45">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{ width: `${(row.count / maxCount) * 100}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-400">{row.moduleKey}</td>
                <td className="px-4 py-2.5 text-right text-slate-300 text-xs font-mono">{fmtNum(row.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Top Questions Table ────────────────────────────────────────────

function TopQuestionsTable({ data }: { data: AiAnalyticsTopQuestion[] }) {
  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700">
        <h3 className="text-sm font-medium text-slate-300">Top Repeated Questions</h3>
      </div>
      {data.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm">No repeated questions in this period</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/50">
              <th className="text-left px-4 py-2 font-medium text-slate-400 text-xs">#</th>
              <th className="text-left px-4 py-2 font-medium text-slate-400 text-xs">Question</th>
              <th className="text-left px-4 py-2 font-medium text-slate-400 text-xs">Route</th>
              <th className="text-right px-4 py-2 font-medium text-slate-400 text-xs">Count</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {data.map((row, i) => (
              <tr key={i} className="hover:bg-slate-700/40 transition-colors">
                <td className="px-4 py-2.5 text-slate-500 text-xs">{i + 1}</td>
                <td className="px-4 py-2.5 text-xs text-slate-200 max-w-xs">
                  <span className="line-clamp-2">{row.question}</span>
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-400 font-mono truncate max-w-35">{row.route}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className="text-xs font-medium text-indigo-400">{row.count}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Failure Clusters Table ─────────────────────────────────────────

function FailureClustersTable({ data }: { data: AiAnalyticsFailureCluster[] }) {
  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-300">Failure Clusters</h3>
        <span className="text-xs text-slate-500">Grouped by question type + issue tag</span>
      </div>
      {data.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm">No failure clusters detected</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/50">
              <th className="text-left px-4 py-2 font-medium text-slate-400 text-xs">Question Type</th>
              <th className="text-left px-4 py-2 font-medium text-slate-400 text-xs">Issue Tag</th>
              <th className="text-left px-4 py-2 font-medium text-slate-400 text-xs">Primary Screen</th>
              <th className="text-right px-4 py-2 font-medium text-slate-400 text-xs">Count</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {data.map((row, i) => (
              <tr key={i} className="hover:bg-slate-700/40 transition-colors">
                <td className="px-4 py-2.5">
                  <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{row.questionType}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">{row.issueTag}</span>
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-400 font-mono truncate max-w-45">{row.screenRoute}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className="text-xs font-semibold text-red-400">{row.count}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────

type Period = '7d' | '30d' | '90d';

export default function AiAssistantAnalyticsPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const { analytics, isLoading, error, load } = useAiSupportAnalytics(period);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="p-6 max-w-350">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">AI Assistant Analytics</h1>
          <p className="text-sm text-slate-400 mt-1">
            Question volumes, answer quality, feedback signals and failure clusters.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex gap-1">
            {(['7d', '30d', '90d'] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  period === p
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          {/* Refresh */}
          <button
            type="button"
            onClick={refresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 text-slate-200 rounded-lg text-xs hover:bg-slate-600 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} aria-hidden="true" />
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
      {isLoading && !analytics && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-20 bg-slate-800 rounded-lg border border-slate-700 animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-slate-800 rounded-lg border border-slate-700 animate-pulse" />
          <div className="grid grid-cols-2 gap-6">
            <div className="h-48 bg-slate-800 rounded-lg border border-slate-700 animate-pulse" />
            <div className="h-48 bg-slate-800 rounded-lg border border-slate-700 animate-pulse" />
          </div>
        </div>
      )}

      {/* Content */}
      {analytics && (
        <>
          {/* KPI Row */}
          <KpiRow data={analytics} />

          {/* Deflection Banner */}
          <DeflectionBanner pct={analytics.deflectionEstimate} />

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2">
              <DailyTrendChart data={analytics.dailyTrends} />
            </div>
            <div>
              <SourceTierPie data={analytics.sourceTierDistribution} />
            </div>
          </div>

          {/* Tables row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <TopScreensTable data={analytics.topScreens} />
            <TopQuestionsTable data={analytics.topQuestions} />
          </div>

          {/* Failure clusters — full width */}
          <FailureClustersTable data={analytics.failureClusters} />

          {/* Review stats footer */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Reviewed', value: fmtNum(analytics.reviewedCount), color: 'text-emerald-400' },
              { label: 'Pending Review', value: fmtNum(analytics.pendingReviewCount), color: analytics.pendingReviewCount > 20 ? 'text-amber-400' : 'text-slate-300' },
              { label: 'Escalated', value: fmtNum(analytics.escalatedCount), color: analytics.escalatedCount > 0 ? 'text-red-400' : 'text-slate-400' },
              { label: 'Deflection', value: fmtPct(analytics.deflectionEstimate), color: 'text-indigo-400' },
            ].map((stat) => (
              <div key={stat.label} className="bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-3 text-center">
                <p className="text-xs text-slate-500 mb-1">{stat.label}</p>
                <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Empty state */}
      {!isLoading && !analytics && !error && (
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-16 text-center">
          <BarChart3 className="mx-auto h-10 w-10 text-slate-600 mb-3" aria-hidden="true" />
          <p className="text-slate-400 text-sm">No analytics data yet</p>
          <p className="text-xs text-slate-500 mt-1">Data appears once users start interacting with the AI assistant.</p>
        </div>
      )}
    </div>
  );
}
