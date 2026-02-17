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
  metadata: Record<string, unknown> | null;
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
