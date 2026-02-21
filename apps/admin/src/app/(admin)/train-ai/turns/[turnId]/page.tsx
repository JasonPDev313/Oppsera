'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Zap } from 'lucide-react';
import { useEvalTurn } from '@/hooks/use-eval';
import { PlanViewer } from '@/components/PlanViewer';
import { SqlViewer } from '@/components/SqlViewer';
import { VerdictBadge } from '@/components/VerdictBadge';
import { QualityFlagPills } from '@/components/QualityFlagPills';
import { RatingStars } from '@/components/RatingStars';
import type { AdminVerdict } from '@/types/eval';

const VERDICT_OPTIONS: { value: AdminVerdict; label: string }[] = [
  { value: 'correct', label: 'Correct' },
  { value: 'incorrect', label: 'Incorrect' },
  { value: 'partial', label: 'Partial' },
  { value: 'clarification_needed', label: 'Needs Clarification' },
];

export default function EvalTurnDetailPage() {
  const { turnId } = useParams<{ turnId: string }>();
  const router = useRouter();
  const { data: turn, isLoading, error, load, submitReview, promote } = useEvalTurn(turnId);

  const [verdict, setVerdict] = useState<AdminVerdict>('correct');
  const [score, setScore] = useState<number>(4);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPromoting, setIsPromoting] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (turn) {
      if (turn.adminVerdict) setVerdict(turn.adminVerdict);
      if (turn.adminScore) setScore(turn.adminScore);
      if (turn.adminNotes) setNotes(turn.adminNotes);
    }
  }, [turn]);

  const handleReview = async () => {
    setIsSubmitting(true);
    try {
      await submitReview({ verdict, score, notes: notes || undefined });
      setReviewSuccess(true);
      setTimeout(() => setReviewSuccess(false), 2000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePromote = async () => {
    setIsPromoting(true);
    try {
      await promote({});
    } finally {
      setIsPromoting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !turn) {
    return (
      <div className="p-6">
        <p className="text-red-400">{error ?? 'Turn not found'}</p>
      </div>
    );
  }

  const confidence = turn.llmConfidence ? Number(turn.llmConfidence) : null;
  const qualityScore = turn.qualityScore ? Number(turn.qualityScore) : null;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to feed
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-slate-500 font-mono">Turn #{turn.turnNumber}</span>
            <span className="text-xs text-slate-600">·</span>
            <span className="text-xs text-slate-500">{turn.userRole}</span>
            <span className="text-xs text-slate-600">·</span>
            <span className="text-xs text-slate-500 font-mono">{turn.tenantId.slice(0, 12)}…</span>
          </div>
          <h1 className="text-xl font-bold text-white">{turn.userMessage}</h1>
          <p className="text-xs text-slate-500 mt-1">{new Date(turn.createdAt).toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-3">
          <VerdictBadge verdict={turn.adminVerdict} />
          <button
            onClick={handlePromote}
            disabled={isPromoting}
            className="flex items-center gap-1.5 text-xs bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            <Zap size={12} />
            {isPromoting ? 'Promoting…' : 'Promote to Example'}
          </button>
        </div>
      </div>

      {/* Quality flags */}
      <div className="mb-6">
        <QualityFlagPills flags={turn.qualityFlags} />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
              <p className="text-xs text-slate-400">Confidence</p>
              <p className="text-lg font-bold text-white">
                {confidence !== null ? `${Math.round(confidence * 100)}%` : '—'}
              </p>
            </div>
            <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
              <p className="text-xs text-slate-400">Exec Time</p>
              <p className="text-lg font-bold text-white">
                {turn.executionTimeMs !== null ? `${turn.executionTimeMs}ms` : '—'}
              </p>
            </div>
            <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
              <p className="text-xs text-slate-400">Quality</p>
              <p className="text-lg font-bold text-white">
                {qualityScore !== null ? `${Math.round(qualityScore * 100)}%` : '—'}
              </p>
            </div>
          </div>

          {/* LLM Plan */}
          <div>
            <h2 className="text-sm font-semibold text-slate-300 mb-2">LLM Response</h2>
            <PlanViewer plan={turn.llmPlan} rationale={turn.llmRationale} />
          </div>

          {/* SQL */}
          <div>
            <h2 className="text-sm font-semibold text-slate-300 mb-2">Compiled SQL</h2>
            <SqlViewer sql={turn.compiledSql} errors={turn.compilationErrors} />
          </div>

          {/* User feedback */}
          {(turn.userRating !== null || turn.userFeedbackText) && (
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <h2 className="text-sm font-semibold text-slate-300 mb-3">User Feedback</h2>
              {turn.userRating !== null && (
                <div className="flex items-center gap-2 mb-2">
                  <RatingStars value={turn.userRating} />
                  <span className="text-xs text-slate-400">{turn.userRating}/5</span>
                </div>
              )}
              {turn.userFeedbackText && (
                <p className="text-sm text-slate-300 italic">"{turn.userFeedbackText}"</p>
              )}
              {turn.userFeedbackTags && turn.userFeedbackTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {turn.userFeedbackTags.map((tag) => (
                    <span key={tag} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column — Admin review */}
        <div className="space-y-5">
          {/* Result sample */}
          {turn.resultSample && turn.resultSample.length > 0 && (
            <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
              <div className="px-4 py-2 border-b border-slate-700">
                <span className="text-xs text-slate-400 font-medium">
                  Result Sample ({turn.rowCount} rows total)
                </span>
              </div>
              <div className="p-4 overflow-auto max-h-48">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="text-slate-500">
                      {Object.keys(turn.resultSample[0]!).map((col) => (
                        <th key={col} className="text-left pr-4 pb-1 font-medium">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {turn.resultSample.slice(0, 5).map((row, i) => (
                      <tr key={i} className="text-slate-300">
                        {Object.values(row).map((val, j) => (
                          <td key={j} className="pr-4 py-0.5">{String(val ?? 'null')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Admin review form */}
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <h2 className="text-sm font-semibold text-white mb-4">Admin Review</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Verdict</label>
                <div className="flex flex-wrap gap-2">
                  {VERDICT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setVerdict(opt.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        verdict === opt.value
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Admin Score</label>
                <RatingStars value={score} onChange={setScore} size={20} />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder="Internal notes about this turn…"
                />
              </div>

              <button
                onClick={handleReview}
                disabled={isSubmitting}
                className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  reviewSuccess
                    ? 'bg-emerald-600 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800 text-white disabled:cursor-not-allowed'
                }`}
              >
                {reviewSuccess ? '✓ Saved' : isSubmitting ? 'Saving…' : 'Save Review'}
              </button>
            </div>
          </div>

          {/* Metadata */}
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 space-y-2 text-xs">
            <h2 className="text-sm font-semibold text-slate-300 mb-3">Metadata</h2>
            <Row label="LLM" value={`${turn.llmProvider} / ${turn.llmModel}`} />
            <Row label="Tokens" value={`${turn.llmTokensInput}↑ ${turn.llmTokensOutput}↓`} />
            <Row label="LLM latency" value={`${turn.llmLatencyMs}ms`} />
            <Row label="Cache" value={turn.cacheStatus ?? '—'} />
            <Row label="Session" value={turn.sessionId} mono />
            {turn.narrativeLensId && <Row label="Lens" value={turn.narrativeLensId} />}
            {turn.tablesAccessed && turn.tablesAccessed.length > 0 && (
              <Row label="Tables" value={turn.tablesAccessed.join(', ')} />
            )}
            {turn.playbooksFired && turn.playbooksFired.length > 0 && (
              <Row label="Playbooks" value={turn.playbooksFired.join(', ')} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className={`text-slate-300 text-right ${mono ? 'font-mono' : ''} break-all`}>{value}</span>
    </div>
  );
}
