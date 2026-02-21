'use client';

import type { ConnectionStatus } from '@/hooks/use-fnb-realtime';
import { Wifi, WifiOff } from 'lucide-react';

interface ConnectionBannerProps {
  status: ConnectionStatus;
}

export function ConnectionBanner({ status }: ConnectionBannerProps) {
  if (status === 'connected') return null;

  const isOffline = status === 'offline';

  return (
    <div
      className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold"
      style={{
        backgroundColor: isOffline ? 'var(--fnb-status-dirty)' : 'var(--fnb-status-check-presented)',
        color: isOffline ? 'white' : 'rgba(0,0,0,0.8)',
      }}
    >
      {isOffline ? (
        <>
          <WifiOff className="h-3 w-3" />
          OFFLINE — Orders will queue
        </>
      ) : (
        <>
          <Wifi className="h-3 w-3 animate-pulse" />
          Reconnecting...
        </>
      )}
    </div>
  );
}
