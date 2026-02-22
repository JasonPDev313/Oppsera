import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getFnbMappingCoverage } from '@oppsera/module-accounting';
import { db, fnbGlAccountMappings } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { z } from 'zod';

// GET /api/v1/accounting/mappings/fnb-categories?locationId=xxx
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const locationId = request.nextUrl.searchParams.get('locationId');
    if (!locationId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'locationId is required' } },
        { status: 400 },
      );
    }

    const result = await getFnbMappingCoverage(ctx.tenantId, locationId);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);

const saveFnbMappingSchema = z.object({
  locationId: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1).default('default'),
  revenueAccountId: z.string().nullable().optional(),
  expenseAccountId: z.string().nullable().optional(),
  liabilityAccountId: z.string().nullable().optional(),
  assetAccountId: z.string().nullable().optional(),
  contraRevenueAccountId: z.string().nullable().optional(),
});

// POST /api/v1/accounting/mappings/fnb-categories — save a single mapping
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = saveFnbMappingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }

    const input = parsed.data;

    // Upsert: check if mapping already exists for this entity type + id + location
    const existing = await db
      .select({ id: fnbGlAccountMappings.id })
      .from(fnbGlAccountMappings)
      .where(
        and(
          eq(fnbGlAccountMappings.tenantId, ctx.tenantId),
          eq(fnbGlAccountMappings.locationId, input.locationId),
          eq(fnbGlAccountMappings.entityType, input.entityType),
          eq(fnbGlAccountMappings.entityId, input.entityId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(fnbGlAccountMappings)
        .set({
          revenueAccountId: input.revenueAccountId ?? null,
          expenseAccountId: input.expenseAccountId ?? null,
          liabilityAccountId: input.liabilityAccountId ?? null,
          assetAccountId: input.assetAccountId ?? null,
          contraRevenueAccountId: input.contraRevenueAccountId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(fnbGlAccountMappings.id, existing[0]!.id));

      return NextResponse.json({ data: { id: existing[0]!.id } });
    }

    const id = generateUlid();
    await db.insert(fnbGlAccountMappings).values({
      id,
      tenantId: ctx.tenantId,
      locationId: input.locationId,
      entityType: input.entityType,
      entityId: input.entityId,
      revenueAccountId: input.revenueAccountId ?? null,
      expenseAccountId: input.expenseAccountId ?? null,
      liabilityAccountId: input.liabilityAccountId ?? null,
      assetAccountId: input.assetAccountId ?? null,
      contraRevenueAccountId: input.contraRevenueAccountId ?? null,
    });

    return NextResponse.json({ data: { id } }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'accounting.mappings.manage', writeAccess: true },
);
