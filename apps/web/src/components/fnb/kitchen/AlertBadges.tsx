'use client';

/**
 * Alert badges row for KDS ticket cards.
 * Shows RUSH, ALLERGY, VIP, and LARGE order indicators.
 */

interface AlertBadgesProps {
  isRush?: boolean;
  isAllergy?: boolean;
  isVip?: boolean;
  /** Show LARGE badge when item count exceeds threshold */
  itemCount?: number;
  largeThreshold?: number;
  density?: 'compact' | 'standard' | 'comfortable';
}

const BADGES = {
  rush: { label: 'RUSH', color: '#ef4444', bg: 'rgba(239,68,68,0.15)', icon: '\u26A1' },
  allergy: { label: 'ALLERGY', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', icon: '\u26A0\uFE0F' },
  vip: { label: 'VIP', color: '#a855f7', bg: 'rgba(168,85,247,0.15)', icon: '\u2B50' },
  large: { label: 'LARGE', color: '#0ea5e9', bg: 'rgba(14,165,233,0.15)', icon: '\u{1F4E6}' },
} as const;

export function AlertBadges({
  isRush,
  isAllergy,
  isVip,
  itemCount = 0,
  largeThreshold = 5,
  density = 'standard',
}: AlertBadgesProps) {
  const active: (keyof typeof BADGES)[] = [];
  if (isRush) active.push('rush');
  if (isAllergy) active.push('allergy');
  if (isVip) active.push('vip');
  if (itemCount >= largeThreshold) active.push('large');

  if (active.length === 0) return null;

  const textSize = density === 'compact' ? 'text-[8px]' : 'text-[9px]';
  const padding = density === 'compact' ? 'px-2 py-0.5' : 'px-3 py-1';

  return (
    <div className={`flex items-center gap-1 ${padding}`}>
      {active.map((key) => {
        const badge = BADGES[key];
        return (
          <span
            key={key}
            className={`${textSize} font-bold rounded px-1.5 py-0.5`}
            style={{ color: badge.color, backgroundColor: badge.bg }}
          >
            {badge.icon} {badge.label}
          </span>
        );
      })}
    </div>
  );
}
