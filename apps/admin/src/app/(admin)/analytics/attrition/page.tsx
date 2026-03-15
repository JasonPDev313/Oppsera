'use client';

import { useState, useEffect } from 'react';
import {
  RefreshCw,
  Zap,
  TrendingDown,
  ChevronDown,
  ChevronRight,
  Filter,
  Eye,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Users,
  Activity,
  LogIn,
  Layers,
  ShieldAlert,
  Clock,
  Compass,
  ArrowUp,
  ArrowDown,
  Minus,
} from 'lucide-react';
import Link from 'next/link';
import {
  useAttritionList,
  useAttritionMutations,
} from '@/hooks/use-analytics';
import type { AttritionScore } from '@/hooks/use-analytics';

// ── Constants ────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'actioned', label: 'Actioned' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'all', label: 'All' },
];

const RISK_OPTIONS = [
  { value: '', label: 'All Risks' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const SIGNAL_META: Record<string, { label: string; icon: typeof TrendingDown; color: string }> = {
  loginDecline: { label: 'Login Decline', icon: LogIn, color: 'text-rose-400' },
  usageDecline: { label: 'Usage Decline', icon: TrendingDown, color: 'text-orange-400' },
  moduleAbandonment: { label: 'Module Abandon', icon: Layers, color: 'text-amber-400' },
  userShrinkage: { label: 'User Shrinkage', icon: Users, color: 'text-yellow-400' },
  errorFrustration: { label: 'Error Frustration', icon: ShieldAlert, color: 'text-red-400' },
  breadthNarrowing: { label: 'Breadth Narrowing', icon: Activity, color: 'text-purple-400' },
  staleness: { label: 'Staleness', icon: Clock, color: 'text-slate-400' },
  onboardingStall: { label: 'Onboarding Stall', icon: Compass, color: 'text-cyan-400' },
};

// ── Badges ───────────────────────────────────────────────────────

function RiskBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    critical: 'bg-red-500/10 text-red-400 border-red-500/30',
    high: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    medium: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium border ${styles[level] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/30'}`}>
      {level}
    </span>
  );
}

function ScoreRing({ score }: { score: number }) {
  // Display as health score (higher = better): 100 - riskScore
  const health = 100 - score;
  const color =
    health >= 70 ? 'text-emerald-400' :
    health >= 50 ? 'text-amber-400' :
    health >= 25 ? 'text-orange-400' :
    'text-red-400';
  const bg =
    health >= 70 ? 'bg-emerald-500/10 border-emerald-500/30' :
    health >= 50 ? 'bg-amber-500/10 border-amber-500/30' :
    health >= 25 ? 'bg-orange-500/10 border-orange-500/30' :
    'bg-red-500/10 border-red-500/30';
  return (
    <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full border ${bg}`}>
      <span className={`text-sm font-bold ${color}`}>{health}</span>
    </div>
  );
}

function SignalBar({ label, score, icon: Icon, color }: { label: string; score: number; icon: typeof TrendingDown; color: string }) {
  const barColor =
    score >= 75 ? 'bg-red-500' :
    score >= 50 ? 'bg-orange-500' :
    score >= 30 ? 'bg-amber-500' :
    'bg-emerald-500';
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon size={12} className={color} />
      <span className="w-28 text-slate-400 truncate">{label}</span>
      <div className="flex-1 bg-slate-700 rounded-full h-1.5">
        <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="w-7 text-right text-slate-500">{score}</span>
    </div>
  );
}

function NeverActiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-slate-500/10 text-slate-400 border border-slate-500/30">
      <Clock size={10} />
      Never Active
    </span>
  );
}

function TrendArrow({ current, previous }: { current: number; previous: number | null }) {
  if (previous == null) return null;
  // Compare health scores (100 - risk), so improving health = good
  const currentHealth = 100 - current;
  const previousHealth = 100 - previous;
  const delta = currentHealth - previousHealth;
  if (Math.abs(delta) < 3) {
    return <Minus size={12} className="text-slate-500" />;
  }
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400" title={`+${delta} from last run`}>
        <ArrowUp size={12} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-red-400" title={`${delta} from last run`}>
      <ArrowDown size={12} />
    </span>
  );
}

// ── Stats Cards ──────────────────────────────────────────────────

function RiskStats({ stats }: { stats: { critical: number; high: number; medium: number; low: number; open: number } }) {
  const cards = [
    { label: 'Critical', value: stats.critical, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
    { label: 'High', value: stats.high, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
    { label: 'Medium', value: stats.medium, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    { label: 'Low', value: stats.low, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  ];
  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      {cards.map((c) => (
        <div key={c.label} className={`${c.bg} rounded-lg border p-4`}>
          <p className="text-xs font-medium text-slate-500">{c.label} Risk</p>
          <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Expandable Row ───────────────────────────────────────────────

function AttritionRow({
  item,
  expanded,
  onToggle,
  onAction,
  isActing,
}: {
  item: AttritionScore;
  expanded: boolean;
  onToggle: () => void;
  onAction: (id: string, status: 'reviewed' | 'actioned' | 'dismissed', notes?: string) => void;
  isActing: boolean;
}) {
  const [notes, setNotes] = useState('');
  const fireAction = (id: string, status: 'reviewed' | 'actioned' | 'dismissed', n?: string) => {
    onAction(id, status, n);
    setNotes('');
  };

  const signalScores: [string, number][] = [
    ['loginDecline', item.loginDeclineScore],
    ['usageDecline', item.usageDeclineScore],
    ['moduleAbandonment', item.moduleAbandonmentScore],
    ['userShrinkage', item.userShrinkageScore],
    ['errorFrustration', item.errorFrustrationScore],
    ['breadthNarrowing', item.breadthNarrowingScore],
    ['staleness', item.stalenessScore],
    ['onboardingStall', item.onboardingStallScore],
  ];

  // Top 3 signals for inline display
  const topSignals = [...signalScores]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .filter(([, s]) => s > 0);

  return (
    <>
      <tr
        className="hover:bg-slate-700/50 transition-colors cursor-pointer"
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        role="button"
        tabIndex={0}
      >
        <td className="px-4 py-3">
          {expanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <ScoreRing score={item.overallScore} />
            <TrendArrow current={item.overallScore} previous={item.previousScore} />
          </div>
        </td>
        <td className="px-4 py-3"><RiskBadge level={item.riskLevel} /></td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Link
              href={`/tenants/${item.tenantId}`}
              className="text-sm text-slate-200 font-medium hover:text-indigo-400 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {item.tenantName}
            </Link>
            {!item.lastActivityAt && <NeverActiveBadge />}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {item.industry ?? 'general'} &middot; {item.totalLocations} loc &middot; {item.totalUsers} users &middot; {item.activeModules} modules
          </p>
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {topSignals.map(([key, score]) => {
              const meta = SIGNAL_META[key];
              return (
                <span key={key} className="inline-flex items-center gap-1 bg-slate-700/50 rounded px-1.5 py-0.5 text-[10px] text-slate-400">
                  {meta && <meta.icon size={10} className={meta.color} />}
                  {score}
                </span>
              );
            })}
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-slate-500">
          {item.lastActivityAt
            ? new Date(item.lastActivityAt).toLocaleDateString()
            : 'Never'}
        </td>
        <td className="px-4 py-3 text-xs text-slate-500">
          {new Date(item.scoredAt).toLocaleDateString()}
        </td>
        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
          {(item.status === 'open' || item.status === 'reviewed') && (
            <div className="flex items-center justify-end gap-1">
              {item.status === 'open' && (
                <button
                  onClick={() => onAction(item.id, 'reviewed')}
                  disabled={isActing}
                  className="p-1.5 rounded hover:bg-slate-600 text-amber-400 hover:text-amber-300 transition-colors"
                  title="Mark as Reviewed"
                  aria-label="Mark as Reviewed"
                >
                  <Eye size={14} />
                </button>
              )}
              <button
                onClick={() => onAction(item.id, 'actioned')}
                disabled={isActing}
                className="p-1.5 rounded hover:bg-slate-600 text-emerald-400 hover:text-emerald-300 transition-colors"
                title="Mark as Actioned"
                aria-label="Mark as Actioned"
              >
                <CheckCircle size={14} />
              </button>
              <button
                onClick={() => onAction(item.id, 'dismissed')}
                disabled={isActing}
                className="p-1.5 rounded hover:bg-slate-600 text-slate-400 hover:text-slate-300 transition-colors"
                title="Dismiss"
                aria-label="Dismiss"
              >
                <XCircle size={14} />
              </button>
            </div>
          )}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-slate-800/50">
          <td colSpan={8} className="px-8 py-5">
            <div className="grid grid-cols-2 gap-6">
              {/* Left: Signal Breakdown */}
              <div>
                <h4 className="text-xs font-semibold text-slate-300 mb-3 uppercase tracking-wider">Signal Breakdown</h4>
                <div className="space-y-2">
                  {signalScores.map(([key, score]) => {
                    const meta = SIGNAL_META[key];
                    if (!meta) return null;
                    return (
                      <SignalBar
                        key={key}
                        label={meta.label}
                        score={score}
                        icon={meta.icon}
                        color={meta.color}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Right: Narrative */}
              <div>
                <h4 className="text-xs font-semibold text-slate-300 mb-3 uppercase tracking-wider">Risk Narrative</h4>
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                  <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                    {item.narrative || 'No narrative generated.'}
                  </pre>
                </div>

                {/* Health + Status context */}
                <div className="mt-3 flex gap-4 text-[10px] text-slate-500">
                  {item.healthGrade && <span>Health: {item.healthGrade}</span>}
                  <span>Status: {item.tenantStatus}</span>
                  {item.reviewedBy && <span>Reviewed by: {item.reviewedBy}</span>}
                </div>

                {/* Review notes */}
                {item.reviewNotes && (
                  <div className="mt-3 bg-slate-900/50 rounded-lg p-3">
                    <p className="text-xs font-medium text-slate-400 mb-1">Review Notes</p>
                    <p className="text-xs text-slate-300">{item.reviewNotes}</p>
                  </div>
                )}

                {/* Inline review */}
                {(item.status === 'open' || item.status === 'reviewed') && (
                  <div className="mt-3 flex gap-2 items-end">
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add notes before acting..."
                      aria-label="Review notes"
                      className="flex-1 bg-slate-900 text-slate-200 rounded-lg px-3 py-2 text-xs border border-slate-600 placeholder:text-slate-500"
                      onClick={(e) => e.stopPropagation()}
                    />
                    {item.status === 'open' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          fireAction(item.id, 'reviewed', notes);
                        }}
                        disabled={isActing}
                        className="px-3 py-2 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-500 transition-colors"
                      >
                        Review
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        fireAction(item.id, 'actioned', notes);
                      }}
                      disabled={isActing}
                      className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-500 transition-colors"
                    >
                      Actioned
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        fireAction(item.id, 'dismissed', notes);
                      }}
                      disabled={isActing}
                      className="px-3 py-2 bg-slate-600 text-white rounded-lg text-xs font-medium hover:bg-slate-500 transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────

export default function AttritionPage() {
  const [statusFilter, setStatusFilter] = useState('open');
  const [riskFilter, setRiskFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scoreMsg, setScoreMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data, isLoading, error, loadMore, refresh } = useAttritionList({
    status: statusFilter || undefined,
    riskLevel: riskFilter || undefined,
  });
  const { updateStatus, runScoring, isActing, mutationError } = useAttritionMutations();

  const handleAction = async (id: string, status: 'reviewed' | 'actioned' | 'dismissed', notes?: string) => {
    const ok = await updateStatus(id, status, notes);
    if (ok) refresh();
  };

  const handleScore = async () => {
    setScoreMsg(null);
    const result = await runScoring();
    if ('error' in result) {
      setScoreMsg({ type: 'error', text: `Scoring failed: ${result.error}` });
    } else {
      const errSuffix = result.errors > 0 ? ` (${result.errors} failed)` : '';
      const da = result.dataAvailability;
      const sparse = da && da.totalTenants > 0 && (da.usageTenants === 0 || da.loginTenants === 0);
      const dataSuffix = sparse
        ? ` Warning: ${da.usageTenants}/${da.totalTenants} tenants have usage data, ${da.loginTenants}/${da.totalTenants} have login data.`
        : '';
      setScoreMsg({
        type: result.errors > 0 || sparse ? 'error' : 'success',
        text: `Scored ${result.scored} tenant${result.scored !== 1 ? 's' : ''} in ${((result.elapsedMs ?? 0) / 1000).toFixed(1)}s. ${result.highRisk} at high risk or above.${errSuffix}${dataSuffix}`,
      });
      refresh();
    }
  };

  // Auto-dismiss score feedback after 8 seconds (longer to read data warnings)
  useEffect(() => {
    if (!scoreMsg) return;
    const timer = setTimeout(() => setScoreMsg(null), scoreMsg.type === 'error' ? 12000 : 5000);
    return () => clearTimeout(timer);
  }, [scoreMsg]);

  return (
    <div className="p-6 max-w-350">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <AlertTriangle size={22} className="text-amber-400" />
            Attrition Risk Monitor
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Health scoring across 8 signals — higher is better. Identify tenants at risk before they churn.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleScore}
            disabled={isActing}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50"
          >
            <Zap size={13} />
            Run Scoring
          </button>
          <button
            onClick={refresh}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 text-slate-200 rounded-lg text-xs hover:bg-slate-600 transition-colors"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      {data?.stats && <RiskStats stats={data.stats} />}

      {/* Score feedback */}
      {scoreMsg && (
        <div className={`${scoreMsg.type === 'error' ? 'bg-red-500/10 border-red-500/30' : 'bg-emerald-500/10 border-emerald-500/30'} border rounded-lg px-4 py-3 mb-4 flex items-center justify-between`}>
          <p className={`text-sm ${scoreMsg.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>{scoreMsg.text}</p>
          <button onClick={() => setScoreMsg(null)} className="text-slate-400 hover:text-slate-300 text-xs ml-4">Dismiss</button>
        </div>
      )}

      {/* Mutation error */}
      {mutationError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-4">
          <p className="text-sm text-red-400">Action failed: {mutationError}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-6">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Filter size={14} className="text-slate-400" />
        <div className="flex gap-1">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setStatusFilter(opt.value); setExpandedId(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === opt.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <select
          value={riskFilter}
          onChange={(e) => { setRiskFilter(e.target.value); setExpandedId(null); }}
          className="bg-slate-700 text-slate-200 rounded-lg px-3 py-1.5 text-xs border border-slate-600"
        >
          {RISK_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading && !data ? (
        <div className="text-center py-16 text-slate-400">Loading attrition scores...</div>
      ) : !data?.items?.length ? (
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-12 text-center">
          <TrendingDown className="mx-auto h-8 w-8 text-slate-600 mb-3" />
          <p className="text-slate-300 font-medium">No attrition scores yet</p>
          <p className="text-xs text-slate-500 mt-1">
            Click &quot;Run Scoring&quot; to analyze all active tenants and generate risk scores.
          </p>
        </div>
      ) : (
        <div className={`bg-slate-800 rounded-lg border border-slate-700 overflow-hidden relative ${isLoading ? 'opacity-60' : ''}`}>
          {isLoading && data && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/20 z-10">
              <p className="text-sm text-slate-400">Updating...</p>
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="w-8 px-4 py-3" />
                <th className="text-left px-4 py-3 font-medium text-slate-400">Health</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Risk</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Tenant</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Top Signals</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Last Active</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Scored</th>
                <th className="text-right px-4 py-3 font-medium text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {data.items.map((item) => (
                <AttritionRow
                  key={item.id}
                  item={item}
                  expanded={expandedId === item.id}
                  onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  onAction={handleAction}
                  isActing={isActing}
                />
              ))}
            </tbody>
          </table>
          {data.hasMore && (
            <div className="px-4 py-3 border-t border-slate-700 text-center">
              <button
                onClick={loadMore}
                disabled={isLoading}
                className="text-sm text-indigo-400 hover:text-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
