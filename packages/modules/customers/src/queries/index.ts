export { listCustomers } from './list-customers';
export type { ListCustomersInput, ListCustomersResult, CustomerListItem } from './list-customers';

export { getCustomer } from './get-customer';
export type { GetCustomerInput, CustomerDetail } from './get-customer';

export { listMembershipPlans } from './list-membership-plans';
export type { ListMembershipPlansInput, ListMembershipPlansResult } from './list-membership-plans';

export { getMembershipPlan } from './get-membership-plan';
export type { GetMembershipPlanInput, MembershipPlanDetail } from './get-membership-plan';

export { listMemberships } from './list-memberships';
export type { ListMembershipsInput, ListMembershipsResult } from './list-memberships';

export { listBillingAccounts } from './list-billing-accounts';
export type { ListBillingAccountsInput, ListBillingAccountsResult } from './list-billing-accounts';

export { getBillingAccount } from './get-billing-account';
export type { GetBillingAccountInput, BillingAccountDetail } from './get-billing-account';

export { getArLedger } from './get-ar-ledger';
export type { GetArLedgerInput, GetArLedgerResult } from './get-ar-ledger';

export { getAgingReport } from './get-aging-report';
export type { GetAgingReportInput, AgingReport } from './get-aging-report';

export { getStatement } from './get-statement';
export type { GetStatementInput } from './get-statement';

export { getCustomerPrivileges } from './get-customer-privileges';
export type { GetCustomerPrivilegesInput, PrivilegeEntry } from './get-customer-privileges';

export { searchCustomers } from './search-customers';
export type { SearchCustomersInput, SearchCustomerResult } from './search-customers';

export { getCustomerProfile } from './get-customer-profile';
export type { GetCustomerProfileInput, CustomerProfileOverview } from './get-customer-profile';

export { getCustomerFinancial } from './get-customer-financial';
export type {
  GetCustomerFinancialInput,
  ArAgingBuckets,
  CustomerFinancialResult,
} from './get-customer-financial';

export { getCustomerPreferences } from './get-customer-preferences';
export type { GetCustomerPrefsInput, CustomerPrefsResult } from './get-customer-preferences';

export { getCustomerActivity } from './get-customer-activity';
export type { GetCustomerActivityInput, GetCustomerActivityResult } from './get-customer-activity';

export { getCustomerNotes } from './get-customer-notes';
export type { GetCustomerNotesInput, GetCustomerNotesResult } from './get-customer-notes';

export { getCustomerDocuments } from './get-customer-documents';
export type { GetCustomerDocumentsInput } from './get-customer-documents';

export { getCustomerCommunications } from './get-customer-communications';
export type {
  GetCustomerCommsInput,
  GetCustomerCommsResult,
} from './get-customer-communications';

export { getCustomerCompliance } from './get-customer-compliance';
export type { GetCustomerComplianceInput } from './get-customer-compliance';

export { getCustomerSegments } from './get-customer-segments';
export type { GetCustomerSegmentsInput, CustomerSegmentEntry } from './get-customer-segments';

export { getCustomerIntegrations } from './get-customer-integrations';
export type {
  GetCustomerIntegrationsInput,
  GetCustomerIntegrationsResult,
} from './get-customer-integrations';

export { getCustomerAnalytics } from './get-customer-analytics';
export type {
  GetCustomerAnalyticsInput,
  GetCustomerAnalyticsResult,
} from './get-customer-analytics';

export { listHouseholds } from './list-households';
export type {
  ListHouseholdsInput,
  HouseholdListItem,
  ListHouseholdsResult,
} from './list-households';

// ── Customer 360 (Session 1) ──────────────────────────────────────
export { getCustomerHeader } from './get-customer-header';
export type { GetCustomerHeaderInput, CustomerHeaderData } from './get-customer-header';

export { getCustomerContacts360 } from './get-customer-contacts-360';
export type { GetCustomerContacts360Input, CustomerContacts360 } from './get-customer-contacts-360';

export { getCustomerOverview } from './get-customer-overview';
export type { GetCustomerOverviewInput, CustomerOverviewData } from './get-customer-overview';

// ── Customer Financial Engine (Session 2) ────────────────────────
export { getFinancialAccountsSummary } from './get-financial-accounts-summary';
export type {
  GetFinancialAccountsSummaryInput,
  FinancialAccountEntry,
  CustomerFinancialSummary,
} from './get-financial-accounts-summary';

export { getUnifiedLedger } from './get-unified-ledger';
export type {
  GetUnifiedLedgerInput,
  UnifiedLedgerEntry,
  UnifiedLedgerResult,
} from './get-unified-ledger';

export { getCustomerAgingSummary } from './get-customer-aging-summary';
export type {
  GetCustomerAgingSummaryInput,
  AgingBucket,
  AccountAgingEntry,
  CustomerAgingSummary,
} from './get-customer-aging-summary';

export { getCustomerAuditTrail } from './get-customer-audit-trail';
export type {
  GetCustomerAuditTrailInput,
  AuditTrailEntry,
  CustomerAuditTrailResult,
} from './get-customer-audit-trail';

// ── Session 3: Activity + Communication + Relationships + Documents ──
export { getCustomerActivityFeed } from './get-customer-activity-feed';
export type {
  GetCustomerActivityFeedInput,
  ActivityFeedItem,
  GetCustomerActivityFeedResult,
} from './get-customer-activity-feed';

export { getCustomerNotesList } from './get-customer-notes-list';
export type {
  GetCustomerNotesListInput,
  CustomerNoteItem,
  GetCustomerNotesListResult,
} from './get-customer-notes-list';

export { getCommunicationTimeline } from './get-communication-timeline';
export type {
  GetCommunicationTimelineInput,
  CommunicationTimelineItem,
  GetCommunicationTimelineResult,
} from './get-communication-timeline';

export { getRelationshipsExtended } from './get-relationships-extended';
export type {
  GetRelationshipsExtendedInput,
  RelationshipExtended,
  GetRelationshipsExtendedResult,
} from './get-relationships-extended';

export { getCustomerFilesList } from './get-customer-files-list';
export type {
  GetCustomerFilesListInput,
  CustomerFileItem,
  GetCustomerFilesListResult,
} from './get-customer-files-list';

// ── Session 4: Stored Value + Discounts ─────────────────────────────
export { getStoredValueInstruments } from './get-stored-value-instruments';
export type {
  GetStoredValueInstrumentsInput,
  StoredValueInstrumentSummary,
} from './get-stored-value-instruments';

export { getStoredValueTransactions } from './get-stored-value-transactions';
export type {
  GetStoredValueTransactionsInput,
  StoredValueTransactionEntry,
} from './get-stored-value-transactions';

export { getApplicableDiscountRules } from './get-applicable-discount-rules';
export type {
  GetApplicableDiscountRulesInput,
  ApplicableDiscountRule,
} from './get-applicable-discount-rules';

export { listDiscountRules } from './list-discount-rules';
export type {
  ListDiscountRulesInput,
  DiscountRuleListEntry,
} from './list-discount-rules';

export { getCustomerPrivilegesExtended } from './get-customer-privileges-extended';
export type {
  GetCustomerPrivilegesExtendedInput,
  PrivilegeExtendedEntry,
  StoredValueByType,
  StoredValueSummary,
  CustomerPrivilegesExtended,
} from './get-customer-privileges-extended';

// ── Tag Management ──────────────────────────────────────────────────
export { listTags } from './list-tags';
export type { ListTagsInput, TagListItem, ListTagsResult } from './list-tags';

export { getTag } from './get-tag';
export type { GetTagInput, TagDetail } from './get-tag';

export { getCustomerTags } from './get-customer-tags';
export type { GetCustomerTagsInput, CustomerTagEntry } from './get-customer-tags';

export { getTaggedCustomers } from './get-tagged-customers';
export type {
  GetTaggedCustomersInput,
  TaggedCustomerEntry,
  GetTaggedCustomersResult,
} from './get-tagged-customers';

export { listSmartTagRules } from './list-smart-tag-rules';
export type {
  ListSmartTagRulesInput,
  SmartTagRuleListItem,
  ListSmartTagRulesResult,
} from './list-smart-tag-rules';

export { getSmartTagRule } from './get-smart-tag-rule';
export type {
  GetSmartTagRuleInput,
  SmartTagRuleDetail,
  SmartTagEvaluationSummary,
} from './get-smart-tag-rule';

export { getTagAuditLog } from './get-tag-audit-log';
export type {
  GetTagAuditLogInput,
  TagAuditLogEntry,
  GetTagAuditLogResult,
} from './get-tag-audit-log';

export { getSmartTagEvaluationHistory } from './get-smart-tag-evaluation-history';
export type {
  GetSmartTagEvaluationHistoryInput,
  SmartTagEvaluationEntry,
  GetSmartTagEvaluationHistoryResult,
} from './get-smart-tag-evaluation-history';
