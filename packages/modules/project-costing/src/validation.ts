import { z } from 'zod';

export const createProjectSchema = z.object({
  locationId: z.string().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  projectType: z.string().optional(),
  customerId: z.string().optional(),
  managerUserId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  budgetAmount: z.string().optional(),
  budgetLaborHours: z.string().optional(),
  notes: z.string().max(5000).optional(),
  metadata: z.record(z.unknown()).optional(),
  clientRequestId: z.string().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  projectType: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  managerUserId: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  budgetAmount: z.string().optional().nullable(),
  budgetLaborHours: z.string().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
  expectedVersion: z.number().int().optional(),
});

export const archiveProjectSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const createTaskSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  budgetAmount: z.string().optional(),
  budgetHours: z.string().optional(),
  glExpenseAccountId: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

export const updateTaskSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(['open', 'in_progress', 'complete', 'closed']).optional(),
  budgetAmount: z.string().optional().nullable(),
  budgetHours: z.string().optional().nullable(),
  glExpenseAccountId: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export const listProjectsSchema = z.object({
  tenantId: z.string(),
  status: z.string().optional(),
  locationId: z.string().optional(),
  customerId: z.string().optional(),
  startDateFrom: z.string().optional(),
  startDateTo: z.string().optional(),
  search: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const listTasksSchema = z.object({
  tenantId: z.string(),
  projectId: z.string(),
  status: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const projectCostDetailSchema = z.object({
  tenantId: z.string(),
  projectId: z.string(),
  taskId: z.string().optional(),
  accountType: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(100),
});
