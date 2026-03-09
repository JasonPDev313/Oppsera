'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Clock, RefreshCw } from 'lucide-react';
import { getStoredToken, refreshTokenIfNeeded } from '@/lib/api-client';

/**
 * Monitors the JWT access token and shows a warning dialog when the session
 * is about to expire (token expires within 3 minutes AND refresh fails).
 * Checks every 60 seconds. Only shown when the user has been idle long enough
 * for the auto-refresh to have lapsed.
 */
export function SessionTimeoutWarning() {
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    const check = async () => {
      const token = getStoredToken();
      if (!token) return; // Not logged in

      try {
        const parts = token.split('.');
        if (parts.length !== 3) return;
        const payload = JSON.parse(atob(parts[1]!));
        if (typeof payload.exp !== 'number') return;

        const expiryMs = payload.exp * 1000;
        const timeLeft = expiryMs - Date.now();

        // If less than 3 minutes remaining, try to refresh
        if (timeLeft < 3 * 60_000) {
          const refreshed = await refreshTokenIfNeeded();
          if (!refreshed) {
            // Refresh failed — session is about to expire
            setShowWarning(true);
          }
        }
      } catch {
        // Ignore parse errors
      }
    };

    // Check immediately and then every 60 seconds
    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = useCallback(() => {
    window.location.reload();
  }, []);

  const handleDismiss = useCallback(() => {
    setShowWarning(false);
  }, []);

  if (!showWarning || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" />
      <div className="relative w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-2xl">
        {/* Icon */}
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15">
          <Clock className="h-7 w-7 text-amber-400" />
        </div>

        <h3 className="text-center text-lg font-semibold text-foreground">
          Session Expiring Soon
        </h3>
        <p className="mt-2 text-center text-sm leading-relaxed text-foreground/70">
          Your session is about to expire. Save any unsaved work, then refresh the page to stay logged in.
        </p>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={handleDismiss}
            className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
            style={{ minHeight: '44px' }}
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
            style={{ minHeight: '44px' }}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
