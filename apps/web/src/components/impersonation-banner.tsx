'use client';

import { Shield, X } from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';

export function ImpersonationBanner() {
  const { impersonation, isImpersonating, exitImpersonation } = useAuthContext();

  if (!isImpersonating || !impersonation) return null;

  return (
    <div className="relative z-[70] flex h-10 shrink-0 items-center justify-center gap-2 bg-amber-500 px-4 text-sm font-medium text-amber-950">
      <Shield className="h-4 w-4" />
      <span>
        Impersonating <strong>{impersonation.tenantName}</strong>
        <span className="mx-1.5 opacity-60">as</span>
        <span className="font-mono text-xs">{impersonation.adminEmail}</span>
      </span>
      <button
        onClick={exitImpersonation}
        className="ml-4 inline-flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
      >
        <X className="h-3 w-3" />
        Exit
      </button>
    </div>
  );
}
