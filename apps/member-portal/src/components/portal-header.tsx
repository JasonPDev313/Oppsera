'use client';

import { LogOut, User } from 'lucide-react';
import { usePortalAuth } from '@/hooks/use-portal-auth';

export function PortalHeader() {
  const { user, logout } = usePortalAuth();

  return (
    <header className="h-14 border-b border-[var(--portal-border)] bg-[var(--portal-surface)] px-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-[var(--portal-primary)] flex items-center justify-center">
          <span className="text-white font-bold text-sm">M</span>
        </div>
        <span className="font-semibold text-sm">Member Portal</span>
      </div>

      {user && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm text-[var(--portal-text-muted)]">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">{user.email}</span>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1 text-sm text-[var(--portal-text-muted)] hover:text-[var(--portal-text)] transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      )}
    </header>
  );
}
