'use client';

import type { QualityFlag } from '@/types/eval';

const FLAG_STYLE: Record<QualityFlag, string> = {
  empty_result: 'bg-slate-700 text-slate-300',
  timeout: 'bg-red-500/20 text-red-400',
  low_confidence: 'bg-amber-500/20 text-amber-400',
  hallucinated_slug: 'bg-purple-500/20 text-purple-400',
  high_null_rate: 'bg-orange-500/20 text-orange-400',
  excessive_rows: 'bg-blue-500/20 text-blue-400',
  very_slow: 'bg-yellow-500/20 text-yellow-400',
};

const FLAG_LABEL: Record<QualityFlag, string> = {
  empty_result: 'Empty',
  timeout: 'Timeout',
  low_confidence: 'Low Conf',
  hallucinated_slug: 'Hallucination',
  high_null_rate: 'High Nulls',
  excessive_rows: 'Too Many Rows',
  very_slow: 'Very Slow',
};

interface Props {
  flags: QualityFlag[] | null;
}

export function QualityFlagPills({ flags }: Props) {
  if (!flags || flags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <span
          key={flag}
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${FLAG_STYLE[flag]}`}
        >
          {FLAG_LABEL[flag]}
        </span>
      ))}
    </div>
  );
}
