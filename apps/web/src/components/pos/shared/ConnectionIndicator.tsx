'use client';

import { memo } from 'react';
import { WifiOff } from 'lucide-react';
import { useConnectionStatus, type ConnectionStatus } from '@/hooks/use-connection-status';

const STATUS_CONFIG: Record<ConnectionStatus, { color: string; label: string }> = {
  online: { color: 'bg-green-500', label: 'Connected' },
  slow: { color: 'bg-amber-500', label: 'Slow Connection' },
  offline: { color: 'bg-red-500', label: 'Offline' },
};

function ConnectionIndicatorComponent() {
  const { status, latencyMs } = useConnectionStatus();
  const config = STATUS_CONFIG[status];

  return (
    <div className="flex items-center gap-1.5" title={`${config.label}${latencyMs != null ? ` (${latencyMs}ms)` : ''}`}>
      {status === 'offline' ? (
        <WifiOff className="h-3.5 w-3.5 text-red-500" />
      ) : (
        <div className="relative flex items-center">
          <div className={`h-2 w-2 rounded-full ${config.color}`} />
          {status === 'slow' && (
            <div className={`absolute inset-0 h-2 w-2 animate-ping rounded-full ${config.color} opacity-50`} />
          )}
        </div>
      )}
      {status === 'offline' && (
        <span className="text-xs font-medium text-red-500">Offline</span>
      )}
    </div>
  );
}

export const ConnectionIndicator = memo(ConnectionIndicatorComponent);
