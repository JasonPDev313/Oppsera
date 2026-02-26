'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────

export interface QualityFactor {
  name: string;
  score: number;
  weight: number;
  detail: string;
}

interface DataQualityBadgeProps {
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  score: number;
  factors?: QualityFactor[];
  compact?: boolean;
  className?: string;
}

// ── Constants ──────────────────────────────────────────────────────

const GRADE_COLORS: Record<string, { bg: string; text: string; ring: string; bar: string }> = {
  A: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', ring: 'ring-emerald-500/30', bar: 'bg-emerald-500' },
  B: { bg: 'bg-blue-500/10', text: 'text-blue-500', ring: 'ring-blue-500/30', bar: 'bg-blue-500' },
  C: { bg: 'bg-yellow-500/10', text: 'text-yellow-500', ring: 'ring-yellow-500/30', bar: 'bg-yellow-500' },
  D: { bg: 'bg-orange-500/10', text: 'text-orange-500', ring: 'ring-orange-500/30', bar: 'bg-orange-500' },
  F: { bg: 'bg-red-500/10', text: 'text-red-500', ring: 'ring-red-500/30', bar: 'bg-red-500' },
};

// ── Component ──────────────────────────────────────────────────────

export function DataQualityBadge({
  grade,
  score,
  factors,
  compact = false,
  className,
}: DataQualityBadgeProps) {
  const [expanded, setExpanded] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const badgeRef = useRef<HTMLDivElement>(null);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const colors = GRADE_COLORS[grade] ?? GRADE_COLORS.C!;

  // Close expanded panel on click outside
  useEffect(() => {
    if (!expanded) return;

    function handleClickOutside(e: MouseEvent) {
      if (badgeRef.current && !badgeRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expanded]);

  const handleMouseEnter = useCallback(() => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    tooltipTimerRef.current = setTimeout(() => setShowTooltip(true), 400);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    setShowTooltip(false);
  }, []);

  // Compact mode: just the grade letter in a colored circle
  if (compact) {
    return (
      <div ref={badgeRef} className={`relative inline-flex ${className ?? ''}`}>
        <button
          type="button"
          onClick={() => {
            if (factors && factors.length > 0) setExpanded((p) => !p);
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold leading-none ring-1 ${colors.bg} ${colors.text} ${colors.ring} transition-transform hover:scale-110`}
          title={`Quality: ${grade} (${score}/100)`}
        >
          {grade}
        </button>

        {/* Hover tooltip */}
        {showTooltip && !expanded && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded bg-gray-900 text-white text-[10px] whitespace-nowrap z-10 pointer-events-none">
            Score: {score}/100
          </div>
        )}

        {/* Expanded factor breakdown */}
        {expanded && factors && factors.length > 0 && (
          <FactorBreakdown factors={factors} colors={colors} />
        )}
      </div>
    );
  }

  // Full mode: grade + score inline, click to expand
  return (
    <div ref={badgeRef} className={`relative inline-flex ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => {
          if (factors && factors.length > 0) setExpanded((p) => !p);
        }}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${colors.bg} ${colors.text} ${colors.ring} transition-colors hover:opacity-90`}
      >
        <span className="font-bold">{grade}</span>
        <span className="opacity-80">{score}/100</span>
      </button>

      {/* Expanded factor breakdown */}
      {expanded && factors && factors.length > 0 && (
        <FactorBreakdown factors={factors} colors={colors} />
      )}
    </div>
  );
}

// ── Factor Breakdown ───────────────────────────────────────────────

function FactorBreakdown({
  factors,
  colors,
}: {
  factors: QualityFactor[];
  colors: { bar: string };
}) {
  return (
    <div className="absolute top-full left-0 mt-1.5 z-20 w-64 rounded-lg border border-border bg-surface shadow-lg p-3 space-y-2">
      <p className="text-xs font-semibold text-foreground mb-1">Quality Factors</p>
      {factors.map((factor) => (
        <div key={factor.name}>
          <div className="flex items-center justify-between text-[11px] mb-0.5">
            <span className="text-foreground font-medium">{factor.name}</span>
            <span className="text-muted-foreground">
              {factor.score}% (w: {Math.round(factor.weight * 100)}%)
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
              style={{ width: `${Math.min(factor.score, 100)}%` }}
            />
          </div>
          {factor.detail && (
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
              {factor.detail}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
