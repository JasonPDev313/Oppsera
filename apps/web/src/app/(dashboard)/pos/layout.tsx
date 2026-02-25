'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { X, MapPin, Monitor, User, ShoppingCart, UtensilsCrossed, Moon, Sun } from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { useTheme } from '@/components/theme-provider';
import { refreshTokenIfNeeded } from '@/lib/api-client';
import { warmCustomerCache } from '@/lib/customer-cache';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useTerminalSession } from '@/components/terminal-session-provider';
import { POSErrorBoundary } from '@/components/pos/pos-error-boundary';
import { ConnectionIndicator } from '@/components/pos/shared/ConnectionIndicator';
import { usePOSDisplaySize } from '@/hooks/use-pos-display-size';
import type { POSDisplaySize } from '@/hooks/use-pos-display-size';
import '@/styles/fnb-design-tokens.css';
import '@/styles/pos-design-tokens.css';
import '@/styles/pos-animations.css';
import RetailPOSLoading from './retail/loading';
import FnBPOSLoading from './fnb/loading';

// Mount both POS content components in the layout so switching between
// Retail ↔ F&B is an instant CSS toggle instead of a full route transition.
const RetailPOSContent = dynamic(() => import('./retail/retail-pos-content'), {
  loading: () => <RetailPOSLoading />,
  ssr: false,
});

const FnBPOSContent = dynamic(() => import('./fnb/fnb-pos-content'), {
  loading: () => <FnBPOSLoading />,
  ssr: false,
});

// ── Terminal ID ───────────────────────────────────────────────────

function useTerminalId(): string {
  const { session } = useTerminalSession();
  return session?.terminalId ?? 'POS-01';
}

// ── Barcode Scanner Listener ──────────────────────────────────────

function useBarcodeScannerListener(): void {
  useEffect(() => {
    let buffer = '';
    let lastKeyTime = 0;
    const SCAN_THRESHOLD = 50; // ms between keystrokes for scanner
    const MIN_LENGTH = 4;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const now = Date.now();

      if (e.key === 'Enter' && buffer.length >= MIN_LENGTH) {
        window.dispatchEvent(
          new CustomEvent('barcode-scan', { detail: buffer }),
        );
        buffer = '';
        e.preventDefault();
        return;
      }

      // Reset buffer if too much time elapsed between keystrokes
      if (now - lastKeyTime > SCAN_THRESHOLD) {
        buffer = '';
      }

      // Only capture printable characters
      if (e.key.length === 1) {
        buffer += e.key;
        lastKeyTime = now;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}

// ── Visibility Resume (proactive warm-up after idle) ─────────────
// When the browser tab was hidden and becomes visible again, proactively:
// 1. Refresh the JWT if it's near expiry (avoids 401 → refresh → retry chain)
// 2. Ping /api/health to warm the Vercel serverless function (avoids cold start)
// 3. Dispatch 'pos-visibility-resume' event so catalog/tabs hooks can refresh

const IDLE_THRESHOLD_MS = 30_000; // only act if hidden for >30 seconds

function usePOSVisibilityRefresh(): void {
  useEffect(() => {
    let lastHiddenAt = 0;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        lastHiddenAt = Date.now();
        return;
      }

      // Tab became visible again
      const idleDuration = lastHiddenAt ? Date.now() - lastHiddenAt : 0;
      if (idleDuration < IDLE_THRESHOLD_MS) return;

      // 1. Proactive token refresh if near expiry (<5 min remaining)
      refreshTokenIfNeeded().catch(() => {});

      // 2. Warm serverless function — fire and forget (no DB, instant response)
      fetch('/api/health/light').catch(() => {});

      // 3. Signal POS hooks to refresh stale data
      window.dispatchEvent(
        new CustomEvent('pos-visibility-resume', {
          detail: { idleDurationMs: idleDuration },
        }),
      );
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);
}

// ── POS Layout ────────────────────────────────────────────────────

export default function POSLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, locations, isLoading, isAuthenticated } = useAuthContext();
  const terminalId = useTerminalId();

  // Barcode scanner listener
  useBarcodeScannerListener();

  // Pre-warm customer cache so search is instant
  useEffect(() => { warmCustomerCache(); }, []);

  // Proactive warm-up when returning from idle (token refresh + function warm + data refresh)
  usePOSVisibilityRefresh();

  // ── POS display size ───────────────────────────────────────────
  const { displaySize, setDisplaySize, fontScale } = usePOSDisplaySize();

  // ── Theme (follows system-wide dark/light mode) ────────────────
  const { theme, toggleTheme } = useTheme();

  // ── Mode state ─────────────────────────────────────────────────
  // React state drives the CSS toggle for instant switching.
  // URL is synced via router.replace (deferred, non-blocking).
  // Sidebar link clicks update pathname → synced back via useEffect.
  const [mode, setMode] = useState<'retail' | 'fnb'>(
    pathname.startsWith('/pos/fnb') ? 'fnb' : 'retail',
  );

  // Sync mode when pathname changes (e.g., sidebar navigation)
  useEffect(() => {
    if (pathname.startsWith('/pos/fnb') && mode !== 'fnb') setMode('fnb');
    else if (pathname.startsWith('/pos/retail') && mode !== 'retail') setMode('retail');
  }, [pathname]);

  const isRetail = mode === 'retail';
  const isFnB = mode === 'fnb';

  // Instant mode switch — state change is immediate, URL update is deferred.
  const switchMode = useCallback(
    (newMode: 'retail' | 'fnb') => {
      if (newMode === mode) return;
      setMode(newMode);
      router.replace(`/pos/${newMode}`, { scroll: false });
    },
    [mode, router],
  );

  // Lazily mount each POS mode on first visit, keep mounted afterwards
  // so switching back is instant (CSS toggle, no re-mount).
  const [visited, setVisited] = useState({ retail: isRetail, fnb: isFnB });
  useEffect(() => {
    if (isRetail && !visited.retail) setVisited((v) => ({ ...v, retail: true }));
    if (isFnB && !visited.fnb) setVisited((v) => ({ ...v, fnb: true }));
  }, [isRetail, isFnB, visited.retail, visited.fnb]);

  // Auth guard
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  const handleExitPOS = useCallback(() => {
    router.push('/dashboard');
  }, [router]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" label="Loading POS..." />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  const locationName = locations[0]?.name ?? 'Unknown Location';
  const employeeName = user.name ?? 'Staff';

  // Get first name or abbreviated name for compact display
  const displayName = employeeName.includes(' ')
    ? `${employeeName.split(' ')[0]} ${employeeName.split(' ')[1]?.[0]}.`
    : employeeName;

  return (
    <div
      className="flex h-full flex-col"
      style={{
        backgroundColor: 'var(--pos-bg-primary)',
        ['--pos-font-scale' as string]: fontScale,
      }}
    >
      {/* ── Top Bar ──────────────────────────────────────────────── */}
      <header
        className="flex h-12 shrink-0 items-center justify-between px-4"
        style={{
          backgroundColor: 'var(--pos-bg-surface)',
          borderBottom: '1px solid var(--pos-border)',
          boxShadow: 'var(--pos-shadow-header)',
        }}
      >
        {/* Left: Mode toggle, location, terminal, employee */}
        <div className="flex items-center gap-4">
          {/* Retail / F&B mode toggle — instant switch via React state */}
          <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ backgroundColor: 'var(--pos-bg-elevated)' }}>
            <button
              type="button"
              onClick={() => switchMode('retail')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                isRetail
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : ''
              }`}
              style={isRetail ? undefined : { color: 'var(--pos-text-muted)' }}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Retail
            </button>
            <button
              type="button"
              onClick={() => switchMode('fnb')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                isFnB
                  ? 'bg-amber-600 text-white shadow-sm'
                  : ''
              }`}
              style={isFnB ? undefined : { color: 'var(--pos-text-muted)' }}
            >
              <UtensilsCrossed className="h-3.5 w-3.5" />
              F&B
            </button>
          </div>

          {/* Divider */}
          <div className="h-5 w-px" style={{ backgroundColor: 'var(--pos-border)' }} />

          {/* Location */}
          <div className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4" style={{ color: 'var(--pos-accent)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--pos-text-primary)' }}>
              {locationName}
            </span>
          </div>

          {/* Divider */}
          <div className="h-5 w-px" style={{ backgroundColor: 'var(--pos-border)' }} />

          {/* Terminal */}
          <div className="flex items-center gap-1.5">
            <Monitor className="h-4 w-4" style={{ color: 'var(--pos-text-muted)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--pos-text-secondary)' }}>
              {terminalId}
            </span>
          </div>

          {/* Divider */}
          <div className="h-5 w-px" style={{ backgroundColor: 'var(--pos-border)' }} />

          {/* Employee */}
          <div className="flex items-center gap-1.5">
            <User className="h-4 w-4" style={{ color: 'var(--pos-text-muted)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--pos-text-secondary)' }}>
              {displayName}
            </span>
          </div>
        </div>

        {/* Right: Connection + Exit */}
        <div className="flex items-center gap-3">
          <ConnectionIndicator />
          {/* Font size selector */}
          <div className="flex items-center gap-0.5 rounded-md p-0.5" style={{ backgroundColor: 'var(--pos-bg-elevated)' }}>
            {(['default', 'large', 'xlarge'] as POSDisplaySize[]).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setDisplaySize(size)}
                className={`rounded px-1.5 py-0.5 font-semibold transition-colors ${
                  displaySize === size ? 'bg-indigo-600 text-white shadow-sm' : ''
                }`}
                style={displaySize === size ? undefined : { color: 'var(--pos-text-muted)' }}
                title={`Font size: ${size}`}
              >
                <span style={{ fontSize: size === 'default' ? '11px' : size === 'large' ? '13px' : '15px' }}>A</span>
              </button>
            ))}
          </div>
          {/* Dark mode toggle — wired to system theme */}
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--pos-text-muted)' }}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle dark mode"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          {/* Exit POS */}
          <button
            type="button"
            onClick={handleExitPOS}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--pos-text-muted)' }}
            title="Exit POS"
            aria-label="Exit POS"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* ── Content Area ─────────────────────────────────────────── */}
      {/* Both POS modes are mounted in this layout and toggled via CSS.
          Mode switching uses React state for instant visual toggle — no
          Next.js route transition needed. Each mode loads independently
          and continues running in the background when the other is active. */}
      <div className="relative flex-1 overflow-hidden">
        {visited.retail && (
          <div className={`absolute inset-0 ${isRetail ? '' : 'pointer-events-none invisible'}`}>
            <POSErrorBoundary mode="retail">
              <RetailPOSContent isActive={isRetail} />
            </POSErrorBoundary>
          </div>
        )}
        {visited.fnb && (
          <div className={`absolute inset-0 ${isFnB ? '' : 'pointer-events-none invisible'}`}>
            <POSErrorBoundary mode="fnb">
              <FnBPOSContent isActive={isFnB} />
            </POSErrorBoundary>
          </div>
        )}
        {/* Fallback for any future POS sub-routes */}
        {!isRetail && !isFnB && children}
      </div>
    </div>
  );
}
