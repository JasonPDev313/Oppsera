/**
 * List import jobs with cursor pagination.
 */

import { eq, and, desc, lt } from 'drizzle-orm';
import { withTenant, importJobs } from '@oppsera/db';

import type { ListImportJobsInput } from '../validation';

export async function listImportJobs(input: ListImportJobsInput) {
  return withTenant(input.tenantId, async (tx) => {
    const limit = input.limit ?? 25;
    const conditions = [eq(importJobs.tenantId, input.tenantId)];

    if (input.status) {
      conditions.push(eq(importJobs.status, input.status));
    }

    if (input.cursor) {
      conditions.push(lt(importJobs.id, input.cursor));
    }

    const rows = await tx
      .select()
      .from(importJobs)
      .where(and(...conditions))
      .orderBy(desc(importJobs.createdAt), desc(importJobs.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items,
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
