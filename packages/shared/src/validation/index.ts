import { z } from 'zod';

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const tenantIdSchema = z.string().min(1);
export const locationIdSchema = z.string().min(1);
