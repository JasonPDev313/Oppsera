export const MODULE_KEY = 'customers' as const;
export const MODULE_NAME = 'Customer Management';
export const MODULE_VERSION = '0.0.0';

// Commands
export { createCustomer } from './commands/create-customer';
export { updateCustomer } from './commands/update-customer';
export { addCustomerIdentifier } from './commands/add-customer-identifier';
export { addCustomerNote } from './commands/add-customer-note';
export { mergeCustomers } from './commands/merge-customers';
export { createMembershipPlan } from './commands/create-membership-plan';
export { updateMembershipPlan } from './commands/update-membership-plan';
export { enrollMember } from './commands/enroll-member';
export { updateMembershipStatus } from './commands/update-membership-status';
export { assignCustomerPrivilege } from './commands/assign-customer-privilege';
export { createBillingAccount } from './commands/create-billing-account';
export { updateBillingAccount } from './commands/update-billing-account';
export { addBillingAccountMember } from './commands/add-billing-account-member';
export { recordArTransaction } from './commands/record-ar-transaction';
export { recordArPayment } from './commands/record-ar-payment';
export { generateStatement } from './commands/generate-statement';

// Validation schemas + inferred types
export {
  createCustomerSchema,
  updateCustomerSchema,
  addCustomerIdentifierSchema,
  addCustomerNoteSchema,
  mergeCustomersSchema,
  searchCustomersSchema,
  createMembershipPlanSchema,
  updateMembershipPlanSchema,
  enrollMemberSchema,
  updateMembershipStatusSchema,
  assignCustomerPrivilegeSchema,
  createBillingAccountSchema,
  updateBillingAccountSchema,
  addBillingAccountMemberSchema,
  recordArTransactionSchema,
  recordArPaymentSchema,
  generateStatementSchema,
} from './validation';

export type {
  CreateCustomerInput,
  UpdateCustomerInput,
  AddCustomerIdentifierInput,
  AddCustomerNoteInput,
  MergeCustomersInput,
  SearchCustomersInput,
  CreateMembershipPlanInput,
  UpdateMembershipPlanInput,
  EnrollMemberInput,
  UpdateMembershipStatusInput,
  AssignCustomerPrivilegeInput,
  CreateBillingAccountInput,
  UpdateBillingAccountInput,
  AddBillingAccountMemberInput,
  RecordArTransactionInput,
  RecordArPaymentInput,
  GenerateStatementInput,
} from './validation';

// Helpers
export { computeDisplayName } from './helpers/display-name';
export { checkCreditLimit } from './helpers/credit-limit';

// Queries
export {
  listCustomers,
  getCustomer,
  listMembershipPlans,
  getMembershipPlan,
  listMemberships,
  listBillingAccounts,
  getBillingAccount,
  getArLedger,
  getAgingReport,
  getStatement,
  getCustomerPrivileges,
  searchCustomers,
} from './queries';

// Event types + consumers
export * from './events/types';
export { handleOrderPlaced, handleOrderVoided, handleTenderRecorded } from './events/consumers';
