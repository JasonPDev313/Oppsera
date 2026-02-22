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

// Commands (Customer 360 — Session 1)
export { addCustomerEmail } from './commands/add-customer-email';
export { updateCustomerEmail } from './commands/update-customer-email';
export { removeCustomerEmail } from './commands/remove-customer-email';
export { addCustomerPhone } from './commands/add-customer-phone';
export { updateCustomerPhone } from './commands/update-customer-phone';
export { removeCustomerPhone } from './commands/remove-customer-phone';
export { addCustomerAddress } from './commands/add-customer-address';
export { updateCustomerAddress } from './commands/update-customer-address';
export { removeCustomerAddress } from './commands/remove-customer-address';
export { addEmergencyContact } from './commands/add-emergency-contact';
export { updateEmergencyContact } from './commands/update-emergency-contact';
export { removeEmergencyContact } from './commands/remove-emergency-contact';
export { updateCustomerMemberNumber } from './commands/update-customer-member-number';

// Commands (Customer 360 — Session 2: Financial Engine)
export { createFinancialAccount } from './commands/create-financial-account';
export { updateFinancialAccount } from './commands/update-financial-account';
export { adjustLedger } from './commands/adjust-ledger';
export { transferBetweenAccounts } from './commands/transfer-between-accounts';
export { configureAutopay } from './commands/configure-autopay';
export { recordCustomerAuditEntry } from './commands/record-customer-audit-entry';
export { placeFinancialHold } from './commands/place-financial-hold';
export { liftFinancialHold } from './commands/lift-financial-hold';
export { updateCreditLimit } from './commands/update-credit-limit';

// Commands (Customer 360 — Session 3: Activity + Communication + Relationships + Documents)
export { sendCustomerMessage } from './commands/send-customer-message';
export { addCustomerNoteV2 } from './commands/add-customer-note-v2';
export { updateCustomerNote } from './commands/update-customer-note';
export { removeCustomerNote } from './commands/remove-customer-note';
export { updateCustomerRelationship } from './commands/update-relationship';
export { removeCustomerRelationship } from './commands/remove-relationship';
export { uploadCustomerFile } from './commands/upload-customer-file';
export { deleteCustomerFile } from './commands/delete-customer-file';

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

// Validation schemas (Customer 360 — Session 1)
export {
  addCustomerEmailSchema,
  updateCustomerEmailSchema,
  removeCustomerEmailSchema,
  addCustomerPhoneSchema,
  updateCustomerPhoneSchema,
  removeCustomerPhoneSchema,
  addCustomerAddressSchema,
  updateCustomerAddressSchema,
  removeCustomerAddressSchema,
  addEmergencyContactSchema,
  updateEmergencyContactSchema,
  removeEmergencyContactSchema,
  updateCustomerMemberNumberSchema,
} from './validation';

// Inferred types (Customer 360 — Session 1)
export type {
  AddCustomerEmailInput,
  UpdateCustomerEmailInput,
  RemoveCustomerEmailInput,
  AddCustomerPhoneInput,
  UpdateCustomerPhoneInput,
  RemoveCustomerPhoneInput,
  AddCustomerAddressInput,
  UpdateCustomerAddressInput,
  RemoveCustomerAddressInput,
  AddEmergencyContactInput,
  UpdateEmergencyContactInput,
  RemoveEmergencyContactInput,
  UpdateCustomerMemberNumberInput,
} from './validation';

// Validation schemas (Customer 360 — Session 2: Financial Engine)
export {
  createFinancialAccountSchema,
  updateFinancialAccountSchema,
  adjustLedgerSchema,
  transferBetweenAccountsSchema,
  configureAutopaySchema,
  recordCustomerAuditEntrySchema,
  placeFinancialHoldSchema,
  liftFinancialHoldSchema,
  updateCreditLimitSchema,
} from './validation';

// Inferred types (Customer 360 — Session 2: Financial Engine)
export type {
  CreateFinancialAccountInput,
  UpdateFinancialAccountInput,
  AdjustLedgerInput,
  TransferBetweenAccountsInput,
  ConfigureAutopayInput,
  RecordCustomerAuditEntryInput,
  PlaceFinancialHoldInput,
  LiftFinancialHoldInput,
  UpdateCreditLimitInput,
} from './validation';

// Validation schemas (Customer 360 — Session 3: Activity + Communication + Relationships + Documents)
export {
  sendCustomerMessageSchema,
  addCustomerNoteV2Schema,
  updateCustomerNoteSchema,
  removeCustomerNoteSchema,
  updateRelationshipSchema,
  removeRelationshipSchema,
  uploadCustomerFileSchema,
  deleteCustomerFileSchema,
} from './validation';

// Inferred types (Customer 360 — Session 3)
export type {
  SendCustomerMessageInput,
  AddCustomerNoteV2Input,
  UpdateCustomerNoteInput,
  RemoveCustomerNoteInput,
  UpdateRelationshipInput,
  RemoveRelationshipInput,
  UploadCustomerFileInput,
  DeleteCustomerFileInput,
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

// Queries (Customer 360 — Session 1)
export {
  getCustomerHeader,
  getCustomerContacts360,
  getCustomerOverview,
} from './queries';

// Queries (Customer 360 — Session 2: Financial Engine)
export {
  getFinancialAccountsSummary,
  getUnifiedLedger,
  getCustomerAgingSummary,
  getCustomerAuditTrail,
} from './queries';

// Queries (Customer 360 — Session 3: Activity + Communication + Relationships + Documents)
export {
  getCustomerActivityFeed,
  getCustomerNotesList,
  getCommunicationTimeline,
  getRelationshipsExtended,
  getCustomerFilesList,
} from './queries';

// Commands (Customer 360 — Session 4: Stored Value + Discounts)
export { issueStoredValue } from './commands/issue-stored-value';
export { redeemStoredValue } from './commands/redeem-stored-value';
export { reloadStoredValue } from './commands/reload-stored-value';
export { transferStoredValue } from './commands/transfer-stored-value';
export { voidStoredValue } from './commands/void-stored-value';
export { createDiscountRule } from './commands/create-discount-rule';
export { updateDiscountRule } from './commands/update-discount-rule';
export { toggleDiscountRule } from './commands/toggle-discount-rule';

// Validation schemas (Customer 360 — Session 4: Stored Value + Discounts)
export {
  issueStoredValueSchema,
  redeemStoredValueSchema,
  reloadStoredValueSchema,
  transferStoredValueSchema,
  voidStoredValueSchema,
  createDiscountRuleSchema,
  updateDiscountRuleSchema,
  toggleDiscountRuleSchema,
} from './validation';

// Inferred types (Customer 360 — Session 4: Stored Value + Discounts)
export type {
  IssueStoredValueInput,
  RedeemStoredValueInput,
  ReloadStoredValueInput,
  TransferStoredValueInput,
  VoidStoredValueInput,
  CreateDiscountRuleInput,
  UpdateDiscountRuleInput,
  ToggleDiscountRuleInput,
} from './validation';

// Queries (Customer 360 — Session 4: Stored Value + Discounts)
export {
  getStoredValueInstruments,
  getStoredValueTransactions,
  listDiscountRules,
  getApplicableDiscountRules,
  getCustomerPrivilegesExtended,
} from './queries';

// Event types + consumers
export * from './events/types';
export { handleOrderPlaced, handleOrderVoided, handleTenderRecorded } from './events/consumers';
