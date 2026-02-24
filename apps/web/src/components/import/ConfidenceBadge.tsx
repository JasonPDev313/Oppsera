'use client';

interface ConfidenceBadgeProps {
  confidence: number;
  method?: 'alias' | 'ai' | 'manual' | 'unmapped';
  showLabel?: boolean;
  reasoning?: string;
}

export function ConfidenceBadge({ confidence, method, showLabel = false, reasoning }: ConfidenceBadgeProps) {
  // Auto-detect scale: >1 means 0-100 integer, <=1 means 0-1 float
  const normalized = confidence > 1 ? confidence / 100 : confidence;
  const pct = Math.round(normalized * 100);

  let color: string;
  let label: string;

  if (method === 'manual') {
    color = 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    label = 'Manual';
  } else if (method === 'unmapped' || pct === 0) {
    color = 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
    label = 'Unmapped';
  } else if (normalized >= 0.8) {
    color = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    label = 'High';
  } else if (normalized >= 0.5) {
    color = 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    label = 'Medium';
  } else {
    color = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    label = 'Low';
  }

  const tooltip = reasoning
    ?? (method === 'alias' ? 'Matched by column name alias'
      : method === 'ai' ? 'AI suggested mapping'
      : method === 'manual' ? 'Manually set by user'
      : undefined);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}
      title={tooltip}
    >
      {method === 'ai' && (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      )}
      {method === 'manual' || method === 'unmapped' ? label : `${pct}%`}
      {showLabel && method !== 'manual' && method !== 'unmapped' && (
        <span className="hidden sm:inline">({label})</span>
      )}
    </span>
  );
}
