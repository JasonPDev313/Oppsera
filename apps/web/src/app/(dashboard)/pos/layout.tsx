'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { X, MapPin, Monitor, User, Clock } from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

// ── Live Clock ────────────────────────────────────────────────────

function useLiveClock(): string {
  const [time, setTime] = useState(() => formatTime(new Date()));

  useEffect(() => {
    const id = setInterval(() => {
      setTime(formatTime(new Date()));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return time;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

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
  const { user, locations, isLoading, isAuthenticated } = useAuthContext();
  const clock = useLiveClock();
  const terminalId = useTerminalId();

  // Barcode scanner listener
  useBarcodeScannerListener();

  // Auth guard
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  const handleExitPOS = useCallback(() => {
    router.push('/');
  }, [router]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-50">
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
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
      {/* ── Top Bar ──────────────────────────────────────────────── */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-sm">
        {/* Left: Location, terminal, employee */}
        <div className="flex items-center gap-4">
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

        {/* Right: Clock + Exit */}
        <div className="flex items-center gap-4">
          {/* Clock */}
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium tabular-nums text-gray-600">
              {clock}
            </span>
          </div>

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
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
