'use client';

import { useState } from 'react';
import {
  CheckCircle,
  Edit2,
  XCircle,
  BookOpen,
  ThumbsDown,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react';
import {
  useReviewQueue,
  submitReview,
  type ReviewQueueItem,
  type SubmitReviewInput,
} from '@/hooks/use-ai-support';

// ── Confidence + Status Badges ────────────────────────────────────

function ConfidenceBadge({ level }: { level: string | null }) {
  if (!level) return null;
  const colors: Record<string, string> = {
    high: 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
    medium: 'bg-amber-900/50 text-amber-300 border-amber-700',
    low: 'bg-red-900/50 text-red-300 border-red-700',
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium border ${colors[level] ?? 'bg-slate-800 text-slate-400 border-slate-700'}`}
    >
      {level}
    </span>
  );
}

function ReviewStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-slate-500 italic">unreviewed</span>;
  const colors: Record<string, string> = {
    approved: 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
    edited: 'bg-blue-900/50 text-blue-300 border-blue-700',
    rejected: 'bg-red-900/50 text-red-300 border-red-700',
    needs_kb_update: 'bg-amber-900/50 text-amber-300 border-amber-700',
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium border ${colors[status] ?? 'bg-slate-800 text-slate-400 border-slate-700'}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ── Review Item Card ──────────────────────────────────────────────

function ReviewCard({
  item,
  onReviewed,
}: {
  item: ReviewQueueItem;
  onReviewed: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showEditArea, setShowEditArea] = useState(false);
  const [correctedAnswer, setCorrectedAnswer] = useState('');
  const [questionNormalized, setQuestionNormalized] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(item.reviewStatus);

  async function handleSubmit(reviewStatus: SubmitReviewInput['reviewStatus']) {
    if (reviewStatus === 'edited' && !correctedAnswer.trim()) {
      setSubmitError('Corrected answer is required for edited status.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitReview({
        messageId: item.messageId,
        threadId: item.threadId,
        reviewStatus,
        correctedAnswer: reviewStatus === 'edited' ? correctedAnswer.trim() : null,
        questionNormalized: questionNormalized.trim() || null,
        moduleKey: null,
      });
      setSubmitted(reviewStatus);
      onReviewed();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  }

  const isReviewed = submitted !== null && submitted !== 'unreviewed';

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <ConfidenceBadge level={item.answerConfidence} />
            {item.feedbackRating === 'down' && (
              <span className="flex items-center gap-1 text-xs text-red-400 border border-red-700 bg-red-900/30 px-2 py-0.5 rounded-full">
                <ThumbsDown size={11} />
                thumbs down
              </span>
            )}
            <ReviewStatusBadge status={submitted} />
            {item.sourceTierUsed && (
              <span className="text-xs text-slate-500 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">
                {item.sourceTierUsed}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-200 line-clamp-2">{item.messageText}</p>
          {item.feedbackComment && (
            <p className="mt-1 text-xs text-slate-400 italic">
              User note: &quot;{item.feedbackComment}&quot;
            </p>
          )}
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          className="shrink-0 p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-5 pb-4 border-t border-slate-800">
          <div className="mt-4 space-y-4">
            {/* Full message */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Full Answer
              </p>
              <div className="bg-slate-950 rounded p-3 text-sm text-slate-300 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                {item.messageText}
              </div>
            </div>

            {/* Context */}
            <div className="grid grid-cols-2 gap-3 text-xs text-slate-400">
              <div>
                <span className="font-semibold text-slate-500">Tenant:</span>{' '}
                <span className="text-slate-300">{item.tenantId}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500">Thread:</span>{' '}
                <span className="text-slate-300 font-mono">{item.threadId.slice(0, 12)}…</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500">Asked:</span>{' '}
                <span className="text-slate-300">
                  {new Date(item.createdAt).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="font-semibold text-slate-500">Source tier:</span>{' '}
                <span className="text-slate-300">{item.sourceTierUsed ?? '—'}</span>
              </div>
            </div>

            {/* Corrected answer textarea */}
            {!isReviewed && showEditArea && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Corrected Answer
                </label>
                <textarea
                  value={correctedAnswer}
                  onChange={(e) => setCorrectedAnswer(e.target.value)}
                  rows={6}
                  placeholder="Enter the corrected answer (supports Markdown)…"
                  className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-sm text-slate-200 font-mono resize-y focus:outline-none focus:border-indigo-500"
                />
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Normalized Question (for memory)
                </label>
                <input
                  value={questionNormalized}
                  onChange={(e) => setQuestionNormalized(e.target.value)}
                  type="text"
                  placeholder="e.g. how do i add a product to the catalog?"
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            {!isReviewed && !showEditArea && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Normalized Question (optional — promotes to answer memory)
                </label>
                <input
                  value={questionNormalized}
                  onChange={(e) => setQuestionNormalized(e.target.value)}
                  type="text"
                  placeholder="e.g. how do i void a transaction?"
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            {submitError && (
              <p className="text-sm text-red-400 flex items-center gap-1.5">
                <AlertCircle size={14} />
                {submitError}
              </p>
            )}

            {/* Action buttons */}
            {!isReviewed && (
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => handleSubmit('approved')}
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50 transition-colors"
                >
                  <CheckCircle size={14} />
                  Approve
                </button>
                <button
                  onClick={() => {
                    setShowEditArea(true);
                    if (showEditArea) handleSubmit('edited');
                  }}
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-50 transition-colors"
                >
                  <Edit2 size={14} />
                  {showEditArea ? 'Submit Edit' : 'Edit'}
                </button>
                <button
                  onClick={() => handleSubmit('rejected')}
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-800 hover:bg-red-700 text-white disabled:opacity-50 transition-colors"
                >
                  <XCircle size={14} />
                  Reject
                </button>
                <button
                  onClick={() => handleSubmit('needs_kb_update')}
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-700 hover:bg-amber-600 text-white disabled:opacity-50 transition-colors"
                >
                  <BookOpen size={14} />
                  Needs KB Update
                </button>
              </div>
            )}

            {isReviewed && (
              <p className="text-sm text-emerald-400 flex items-center gap-1.5">
                <CheckCircle size={14} />
                Reviewed as <strong>{submitted?.replace(/_/g, ' ')}</strong>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────

export default function ReviewQueuePage() {
  const { items, isLoading, error, reload } = useReviewQueue({ limit: 100 });
  const [reviewed, setReviewed] = useState(0);

  const unreviewed = items.filter((i) => !i.reviewStatus);
  const alreadyReviewed = items.filter((i) => i.reviewStatus);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Review Queue</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Low-confidence answers and thumbs-down feedback awaiting human review
          </p>
        </div>
        <button
          onClick={reload}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-300 bg-slate-800 border border-slate-700 hover:text-white hover:border-slate-600 transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <p className="text-2xl font-bold text-white">{items.length}</p>
          <p className="text-sm text-slate-400 mt-0.5">Total items</p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <p className="text-2xl font-bold text-amber-400">{unreviewed.length}</p>
          <p className="text-sm text-slate-400 mt-0.5">Needs review</p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <p className="text-2xl font-bold text-emerald-400">{alreadyReviewed.length + reviewed}</p>
          <p className="text-sm text-slate-400 mt-0.5">Reviewed</p>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-950 border border-red-700 rounded-lg p-4 text-red-300 text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="bg-slate-900 border border-slate-700 rounded-lg h-24 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && items.length === 0 && !error && (
        <div className="text-center py-16 text-slate-500">
          <CheckCircle size={40} className="mx-auto mb-3 text-slate-700" />
          <p className="text-lg font-medium">Queue is empty</p>
          <p className="text-sm mt-1">No low-confidence or thumbs-down answers to review.</p>
        </div>
      )}

      {/* Unreviewed items */}
      {!isLoading && unreviewed.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
            Needs Review ({unreviewed.length})
          </h2>
          {unreviewed.map((item) => (
            <ReviewCard
              key={item.messageId}
              item={item}
              onReviewed={() => setReviewed((v) => v + 1)}
            />
          ))}
        </div>
      )}

      {/* Already reviewed */}
      {!isLoading && alreadyReviewed.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
            Already Reviewed ({alreadyReviewed.length})
          </h2>
          {alreadyReviewed.map((item) => (
            <ReviewCard
              key={item.messageId}
              item={item}
              onReviewed={() => setReviewed((v) => v + 1)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
