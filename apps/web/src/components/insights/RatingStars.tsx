'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';

// ── RatingStars ────────────────────────────────────────────────────
// Reusable star rating widget.
//
// Props:
//   value     — current rating (1–max, or 0 for unset)
//   max       — number of stars (default 5)
//   onChange  — called when user selects a rating (input mode only)
//   readOnly  — display mode: no hover, no click
//   size      — 'sm' | 'md' | 'lg'

interface RatingStarsProps {
  value: number;
  max?: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_MAP = {
  sm: 'h-3.5 w-3.5',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

export function RatingStars({
  value,
  max = 5,
  onChange,
  readOnly = false,
  size = 'md',
}: RatingStarsProps) {
  const [hovered, setHovered] = useState(0);
  const iconClass = SIZE_MAP[size];
  const displayValue = !readOnly && hovered > 0 ? hovered : value;

  return (
    <div
      className="flex items-center gap-0.5"
      onMouseLeave={() => !readOnly && setHovered(0)}
    >
      {Array.from({ length: max }, (_, i) => {
        const star = i + 1;
        const filled = star <= displayValue;
        return (
          <button
            key={star}
            type="button"
            disabled={readOnly}
            onClick={() => onChange?.(star)}
            onMouseEnter={() => !readOnly && setHovered(star)}
            className={`transition-colors ${readOnly ? 'cursor-default' : 'cursor-pointer focus:outline-none'}`}
            aria-label={`${star} star${star !== 1 ? 's' : ''}`}
          >
            <Star
              className={`${iconClass} transition-colors ${
                filled
                  ? 'fill-amber-400 text-amber-400'
                  : readOnly
                  ? 'fill-gray-200 text-gray-200'
                  : 'fill-gray-200 text-gray-300 hover:fill-amber-300 hover:text-amber-300'
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
