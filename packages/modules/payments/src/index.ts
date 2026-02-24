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

// Queries
export { getTendersByOrder, listTenders, getPaymentJournalEntries } from './queries';
export { listPaymentMethods } from './queries';
export { getTokenizerConfig } from './queries/get-tokenizer-config';
export type { TokenizerConfig } from './queries/get-tokenizer-config';
export type { TenderSummary, TenderWithReversals } from './queries/get-tenders-by-order';
export type { ListTendersInput, ListTendersResult } from './queries/list-tenders';
export type { GetJournalInput, GetJournalResult } from './queries/get-payment-journal-entries';
export type { StoredPaymentMethod } from './queries/list-payment-methods';

// Validation schemas + types
export { recordTenderSchema, reverseTenderSchema, adjustTipSchema } from './validation';
export type { RecordTenderInput, ReverseTenderInput, AdjustTipInput } from './validation';
export { purchaseVoucherSchema, redeemVoucherSchema, expireVouchersSchema } from './voucher-validation';
export type { PurchaseVoucherInput, RedeemVoucherInput, ExpireVouchersInput } from './voucher-validation';
export { recordChargebackSchema, resolveChargebackSchema } from './chargeback-validation';
export type { RecordChargebackInput, ResolveChargebackInput } from './chargeback-validation';

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
} from './events/gateway-types';

// Gateway helpers
export { centsToDollars, dollarsToCents, generateProviderOrderId, extractCardLast4, detectCardBrand } from './helpers/amount';
export { encryptCredentials, decryptCredentials } from './helpers/credentials';
export { resolveProvider } from './helpers/resolve-provider';

// Gateway facade
export { paymentsFacade } from './facade';

// Gateway result types
export type { PaymentIntentResult, TokenResult, PaymentProfileResult } from './types/gateway-results';

// Provider types (for advanced usage)
export type { PaymentProvider, ProviderCredentials } from './providers/interface';
export { providerRegistry } from './providers/registry';

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
} from './reconciliation';
