'use client';

interface Props {
  label: string;
  value: string | number | null;
  sub?: string;
  trend?: 'up' | 'down' | 'neutral';
  good?: 'up' | 'down'; // which direction is good
}

export function QualityKpiCard({ label, value, sub, trend, good = 'up' }: Props) {
  const trendColor =
    trend === undefined || trend === 'neutral'
      ? 'text-slate-400'
      : trend === good
        ? 'text-emerald-400'
        : 'text-red-400';

  const trendArrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '';

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">
        {value !== null && value !== undefined ? value : '—'}
        {trend && (
          <span className={`ml-1.5 text-sm font-medium ${trendColor}`}>{trendArrow}</span>
        )}
      </p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}
