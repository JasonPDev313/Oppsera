'use client';

import { Star } from 'lucide-react';

interface Props {
  value: number | null;
  onChange?: (rating: number) => void;
  max?: number;
  size?: number;
}

export function RatingStars({ value, onChange, max = 5, size = 14 }: Props) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => i + 1).map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange?.(star)}
          disabled={!onChange}
          className={`transition-colors ${onChange ? 'cursor-pointer hover:scale-110' : 'cursor-default'}`}
        >
          <Star
            size={size}
            className={
              value !== null && star <= (value ?? 0)
                ? 'fill-amber-400 text-amber-400'
                : 'fill-transparent text-slate-600'
            }
          />
        </button>
      ))}
    </div>
  );
}
