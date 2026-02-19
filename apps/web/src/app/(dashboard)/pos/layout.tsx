'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { X, MapPin, Monitor, User, ShoppingCart, UtensilsCrossed } from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
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
  const [terminalId, setTerminalId] = useState('POS-01');

  useEffect(() => {
    // Check URL search params first, then localStorage
    const params = new URLSearchParams(window.location.search);
    const fromParams = params.get('terminal');
    if (fromParams) {
      setTerminalId(fromParams);
      localStorage.setItem('pos_terminal_id', fromParams);
      return;
    }

    const stored = localStorage.getItem('pos_terminal_id');
    if (stored) {
      setTerminalId(stored);
    }
  }, []);

  return terminalId;
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

// ── POS Layout ────────────────────────────────────────────────────

export default function POSLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, locations, isLoading, isAuthenticated } = useAuthContext();
  const terminalId = useTerminalId();

  // Barcode scanner listener
  useBarcodeScannerListener();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally omit `mode` to avoid loops
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
    <div className="flex h-full flex-col bg-gray-50">
      {/* ── Top Bar ──────────────────────────────────────────────── */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 bg-surface px-4 shadow-sm">
        {/* Left: Mode toggle, location, terminal, employee */}
        <div className="flex items-center gap-4">
          {/* Retail / F&B mode toggle — instant switch via React state */}
          <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
            <button
              type="button"
              onClick={() => switchMode('retail')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                isRetail
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Retail
            </button>
            <button
              type="button"
              onClick={() => switchMode('fnb')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                isFnB
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <UtensilsCrossed className="h-3.5 w-3.5" />
              F&B
            </button>
          </div>

          {/* Divider */}
          <div className="h-5 w-px bg-gray-200" />

          {/* Location */}
          <div className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-indigo-600" />
            <span className="text-sm font-semibold text-gray-900">
              {locationName}
            </span>
          </div>

          {/* Divider */}
          <div className="h-5 w-px bg-gray-200" />

          {/* Terminal */}
          <div className="flex items-center gap-1.5">
            <Monitor className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-600">
              {terminalId}
            </span>
          </div>

          {/* Divider */}
          <div className="h-5 w-px bg-gray-200" />

          {/* Employee */}
          <div className="flex items-center gap-1.5">
            <User className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-600">
              {displayName}
            </span>
          </div>
        </div>

        {/* Right: Exit */}
        <div className="flex items-center gap-4">
          {/* Exit POS */}
          <button
            type="button"
            onClick={handleExitPOS}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
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
            <RetailPOSContent isActive={isRetail} />
          </div>
        )}
        {visited.fnb && (
          <div className={`absolute inset-0 ${isFnB ? '' : 'pointer-events-none invisible'}`}>
            <FnBPOSContent isActive={isFnB} />
          </div>
        )}
        {/* Fallback for any future POS sub-routes */}
        {!isRetail && !isFnB && children}
      </div>
    </div>
  );
}
