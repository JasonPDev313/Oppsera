'use client';

import { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { useFnbPosStore } from '@/stores/fnb-pos-store';
import { ServerPinModal } from './ServerPinModal';

export function ServerLockBanner() {
  const { serverLock, unlockServer } = useFnbPosStore();
  const [pinModalOpen, setPinModalOpen] = useState(false);

  if (!serverLock.isLocked) return null;

  function handleUnlockAttempt(pin: string): boolean {
    const success = unlockServer(pin);
    if (success) setPinModalOpen(false);
    return success;
  }

  return (
    <>
      <div
        className="flex items-center justify-between px-3 py-1.5 shrink-0"
        style={{
          backgroundColor: 'rgba(99,102,241,0.1)',
          borderBottom: '1px solid rgba(99,102,241,0.2)',
        }}
      >
        <div className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5" style={{ color: 'var(--fnb-action-send)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--fnb-action-send)' }}>
            Locked to {serverLock.serverName}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setPinModalOpen(true)}
          className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors"
          style={{
            backgroundColor: 'rgba(99,102,241,0.15)',
            color: 'var(--fnb-action-send)',
            border: '1px solid rgba(99,102,241,0.3)',
          }}
        >
          <Unlock className="h-3 w-3" />
          Unlock
        </button>
      </div>

      <ServerPinModal
        open={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onSubmit={handleUnlockAttempt}
        title="Unlock POS"
        description={`Enter PIN to unlock from ${serverLock.serverName}`}
      />
    </>
  );
}
