export { db, guardedDb, withTenant, createAdminClient, sql, schema } from './client';
export type { Database } from './client';
export {
  guardedQuery,
  singleFlight,
  jitterTtl,
  jitterTtlMs,
  isBreakerOpen,
  isPoolExhaustion,
  getPoolGuardStats,
  recordZombieDetection,
  recordZombieKill,
} from './pool-guard';
export * from './schema';
