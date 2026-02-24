'use client';

const TIER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  SMB: { bg: 'bg-green-500/15', text: 'text-green-700', label: 'SMB' },
  MID_MARKET: { bg: 'bg-blue-500/15', text: 'text-blue-700', label: 'Mid-Market' },
  ENTERPRISE: { bg: 'bg-purple-500/15', text: 'text-purple-700', label: 'Enterprise' },
};

export function TierBadge({ tier, size = 'sm' }: { tier: string; size?: 'sm' | 'lg' }) {
  const style = TIER_STYLES[tier] ?? TIER_STYLES.SMB!;
  const sizeClasses = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';

  return (
    <span className={`inline-flex rounded-full font-medium ${style.bg} ${style.text} ${sizeClasses}`}>
      {style.label}
    </span>
  );
}
