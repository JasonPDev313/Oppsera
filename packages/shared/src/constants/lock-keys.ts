/**
 * Well-known distributed lock keys for app-level worker coordination.
 *
 * Each key identifies a singleton process that should never run concurrently
 * across Vercel instances. The distributed_locks table uses these as PKs.
 */
export const LOCK_KEYS = {
  /** ERP auto-close / day-end close cron */
  ERP_CRON: 'erp-cron',

  /** Outbox worker drain cycle */
  DRAIN_OUTBOX: 'drain-outbox',

  /** Guest pay session expiry sweep */
  GUEST_PAY_EXPIRY: 'guest-pay-expiry',

  /** Smart tag evaluation cron */
  TAG_EVALUATION_CRON: 'tag-evaluation-cron',

  /** PMS nightly charge posting */
  PMS_NIGHTLY_CHARGES: 'pms-nightly-charges',

  /** PMS no-show marking */
  PMS_NO_SHOW_MARKING: 'pms-no-show-marking',

  /** PMS housekeeping auto-dirty */
  PMS_HOUSEKEEPING_AUTO_DIRTY: 'pms-housekeeping-auto-dirty',

  /** Expired lock cleanup (self-maintaining) */
  LOCK_CLEANUP: 'lock-cleanup',
} as const;

export type LockKey = (typeof LOCK_KEYS)[keyof typeof LOCK_KEYS];
