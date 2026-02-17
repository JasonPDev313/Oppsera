export const MODULE_KEY = 'customers' as const;
export const MODULE_NAME = 'Customer Management';
export const MODULE_VERSION = '0.0.0';

// Commands (Session 16)
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

// Commands (Session 16.5 — Profile)
export { addCustomerContact } from './commands/add-customer-contact';
export { updateCustomerContact } from './commands/update-customer-contact';
export { setCustomerPreference } from './commands/set-customer-preference';
export { deleteCustomerPreference } from './commands/delete-customer-preference';
export { addCustomerDocument } from './commands/add-customer-document';
export { logCustomerCommunication } from './commands/log-customer-communication';
export { addServiceFlag } from './commands/add-service-flag';
export { removeServiceFlag } from './commands/remove-service-flag';
export { recordConsent } from './commands/record-consent';
export { addExternalId } from './commands/add-external-id';
export { createWalletAccount } from './commands/create-wallet-account';
export { adjustWalletBalance } from './commands/adjust-wallet-balance';
export { createAlert } from './commands/create-alert';
export { dismissAlert } from './commands/dismiss-alert';
export { createHousehold } from './commands/create-household';
export { addHouseholdMember } from './commands/add-household-member';
export { removeHouseholdMember } from './commands/remove-household-member';
export { recordVisit } from './commands/record-visit';
export { checkOutVisit } from './commands/check-out-visit';
export { createIncident } from './commands/create-incident';
export { updateIncident } from './commands/update-incident';
export { createSegment, addToSegment, removeFromSegment } from './commands/manage-segments';

// Validation schemas (Session 16)
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

// Validation schemas (Session 16.5)
export {
  addCustomerContactSchema,
  updateCustomerContactSchema,
  setCustomerPreferenceSchema,
  deleteCustomerPreferenceSchema,
  addCustomerDocumentSchema,
  logCustomerCommunicationSchema,
  addServiceFlagSchema,
  removeServiceFlagSchema,
  recordConsentSchema,
  addExternalIdSchema,
  createWalletAccountSchema,
  adjustWalletBalanceSchema,
  createAlertSchema,
  dismissAlertSchema,
  createHouseholdSchema,
  addHouseholdMemberSchema,
  removeHouseholdMemberSchema,
  recordVisitSchema,
  checkOutVisitSchema,
  createIncidentSchema,
  updateIncidentSchema,
  createSegmentSchema,
  addToSegmentSchema,
  removeFromSegmentSchema,
} from './validation';

// Inferred types (Session 16)
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

// Inferred types (Session 16.5)
export type {
  AddCustomerContactInput,
  UpdateCustomerContactInput,
  SetCustomerPreferenceInput,
  DeleteCustomerPreferenceInput,
  AddCustomerDocumentInput,
  LogCustomerCommunicationInput,
  AddServiceFlagInput,
  RemoveServiceFlagInput,
  RecordConsentInput,
  AddExternalIdInput,
  CreateWalletAccountInput,
  AdjustWalletBalanceInput,
  CreateAlertInput,
  DismissAlertInput,
  CreateHouseholdInput,
  AddHouseholdMemberInput,
  RemoveHouseholdMemberInput,
  RecordVisitInput,
  CheckOutVisitInput,
  CreateIncidentInput,
  UpdateIncidentInput,
  CreateSegmentInput,
  AddToSegmentInput,
  RemoveFromSegmentInput,
} from './validation';

// Helpers
export { computeDisplayName } from './helpers/display-name';
export { checkCreditLimit } from './helpers/credit-limit';

// Queries (Session 16)
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

// Queries (Session 16.5 — Profile)
export {
  getCustomerProfile,
  getCustomerFinancial,
  getCustomerPreferences,
  getCustomerActivity,
  getCustomerNotes,
  getCustomerDocuments,
  getCustomerCommunications,
  getCustomerCompliance,
  getCustomerSegments,
  getCustomerIntegrations,
  getCustomerAnalytics,
  listHouseholds,
} from './queries';

// Event types + consumers
export * from './events/types';
export { handleOrderPlaced, handleOrderVoided, handleTenderRecorded } from './events/consumers';
