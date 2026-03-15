'use client';

import { useState } from 'react';
import { ThumbsUp, ThumbsDown, CheckCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface AiAssistantFeedbackProps {
  messageId: string;
}

const REASON_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'not_accurate', label: 'Not accurate for my setup' },
  { code: 'didnt_answer', label: "Didn't answer my question" },
  { code: 'show_steps', label: 'Show steps instead' },
  { code: 'contact_support', label: 'Contact support' },
];

type Step = 'idle' | 'reason' | 'submitted';

export function AiAssistantFeedback({ messageId }: AiAssistantFeedbackProps) {
  const [step, setStep] = useState<Step>('idle');
  const [activeRating, setActiveRating] = useState<'up' | 'down' | null>(null);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRating(rating: 'up' | 'down') {
    setActiveRating(rating);
    setError(null);

    if (rating === 'up') {
      await submitFeedback(rating, null, '');
    } else {
      setStep('reason');
    }
  }

  async function handleSubmit() {
    await submitFeedback('down', selectedReason, comment);
  }

  async function submitFeedback(
    rating: 'up' | 'down',
    reasonCode: string | null,
    freeformComment: string,
  ) {
    setSubmitting(true);
    setError(null);

    try {
      await apiFetch('/api/v1/ai-support/feedback', {
        method: 'POST',
        body: JSON.stringify({
          messageId,
          rating,
          ...(reasonCode ? { reasonCode } : {}),
          ...(freeformComment.trim() ? { freeformComment: freeformComment.trim() } : {}),
        }),
      });

      setStep('submitted');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  }

  if (step === 'submitted') {
    return (
      <div className="flex items-center gap-1.5 mt-2 text-xs text-zinc-400">
        <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
        <span>Thanks for your feedback</span>
      </div>
    );
  }

  return (
    <div className="mt-2">
      {/* Thumbs row */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => { void handleRating('up'); }}
          disabled={submitting || activeRating !== null}
          aria-label="Thumbs up"
          className={[
            'p-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500',
            activeRating === 'up'
              ? 'text-emerald-400'
              : 'text-zinc-500 hover:text-zinc-300 disabled:opacity-40',
          ].join(' ')}
        >
          <ThumbsUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => { void handleRating('down'); }}
          disabled={submitting || activeRating !== null}
          aria-label="Thumbs down"
          className={[
            'p-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500',
            activeRating === 'down'
              ? 'text-rose-400'
              : 'text-zinc-500 hover:text-zinc-300 disabled:opacity-40',
          ].join(' ')}
        >
          <ThumbsDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Reason picker (thumbs-down only) */}
      {step === 'reason' && (
        <div className="mt-2 rounded-lg border border-zinc-700 bg-zinc-800/60 p-3 space-y-2">
          <p className="text-xs font-medium text-zinc-300">What went wrong?</p>

          <div className="flex flex-wrap gap-1.5">
            {REASON_OPTIONS.map((opt) => (
              <button
                key={opt.code}
                type="button"
                onClick={() => setSelectedReason(opt.code === selectedReason ? null : opt.code)}
                className={[
                  'text-xs px-2.5 py-1 rounded-full border transition-colors',
                  selectedReason === opt.code
                    ? 'border-violet-500 bg-violet-500/20 text-violet-300'
                    : 'border-zinc-600 text-zinc-400 hover:border-zinc-400 hover:text-zinc-200',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <textarea
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional: tell us more..."
            maxLength={500}
            className="w-full rounded-md bg-zinc-900 border border-zinc-600 px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500"
          />

          {error && (
            <p className="text-xs text-rose-400">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setStep('idle'); setActiveRating(null); setSelectedReason(null); setComment(''); setError(null); }}
              disabled={submitting}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { void handleSubmit(); }}
              disabled={submitting}
              className="text-xs px-3 py-1 rounded-md bg-violet-600 hover:bg-violet-500 text-zinc-50 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Sending…' : 'Submit'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
