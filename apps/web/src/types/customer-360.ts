// Customer 360 types (Session 1)

export interface CustomerHeaderData {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  memberNumber: string | null;
  status: string;
  type: string;
  profileImageUrl: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  primaryPhoneDisplay: string | null;
  totalSpend: number;
  totalVisits: number;
  lastVisitAt: string | null;
  loyaltyTier: string | null;
  taxExempt: boolean;
  ghinNumber: string | null;
  activeMembership: {
    planName: string;
    status: string;
  } | null;
  outstandingBalance: number;
  creditLimit: number;
  activeFlags: Array<{ id: string; flagType: string; severity: string }>;
}

export interface CustomerEmailEntry {
  id: string;
  email: string;
  type: string;
  isPrimary: boolean;
  isVerified: boolean;
  canReceiveStatements: boolean;
  canReceiveMarketing: boolean;
}

export interface CustomerPhoneEntry {
  id: string;
  phoneE164: string;
  phoneDisplay: string | null;
  type: string;
  isPrimary: boolean;
  isVerified: boolean;
  canReceiveSms: boolean;
}

export interface CustomerAddressEntry {
  id: string;
  type: string;
  label: string | null;
  line1: string;
  line2: string | null;
  line3: string | null;
  city: string;
  state: string | null;
  postalCode: string | null;
  county: string | null;
  country: string;
  isPrimary: boolean;
  seasonalStartMonth: number | null;
  seasonalEndMonth: number | null;
}

export interface EmergencyContactEntry {
  id: string;
  name: string;
  relationship: string | null;
  phoneE164: string;
  phoneDisplay: string | null;
  email: string | null;
  notes: string | null;
  isPrimary: boolean;
}

export interface CustomerContacts360 {
  emails: CustomerEmailEntry[];
  phones: CustomerPhoneEntry[];
  addresses: CustomerAddressEntry[];
  emergencyContacts: EmergencyContactEntry[];
}

export interface CustomerOverviewData {
  outstandingBalance: number;
  creditLimit: number;
  creditUtilization: number;
  totalSpend: number;
  totalVisits: number;
  lastVisitAt: string | null;
  activeMembership: {
    planName: string;
    status: string;
    startDate: string | null;
  } | null;
  recentTransactions: Array<{
    id: string;
    type: string;
    description: string;
    amountCents: number;
    createdAt: string;
  }>;
  activeFlags: Array<{
    id: string;
    flagType: string;
    severity: string;
    description: string | null;
  }>;
  activeAlerts: Array<{
    id: string;
    alertType: string;
    severity: string;
    title: string;
    message: string | null;
  }>;
  lifetimeMetrics: {
    totalOrderCount: number;
    avgOrderValue: number;
    daysSinceLastVisit: number | null;
    topCategory: string | null;
    churnRiskScore: number | null;
  } | null;
}

// ── Mutation input types ────────────────────────────────────────

export interface AddEmailInput {
  email: string;
  type: string;
  isPrimary?: boolean;
  canReceiveStatements?: boolean;
  canReceiveMarketing?: boolean;
}

export interface UpdateEmailInput {
  type?: string;
  isPrimary?: boolean;
  canReceiveStatements?: boolean;
  canReceiveMarketing?: boolean;
}

export interface AddPhoneInput {
  phoneE164: string;
  type: string;
  isPrimary?: boolean;
  canReceiveSms?: boolean;
}

export interface UpdatePhoneInput {
  type?: string;
  isPrimary?: boolean;
  canReceiveSms?: boolean;
}

export interface AddAddressInput {
  type: string;
  label?: string;
  line1: string;
  line2?: string;
  line3?: string;
  city: string;
  state?: string;
  postalCode?: string;
  county?: string;
  country: string;
  isPrimary?: boolean;
  seasonalStartMonth?: number;
  seasonalEndMonth?: number;
}

export interface UpdateAddressInput {
  type?: string;
  label?: string;
  line1?: string;
  line2?: string;
  line3?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  county?: string;
  country?: string;
  isPrimary?: boolean;
  seasonalStartMonth?: number | null;
  seasonalEndMonth?: number | null;
}

export interface AddEmergencyContactInput {
  name: string;
  relationship?: string;
  phoneE164: string;
  email?: string;
  notes?: string;
  isPrimary?: boolean;
}

export interface UpdateEmergencyContactInput {
  name?: string;
  relationship?: string;
  phoneE164?: string;
  email?: string;
  notes?: string;
  isPrimary?: boolean;
}

// ── Session 2: Financial Engine ──────────────────────────────────

export interface FinancialAccountEntry {
  id: string;
  name: string;
  accountType: string;
  status: string;
  currentBalanceCents: number;
  creditLimitCents: number | null;
  creditUtilization: number;
  autopayStrategy: string | null;
  autopayEnabled: boolean;
  currency: string;
  collectionStatus: string;
  billingCycle: string;
  dueDays: number;
  billingEmail: string | null;
}

export interface CustomerFinancialSummary {
  accounts: FinancialAccountEntry[];
  totalBalanceCents: number;
  totalCreditLimitCents: number;
  overallUtilization: number;
}

export interface LedgerTransactionEntry {
  id: string;
  type: string;
  amountCents: number;
  notes: string | null;
  status: string;
  sourceModule: string | null;
  businessDate: string | null;
  locationId: string | null;
  departmentId: string | null;
  createdAt: string;
  accountName: string;
  accountId: string;
  metaJson: Record<string, unknown> | null;
}

export interface UnifiedLedgerResult {
  transactions: LedgerTransactionEntry[];
  cursor: string | null;
  hasMore: boolean;
}

export interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number | null;
  count: number;
  totalCents: number;
}

export interface AccountAgingEntry {
  accountId: string;
  accountName: string;
  buckets: AgingBucket[];
  totalCents: number;
}

export interface CustomerAgingSummary {
  buckets: AgingBucket[];
  byAccount: AccountAgingEntry[];
  totalOutstandingCents: number;
}

export interface AuditTrailEntry {
  id: string;
  actorUserId: string;
  actionType: string;
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
  reason: string | null;
  occurredAt: string;
}

export interface CustomerAuditTrailResult {
  entries: AuditTrailEntry[];
  cursor: string | null;
  hasMore: boolean;
}

// Mutation inputs
export interface CreateFinancialAccountInput {
  name: string;
  accountType?: string;
  creditLimitCents?: number;
  billingCycle?: string;
  dueDays?: number;
  billingEmail?: string;
}

export interface UpdateFinancialAccountInput {
  name?: string;
  status?: string;
  creditLimitCents?: number;
  billingCycle?: string;
  dueDays?: number;
  billingEmail?: string;
  autopayStrategy?: string | null;
  autopayFixedAmountCents?: number;
  autopayPaymentMethodId?: string;
}

export interface AdjustLedgerInput {
  type: 'credit_memo' | 'manual_charge' | 'writeoff' | 'adjustment';
  amountCents: number;
  notes: string;
  reason?: string;
}

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  reason: string;
}

// ── Session 3: Activity + Communication + Relationships + Documents ──

export interface ActivityFeedItem {
  id: string;
  source: 'activity_log' | 'communication';
  type: string;
  title: string;
  details: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface CustomerNoteEntry {
  id: string;
  content: string;
  isPinned: boolean;
  visibility: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface CommunicationEntry {
  id: string;
  channel: string;
  direction: string;
  subject: string | null;
  body: string | null;
  status: string;
  sentAt: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface RelationshipExtendedEntry {
  id: string;
  relatedCustomerId: string;
  relatedCustomerName: string;
  relatedCustomerEmail: string | null;
  relatedCustomerStatus: string;
  relationshipType: string;
  direction: 'parent' | 'child';
  isPrimary: boolean;
  effectiveDate: string | null;
  expirationDate: string | null;
  notes: string | null;
}

export interface CustomerFileEntry {
  id: string;
  documentType: string;
  name: string;
  description: string | null;
  mimeType: string;
  sizeBytes: number;
  tagsJson: string[];
  version: number;
  uploadedAt: string;
  uploadedBy: string;
  expiresAt: string | null;
}

// Session 3 mutation inputs
export interface AddNoteInput {
  content: string;
  isPinned?: boolean;
  visibility?: string;
}

export interface UpdateNoteInput {
  content?: string;
  isPinned?: boolean;
  visibility?: string;
}

export interface SendMessageInput {
  channel: string;
  direction?: string;
  subject?: string;
  body: string;
}

export interface UpdateRelationshipInput {
  isPrimary?: boolean;
  effectiveDate?: string | null;
  expirationDate?: string | null;
  notes?: string | null;
}

export interface UploadFileInput {
  documentType: string;
  name: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  description?: string;
  tagsJson?: string[];
  expiresAt?: string;
}

// ── Session 4: Stored Value + Discounts ──────────────────────────

export interface StoredValueInstrumentEntry {
  id: string;
  instrumentType: string;
  code: string;
  status: string;
  initialValueCents: number;
  currentBalanceCents: number;
  unitCount: number | null;
  unitsRemaining: number | null;
  description: string | null;
  expiresAt: string | null;
  issuedBy: string | null;
  createdAt: string;
}

export interface StoredValueTransactionEntry {
  id: string;
  txnType: string;
  amountCents: number;
  unitDelta: number | null;
  runningBalanceCents: number;
  sourceModule: string | null;
  sourceId: string | null;
  reason: string | null;
  createdAt: string;
  createdBy: string;
}

export interface StoredValueTransactionsResult {
  transactions: StoredValueTransactionEntry[];
  cursor: string | null;
  hasMore: boolean;
}

export interface DiscountRuleEntry {
  id: string;
  scopeType: string;
  customerId: string | null;
  membershipClassId: string | null;
  segmentId: string | null;
  priority: number;
  name: string;
  description: string | null;
  isActive: boolean;
  effectiveDate: string | null;
  expirationDate: string | null;
  ruleJson: Record<string, unknown>;
  createdAt: string;
}

export interface DiscountRulesResult {
  rules: DiscountRuleEntry[];
  cursor: string | null;
  hasMore: boolean;
}

export interface ApplicableDiscountRule {
  id: string;
  scopeType: string;
  priority: number;
  name: string;
  description: string | null;
  ruleJson: Record<string, unknown>;
  effectiveDate: string | null;
  expirationDate: string | null;
}

export interface StoredValueByType {
  instrumentType: string;
  count: number;
  balanceCents: number;
}

export interface StoredValueSummary {
  totalInstruments: number;
  totalBalanceCents: number;
  byType: StoredValueByType[];
}

export interface PrivilegeExtendedEntry {
  id: string;
  privilegeType: string;
  value: Record<string, unknown>;
  reason: string | null;
  isActive: boolean;
  effectiveDate: string | null;
  expirationDate: string | null;
  expiresAt: string | null;
  notes: string | null;
}

export interface CustomerPrivilegesExtended {
  privileges: PrivilegeExtendedEntry[];
  storedValueSummary: StoredValueSummary;
  discountRuleCount: number;
}

// Session 4 mutation inputs

export interface IssueStoredValueInput {
  instrumentType: string;
  code: string;
  initialValueCents?: number;
  unitCount?: number;
  liabilityGlAccountId?: string;
  description?: string;
  expiresAt?: string;
  metaJson?: Record<string, unknown>;
  clientRequestId?: string;
}

export interface RedeemStoredValueInput {
  amountCents: number;
  unitDelta?: number;
  sourceModule?: string;
  sourceId?: string;
  reason?: string;
  clientRequestId?: string;
}

export interface ReloadStoredValueInput {
  amountCents: number;
  unitDelta?: number;
  reason?: string;
  clientRequestId?: string;
}

export interface TransferStoredValueInput {
  sourceInstrumentId: string;
  targetInstrumentId: string;
  amountCents: number;
  approvedBy: string;
  reason?: string;
  clientRequestId?: string;
}

export interface VoidStoredValueInput {
  approvedBy: string;
  reason?: string;
  clientRequestId?: string;
}

export interface CreateDiscountRuleInput {
  scopeType?: string;
  customerId?: string;
  membershipClassId?: string;
  segmentId?: string;
  priority?: number;
  name: string;
  description?: string;
  effectiveDate?: string;
  expirationDate?: string;
  ruleJson: {
    conditions: Record<string, unknown>[];
    actions: Record<string, unknown>[];
    maxUsesPerPeriod?: number;
    maxUsesPerCustomer?: number;
    stackable?: boolean;
  };
  clientRequestId?: string;
}

export interface UpdateDiscountRuleInput {
  name?: string;
  description?: string;
  priority?: number;
  effectiveDate?: string | null;
  expirationDate?: string | null;
  ruleJson?: {
    conditions: Record<string, unknown>[];
    actions: Record<string, unknown>[];
    maxUsesPerPeriod?: number;
    maxUsesPerCustomer?: number;
    stackable?: boolean;
  };
}

export interface ToggleDiscountRuleInput {
  isActive: boolean;
}

// ── Session 5: Membership ──────────────────────────────────────

export interface MembershipAccountListEntry {
  id: string;
  accountNumber: string;
  status: string;
  startDate: string;
  endDate: string | null;
  primaryMemberId: string;
  primaryMemberName: string | null;
  autopayEnabled: boolean;
  creditLimitCents: number;
  holdCharging: boolean;
  memberCount: number;
  createdAt: string;
}

export interface MembershipMemberEntry {
  id: string;
  customerId: string;
  customerName: string | null;
  role: string;
  memberNumber: string | null;
  status: string;
  chargePrivileges: Record<string, unknown> | null;
}

export interface MembershipClassEntry {
  id: string;
  className: string;
  effectiveDate: string;
  expirationDate: string | null;
  billedThroughDate: string | null;
  isArchived: boolean;
}

export interface MembershipBillingItemEntry {
  id: string;
  description: string;
  amountCents: number;
  discountCents: number;
  frequency: string;
  isActive: boolean;
  isSubMemberItem: boolean;
}

export interface MembershipAuthorizedUserEntry {
  id: string;
  name: string;
  relationship: string | null;
  status: string;
  effectiveDate: string | null;
  expirationDate: string | null;
}

export interface MembershipAccountDetail {
  id: string;
  accountNumber: string;
  status: string;
  startDate: string;
  endDate: string | null;
  primaryMemberId: string;
  primaryMemberName: string | null;
  billingEmail: string | null;
  billingAddressJson: Record<string, unknown> | null;
  statementDayOfMonth: number;
  paymentTermsDays: number;
  autopayEnabled: boolean;
  creditLimitCents: number;
  holdCharging: boolean;
  billingAccountId: string | null;
  customerId: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  members: MembershipMemberEntry[];
  classes: MembershipClassEntry[];
  billingItems: MembershipBillingItemEntry[];
  authorizedUsers: MembershipAuthorizedUserEntry[];
  createdAt: string;
}

export interface MembershipAccountingSettings {
  clubModel: string;
  recognitionPolicy: Record<string, unknown> | null;
  defaultDuesRevenueAccountId: string | null;
  defaultDeferredRevenueAccountId: string | null;
  defaultInitiationRevenueAccountId: string | null;
  defaultNotesReceivableAccountId: string | null;
  defaultInterestIncomeAccountId: string | null;
  defaultCapitalContributionAccountId: string | null;
  defaultBadDebtAccountId: string | null;
  defaultLateFeeAccountId: string | null;
  defaultMinimumRevenueAccountId: string | null;
}

// ── Reservations & Waitlist (Cross-Module) ──────────────────────

export interface CustomerReservationEntry {
  id: string;
  module: 'spa' | 'pms' | 'dining' | 'golf';
  type: string;
  title: string;
  date: string;
  time: string | null;
  endTime: string | null;
  status: string;
  partySize: number | null;
  locationId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CustomerWaitlistEntry {
  id: string;
  module: 'spa' | 'dining';
  guestName: string;
  partySize: number | null;
  status: string;
  position: number | null;
  quotedWaitMinutes: number | null;
  addedAt: string;
  seatedAt: string | null;
}

export interface CustomerReservationsData {
  spa: CustomerReservationEntry[];
  hotel: CustomerReservationEntry[];
  dining: CustomerReservationEntry[];
  golf: CustomerReservationEntry[];
  waitlist: CustomerWaitlistEntry[];
}

// ── Order History ───────────────────────────────────────────────

export interface CustomerOrderEntry {
  id: string;
  orderNumber: string;
  businessDate: string | null;
  status: string;
  orderType: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  itemCount: number;
  locationId: string | null;
  tenderSummary: string | null;
  createdAt: string;
}

export interface CustomerOrdersResult {
  items: CustomerOrderEntry[];
  cursor: string | null;
  hasMore: boolean;
}
