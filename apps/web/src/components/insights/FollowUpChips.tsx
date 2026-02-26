'use client';

import { useState, useEffect } from 'react';

// ── Props ──────────────────────────────────────────────────────────

interface FollowUpChipsProps {
  suggestions: string[];
  onSelect: (question: string) => void;
  className?: string;
}

// ── Constants ──────────────────────────────────────────────────────

const MAX_CHIPS = 4;

// ── Component ──────────────────────────────────────────────────────

export function FollowUpChips({ suggestions, onSelect, className }: FollowUpChipsProps) {
  const [visible, setVisible] = useState(false);

  // Fade-in on mount / when suggestions change
  useEffect(() => {
    if (suggestions.length === 0) {
      setVisible(false);
      return;
    }

    // Reset visibility then trigger fade-in on next frame
    setVisible(false);
    const frame = requestAnimationFrame(() => {
      setVisible(true);
    });

    return () => cancelAnimationFrame(frame);
  }, [suggestions]);

  if (suggestions.length === 0) {
    return null;
  }

  const chips = suggestions.slice(0, MAX_CHIPS);

  return (
    <div
      className={`flex flex-wrap gap-2 transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      } ${className ?? ''}`}
    >
      {chips.map((question) => (
        <button
          key={question}
          type="button"
          onClick={() => onSelect(question)}
          className="px-3 py-1.5 text-sm rounded-full border border-indigo-500/30 text-indigo-500 hover:bg-indigo-500/10 transition-colors cursor-pointer"
        >
          {question}
        </button>
      ))}
    </div>
  );
}
