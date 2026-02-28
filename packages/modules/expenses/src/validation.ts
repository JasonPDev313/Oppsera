import { z } from 'zod';

// ── Expense CRUD ────────────────────────────────────────────────────────────

export const createExpenseSchema = z.object({
  locationId: z.string().optional(),
  expenseDate: z.string().min(1),
  vendorName: z.string().max(200).optional(),
  category: z.string().min(1),
  description: z.string().max(2000).optional(),
  amount: z.number().positive(),
  currency: z.string().default('USD'),
  paymentMethod: z.string().optional(),
  isReimbursable: z.boolean().default(true),
  glAccountId: z.string().optional(),
  projectId: z.string().optional(),
  expensePolicyId: z.string().optional(),
  notes: z.string().max(5000).optional(),
  metadata: z.record(z.unknown()).optional(),
  clientRequestId: z.string().optional(),
});

export const updateExpenseSchema = z.object({
  expenseDate: z.string().optional(),
  vendorName: z.string().max(200).optional().nullable(),
  category: z.string().optional(),
  description: z.string().max(2000).optional().nullable(),
  amount: z.number().positive().optional(),
  paymentMethod: z.string().optional().nullable(),
  isReimbursable: z.boolean().optional(),
  glAccountId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  expensePolicyId: z.string().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
  expectedVersion: z.number().int().optional(),
});

export const submitExpenseSchema = z.object({
  expenseId: z.string(),
});

export const approveExpenseSchema = z.object({
  expenseId: z.string(),
});

export const rejectExpenseSchema = z.object({
  expenseId: z.string(),
  reason: z.string().min(1).max(1000),
});

export const postExpenseSchema = z.object({
  expenseId: z.string(),
});

export const voidExpenseSchema = z.object({
  expenseId: z.string(),
  reason: z.string().min(1).max(1000),
});

export const markReimbursedSchema = z.object({
  expenseId: z.string(),
  method: z.string().min(1),
  reference: z.string().max(200).optional(),
});

// ── Expense Policy ──────────────────────────────────────────────────────────

export const createExpensePolicySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  autoApproveThreshold: z.number().min(0).optional(),
  requiresReceiptAbove: z.number().min(0).optional(),
  maxAmountPerExpense: z.number().min(0).optional(),
  allowedCategories: z.array(z.string()).optional(),
  approverRole: z.string().default('manager'),
  isDefault: z.boolean().default(false),
});

export const updateExpensePolicySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  autoApproveThreshold: z.number().min(0).optional().nullable(),
  requiresReceiptAbove: z.number().min(0).optional().nullable(),
  maxAmountPerExpense: z.number().min(0).optional().nullable(),
  allowedCategories: z.array(z.string()).optional().nullable(),
  approverRole: z.string().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

// ── Query Filters ───────────────────────────────────────────────────────────

export const listExpensesSchema = z.object({
  tenantId: z.string(),
  status: z.string().optional(),
  employeeUserId: z.string().optional(),
  category: z.string().optional(),
  locationId: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  search: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const pendingApprovalsSchema = z.object({
  tenantId: z.string(),
  approverId: z.string().optional(),
  locationId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const expenseSummarySchema = z.object({
  tenantId: z.string(),
  locationId: z.string().optional(),
  fromPeriod: z.string().optional(),
  toPeriod: z.string().optional(),
});

export const employeeExpenseTotalsSchema = z.object({
  tenantId: z.string(),
  userId: z.string(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});
