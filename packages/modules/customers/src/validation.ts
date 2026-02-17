import { z } from 'zod';

export const createCustomerSchema = z.object({
  type: z.enum(['person', 'organization']).default('person'),
  email: z.string().email().toLowerCase().trim().optional(),
  phone: z.string().trim().min(7).optional(),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  organizationName: z.string().trim().max(200).optional(),
  notes: z.string().max(2000).optional(),
  tags: z.array(z.string()).optional(),
  marketingConsent: z.boolean().optional(),
  taxExempt: z.boolean().optional(),
  taxExemptCertificateNumber: z.string().optional(),
  clientRequestId: z.string().optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z.object({
  email: z.string().email().toLowerCase().trim().optional().nullable(),
  phone: z.string().trim().min(7).optional().nullable(),
  firstName: z.string().trim().max(100).optional().nullable(),
  lastName: z.string().trim().max(100).optional().nullable(),
  organizationName: z.string().trim().max(200).optional().nullable(),
  displayName: z.string().trim().max(200).optional(),
  notes: z.string().max(2000).optional().nullable(),
  tags: z.array(z.string()).optional(),
  marketingConsent: z.boolean().optional(),
  taxExempt: z.boolean().optional(),
  taxExemptCertificateNumber: z.string().optional().nullable(),
  clientRequestId: z.string().optional(),
});
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const addCustomerIdentifierSchema = z.object({
  customerId: z.string().min(1),
  type: z.enum(['member_number', 'card', 'barcode', 'qr', 'wristband', 'external']),
  value: z.string().min(1),
  clientRequestId: z.string().optional(),
});
export type AddCustomerIdentifierInput = z.infer<typeof addCustomerIdentifierSchema>;

export const addCustomerNoteSchema = z.object({
  customerId: z.string().min(1),
  title: z.string().min(1).max(200),
  details: z.string().max(5000).optional(),
});
export type AddCustomerNoteInput = z.infer<typeof addCustomerNoteSchema>;

export const mergeCustomersSchema = z.object({
  primaryId: z.string().min(1),
  duplicateId: z.string().min(1),
  clientRequestId: z.string().optional(),
});
export type MergeCustomersInput = z.infer<typeof mergeCustomersSchema>;

export const searchCustomersSchema = z.object({
  search: z.string().optional(),
  identifier: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(10),
});
export type SearchCustomersInput = z.infer<typeof searchCustomersSchema>;

export const createMembershipPlanSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  billingInterval: z.enum(['monthly', 'annual', 'none']).default('monthly'),
  priceCents: z.number().int().min(0),
  billingEnabled: z.boolean().default(true),
  privileges: z.array(z.object({ type: z.string(), value: z.unknown() })).optional(),
  rules: z.record(z.unknown()).optional(),
  clientRequestId: z.string().optional(),
});
export type CreateMembershipPlanInput = z.infer<typeof createMembershipPlanSchema>;

export const updateMembershipPlanSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  billingEnabled: z.boolean().optional(),
  privileges: z.array(z.object({ type: z.string(), value: z.unknown() })).optional(),
  rules: z.record(z.unknown()).optional().nullable(),
  isActive: z.boolean().optional(),
  clientRequestId: z.string().optional(),
});
export type UpdateMembershipPlanInput = z.infer<typeof updateMembershipPlanSchema>;

export const enrollMemberSchema = z.object({
  customerId: z.string().min(1),
  planId: z.string().min(1),
  billingAccountId: z.string().min(1),
  startDate: z.string().optional(), // date string, defaults to today
  clientRequestId: z.string().optional(),
});
export type EnrollMemberInput = z.infer<typeof enrollMemberSchema>;

export const updateMembershipStatusSchema = z.object({
  membershipId: z.string().min(1),
  action: z.enum(['pause', 'cancel', 'reactivate', 'expire']),
  reason: z.string().optional(),
  clientRequestId: z.string().optional(),
});
export type UpdateMembershipStatusInput = z.infer<typeof updateMembershipStatusSchema>;

export const assignCustomerPrivilegeSchema = z.object({
  customerId: z.string().min(1),
  privilegeType: z.string().min(1),
  value: z.unknown(),
  reason: z.string().optional(),
  expiresAt: z.string().optional(), // ISO datetime
  clientRequestId: z.string().optional(),
});
export type AssignCustomerPrivilegeInput = z.infer<typeof assignCustomerPrivilegeSchema>;

export const createBillingAccountSchema = z.object({
  name: z.string().min(1).max(200),
  primaryCustomerId: z.string().min(1),
  creditLimitCents: z.number().int().optional().nullable(),
  billingCycle: z.enum(['monthly', 'none']).default('monthly'),
  statementDayOfMonth: z.number().int().min(1).max(28).optional(),
  dueDays: z.number().int().min(0).default(30),
  lateFeePolicyId: z.string().optional(),
  taxExempt: z.boolean().optional(),
  taxExemptCertificateNumber: z.string().optional(),
  authorizationRules: z.record(z.unknown()).optional(),
  billingEmail: z.string().email().optional(),
  billingContactName: z.string().optional(),
  billingAddress: z.string().optional(),
  glArAccountCode: z.string().default('1200'),
  clientRequestId: z.string().optional(),
});
export type CreateBillingAccountInput = z.infer<typeof createBillingAccountSchema>;

export const updateBillingAccountSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  creditLimitCents: z.number().int().optional().nullable(),
  statementDayOfMonth: z.number().int().min(1).max(28).optional().nullable(),
  dueDays: z.number().int().min(0).optional(),
  lateFeePolicyId: z.string().optional().nullable(),
  autoPayEnabled: z.boolean().optional(),
  taxExempt: z.boolean().optional(),
  taxExemptCertificateNumber: z.string().optional().nullable(),
  authorizationRules: z.record(z.unknown()).optional().nullable(),
  billingEmail: z.string().email().optional().nullable(),
  billingContactName: z.string().optional().nullable(),
  billingAddress: z.string().optional().nullable(),
  status: z.enum(['active', 'suspended', 'closed']).optional(),
  collectionStatus: z.enum(['normal', 'reminder_sent', 'final_notice', 'sent_to_collections']).optional(),
  clientRequestId: z.string().optional(),
});
export type UpdateBillingAccountInput = z.infer<typeof updateBillingAccountSchema>;

export const addBillingAccountMemberSchema = z.object({
  billingAccountId: z.string().min(1),
  customerId: z.string().min(1),
  role: z.enum(['authorized', 'dependent', 'employee']),
  chargeAllowed: z.boolean().default(true),
  spendingLimitCents: z.number().int().optional().nullable(),
  clientRequestId: z.string().optional(),
});
export type AddBillingAccountMemberInput = z.infer<typeof addBillingAccountMemberSchema>;

export const recordArTransactionSchema = z.object({
  billingAccountId: z.string().min(1),
  type: z.enum(['charge', 'payment', 'adjustment', 'writeoff']),
  amountCents: z.number().int(),
  dueDate: z.string().optional(),
  customerId: z.string().optional(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
  notes: z.string().optional(),
  clientRequestId: z.string().optional(),
});
export type RecordArTransactionInput = z.infer<typeof recordArTransactionSchema>;

export const recordArPaymentSchema = z.object({
  billingAccountId: z.string().min(1),
  amountCents: z.number().int().positive(),
  notes: z.string().optional(),
  clientRequestId: z.string().optional(),
});
export type RecordArPaymentInput = z.infer<typeof recordArPaymentSchema>;

export const generateStatementSchema = z.object({
  billingAccountId: z.string().min(1),
  periodStart: z.string(), // date string
  periodEnd: z.string(),   // date string
  clientRequestId: z.string().optional(),
});
export type GenerateStatementInput = z.infer<typeof generateStatementSchema>;
