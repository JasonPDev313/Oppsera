import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { updateItem } from '@oppsera/module-catalog';
import { logger } from '@oppsera/core/observability';

const bulkTypeSchema = z.object({
  updates: z
    .array(
      z.object({
        itemId: z.string().min(1),
        itemType: z.enum(['retail', 'food', 'beverage', 'service', 'green_fee', 'rental']),
      }),
    )
    .min(1)
    .max(500),
});

/**
 * POST /api/v1/catalog/items/bulk-type
 *
 * Bulk-update item types for multiple catalog items.
 * Used by the KDS Setup Wizard menu audit step to fix mistyped items.
 * Sequential loop to avoid pool exhaustion (gotcha #1).
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = bulkTypeSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    let updated = 0;
    const failed: Array<{ itemId: string; error: string }> = [];

    // Sequential to avoid pool exhaustion (gotcha #1)
    for (const update of parsed.data.updates) {
      try {
        await updateItem(ctx, update.itemId, { itemType: update.itemType });
        updated++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('[kds-setup] bulk-type: failed to update item', {
          domain: 'kds-setup',
          tenantId: ctx.tenantId,
          itemId: update.itemId,
          targetType: update.itemType,
          error: { message },
        });
        failed.push({ itemId: update.itemId, error: message });
      }
    }

    return NextResponse.json({ data: { updated, failed } });
  },
  { entitlement: 'catalog', permission: 'catalog.manage', writeAccess: true },
);
