'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Zap, GitBranch, FileText, Copy, Check, AlertTriangle, Shield, Database } from 'lucide-react';
import { useEvalTurn } from '@/hooks/use-eval';
import { useExampleCrud } from '@/hooks/use-eval-training';
import { PlanViewer } from '@/components/PlanViewer';
import { SqlViewer } from '@/components/SqlViewer';
import { VerdictBadge } from '@/components/VerdictBadge';
import { QualityFlagPills } from '@/components/QualityFlagPills';
import { RatingStars } from '@/components/RatingStars';
import type { AdminVerdict } from '@/types/eval';

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
      title="Copy"
    >
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
    </button>
  );
}

const CATEGORY_OPTIONS = ['sales', 'inventory', 'customer', 'golf', 'comparison', 'trend', 'anomaly'];
const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard'];

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
  const [correctedPlanJson, setCorrectedPlanJson] = useState('');
  const [correctedPlanError, setCorrectedPlanError] = useState('');
  const [showPromoteCorrection, setShowPromoteCorrection] = useState(false);
  const [promoteCategory, setPromoteCategory] = useState('sales');
  const [promoteDifficulty, setPromoteDifficulty] = useState('medium');
  const [promoteCorrectionSuccess, setPromoteCorrectionSuccess] = useState(false);
  const { promoteCorrection } = useExampleCrud();

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

  const handleSaveCorrectedPlan = () => {
    if (!correctedPlanJson.trim()) {
      setCorrectedPlanError('');
      return;
    }
    try {
      JSON.parse(correctedPlanJson);
      setCorrectedPlanError('');
    } catch {
      setCorrectedPlanError('Invalid JSON');
    }
  };

  const handlePromoteCorrection = async () => {
    setIsPromoting(true);
    try {
      await promoteCorrection(turnId, {
        category: promoteCategory,
        difficulty: promoteDifficulty,
      });
      setPromoteCorrectionSuccess(true);
      setShowPromoteCorrection(false);
      setTimeout(() => setPromoteCorrectionSuccess(false), 3000);
      await load();
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
            {isPromoting ? 'Promoting…' : 'Promote LLM Plan'}
          </button>
          <button
            onClick={() => setShowPromoteCorrection(true)}
            disabled={isPromoting || promoteCorrectionSuccess}
            className="flex items-center gap-1.5 text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            <GitBranch size={12} />
            {promoteCorrectionSuccess ? '✓ Promoted' : 'Promote Correction'}
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

          {/* Narrative / AI Response */}
          <div>
            <h2 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
              <FileText size={14} />
              Narrative Response
            </h2>
            {turn.narrative ? (
              <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
                  <span className="text-xs text-slate-400 font-medium">
                    What the user saw
                  </span>
                  <CopyBtn text={turn.narrative} />
                </div>
                <div className="p-4 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                  {turn.narrative}
                </div>
                {turn.responseSections && turn.responseSections.length > 0 && (
                  <div className="px-4 py-2 border-t border-slate-700 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-500">Sections:</span>
                    {turn.responseSections.map((section) => (
                      <span key={section} className="text-xs bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded">
                        {section}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-900 rounded-xl border border-slate-700 p-4">
                <span className="text-sm text-slate-500">No narrative captured for this turn</span>
              </div>
            )}
          </div>

          {/* Clarification */}
          {turn.wasClarification && (
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-yellow-400 mb-2 flex items-center gap-2">
                <AlertTriangle size={14} />
                Clarification Requested
              </h2>
              <p className="text-sm text-slate-300">
                The AI requested clarification instead of executing a query for this turn.
              </p>
            </div>
          )}

          {/* Context snapshot */}
          {turn.contextSnapshot && Object.keys(turn.contextSnapshot).length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
                <Database size={14} />
                Context Snapshot
              </h2>
              <div className="bg-slate-900 rounded-xl border border-slate-700 p-4 font-mono text-xs overflow-auto max-h-40">
                <pre className="text-slate-300">
                  {JSON.stringify(turn.contextSnapshot, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Safety flags */}
          {turn.safetyFlags && turn.safetyFlags.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
                <Shield size={14} />
                Safety Flags
              </h2>
              <div className="flex flex-wrap gap-1">
                {turn.safetyFlags.map((flag) => (
                  <span key={flag} className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded">
                    {flag}
                  </span>
                ))}
              </div>
            </div>
          )}

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

          {/* Corrected Plan Editor */}
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <h2 className="text-sm font-semibold text-white mb-3">Corrected Plan</h2>
            <p className="text-xs text-slate-400 mb-3">
              Paste the corrected plan JSON here. This will be used when promoting to a golden example.
            </p>
            <textarea
              value={correctedPlanJson}
              onChange={(e) => setCorrectedPlanJson(e.target.value)}
              onBlur={handleSaveCorrectedPlan}
              rows={6}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              placeholder='{"metrics": [...], "dimensions": [...], "filters": [...], "dateRange": {...}}'
            />
            {correctedPlanError && (
              <p className="text-xs text-red-400 mt-1">{correctedPlanError}</p>
            )}
          </div>

          {/* Promote Correction Dialog */}
          {showPromoteCorrection && (
            <div className="bg-emerald-900/30 rounded-xl p-5 border border-emerald-700/50">
              <h2 className="text-sm font-semibold text-emerald-300 mb-3">Promote Corrected Plan to Example</h2>
              <p className="text-xs text-slate-400 mb-4">
                This creates a golden example using the admin-corrected plan (not the original LLM plan).
              </p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Category</label>
                  <select
                    value={promoteCategory}
                    onChange={(e) => setPromoteCategory(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Difficulty</label>
                  <select
                    value={promoteDifficulty}
                    onChange={(e) => setPromoteDifficulty(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {DIFFICULTY_OPTIONS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePromoteCorrection}
                  disabled={isPromoting}
                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {isPromoting ? 'Promoting…' : 'Confirm Promote'}
                </button>
                <button
                  onClick={() => setShowPromoteCorrection(false)}
                  className="px-4 py-2 bg-slate-700 text-slate-300 text-xs rounded-lg hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

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
