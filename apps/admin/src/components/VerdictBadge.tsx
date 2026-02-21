'use client';

import type { AdminVerdict } from '@/types/eval';

const STYLE: Record<AdminVerdict, string> = {
  correct: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  incorrect: 'bg-red-500/15 text-red-400 border-red-500/30',
  partial: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  clarification_needed: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
};

const LABEL: Record<AdminVerdict, string> = {
  correct: 'Correct',
  incorrect: 'Incorrect',
  partial: 'Partial',
  clarification_needed: 'Needs Clarification',
};

interface Props {
  verdict: AdminVerdict | null;
}

export function VerdictBadge({ verdict }: Props) {
  if (!verdict) return <span className="text-slate-500 text-xs">Unreviewed</span>;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STYLE[verdict]}`}>
      {LABEL[verdict]}
    </span>
  );
}
