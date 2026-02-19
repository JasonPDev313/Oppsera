import { z } from 'zod';

export const CustomerCreatedDataSchema = z.object({
  customerId: z.string(),
  type: z.string(),
  displayName: z.string(),
  email: z.string().optional(),
  phone: z.string().optional(),
});

export const CustomerUpdatedDataSchema = z.object({
  customerId: z.string(),
  changes: z.record(z.object({ old: z.unknown(), new: z.unknown() })),
});

export const CustomerMergedDataSchema = z.object({
  primaryId: z.string(),
  duplicateId: z.string(),
  mergedFields: z.array(z.string()),
});

export const CustomerPrivilegeAssignedDataSchema = z.object({
  customerId: z.string(),
  privilegeType: z.string(),
  value: z.unknown(),
  expiresAt: z.string().optional(),
});

export const MembershipPlanCreatedDataSchema = z.object({
  planId: z.string(),
  name: z.string(),
  billingInterval: z.string(),
  priceCents: z.number(),
});

export const MembershipPlanUpdatedDataSchema = z.object({
  planId: z.string(),
  changes: z.record(z.object({ old: z.unknown(), new: z.unknown() })),
});

export const MembershipCreatedDataSchema = z.object({
  membershipId: z.string(),
  customerId: z.string(),
  planId: z.string(),
  billingAccountId: z.string(),
  startDate: z.string(),
  status: z.string(),
});

export const MembershipUpdatedDataSchema = z.object({
  membershipId: z.string(),
  customerId: z.string(),
  action: z.string(),
  previousStatus: z.string(),
  newStatus: z.string(),
});

export const BillingAccountCreatedDataSchema = z.object({
  billingAccountId: z.string(),
  name: z.string(),
  primaryCustomerId: z.string(),
});

export const BillingAccountUpdatedDataSchema = z.object({
  billingAccountId: z.string(),
  changes: z.record(z.object({ old: z.unknown(), new: z.unknown() })),
});

export const ArTransactionCreatedDataSchema = z.object({
  transactionId: z.string(),
  billingAccountId: z.string(),
  type: z.string(),
  amountCents: z.number(),
  newBalance: z.number(),
  orderId: z.string().optional(),
  customerId: z.string().optional(),
});

export const ArPaymentCreatedDataSchema = z.object({
  transactionId: z.string(),
  billingAccountId: z.string(),
  amountCents: z.number(),
  newBalance: z.number(),
  allocations: z.array(z.object({
    chargeTransactionId: z.string(),
    amountCents: z.number(),
  })),
});

export const ArAdjustmentCreatedDataSchema = z.object({
  transactionId: z.string(),
  billingAccountId: z.string(),
  amountCents: z.number(),
  reason: z.string().optional(),
});

export const ArLateFeeAppliedDataSchema = z.object({
  billingAccountId: z.string(),
  statementId: z.string(),
  feeCents: z.number(),
});

export const StatementGeneratedDataSchema = z.object({
  statementId: z.string(),
  billingAccountId: z.string(),
  closingBalance: z.number(),
  dueDate: z.string(),
});

// Consumed event schemas (emitted by other modules)

// Emitted by orders module
export const OrderPlacedDataSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  locationId: z.string(),
  businessDate: z.string(),
  subtotal: z.number().int(),
  taxTotal: z.number().int(),
  total: z.number().int(),
  lineCount: z.number().int(),
  customerId: z.string().nullable().optional(),
});

// Emitted by orders module
export const OrderVoidedDataSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  reason: z.string(),
  voidedBy: z.string(),
  locationId: z.string().optional(),
  businessDate: z.string().optional(),
  total: z.number().int().optional(),
  customerId: z.string().nullable().optional(),
});

// Emitted by tenders module
export const TenderRecordedDataSchema = z.object({
  tenderId: z.string(),
  orderId: z.string(),
  orderNumber: z.string(),
  locationId: z.string(),
  businessDate: z.string(),
  tenderType: z.string(),
  tenderSequence: z.number().int(),
  amount: z.number().int(),
  tipAmount: z.number().int(),
  changeGiven: z.number().int(),
  amountGiven: z.number().int(),
  employeeId: z.string(),
  terminalId: z.string(),
  shiftId: z.string().nullable(),
  posMode: z.string().nullable(),
  source: z.string(),
  orderTotal: z.number().int(),
  totalTendered: z.number().int(),
  remainingBalance: z.number().int(),
  isFullyPaid: z.boolean(),
  customerId: z.string().nullable().optional(),
});

// ── Session 16.5 Event Schemas ──────────────────────────────────

export const CustomerContactAddedDataSchema = z.object({
  customerId: z.string(),
  contactId: z.string(),
  contactType: z.string(),
  value: z.string(),
  isPrimary: z.boolean(),
});

export const CustomerPreferenceSetDataSchema = z.object({
  customerId: z.string(),
  preferenceId: z.string(),
  category: z.string(),
  key: z.string(),
  value: z.string(),
  source: z.string(),
});

export const CustomerDocumentAddedDataSchema = z.object({
  customerId: z.string(),
  documentId: z.string(),
  documentType: z.string(),
  name: z.string(),
});

export const CustomerCommunicationLoggedDataSchema = z.object({
  customerId: z.string(),
  communicationId: z.string(),
  channel: z.string(),
  direction: z.string(),
  status: z.string(),
});

export const CustomerServiceFlagAddedDataSchema = z.object({
  customerId: z.string(),
  flagId: z.string(),
  flagType: z.string(),
  severity: z.string(),
});

export const CustomerServiceFlagRemovedDataSchema = z.object({
  customerId: z.string(),
  flagId: z.string(),
  flagType: z.string(),
});

export const CustomerConsentRecordedDataSchema = z.object({
  customerId: z.string(),
  consentId: z.string(),
  consentType: z.string(),
  status: z.string(),
  source: z.string(),
});

export const CustomerExternalIdAddedDataSchema = z.object({
  customerId: z.string(),
  externalIdRecordId: z.string(),
  provider: z.string(),
  externalId: z.string(),
});

export const CustomerWalletCreatedDataSchema = z.object({
  customerId: z.string(),
  walletAccountId: z.string(),
  walletType: z.string(),
  balanceCents: z.number(),
});

export const CustomerWalletAdjustedDataSchema = z.object({
  customerId: z.string(),
  walletAccountId: z.string(),
  walletType: z.string(),
  amountCents: z.number(),
  newBalanceCents: z.number(),
  customerWalletBalanceCents: z.number(),
});

export const CustomerAlertCreatedDataSchema = z.object({
  customerId: z.string(),
  alertId: z.string(),
  alertType: z.string(),
  severity: z.string(),
  message: z.string(),
});

export const CustomerAlertDismissedDataSchema = z.object({
  customerId: z.string(),
  alertId: z.string(),
  alertType: z.string(),
});

export const CustomerHouseholdCreatedDataSchema = z.object({
  householdId: z.string(),
  name: z.string(),
  householdType: z.string(),
  primaryCustomerId: z.string(),
});

export const CustomerHouseholdMemberAddedDataSchema = z.object({
  householdId: z.string(),
  customerId: z.string(),
  role: z.string(),
});

export const CustomerHouseholdMemberRemovedDataSchema = z.object({
  householdId: z.string(),
  customerId: z.string(),
});

export const CustomerVisitRecordedDataSchema = z.object({
  customerId: z.string(),
  visitId: z.string(),
  location: z.string().optional(),
  checkInMethod: z.string(),
});

export const CustomerVisitCheckedOutDataSchema = z.object({
  customerId: z.string(),
  visitId: z.string(),
  durationMinutes: z.number(),
});

export const CustomerIncidentCreatedDataSchema = z.object({
  customerId: z.string(),
  incidentId: z.string(),
  incidentType: z.string(),
  severity: z.string(),
  subject: z.string(),
});

export const CustomerIncidentUpdatedDataSchema = z.object({
  customerId: z.string(),
  incidentId: z.string(),
  status: z.string(),
  previousStatus: z.string(),
});

export const CustomerSegmentCreatedDataSchema = z.object({
  segmentId: z.string(),
  name: z.string(),
  segmentType: z.string(),
});

export const CustomerSegmentMemberAddedDataSchema = z.object({
  segmentId: z.string(),
  customerId: z.string(),
});

export const CustomerSegmentMemberRemovedDataSchema = z.object({
  segmentId: z.string(),
  customerId: z.string(),
});
