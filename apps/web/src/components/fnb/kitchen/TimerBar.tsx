'use client';

interface TimerBarProps {
  elapsedSeconds: number;
  warningThresholdSeconds: number;
  criticalThresholdSeconds: number;
}

function getTimerColor(elapsed: number, warning: number, critical: number): string {
  if (elapsed >= critical) return 'var(--fnb-status-dirty)';
  if (elapsed >= warning) return 'var(--fnb-status-entrees-fired)';
  return 'var(--fnb-status-seated)';
}

export function TimerBar({ elapsedSeconds, warningThresholdSeconds, criticalThresholdSeconds }: TimerBarProps) {
  const pct = Math.min((elapsedSeconds / criticalThresholdSeconds) * 100, 100);
  const color = getTimerColor(elapsedSeconds, warningThresholdSeconds, criticalThresholdSeconds);

  return (
    <div className="h-1 xl:h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function getTimerColorForElapsed(
  elapsed: number,
  warning: number,
  critical: number,
): string {
  return getTimerColor(elapsed, warning, critical);
}
