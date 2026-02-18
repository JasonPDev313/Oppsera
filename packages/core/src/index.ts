export type { AuthUser, AuthAdapter } from './auth';
export { SupabaseAuthAdapter } from './auth';
export { requestContext, getRequestContext } from './auth';
export type { RequestContext } from './auth';
export { authenticate, resolveTenant } from './auth';
export { withMiddleware } from './auth';
export { getAuthAdapter } from './auth/get-adapter';
export { createSupabaseAdmin, createSupabaseClient } from './auth/supabase-client';
export type { PermissionEngine } from './permissions';
export {
  DefaultPermissionEngine,
  getPermissionEngine,
  setPermissionEngine,
  matchPermission,
  requirePermission,
  InMemoryPermissionCache,
  getPermissionCache,
  setPermissionCache,
  createRole,
  updateRole,
  deleteRole,
  assignRole,
  revokeRole,
  listRoles,
  getRoleDetail,
  getUserRoles,
  getEffectivePermissions,
} from './permissions';
export type { EntitlementCheck } from './entitlements';
export {
  DefaultEntitlementEngine,
  getEntitlementEngine,
  setEntitlementEngine,
  requireEntitlement,
  InMemoryEntitlementCache,
  getEntitlementCache,
  setEntitlementCache,
  MODULE_REGISTRY,
  checkSeatLimit,
  checkLocationLimit,
} from './entitlements';
export type { EventHandler, EventBus, OutboxWriter } from './events';
export {
  InMemoryEventBus,
  DrizzleOutboxWriter,
  OutboxWorker,
  buildEvent,
  buildEventFromContext,
  publishWithOutbox,
  getEventBus,
  setEventBus,
  getOutboxWriter,
  setOutboxWriter,
  getOutboxWorker,
  setOutboxWorker,
  initializeEventSystem,
  shutdownEventSystem,
  registerModuleEvents,
  registerContracts,
  getContractRegistry,
  clearContractRegistry,
  validateContracts,
} from './events';
export type {
  EventRegistration,
  PatternRegistration,
  ModuleEventRegistration,
  EventContract,
  ModuleContracts,
} from './events';
export type { AuditEntry, AuditLogger } from './audit';
export {
  DrizzleAuditLogger,
  getAuditLogger,
  setAuditLogger,
  auditLog,
  auditLogSystem,
  computeChanges,
  pruneAuditLog,
} from './audit';
export type { ConfigService } from './config';
export type { BillingAdapter } from './billing';

// ── Cross-module helpers (shared infrastructure) ──────────────────
export { checkIdempotency, saveIdempotencyKey } from './helpers/idempotency';
export { fetchOrderForMutation, incrementVersion } from './helpers/optimistic-lock';
export { calculateTaxes } from './helpers/tax-calc';
export type { TaxCalculationInput, TaxCalculationResult, TaxRateBreakdown } from './helpers/tax-calc';
export { getCatalogReadApi, setCatalogReadApi } from './helpers/catalog-read-api';
export type { CatalogReadApi, ItemTaxInfo, PosItemData } from './helpers/catalog-read-api';

// ── Observability ───────────────────────────────────────────────────
export {
  logger,
  log,
  setLogLevel,
  withApi,
  sendAlert,
  classifyAndAlert,
  dbHealth,
  jobHealth,
  setSentryRequestContext,
  setSentryBusinessContext,
  captureException,
  ObservabilityDrizzleLogger,
  metricsStore,
  createRequestMetrics,
  getRequestMetrics,
  recordDbQuery,
  runbooks,
  findRunbook,
} from './observability';
export type {
  LogLevel,
  LogEntry,
  AlertLevel,
  AlertPayload,
  RequestMetrics,
  Runbook,
  RunbookStep,
} from './observability';

// ── Security ─────────────────────────────────────────────────────
export { RATE_LIMITS, checkRateLimit, getRateLimitKey, rateLimitHeaders } from './security';
