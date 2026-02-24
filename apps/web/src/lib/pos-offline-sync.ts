'use client';

/**
 * Offline sync worker for POS cash transactions.
 * Listens for `online` events and replays queued transactions
 * in FIFO order via the /place-and-pay API.
 */

import { apiFetch } from '@/lib/api-client';
import {
  getPendingTransactions,
  updateTransactionStatus,
  removeTransaction,
  getPendingCount,
} from '@/lib/pos-offline-queue';

// ── State ────────────────────────────────────────────────────────

let isSyncing = false;
const listeners: Set<() => void> = new Set();

/** Subscribe to sync state changes (pending count updates). */
export function onSyncChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function notifyListeners() {
  listeners.forEach((cb) => {
    try { cb(); } catch { /* ignore */ }
  });
}

// ── Sync Logic ───────────────────────────────────────────────────

const MAX_RETRIES = 3;

async function syncOne(tx: { id: string; orderId: string; payload: { tenderType: string; amount: number; amountGiven: number; changeGiven: number; tipAmount: number; clientRequestId: string } }): Promise<boolean> {
  try {
    await updateTransactionStatus(tx.id, 'syncing');
    notifyListeners();

    await apiFetch(`/api/v1/orders/${tx.orderId}/place-and-pay`, {
      method: 'POST',
      body: JSON.stringify(tx.payload),
    });

    await removeTransaction(tx.id);
    notifyListeners();
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await updateTransactionStatus(tx.id, 'failed', message);
    notifyListeners();
    return false;
  }
}

/** Process the entire offline queue in FIFO order. */
export async function processOfflineQueue(): Promise<{ synced: number; failed: number }> {
  if (isSyncing) return { synced: 0, failed: 0 };
  isSyncing = true;

  let synced = 0;
  let failed = 0;

  try {
    const pending = await getPendingTransactions();

    for (const tx of pending) {
      // Skip transactions that have exceeded max retries
      if (tx.retryCount >= MAX_RETRIES) {
        failed++;
        continue;
      }

      const ok = await syncOne(tx);
      if (ok) {
        synced++;
      } else {
        failed++;
        // Stop processing on first failure to avoid cascading errors
        break;
      }
    }
  } finally {
    isSyncing = false;
    notifyListeners();
  }

  return { synced, failed };
}

/** Get current pending count (convenience wrapper). */
export async function getOfflinePendingCount(): Promise<number> {
  return getPendingCount();
}

// ── Auto-Sync on Reconnect ───────────────────────────────────────

let initialized = false;

/** Initialize the sync worker. Call once at app startup. */
export function initOfflineSync(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  window.addEventListener('online', () => {
    // Small delay to let the connection stabilize
    setTimeout(() => {
      processOfflineQueue().catch(() => {});
    }, 2000);
  });
}
