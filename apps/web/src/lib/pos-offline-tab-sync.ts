/**
 * Phase 6: Offline tab mutation queue + replay.
 *
 * When offline, tab mutations (rename, assign, clear) are stored in
 * IndexedDB and replayed FIFO on reconnect. Version conflicts trigger
 * a server re-fetch + conflict toast.
 */

import { apiFetch } from '@/lib/api-client';

// ── Types ───────────────────────────────────────────────────────────

export type TabMutationType = 'rename' | 'assign_order' | 'clear_order' | 'change_server' | 'close';

export interface OfflineTabMutation {
  id: string;
  type: TabMutationType;
  tabId: string;
  payload: Record<string, unknown>;
  expectedVersion: number;
  createdAt: number; // epoch ms
  status: 'pending' | 'syncing' | 'failed';
  lastError?: string;
  retryCount: number;
}

// ── IndexedDB ───────────────────────────────────────────────────────

const DB_NAME = 'oppsera_pos_offline';
const DB_VERSION = 2; // Bumped from 1 (adds tab_mutations store)
const TAB_STORE = 'tab_mutations';
const MAX_RETRIES = 3;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Keep existing "transactions" store from V1
      if (!db.objectStoreNames.contains('transactions')) {
        const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
        txStore.createIndex('status', 'status', { unique: false });
        txStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Add new "tab_mutations" store for V2
      if (!db.objectStoreNames.contains(TAB_STORE)) {
        const tabStore = db.createObjectStore(TAB_STORE, { keyPath: 'id' });
        tabStore.createIndex('status', 'status', { unique: false });
        tabStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ── Queue Operations ────────────────────────────────────────────────

/**
 * Enqueue a tab mutation for offline replay.
 */
export async function enqueueTabMutation(
  mutation: Omit<OfflineTabMutation, 'id' | 'createdAt' | 'status' | 'retryCount'>,
): Promise<void> {
  const db = await openDb();
  const record: OfflineTabMutation = {
    ...mutation,
    id: `tab-mut-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
    status: 'pending',
    retryCount: 0,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(TAB_STORE, 'readwrite');
    tx.objectStore(TAB_STORE).add(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get all pending tab mutations, ordered by createdAt ASC (FIFO).
 */
export async function getPendingTabMutations(): Promise<OfflineTabMutation[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TAB_STORE, 'readonly');
    const index = tx.objectStore(TAB_STORE).index('status');
    const request = index.getAll('pending');
    request.onsuccess = () => {
      const results = (request.result as OfflineTabMutation[]).sort(
        (a, b) => a.createdAt - b.createdAt,
      );
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update a mutation's status in IndexedDB.
 */
async function updateMutationStatus(
  id: string,
  status: 'pending' | 'syncing' | 'failed',
  lastError?: string,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TAB_STORE, 'readwrite');
    const store = tx.objectStore(TAB_STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const record = getReq.result as OfflineTabMutation | undefined;
      if (!record) { resolve(); return; }
      record.status = status;
      if (lastError) record.lastError = lastError;
      if (status === 'failed') record.retryCount++;
      store.put(record);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Remove a mutation from the queue.
 */
async function removeMutation(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TAB_STORE, 'readwrite');
    tx.objectStore(TAB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Replay ──────────────────────────────────────────────────────────

let _isSyncing = false;
const _syncListeners = new Set<(hasPending: boolean) => void>();

/**
 * Subscribe to sync state changes.
 * Returns unsubscribe function.
 */
export function onTabSyncChange(listener: (hasPending: boolean) => void): () => void {
  _syncListeners.add(listener);
  return () => { _syncListeners.delete(listener); };
}

function notifySyncListeners(hasPending: boolean): void {
  for (const l of _syncListeners) {
    try { l(hasPending); } catch { /* ignore */ }
  }
}

/**
 * Replay all pending tab mutations, FIFO order.
 * Stops on first failure — doesn't cascade.
 * Returns { synced, failed, versionConflicts }.
 */
export async function replayTabMutations(): Promise<{
  synced: number;
  failed: number;
  versionConflicts: number;
}> {
  if (_isSyncing) return { synced: 0, failed: 0, versionConflicts: 0 };
  _isSyncing = true;
  notifySyncListeners(true);

  let synced = 0;
  let failed = 0;
  let versionConflicts = 0;

  try {
    const pending = await getPendingTabMutations();
    if (pending.length === 0) return { synced, failed, versionConflicts };

    for (const mutation of pending) {
      if (mutation.retryCount >= MAX_RETRIES) {
        await updateMutationStatus(mutation.id, 'failed', 'Max retries exceeded');
        failed++;
        continue;
      }

      await updateMutationStatus(mutation.id, 'syncing');

      try {
        if (mutation.type === 'close') {
          await apiFetch(`/api/v1/register-tabs/${mutation.tabId}`, {
            method: 'DELETE',
            body: JSON.stringify({
              ...mutation.payload,
              expectedVersion: mutation.expectedVersion,
            }),
          });
        } else {
          await apiFetch(`/api/v1/register-tabs/${mutation.tabId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              ...mutation.payload,
              expectedVersion: mutation.expectedVersion,
            }),
          });
        }

        await removeMutation(mutation.id);
        synced++;
      } catch (err: unknown) {
        const statusCode = (err as any)?.statusCode;

        if (statusCode === 409) {
          // Version conflict — remove mutation and let re-fetch handle it
          await removeMutation(mutation.id);
          versionConflicts++;
        } else {
          await updateMutationStatus(
            mutation.id,
            'pending',
            err instanceof Error ? err.message : 'Unknown error',
          );
          failed++;
          // Stop on first non-409 failure
          break;
        }
      }
    }
  } finally {
    _isSyncing = false;
    const remaining = await getPendingTabMutations();
    notifySyncListeners(remaining.length > 0);
  }

  return { synced, failed, versionConflicts };
}

/**
 * Check if there are any pending offline tab mutations.
 */
export async function hasPendingTabMutations(): Promise<boolean> {
  try {
    const pending = await getPendingTabMutations();
    return pending.length > 0;
  } catch {
    return false;
  }
}

// ── Auto-sync on reconnect ──────────────────────────────────────────

let _initialized = false;

/**
 * Initialize offline tab sync — listens for online events.
 * Safe to call multiple times.
 */
export function initOfflineTabSync(): void {
  if (_initialized || typeof window === 'undefined') return;
  _initialized = true;

  window.addEventListener('online', () => {
    // Small delay to let the network stabilize
    setTimeout(() => {
      replayTabMutations().catch((err) => {
        console.error('[offline-tab-sync] Replay failed:', err);
      });
    }, 1_000);
  });
}
