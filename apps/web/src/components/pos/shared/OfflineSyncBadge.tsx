'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { CloudOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { createPortal } from 'react-dom';
import {
  getOfflinePendingCount,
  onSyncChange,
  processOfflineQueue,
} from '@/lib/pos-offline-sync';
import type { OfflineTransaction } from '@/lib/pos-offline-queue';
import { getAllTransactions } from '@/lib/pos-offline-queue';

function OfflineSyncBadgeComponent() {
  const [pendingCount, setPendingCount] = useState(0);
  const [showDetail, setShowDetail] = useState(false);
  const [transactions, setTransactions] = useState<OfflineTransaction[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refreshCount = useCallback(async () => {
    try {
      const count = await getOfflinePendingCount();
      setPendingCount(count);
    } catch {
      // IndexedDB not available
    }
  }, []);

  useEffect(() => {
    refreshCount();
    const unsub = onSyncChange(() => { refreshCount(); });
    return unsub;
  }, [refreshCount]);

  const handleShowDetail = useCallback(async () => {
    try {
      const all = await getAllTransactions();
      setTransactions(all);
    } catch {
      setTransactions([]);
    }
    setShowDetail(true);
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await processOfflineQueue();
      const all = await getAllTransactions();
      setTransactions(all);
    } finally {
      setSyncing(false);
    }
  }, []);

  if (pendingCount === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleShowDetail}
        className="relative flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors"
        style={{
          backgroundColor: 'var(--pos-bg-elevated)',
          color: 'var(--pos-text-warning, #d97706)',
        }}
        aria-label={`${pendingCount} offline transaction${pendingCount !== 1 ? 's' : ''} pending`}
      >
        <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{pendingCount}</span>
      </button>

      {showDetail && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="offline-queue-dialog-title">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowDetail(false)}
          />
          <div
            className="relative z-10 w-full max-w-md rounded-xl p-5 shadow-2xl"
            style={{
              backgroundColor: 'var(--pos-bg-surface)',
              color: 'var(--pos-text-primary)',
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 id="offline-queue-dialog-title" className="text-lg font-bold">Offline Queue</h3>
              <button
                type="button"
                onClick={handleSync}
                disabled={syncing || !navigator.onLine}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>

            {!navigator.onLine && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Still offline. Transactions will sync when connection is restored.
              </div>
            )}

            <div className="max-h-64 space-y-2 overflow-y-auto">
              {transactions.length === 0 ? (
                <p className="py-4 text-center text-sm" style={{ color: 'var(--pos-text-muted)' }}>
                  No offline transactions
                </p>
              ) : (
                transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between rounded-lg px-3 py-2"
                    style={{ backgroundColor: 'var(--pos-bg-elevated)' }}
                  >
                    <div>
                      <div className="text-sm font-medium">
                        Order #{tx.orderNumber}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--pos-text-muted)' }}>
                        ${(tx.payload.amount / 100).toFixed(2)} cash
                        {' \u00b7 '}
                        {new Date(tx.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {tx.status === 'pending' && (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-medium text-amber-500">
                          Pending
                        </span>
                      )}
                      {tx.status === 'syncing' && (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                      )}
                      {tx.status === 'failed' && (
                        <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-xs font-medium text-red-500">
                          Failed ({tx.retryCount})
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowDetail(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium"
                style={{ color: 'var(--pos-text-muted)' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export const OfflineSyncBadge = memo(OfflineSyncBadgeComponent);
