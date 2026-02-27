'use client';

interface DeltaBadgeProps {
  deltaType: string;
}

export function DeltaBadge({ deltaType }: DeltaBadgeProps) {
  const label = String(deltaType ?? '').toUpperCase();
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold animate-pulse"
      style={{
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        color: 'var(--fnb-status-dirty)',
        border: '1px solid var(--fnb-status-dirty)',
      }}
    >
      {label}
    </span>
  );
}
