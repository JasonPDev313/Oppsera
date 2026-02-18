/**
 * Simple feature flags — env-var driven, no external service needed.
 *
 * These allow migrating components one at a time without code deploys.
 * Flip the env var, redeploy, and the behavior changes.
 */

export const FLAGS = {
  /** Route read queries to a read replica (when available) */
  USE_READ_REPLICA: process.env.USE_READ_REPLICA === 'true',

  /** Enable Redis caching for hot paths */
  USE_REDIS_CACHE: process.env.USE_REDIS_CACHE === 'true',

  /** Use container-based workers instead of in-process outbox worker */
  USE_CONTAINER_WORKERS: process.env.USE_CONTAINER_WORKERS === 'true',

  /** Enable request logging to the database (in addition to stdout) */
  LOG_REQUESTS_TO_DB: process.env.LOG_REQUESTS_TO_DB === 'true',

  /** Enable the admin metrics dashboard endpoints */
  ENABLE_ADMIN_METRICS: process.env.ENABLE_ADMIN_METRICS !== 'false', // default ON

  /** Stripe billing integration enabled */
  ENABLE_STRIPE_BILLING: process.env.ENABLE_STRIPE_BILLING === 'true',
} as const;

export type FeatureFlag = keyof typeof FLAGS;

/** Check a flag at runtime (for flags that may change via hot-reload) */
export function isEnabled(flag: FeatureFlag): boolean {
  // Re-read from env to support runtime changes (e.g., Vercel env var update)
  switch (flag) {
    case 'USE_READ_REPLICA': return process.env.USE_READ_REPLICA === 'true';
    case 'USE_REDIS_CACHE': return process.env.USE_REDIS_CACHE === 'true';
    case 'USE_CONTAINER_WORKERS': return process.env.USE_CONTAINER_WORKERS === 'true';
    case 'LOG_REQUESTS_TO_DB': return process.env.LOG_REQUESTS_TO_DB === 'true';
    case 'ENABLE_ADMIN_METRICS': return process.env.ENABLE_ADMIN_METRICS !== 'false';
    case 'ENABLE_STRIPE_BILLING': return process.env.ENABLE_STRIPE_BILLING === 'true';
    default: return false;
  }
}
