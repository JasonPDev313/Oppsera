'use client';

/**
 * IndexedDB-backed offline queue for POS cash transactions.
 * When the POS is offline and the tender type is cash, orders are
 * enqueued here and replayed when connectivity is restored.
 */

// ── Types ─────────────────────────────────────────────────────────

export interface OfflineTransaction {
  id: string;
  orderId: string;
  orderNumber: string;
  payload: {
    tenderType: 'cash';
    amount: number;
    amountGiven: number;
    changeGiven: number;
    tipAmount: number;
    clientRequestId: string;
  };
  createdAt: number; // epoch ms
  status: 'pending' | 'syncing' | 'failed';
  lastError?: string;
  retryCount: number;
}

// ── Constants ─────────────────────────────────────────────────────

const DB_NAME = 'oppsera_pos_offline';
const DB_VERSION = 1;
const STORE_NAME = 'transactions';

// ── IndexedDB Helpers ─────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ── Queue Operations ──────────────────────────────────────────────

/** Enqueue a cash transaction for later sync. */
export async function enqueueOfflineTransaction(tx: Omit<OfflineTransaction, 'status' | 'retryCount' | 'createdAt'>): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const record: OfflineTransaction = {
      ...tx,
      createdAt: Date.now(),
      status: 'pending',
      retryCount: 0,
    };
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

/** Get all pending transactions ordered by creation time. */
export async function getPendingTransactions(): Promise<OfflineTransaction[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('status');
    const request = index.getAll('pending');
    request.onsuccess = () => {
      const results = (request.result as OfflineTransaction[]).sort(
        (a, b) => a.createdAt - b.createdAt,
      );
      resolve(results);
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

/** Get count of pending transactions. */
export async function getPendingCount(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('status');
    const request = index.count('pending');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

/** Update a transaction's status. */
export async function updateTransactionStatus(
  id: string,
  status: OfflineTransaction['status'],
  error?: string,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const record = getReq.result as OfflineTransaction | undefined;
      if (!record) { resolve(); return; }
      record.status = status;
      if (error) record.lastError = error;
      if (status === 'failed') record.retryCount += 1;
      store.put(record);
      resolve();
    };
    getReq.onerror = () => reject(getReq.error);
    transaction.oncomplete = () => db.close();
  });
}

/** Remove a successfully synced transaction. */
export async function removeTransaction(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

/** Get all transactions (for debugging / status display). */
export async function getAllTransactions(): Promise<OfflineTransaction[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as OfflineTransaction[]);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}
