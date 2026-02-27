import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { setTenantLensPreference, listCustomLenses } from '@oppsera/module-semantic/lenses';
import { listLenses } from '@oppsera/module-semantic/registry';
import { z } from 'zod';
import { db, tenants } from '@oppsera/db';
import { eq } from 'drizzle-orm';

const patchSchema = z.object({
  slug: z.string().min(1),
  enabled: z.boolean(),
});

// ── PATCH /api/v1/semantic/lenses/preferences ─────────────────────
// Toggle a lens on or off for the current tenant.
// Validates the lens exists and is visible to this tenant's business type.

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
        { status: 400 },
      );
    }

    const { slug, enabled } = parsed.data;

    // Verify the lens exists and is visible to this tenant
    const [systemLenses, customLenses, tenantRows] = await Promise.all([
      listLenses(),
      listCustomLenses({ tenantId: ctx.tenantId }),
      db.select({ businessVertical: tenants.businessVertical }).from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1),
    ]);

    const businessVertical = tenantRows[0]?.businessVertical ?? 'general';

    const isSystemLens = systemLenses.some((l) =>
      l.slug === slug && (!l.targetBusinessTypes || l.targetBusinessTypes.length === 0 || l.targetBusinessTypes.includes(businessVertical)),
    );
    const isCustomLens = customLenses.some((l) => l.slug === slug);

    if (!isSystemLens && !isCustomLens) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Lens "${slug}" not found or not available for this tenant` } },
        { status: 404 },
      );
    }

    await setTenantLensPreference(ctx.tenantId, slug, enabled);

    return NextResponse.json({ data: { slug, enabled } });
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);
