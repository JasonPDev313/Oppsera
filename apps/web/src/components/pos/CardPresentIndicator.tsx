'use client';

import { useState, useEffect } from 'react';
import { Wifi, WifiOff, CreditCard, Loader2, CheckCircle2, XCircle, X } from 'lucide-react';

type CardPresentStatus =
  | 'idle'
  | 'waiting'      // Waiting for customer to insert/tap/swipe
  | 'processing'   // Card read, authorizing with gateway
  | 'approved'     // Payment approved
  | 'declined'     // Payment declined
  | 'timeout'      // Terminal timed out
  | 'cancelled';   // User cancelled

interface CardPresentIndicatorProps {
  status: CardPresentStatus;
  isConnected: boolean;
  deviceModel: string | null;
  hsn: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
  errorMessage?: string | null;
  onCancel?: () => void;
  onRetry?: () => void;
}

export function CardPresentIndicator({
  status,
  isConnected,
  deviceModel,
  hsn,
  cardBrand,
  cardLast4,
  errorMessage,
  onCancel,
  onRetry,
}: CardPresentIndicatorProps) {
  const [dotCount, setDotCount] = useState(0);

  // Animate dots when waiting
  useEffect(() => {
    if (status !== 'waiting') return;
    const interval = setInterval(() => {
      setDotCount((prev) => (prev + 1) % 4);
    }, 500);
    return () => clearInterval(interval);
  }, [status]);

  const dots = '.'.repeat(dotCount);

  return (
    <div className="rounded-lg border border-gray-200 bg-surface p-4 space-y-3">
      {/* Device status bar */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          {isConnected ? (
            <Wifi className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-red-500" />
          )}
          <span>{deviceModel ?? 'Terminal'}</span>
          {hsn && <span className="text-gray-400">({hsn})</span>}
        </div>
        <span className={isConnected ? 'text-green-600' : 'text-red-600'}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {/* Main status display */}
      <div className="flex flex-col items-center py-4">
        {status === 'idle' && (
          <>
            <CreditCard className="h-10 w-10 text-indigo-400" />
            <p className="mt-2 text-sm font-medium text-gray-600">Device ready</p>
          </>
        )}

        {status === 'waiting' && (
          <>
            <div className="relative">
              <CreditCard className="h-12 w-12 text-indigo-500 animate-pulse" />
            </div>
            <p className="mt-3 text-base font-semibold text-gray-900">
              Insert, tap, or swipe card{dots}
            </p>
            <p className="mt-1 text-xs text-gray-500">Waiting for customer interaction</p>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="mt-4 flex items-center gap-1.5 rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/10"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
            )}
          </>
        )}

        {status === 'processing' && (
          <>
            <Loader2 className="h-10 w-10 text-indigo-500 animate-spin" />
            <p className="mt-3 text-sm font-semibold text-gray-900">Processing payment...</p>
          </>
        )}

        {status === 'approved' && (
          <>
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="mt-3 text-base font-bold text-green-700">Approved</p>
            {cardBrand && cardLast4 && (
              <p className="mt-1 text-sm text-gray-600">
                {cardBrand} ****{cardLast4}
              </p>
            )}
          </>
        )}

        {status === 'declined' && (
          <>
            <XCircle className="h-12 w-12 text-red-500" />
            <p className="mt-3 text-base font-bold text-red-700">Declined</p>
            {errorMessage && (
              <p className="mt-1 text-xs text-red-500">{errorMessage}</p>
            )}
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
              >
                Try Again
              </button>
            )}
          </>
        )}

        {status === 'timeout' && (
          <>
            <XCircle className="h-12 w-12 text-orange-500" />
            <p className="mt-3 text-base font-bold text-orange-700">Timed Out</p>
            <p className="mt-1 text-xs text-gray-500">Terminal did not respond in time</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
              >
                Try Again
              </button>
            )}
          </>
        )}

        {status === 'cancelled' && (
          <>
            <X className="h-10 w-10 text-gray-400" />
            <p className="mt-2 text-sm font-medium text-gray-600">Cancelled</p>
          </>
        )}
      </div>
    </div>
  );
}
