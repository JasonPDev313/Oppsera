'use client';

import { useState } from 'react';
import { ThumbsUp, ThumbsDown, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { RatingStars } from './RatingStars';
import { useSubmitFeedback } from '@/hooks/use-feedback';

// ── Types & constants ──────────────────────────────────────────────

const FEEDBACK_TAGS = [
  { value: 'great_insight', label: 'Great insight' },
  { value: 'perfect', label: 'Perfect' },
  { value: 'wrong_data', label: 'Wrong data' },
  { value: 'wrong_metric', label: 'Wrong metric' },
  { value: 'confusing', label: 'Confusing' },
  { value: 'missing_context', label: 'Missing context' },
  { value: 'too_verbose', label: 'Too verbose' },
  { value: 'hallucination', label: 'Hallucination' },
] as const;

type FeedbackState = 'idle' | 'expanded' | 'submitting' | 'done';

// ── FeedbackWidget ─────────────────────────────────────────────────
// Inline widget shown below each assistant message.
//
// Quick mode (idle):  thumbs up / thumbs down
// Expanded mode:      5-star rating + tag pills + optional text + submit
// Done:               "Thanks!" checkmark

interface FeedbackWidgetProps {
  evalTurnId: string;
}

export function FeedbackWidget({ evalTurnId }: FeedbackWidgetProps) {
  const { submit, isPending } = useSubmitFeedback();

  const [state, setState] = useState<FeedbackState>('idle');
  const [quickThumb, setQuickThumb] = useState<boolean | null>(null);
  const [rating, setRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [text, setText] = useState('');

  // ── Quick thumb action ─────────────────────────────────────────
  const handleQuickThumb = async (thumbsUp: boolean) => {
    setQuickThumb(thumbsUp);
    setState('expanded');
    // Immediately persist the quick thumb, expand for more details
    try {
      await submit(evalTurnId, { thumbsUp });
    } catch {
      // Not fatal — user can still submit detailed feedback
    }
  };

  // ── Tag toggle ─────────────────────────────────────────────────
  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  // ── Submit detailed feedback ───────────────────────────────────
  const handleSubmit = async () => {
    setState('submitting');
    try {
      await submit(evalTurnId, {
        thumbsUp: quickThumb ?? undefined,
        rating: rating > 0 ? rating : undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        text: text.trim() || undefined,
      });
      setState('done');
    } catch {
      setState('expanded'); // allow retry
    }
  };

  // ── Done state ─────────────────────────────────────────────────
  if (state === 'done') {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-green-500">
        <CheckCircle className="h-3.5 w-3.5" />
        <span>Thanks for your feedback!</span>
      </div>
    );
  }

  // ── Idle state — quick thumbs ──────────────────────────────────
  if (state === 'idle') {
    return (
      <div className="mt-2 flex items-center gap-1">
        <span className="text-xs text-gray-400 mr-1">Helpful?</span>
        <button
          type="button"
          onClick={() => handleQuickThumb(true)}
          className="p-1 rounded text-gray-400 hover:text-green-500 hover:bg-green-500/10 transition-colors"
          title="Helpful"
        >
          <ThumbsUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => handleQuickThumb(false)}
          className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
          title="Not helpful"
        >
          <ThumbsDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setState('expanded')}
          className="p-1 rounded text-gray-400 hover:text-gray-600 transition-colors"
          title="More feedback options"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // ── Expanded state ─────────────────────────────────────────────
  return (
    <div className="mt-2 rounded-xl border border-gray-200 bg-gray-100 p-3 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Thumbs indicators */}
          {quickThumb === true && (
            <ThumbsUp className="h-3.5 w-3.5 text-green-500 fill-current" />
          )}
          {quickThumb === false && (
            <ThumbsDown className="h-3.5 w-3.5 text-red-500 fill-current" />
          )}
          {quickThumb === null && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => handleQuickThumb(true)}
                className="p-1 rounded text-gray-400 hover:text-green-500 hover:bg-green-500/10 transition-colors"
              >
                <ThumbsUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleQuickThumb(false)}
                className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <span className="text-xs text-gray-500">Rate this response</span>
        </div>
        <button
          type="button"
          onClick={() => setState('idle')}
          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          title="Collapse feedback"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Star rating */}
      <div className="flex items-center gap-2">
        <RatingStars value={rating} onChange={setRating} size="sm" />
        {rating > 0 && (
          <span className="text-xs text-gray-400">{rating}/5</span>
        )}
      </div>

      {/* Tag pills */}
      <div className="flex flex-wrap gap-1.5">
        {FEEDBACK_TAGS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => toggleTag(value)}
            className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
              selectedTags.includes(value)
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'bg-surface-raised border-gray-200 text-gray-600 hover:border-indigo-500/50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Text input */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What could be improved? (optional)"
        rows={2}
        maxLength={500}
        className="w-full rounded-lg border border-gray-200 bg-surface px-3 py-2 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
      />

      {/* Submit */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || state === 'submitting'}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
        >
          {isPending || state === 'submitting' ? 'Sending\u2026' : 'Submit feedback'}
        </button>
      </div>
    </div>
  );
}
