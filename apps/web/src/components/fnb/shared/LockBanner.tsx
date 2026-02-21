'use client';

import { Lock, ShieldAlert } from 'lucide-react';

interface LockBannerProps {
  lockedBy: string;
  terminalId?: string | null;
  onForceRelease?: () => void;
  canForceRelease?: boolean;
}

export function LockBanner({ lockedBy, terminalId, onForceRelease, canForceRelease }: LockBannerProps) {
  return (
    <div
      className="flex items-center justify-between px-4 py-2 text-xs font-bold"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--fnb-status-check-presented) 15%, transparent)',
        color: 'var(--fnb-status-check-presented)',
        borderBottom: '1px solid var(--fnb-status-check-presented)',
      }}
    >
      <div className="flex items-center gap-2">
        <Lock className="h-3 w-3" />
        <span>
          Edited by {lockedBy}
          {terminalId ? ` on Terminal ${terminalId}` : ''}
        </span>
      </div>
      {canForceRelease && onForceRelease && (
        <button
          type="button"
          onClick={onForceRelease}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase transition-colors hover:opacity-80"
          style={{
            backgroundColor: 'var(--fnb-status-check-presented)',
            color: 'white',
          }}
        >
          <ShieldAlert className="h-3 w-3" />
          Force Unlock
        </button>
      )}
    </div>
  );
}
