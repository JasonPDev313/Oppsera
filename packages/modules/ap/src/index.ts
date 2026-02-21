// Module metadata
export const MODULE_KEY = 'ap' as const;
export const MODULE_NAME = 'Accounts Payable';
export const MODULE_VERSION = '0.0.0';

// Commands
export { createBill } from './commands/create-bill';
export { updateBill } from './commands/update-bill';
export { postBill } from './commands/post-bill';
export { voidBill } from './commands/void-bill';
export { createPaymentTerms } from './commands/create-payment-terms';
export { updatePaymentTerms } from './commands/update-payment-terms';
export { updateVendorAccounting } from './commands/update-vendor-accounting';
export { createBillFromReceipt } from './commands/create-bill-from-receipt';
export { createPayment } from './commands/create-payment';
export { postPayment } from './commands/post-payment';
export { voidPayment } from './commands/void-payment';
export { allocatePayment } from './commands/allocate-payment';
export { createVendorCredit } from './commands/create-vendor-credit';
export { applyVendorCredit } from './commands/apply-vendor-credit';
export { allocateLandedCost } from './commands/allocate-landed-cost';

// Queries
export { listBills } from './queries/list-bills';
export type { ListBillsInput, BillListItem, ListBillsResult } from './queries/list-bills';
export { getBill } from './queries/get-bill';
export type { GetBillInput, BillDetail, BillLine, BillPaymentAllocation } from './queries/get-bill';
export { listPaymentTerms } from './queries/list-payment-terms';
export type { ListPaymentTermsInput, PaymentTermItem } from './queries/list-payment-terms';
export { getVendorAccounting } from './queries/get-vendor-accounting';
export type { GetVendorAccountingInput, VendorAccountingDetail } from './queries/get-vendor-accounting';
export { getApAging } from './queries/get-ap-aging';
export type { GetApAgingInput, ApAgingVendorRow, ApAgingReport } from './queries/get-ap-aging';
export { getVendorLedger } from './queries/get-vendor-ledger';
export type { GetVendorLedgerInput, VendorLedgerEntry, VendorLedgerResult } from './queries/get-vendor-ledger';
export { getOpenBills } from './queries/get-open-bills';
export type { GetOpenBillsInput, OpenBillItem, GetOpenBillsResult } from './queries/get-open-bills';
export { getPaymentHistory } from './queries/get-payment-history';
export type { GetPaymentHistoryInput, PaymentHistoryItem, GetPaymentHistoryResult } from './queries/get-payment-history';
export { getExpenseByVendor } from './queries/get-expense-by-vendor';
export type { GetExpenseByVendorInput, VendorExpenseRow } from './queries/get-expense-by-vendor';
export { getCashRequirements } from './queries/get-cash-requirements';
export type { GetCashRequirementsInput, CashRequirementPeriod, CashRequirementsReport } from './queries/get-cash-requirements';
export { get1099Report } from './queries/get-1099-report';
export type { Get1099ReportInput, Vendor1099Row, Report1099 } from './queries/get-1099-report';
export { getAssetPurchases } from './queries/get-asset-purchases';
export type { GetAssetPurchasesInput, AssetPurchaseItem, AssetPurchaseRow } from './queries/get-asset-purchases';

// Errors
export {
  BillStatusError,
  DuplicateBillNumberError,
  BillTotalMismatchError,
  PaymentExceedsBillError,
  BillHasPaymentsError,
  InvalidAccountReferenceError,
} from './errors';

// Event types
export { AP_EVENTS } from './events/types';
export type {
  BillCreatedPayload,
  BillPostedPayload,
  BillVoidedPayload,
  BillPaidPayload,
  PaymentCreatedPayload,
  PaymentPostedPayload,
  PaymentVoidedPayload,
} from './events/types';

// Validation schemas
export {
  createBillSchema,
  updateBillSchema,
  postBillSchema,
  voidBillSchema,
  billLineSchema,
  createPaymentSchema,
  paymentAllocationSchema,
  createPaymentTermsSchema,
  updatePaymentTermsSchema,
  updateVendorAccountingSchema,
  BILL_STATUSES,
  BILL_LINE_TYPES,
  AP_PAYMENT_METHODS,
  PAYMENT_TERM_TYPES,
} from './validation';
export type {
  CreateBillInput,
  UpdateBillInput,
  PostBillInput,
  VoidBillInput,
  BillLineInput,
  CreatePaymentInput,
  PaymentAllocationInput,
  CreatePaymentTermsInput,
  UpdatePaymentTermsInput,
  UpdateVendorAccountingInput,
  BillStatus,
  BillLineType,
  ApPaymentMethod,
  PaymentTermType,
} from './validation';
