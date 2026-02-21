/**
 * Client-side offline queue type definitions.
 * These types are used by the frontend POS app for offline mutation queuing.
 * No DB tables — stored in localStorage/IndexedDB on the terminal.
 */

export interface OfflineQueueItem {
  id: string; // ULID
  timestamp: number; // Date.now()
  endpoint: string; // e.g., POST /api/v1/fnb/tabs/{id}/add-item
  method: 'POST' | 'PATCH' | 'DELETE';
  body: Record<string, unknown>;
  tabId: string; // for conflict detection
  expectedVersion: number; // for CAS retry
  status: 'pending' | 'syncing' | 'synced' | 'conflict' | 'rejected';
  error?: string;
  retryCount: number;
}

export interface OfflineQueueState {
  items: OfflineQueueItem[];
  isOnline: boolean;
  lastSyncAt?: number;
  conflictedItems: string[]; // item IDs with version conflicts
}

/** Operations that CAN be queued offline */
export const OFFLINE_ALLOWED_OPERATIONS = [
  'tab.add_item',
  'tab.remove_item',
  'tab.update_item',
  'course.send',
  'tab.update_note',
] as const;

export type OfflineAllowedOperation = (typeof OFFLINE_ALLOWED_OPERATIONS)[number];

/** Operations that CANNOT happen offline */
export const OFFLINE_BLOCKED_OPERATIONS = [
  'payment.process',
  'tab.void',
  'batch.close',
  'kds.bump',
  'tender.reverse',
  'preauth.capture',
] as const;

export type OfflineBlockedOperation = (typeof OFFLINE_BLOCKED_OPERATIONS)[number];

/** Check if an operation can be queued offline */
export function isOfflineAllowed(operation: string): boolean {
  return (OFFLINE_ALLOWED_OPERATIONS as readonly string[]).includes(operation);
}

/** Maximum number of items that can be queued offline (configurable via settings) */
export const DEFAULT_MAX_OFFLINE_QUEUE_SIZE = 50;
