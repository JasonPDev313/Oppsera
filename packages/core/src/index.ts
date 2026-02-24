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
export type { EntitlementCheck, AccessMode, RiskLevel, ModuleCategory, ModuleDefinition, DependencyCheckResult } from './entitlements';
export {
  DefaultEntitlementEngine,
  getEntitlementEngine,
  setEntitlementEngine,
  requireEntitlement,
  requireEntitlementWrite,
  InMemoryEntitlementCache,
  getEntitlementCache,
  setEntitlementCache,
  MODULE_REGISTRY,
  getModuleDefinition,
  getDependents,
  validateModeChange,
  computeDependencyChain,
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
  listDeadLetters,
  getDeadLetter,
  getDeadLetterStats,
  retryDeadLetter,
  resolveDeadLetter,
  discardDeadLetter,
} from './events';
export type {
  EventRegistration,
  PatternRegistration,
  ModuleEventRegistration,
  EventContract,
  ModuleContracts,
  DeadLetterEntry,
  DeadLetterStats,
  ListDeadLettersInput,
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
export { getAccountingPostingApi, setAccountingPostingApi } from './helpers/accounting-posting-api';
export type { AccountingPostingApi, AccountingPostJournalInput } from './helpers/accounting-posting-api';
export { getOrdersWriteApi, setOrdersWriteApi } from './helpers/orders-write-api';
export type { OrdersWriteApi, OrdersWriteOpenInput, OrdersWriteAddLineInput, OrdersWriteUpdateInput, OrdersWriteResult } from './helpers/orders-write-api';
export { getPaymentsGatewayApi, setPaymentsGatewayApi, hasPaymentsGateway } from './helpers/payments-gateway-api';
export type {
  PaymentsGatewayApi,
  GatewayAuthorizeInput,
  GatewayCaptureInput,
  GatewaySaleInput,
  GatewayVoidInput,
  GatewayRefundInput,
  GatewayResult,
} from './helpers/payments-gateway-api';
export { getReconciliationReadApi, setReconciliationReadApi } from './helpers/reconciliation-read-api';
export type {
  ReconciliationReadApi,
  OrdersSummaryData, TaxBreakdownRow, TaxRemittanceRow, CompTotalData,
  TendersSummaryData, TenderAuditTrailData, TenderAuditTrailStep, UnmatchedTenderRow,
  SettlementFilters, SettlementListResult, SettlementListItem, SettlementDetailData, SettlementLineDetail,
  TipBalanceRow, TipPayoutFilters, TipPayoutListResult, TipPayoutItem,
  TerminalCloseStatus, LocationCloseStatusData,
  InventoryMovementsSummaryData,
} from './helpers/reconciliation-read-api';

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

// ── Profit Centers & Terminals ──────────────────────────────────────
export * from './profit-centers';

// ── Drawer Sessions ─────────────────────────────────────────────────
export * from './drawer-sessions';
export * from './retail-close';
export * from './pos-ops';

// ── Settings ────────────────────────────────────────────────────
export { getNavPreferences, saveNavPreferences } from './settings';

// ── Email ───────────────────────────────────────────────────────
export { sendEmail } from './email/send-email';
export { memberVerificationEmail } from './email/templates';

// ── Security ─────────────────────────────────────────────────────
export { RATE_LIMITS, checkRateLimit, getRateLimitKey, rateLimitHeaders } from './security';
export {
  normalizeEmail,
  normalizeUsername,
  validatePin,
  hashSecret,
  verifySecret,
  listUsers,
  getUserById,
  inviteUser,
  createUser,
  updateUser,
  resetPassword,
  resetPins,
  acceptInvite,
} from './users';
export type {
  UserStatus,
  InviteUserInput,
  CreateUserInput,
  UpdateUserInput,
  ResetPinInput,
  AcceptInviteInput,
} from './users';
