export interface Customer {
  id: string;
  tenantId: string;
  type: 'person' | 'organization';
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  organizationName: string | null;
  displayName: string;
  notes: string | null;
  tags: string[];
  marketingConsent: boolean;
  taxExempt: boolean;
  taxExemptCertificateNumber: string | null;
  totalVisits: number;
  totalSpend: number;
  lastVisitAt: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface CustomerIdentifier {
  id: string;
  customerId: string;
  type: string;
  value: string;
  isActive: boolean;
  createdAt: string;
}

export interface CustomerActivity {
  id: string;
  customerId: string;
  activityType: string;
  title: string;
  details: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  createdBy: string | null;
}

export interface CustomerMembershipSummary {
  id: string;
  planId: string;
  planName: string;
  status: string;
  startDate: string;
  endDate: string | null;
  renewalDate: string | null;
}

export interface BillingAccountSummary {
  id: string;
  name: string;
  status: string;
  currentBalanceCents: number;
  creditLimitCents: number | null;
}

export interface CustomerDetail extends Customer {
  identifiers: CustomerIdentifier[];
  activities: CustomerActivity[];
  memberships: CustomerMembershipSummary[];
  billingAccounts: BillingAccountSummary[];
}

export interface MembershipPlan {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  billingInterval: string;
  priceCents: number;
  billingEnabled: boolean;
  privileges: Array<{ type: string; value: unknown }> | null;
  rules: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MembershipPlanDetail extends MembershipPlan {
  enrollmentCount: number;
}

export interface Membership {
  id: string;
  tenantId: string;
  customerId: string;
  planId: string;
  billingAccountId: string;
  status: string;
  startDate: string;
  endDate: string | null;
  renewalDate: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillingAccount {
  id: string;
  tenantId: string;
  name: string;
  primaryCustomerId: string;
  status: string;
  creditLimitCents: number | null;
  currentBalanceCents: number;
  billingCycle: string;
  statementDayOfMonth: number | null;
  dueDays: number;
  autoPayEnabled: boolean;
  billingEmail: string | null;
  billingContactName: string | null;
  billingAddress: string | null;
  collectionStatus: string;
  glArAccountCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface BillingAccountMember {
  id: string;
  customerId: string;
  displayName: string;
  role: string;
  chargeAllowed: boolean;
  spendingLimitCents: number | null;
  isActive: boolean;
}

export interface ArTransaction {
  id: string;
  billingAccountId: string;
  type: string;
  amountCents: number;
  dueDate: string | null;
  notes: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface BillingAccountDetail extends BillingAccount {
  members: BillingAccountMember[];
  recentTransactions: ArTransaction[];
}

export interface AgingReport {
  current: number;
  thirtyDay: number;
  sixtyDay: number;
  ninetyDay: number;
  overHundredTwenty: number;
  total: number;
}

export interface PrivilegeEntry {
  source: 'membership' | 'manual';
  privilegeType: string;
  value: unknown;
  planName?: string;
  expiresAt?: string;
}

export type CustomerType = 'person' | 'organization';
export type MembershipStatus = 'pending' | 'active' | 'paused' | 'canceled' | 'expired';
export type BillingAccountStatus = 'active' | 'suspended' | 'closed';
export type ArTransactionType = 'charge' | 'payment' | 'credit_memo' | 'late_fee' | 'writeoff' | 'refund' | 'adjustment';

// ── Session 16.5: Customer Profile Types ────────────────────────

export interface CustomerContact {
  id: string;
  contactType: 'email' | 'phone' | 'address' | 'social_media';
  label: string | null;
  value: string;
  isPrimary: boolean;
  isVerified: boolean;
  createdAt: string;
}

export interface CustomerPreference {
  id: string;
  category: string;
  key: string;
  value: string;
  source: 'manual' | 'inferred' | 'imported';
  confidence: number | null;
  updatedAt: string;
}

export interface CustomerDocument {
  id: string;
  documentType: string;
  name: string;
  description: string | null;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string;
  expiresAt: string | null;
}

export interface CustomerCommunication {
  id: string;
  channel: string;
  direction: 'outbound' | 'inbound';
  subject: string | null;
  body: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  createdBy: string | null;
}

export interface CustomerServiceFlag {
  id: string;
  flagType: string;
  severity: 'info' | 'warning' | 'critical';
  notes: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface CustomerConsent {
  id: string;
  consentType: string;
  status: 'granted' | 'revoked';
  grantedAt: string;
  revokedAt: string | null;
  source: string;
}

export interface CustomerExternalId {
  id: string;
  provider: string;
  externalId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface CustomerWalletAccount {
  id: string;
  walletType: string;
  balanceCents: number;
  currency: string;
  externalRef: string | null;
  status: string;
  expiresAt: string | null;
}

export interface CustomerAlert {
  id: string;
  alertType: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  isActive: boolean;
  expiresAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  dismissedAt: string | null;
}

export interface CustomerScore {
  id: string;
  scoreType: string;
  score: number;
  computedAt: string;
  modelVersion: string | null;
}

export interface CustomerHousehold {
  id: string;
  name: string;
  householdType: string;
  primaryCustomerId: string;
  billingAccountId: string | null;
  members: CustomerHouseholdMember[];
}

export interface CustomerHouseholdMember {
  id: string;
  householdId: string;
  customerId: string;
  role: string;
  joinedAt: string;
  leftAt: string | null;
  customerDisplayName?: string;
}

export interface CustomerVisit {
  id: string;
  checkInAt: string;
  checkOutAt: string | null;
  durationMinutes: number | null;
  location: string | null;
  checkInMethod: string;
  staffId: string | null;
  notes: string | null;
}

export interface CustomerIncident {
  id: string;
  incidentType: string;
  severity: string;
  status: string;
  subject: string;
  description: string | null;
  resolution: string | null;
  compensationCents: number | null;
  compensationType: string | null;
  reportedBy: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface CustomerSegmentMembership {
  id: string;
  segmentId: string;
  segmentName: string;
  segmentType: string;
  addedAt: string;
}

export interface CustomerProfileStats {
  totalVisits: number;
  totalSpendCents: number;
  avgSpendCents: number;
  lifetimeValueCents: number;
  revenueByCategory: Record<string, number>;
  firstVisitAt: string | null;
  lastVisitAt: string | null;
  daysSinceLastVisit: number | null;
  visitFrequency: string;
  avgVisitDurationMinutes: number | null;
}

export interface CustomerProfileOverview {
  customer: Customer;
  contacts: CustomerContact[];
  identifiers: CustomerIdentifier[];
  serviceFlags: CustomerServiceFlag[];
  activeAlerts: CustomerAlert[];
  household: { households: CustomerHousehold[] } | null;
  currentVisit: CustomerVisit | null;
  stats: CustomerProfileStats;
  memberships: {
    active: (CustomerMembershipSummary & { planName: string }) | null;
    history: CustomerMembershipSummary[];
  };
  relationships: Array<{
    id: string;
    parentCustomerId: string;
    childCustomerId: string;
    relationshipType: string;
  }>;
}

export interface CustomerFinancial {
  billingAccounts: BillingAccountSummary[];
  arAging: { current: number; thirtyDay: number; sixtyDay: number; ninetyDay: number; overHundredTwenty: number; total: number };
  openInvoices: Array<{ id: string; periodStart: string; periodEnd: string; closingBalanceCents: number; dueDate: string; status: string }>;
  recentPayments: Array<{ id: string; amountCents: number; createdAt: string; notes: string | null }>;
  walletAccounts: CustomerWalletAccount[];
  walletBalanceCents: number;
  loyaltyTier: string | null;
  loyaltyPointsBalance: number;
}
