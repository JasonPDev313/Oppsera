'use client';

const GRADE_COLORS: Record<string, string> = {
  A: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  B: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  C: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  D: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  F: 'text-red-400 bg-red-500/10 border-red-500/30',
};

interface HealthGradePillProps {
  grade: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function HealthGradePill({ grade, size = 'md', showLabel = false }: HealthGradePillProps) {
  const colorClass = GRADE_COLORS[grade] ?? 'text-slate-400 bg-slate-500/10 border-slate-500/30';

  const sizeClass =
    size === 'sm'
      ? 'text-[10px] px-1.5 py-px'
      : size === 'lg'
        ? 'text-sm px-3 py-1'
        : 'text-xs px-2 py-0.5';

  return (
    <span
      className={`inline-flex items-center gap-1 font-bold rounded-full border ${colorClass} ${sizeClass}`}
    >
      {grade}
      {showLabel && <span className="font-normal opacity-75">grade</span>}
    </span>
  );
}

export { GRADE_COLORS };
