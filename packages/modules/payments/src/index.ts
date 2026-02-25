export const MODULE_KEY = 'payments' as const;
export const MODULE_NAME = 'Payments & Tenders';
export const MODULE_VERSION = '1.0.0';

// Register event contracts (side-effect import)
import './events/contracts';

// Commands
export { recordTender, reverseTender, adjustTip } from './commands';
export { purchaseVoucher, redeemVoucher, expireVouchers } from './commands';
export { recordChargeback, resolveChargeback } from './commands';
export { authorizePayment, capturePayment, salePayment, voidPayment, refundPayment } from './commands';
export { tokenizeCard, createPaymentProfile, inquirePaymentIntent } from './commands';
export { addPaymentMethod, removePaymentMethod, setDefaultPaymentMethod } from './commands';
export { terminalAuthCard, terminalReadCard, terminalDisplay, terminalCancel } from './commands';
export type { ReadCardResult } from './commands';
// ACH commands
export { tokenizeBankAccount, addBankAccount, initiateMicroDeposits, verifyMicroDeposits, processAchReturn } from './commands';
export type { BankTokenResult, BankAccountResult, InitiateMicroDepositsResult, VerifyMicroDepositsResult, ProcessAchReturnInput, ProcessAchReturnResult } from './commands';
export { matchSettlement, manualMatchSettlementLine, getSettlementVariance } from './commands/match-settlement';
export { postSettlementGl } from './commands/post-settlement-gl';
export {
  createProvider,
  updateProvider,
  saveProviderCredentials,
  createMerchantAccount,
  updateMerchantAccount,
  assignTerminalMerchant,
  updateMerchantAccountAch,
} from './commands/configure-provider';

// Jobs
export { fetchDailySettlements } from './jobs/fetch-daily-settlements';
export type { FetchSettlementInput, FetchSettlementResult } from './jobs/fetch-daily-settlements';
export { pollAchFunding } from './jobs/poll-ach-funding';
export type { PollAchFundingInput, PollAchFundingResult } from './jobs/poll-ach-funding';

// Queries
export { getTendersByOrder, listTenders, getPaymentJournalEntries } from './queries';
export { listPaymentMethods } from './queries';
export { getTokenizerConfig } from './queries/get-tokenizer-config';
/** @deprecated Use TokenizerClientConfig from @oppsera/shared instead. */
export type { TokenizerConfig } from './queries/get-tokenizer-config';
export type { TenderSummary, TenderWithReversals } from './queries/get-tenders-by-order';
export type { ListTendersInput, ListTendersResult } from './queries/list-tenders';
export type { GetJournalInput, GetJournalResult } from './queries/get-payment-journal-entries';
export type { StoredPaymentMethod } from './queries/list-payment-methods';
export {
  getSettlementReportSummary,
  getSettlementReportByLocation,
  getSettlementReconciliationReport,
} from './queries/settlement-report';
export type {
  SettlementReportFilters,
  SettlementReportSummary,
  SettlementReportByLocation,
  SettlementReconciliationRow,
} from './queries/settlement-report';

// ACH status queries
export {
  getAchStatusSummary,
  listAchPending,
  listAchReturns,
  getAchReturnDistribution,
  getAchSettlementByDate,
} from './queries/ach-status';
export type {
  AchStatusSummary,
  AchPendingItem,
  AchReturnItem,
  AchReturnCodeDistribution,
  AchSettlementByDate,
  GetAchStatusInput,
} from './queries/ach-status';

// Transaction queries
export { searchTransactions, getTransactionDetail } from './queries/search-transactions';
export type {
  TransactionListItem,
  TransactionListResult,
  TransactionDetail,
  TransactionRecord,
} from './queries/search-transactions';

// Failed payments queue
export { listFailedPayments, getFailedPaymentCounts } from './queries/failed-payments';
export type {
  FailedPaymentItem,
  FailedPaymentListResult,
  FailedPaymentCounts,
  ListFailedPaymentsInput,
} from './queries/failed-payments';
export { retryFailedPayment, retryFailedPaymentSchema } from './commands/retry-failed-payment';
export type { RetryFailedPaymentInput } from './commands/retry-failed-payment';
export { resolveFailedPayment, resolveFailedPaymentSchema } from './commands/resolve-failed-payment';
export type { ResolveFailedPaymentInput } from './commands/resolve-failed-payment';

// Provider config queries
export {
  listPaymentProviders,
  listProviderCredentials,
  listMerchantAccounts,
  listTerminalAssignments,
} from './queries/get-provider-config';
export type {
  ProviderSummary,
  CredentialInfo,
  MerchantAccountInfo,
  TerminalAssignmentInfo,
} from './queries/get-provider-config';

// Validation schemas + types
export { recordTenderSchema, reverseTenderSchema, adjustTipSchema } from './validation';
export type { RecordTenderInput, ReverseTenderInput, AdjustTipInput } from './validation';
export { purchaseVoucherSchema, redeemVoucherSchema, expireVouchersSchema } from './voucher-validation';
export type { PurchaseVoucherInput, RedeemVoucherInput, ExpireVouchersInput } from './voucher-validation';
export { recordChargebackSchema, resolveChargebackSchema } from './chargeback-validation';
export type { RecordChargebackInput, ResolveChargebackInput } from './chargeback-validation';
export { matchSettlementSchema, retryMatchSchema } from './commands/match-settlement';
export type { MatchSettlementInput, RetryMatchInput, SettlementVariance } from './commands/match-settlement';
export { postSettlementGlSchema } from './commands/post-settlement-gl';
export type { PostSettlementGlInput, PostSettlementGlResult } from './commands/post-settlement-gl';

// Terminal operation validation schemas + types
export {
  terminalAuthCardSchema,
  terminalReadCardSchema,
  terminalDisplaySchema,
  terminalCancelSchema,
  terminalTipSchema,
} from './validation/terminal-operations';
export type {
  TerminalAuthCardInput,
  TerminalReadCardInput,
  TerminalDisplayInput,
  TerminalCancelInput,
  TerminalTipInput,
} from './validation/terminal-operations';

// Payment method management validation schemas + types
export { addPaymentMethodSchema } from './commands/add-payment-method';
export type { AddPaymentMethodInput } from './commands/add-payment-method';
export { removePaymentMethodSchema } from './commands/remove-payment-method';
export type { RemovePaymentMethodInput } from './commands/remove-payment-method';
export { setDefaultPaymentMethodSchema } from './commands/set-default-payment-method';
export type { SetDefaultPaymentMethodInput } from './commands/set-default-payment-method';

// Helpers
export { generateJournalEntry } from './helpers';
export type {
  TenderForGL,
  OrderForGL,
  OrderLineForGL,
  JournalLine,
} from './helpers';

// Event consumer
export { handleOrderVoided } from './events/consumers';

// Gateway validation schemas + types
export {
  createProviderSchema,
  updateProviderSchema,
  saveCredentialsSchema,
  createMerchantAccountSchema,
  updateMerchantAccountSchema,
  assignTerminalMerchantSchema,
  authorizePaymentSchema,
  capturePaymentSchema,
  salePaymentSchema,
  voidPaymentSchema,
  refundPaymentSchema,
  tokenizeCardSchema,
  createPaymentProfileSchema,
  inquirePaymentSchema,
  searchTransactionsSchema,
  // ACH-specific schemas
  tokenizeBankAccountSchema,
  addBankAccountSchema,
  verifyMicroDepositsSchema,
  updateMerchantAccountAchSchema,
} from './gateway-validation';
export type {
  CreateProviderInput,
  UpdateProviderInput,
  SaveCredentialsInput,
  CreateMerchantAccountInput,
  UpdateMerchantAccountInput,
  AssignTerminalMerchantInput,
  AuthorizePaymentInput,
  CapturePaymentInput,
  SalePaymentInput,
  VoidPaymentInput,
  RefundPaymentInput,
  TokenizeCardInput,
  CreatePaymentProfileInput,
  InquirePaymentInput,
  SearchTransactionsInput,
  // ACH-specific types
  TokenizeBankAccountInput,
  AddBankAccountInput,
  VerifyMicroDepositsInput,
  UpdateMerchantAccountAchInput,
} from './gateway-validation';

// Gateway event types
export { PAYMENT_GATEWAY_EVENTS, INTENT_STATUS_TRANSITIONS, assertIntentTransition } from './events/gateway-types';
export type {
  PaymentGatewayEventType,
  PaymentIntentStatus,
  PaymentAuthorizedPayload,
  PaymentCapturedPayload,
  PaymentVoidedPayload,
  PaymentRefundedPayload,
  PaymentDeclinedPayload,
  PaymentSettledPayload,
  PaymentChargebackReceivedPayload,
  CardUpdatedPayload,
  ProfileCreatedPayload,
  ProfileDeletedPayload,
  // ACH event payloads
  AchOriginatedPayload,
  AchSettledPayload,
  AchReturnedPayload,
  AchSettlementStatus,
} from './events/gateway-types';
export { VALID_INTENT_STATUSES } from './events/gateway-types';

// Response interpreter
export { interpretResponse } from './services/response-interpreter';
export type { ResponseInterpretation, InterpretInput } from './services/response-interpreter';

// Gateway helpers
export { centsToDollars, dollarsToCents, generateProviderOrderId, extractCardLast4, detectCardBrand } from './helpers/amount';
export { encryptCredentials, decryptCredentials, type ProviderCredentialsPayload } from './helpers/credentials';
export { resolveProvider } from './helpers/resolve-provider';

// ACH helpers
export {
  getReturnCode,
  isRetryableReturn,
  getRetryDelayDays,
  classifyReturn,
  getReturnDescription,
  isAdministrativeReturn,
  ALL_RETURN_CODES,
} from './helpers/ach-return-codes';
export type { AchReturnCode, AchReturnCategory } from './helpers/ach-return-codes';

// Gateway facade
export { paymentsFacade } from './facade';

// Gateway result types
export type { PaymentIntentResult, TokenResult, PaymentProfileResult } from './types/gateway-results';

// Provider types (for advanced usage)
export type { PaymentProvider, ProviderCredentials, FundingStatusResponse, FundingTransaction } from './providers/interface';
export { providerRegistry } from './providers/registry';
export { CardPointeClient, CardPointeTimeoutError, CardPointeNetworkError } from './providers/cardpointe/client';
export type { CardPointeClientConfig } from './providers/cardpointe/client';

// Webhook handling
export { verifyWebhookSource, redactWebhookPayload } from './webhooks/verify-webhook';
export type { WebhookVerificationResult } from './webhooks/verify-webhook';
export { processWebhookEvent, detectEventType } from './webhooks/handlers';
export type { WebhookEventType, WebhookPayload, WebhookProcessResult } from './webhooks/handlers';

// Surcharge commands
export { saveSurchargeSettings, deleteSurchargeSettings } from './commands/surcharge-settings';

// Surcharge queries
export { listSurchargeSettings, getSurchargeSettings } from './queries/surcharge-settings';
export type { SurchargeSettingsInfo } from './queries/surcharge-settings';

// Surcharge validation schemas + types
export { saveSurchargeSettingsSchema, deleteSurchargeSettingsSchema, surchargeCalculationSchema } from './validation/surcharge-settings';
export type { SaveSurchargeSettingsInput, DeleteSurchargeSettingsInput, SurchargeCalculationInput } from './validation/surcharge-settings';

// Surcharge helpers
export { resolveSurcharge } from './helpers/resolve-surcharge';
export type { SurchargeConfig } from './helpers/resolve-surcharge';
export { calculateSurcharge, formatDisclosure } from './helpers/surcharge-calculator';

// Device management commands
export { assignDevice, updateDeviceAssignment, removeDeviceAssignment } from './commands/device-management';

// Device management validation
export { assignDeviceSchema, updateDeviceAssignmentSchema, removeDeviceAssignmentSchema } from './validation/device-management';
export type { AssignDeviceInput, UpdateDeviceAssignmentInput, RemoveDeviceAssignmentInput } from './validation/device-management';

// Device assignment queries
export { listDeviceAssignments, getDeviceAssignment, getDeviceByHsn } from './queries/device-assignments';
export type { DeviceAssignmentInfo } from './queries/device-assignments';

// Terminal API client + types
export { CardPointeTerminalClient, TerminalTimeoutError, TerminalConnectionError, TerminalApiError } from './providers/cardpointe/terminal-client';
export type { TerminalClientConfig } from './providers/cardpointe/terminal-client';
export { normalizeEntryMode } from './providers/cardpointe/terminal-types';
export type {
  TerminalAuthCardRequest,
  TerminalAuthCardResponse,
  TerminalReadCardRequest,
  TerminalReadCardResponse,
  TerminalPingResponse,
  TerminalTipRequest,
  TerminalTipResponse,
  EmvData,
  EntryMode,
} from './providers/cardpointe/terminal-types';

// Terminal session manager
export {
  getTerminalSession,
  invalidateTerminalSession,
  hasActiveSession,
  clearAllSessions,
} from './services/terminal-session-manager';

// Device resolution
export { resolveDevice } from './helpers/resolve-device';
export type { ResolvedDevice } from './helpers/resolve-device';

// Terminal context resolution (device + MID + credentials in one call)
export { resolveTerminalContext } from './helpers/resolve-terminal-context';
export type { TerminalContext } from './helpers/resolve-terminal-context';

// Reconciliation methods (used by ReconciliationReadApi)
export {
  getTendersSummary,
  getTenderAuditTrail,
  getUnmatchedTenders,
  getTenderAuditCount,
  listSettlements,
  getSettlementDetail,
  getSettlementStatusCounts,
  getDrawerSessionStatus,
  getRetailCloseStatus,
  getCashOnHand,
  getOverShortTotal,
  getTipBalances,
  listTipPayouts,
  getPendingTipCount,
  getOutstandingTipsCents,
  getDepositStatus,
  getLocationCloseStatus,
  getTenderForGlRepost,
  // ACH reconciliation methods
  getAchPendingCount,
  getAchReturnSummary,
  getAchSettlementSummary,
} from './reconciliation';
