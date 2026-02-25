'use client';

import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';

export function ImpersonationBanner() {
  const { impersonation, isImpersonating, exitImpersonation } = useAuthContext();
  const [timeRemaining, setTimeRemaining] = useState('');

  useEffect(() => {
    if (!isImpersonating || !impersonation?.expiresAt) return;

    function updateTimer() {
      const remaining = new Date(impersonation!.expiresAt).getTime() - Date.now();
      if (remaining <= 0) {
        setTimeRemaining('Expired');
        return;
      }
      const mins = Math.ceil(remaining / 60000);
      setTimeRemaining(`${mins} min`);
    }

    updateTimer();
    const interval = setInterval(updateTimer, 30_000);
    return () => clearInterval(interval);
  }, [isImpersonating, impersonation]);

  if (!isImpersonating || !impersonation) return null;

  return (
    <div className="relative z-[70] flex h-10 shrink-0 items-center justify-center gap-2 bg-red-600 px-4 text-sm font-medium text-white">
      <Shield className="h-4 w-4" />
      <span>
        IMPERSONATION MODE — Viewing as{' '}
        <strong>{impersonation.tenantName}</strong>
        <span className="mx-1.5 opacity-70">·</span>
        Admin: <span className="font-mono text-xs">{impersonation.adminEmail}</span>
        <span className="mx-1.5 opacity-70">·</span>
        Expires in {timeRemaining}
      </span>
      <button
        onClick={exitImpersonation}
        className="ml-4 inline-flex items-center gap-1 rounded-md bg-white/20 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-white/30"
      >
        End Now
      </button>
    </div>
  );
}
