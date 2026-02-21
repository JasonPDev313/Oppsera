'use client';

interface EqualSplitSelectorProps {
  currentCount: number;
  onSelect: (count: number) => void;
}

const QUICK_COUNTS = [2, 3, 4, 5, 6];

export function EqualSplitSelector({ currentCount, onSelect }: EqualSplitSelectorProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <span className="text-xs font-semibold mr-2" style={{ color: 'var(--fnb-text-muted)' }}>
        Split into:
      </span>
      {QUICK_COUNTS.map((count) => (
        <button
          key={count}
          type="button"
          onClick={() => onSelect(count)}
          className="flex items-center justify-center rounded-lg font-bold text-sm transition-colors"
          style={{
            width: '48px',
            height: '48px',
            backgroundColor: currentCount === count ? 'var(--fnb-status-seated)' : 'var(--fnb-bg-elevated)',
            color: currentCount === count ? '#fff' : 'var(--fnb-text-secondary)',
          }}
        >
          {count}
        </button>
      ))}
    </div>
  );
}
