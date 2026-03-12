'use client';

import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

interface StaleDataBannerProps {
  lastRefreshedAt: number | null;
  /** Seconds after which data is considered stale (default: 15) */
  staleAfterSeconds?: number;
}

/**
 * Shows an amber banner when KDS/expo data hasn't been refreshed recently.
 * Helps operators recognize when realtime + polling are degraded.
 */
export function StaleDataBanner({
  lastRefreshedAt,
  staleAfterSeconds = 15,
}: StaleDataBannerProps) {
  const [staleSince, setStaleSince] = useState<number | null>(null);

  useEffect(() => {
    // Check staleness every 2 seconds
    const check = () => {
      if (!lastRefreshedAt) { setStaleSince(null); return; }
      const age = (Date.now() - lastRefreshedAt) / 1000;
      setStaleSince(age >= staleAfterSeconds ? Math.round(age) : null);
    };
    check();
    const interval = setInterval(check, 2000);
    return () => clearInterval(interval);
  }, [lastRefreshedAt, staleAfterSeconds]);

  if (staleSince === null) return null;

  const label = staleSince < 60
    ? `${staleSince}s ago`
    : `${Math.floor(staleSince / 60)}m ${staleSince % 60}s ago`;

  return (
    <div
      className="flex items-center gap-2 px-4 py-1.5 shrink-0"
      style={{
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        borderBottom: '1px solid rgba(245, 158, 11, 0.3)',
      }}
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" style={{ color: '#f59e0b' }} />
      <span className="text-xs font-semibold" style={{ color: '#f59e0b' }}>
        Data may be stale — last refresh {label}
      </span>
    </div>
  );
}
