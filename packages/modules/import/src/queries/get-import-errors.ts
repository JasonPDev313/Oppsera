/**
 * Get paginated import errors.
 */

import { eq, and, desc, lt } from 'drizzle-orm';
import { withTenant, importErrors } from '@oppsera/db';

import type { GetImportErrorsInput } from '../validation';

export async function getImportErrors(input: GetImportErrorsInput) {
  return withTenant(input.tenantId, async (tx) => {
    const limit = input.limit ?? 50;
    const conditions = [
      eq(importErrors.importJobId, input.importJobId),
      eq(importErrors.tenantId, input.tenantId),
    ];

    if (input.severity) {
      conditions.push(eq(importErrors.severity, input.severity));
    }

    if (input.cursor) {
      conditions.push(lt(importErrors.id, input.cursor));
    }

    const rows = await tx
      .select()
      .from(importErrors)
      .where(and(...conditions))
      .orderBy(desc(importErrors.rowNumber))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map((e) => ({
        ...e,
        sourceData: (e.sourceData ?? null) as Record<string, unknown> | null,
      })),
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
