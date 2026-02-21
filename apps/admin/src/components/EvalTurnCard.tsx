'use client';

import Link from 'next/link';
import { MessageSquare, Clock, Database, AlertCircle } from 'lucide-react';
import { VerdictBadge } from './VerdictBadge';
import { QualityFlagPills } from './QualityFlagPills';
import { RatingStars } from './RatingStars';
import type { EvalTurnSummary } from '@/types/eval';

interface Props {
  turn: EvalTurnSummary;
}

export function EvalTurnCard({ turn }: Props) {
  const confidence = turn.llmConfidence ? Number(turn.llmConfidence) : null;
  const qualityScore = turn.qualityScore ? Number(turn.qualityScore) : null;

  const scoreColor =
    qualityScore === null
      ? 'text-slate-400'
      : qualityScore >= 0.8
        ? 'text-emerald-400'
        : qualityScore >= 0.5
          ? 'text-amber-400'
          : 'text-red-400';

  return (
    <Link
      href={`/eval/turns/${turn.id}`}
      className="block bg-slate-800 rounded-xl border border-slate-700 p-5 hover:border-indigo-500/50 transition-colors"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-slate-500 font-mono">T#{turn.turnNumber}</span>
            <span className="text-xs text-slate-600">·</span>
            <span className="text-xs text-slate-500">{turn.userRole}</span>
            {turn.wasClarification && (
              <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">Clarification</span>
            )}
          </div>
          <p className="text-sm text-white font-medium line-clamp-2">{turn.userMessage}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <VerdictBadge verdict={turn.adminVerdict} />
          {qualityScore !== null && (
            <span className={`text-xs font-medium tabular-nums ${scoreColor}`}>
              {Math.round(qualityScore * 100)}%
            </span>
          )}
        </div>
      </div>

      {/* Flags */}
      <QualityFlagPills flags={turn.qualityFlags} />

      {/* Stats row */}
      <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
        {confidence !== null && (
          <span className="flex items-center gap-1">
            <AlertCircle size={11} />
            {Math.round(confidence * 100)}% conf
          </span>
        )}
        {turn.executionTimeMs !== null && (
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {turn.executionTimeMs}ms
          </span>
        )}
        {turn.rowCount !== null && (
          <span className="flex items-center gap-1">
            <Database size={11} />
            {turn.rowCount} rows
          </span>
        )}
        {turn.executionError && (
          <span className="text-red-400 flex items-center gap-1">
            <MessageSquare size={11} />
            error
          </span>
        )}
      </div>

      {/* User rating */}
      {turn.userRating !== null && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-slate-500">User:</span>
          <RatingStars value={turn.userRating} size={12} />
        </div>
      )}

      {/* Timestamp */}
      <p className="text-xs text-slate-600 mt-2">
        {new Date(turn.createdAt).toLocaleString()}
        {turn.tenantId && <span className="ml-2 font-mono">{turn.tenantId.slice(0, 8)}…</span>}
      </p>
    </Link>
  );
}
