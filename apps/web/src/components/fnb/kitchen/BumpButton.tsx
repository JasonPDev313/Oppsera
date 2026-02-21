'use client';

interface BumpButtonProps {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  variant?: 'bump' | 'recall' | 'served';
}

const VARIANTS = {
  bump: { bg: 'var(--fnb-status-available)', text: '#fff', label: 'BUMP' },
  recall: { bg: 'var(--fnb-status-entrees-fired)', text: '#fff', label: 'RECALL' },
  served: { bg: 'var(--fnb-status-seated)', text: '#fff', label: 'SERVED' },
};

export function BumpButton({ onClick, disabled, label, variant = 'bump' }: BumpButtonProps) {
  const v = VARIANTS[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-lg font-bold text-sm transition-colors hover:opacity-90 disabled:opacity-40 kds-bump-lg"
      style={{
        height: '64px',
        backgroundColor: v.bg,
        color: v.text,
      }}
    >
      {label ?? v.label}
    </button>
  );
}
