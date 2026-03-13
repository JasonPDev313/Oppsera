'use client';

interface OrderProgressBarProps {
  totalOrderItems: number;
  totalOrderReadyItems: number;
  stationItemCount: number;
  stationReadyCount: number;
}

export function OrderProgressBar({
  totalOrderItems,
  totalOrderReadyItems,
  stationItemCount,
  stationReadyCount: _stationReadyCount,
}: OrderProgressBarProps) {
  // Only render if there are items at other stations
  if (totalOrderItems <= stationItemCount) return null;

  const readyPct = totalOrderItems > 0
    ? Math.round((totalOrderReadyItems / totalOrderItems) * 100)
    : 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 12px',
        borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
        background: 'var(--fnb-bg-elevated)',
      }}
    >
      <span
        style={{
          fontSize: '12px',
          color: 'var(--fnb-text-muted)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        Order:
      </span>

      {/* Progress bar track */}
      <div
        style={{
          flex: 1,
          height: '6px',
          borderRadius: '3px',
          background: '#6366f1',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {readyPct > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: `${readyPct}%`,
              background: '#22c55e',
              borderRadius: '3px',
              transition: 'width 0.3s ease',
            }}
          />
        )}
      </div>

      <span
        style={{
          fontSize: '12px',
          color: 'var(--fnb-text-secondary)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {totalOrderReadyItems}/{totalOrderItems} ready
      </span>
    </div>
  );
}
