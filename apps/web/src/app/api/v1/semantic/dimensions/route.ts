import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listDimensions } from '@oppsera/module-semantic/registry';
import { db, semanticDimensions, tenants } from '@oppsera/db';
import { generateUlid, ValidationError } from '@oppsera/shared';

// ── Validation ────────────────────────────────────────────────────

const createDimensionSchema = z.object({
  slug: z.string().min(2).max(60).regex(/^[a-z][a-z0-9_]*$/, 'Slug must be lowercase with underscores'),
  displayName: z.string().min(1).max(200),
  description: z.string().max(1000).optional().default(''),
  sqlExpression: z.string().min(1).max(2000),
});

// ── GET /api/v1/semantic/dimensions ───────────────────────────────
// Returns system dimensions + tenant custom dimensions merged together.

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const domain = new URL(request.url).searchParams.get('domain') ?? undefined;

    // System dimensions from registry cache
    const [systemDimensionsRaw, tenantRows] = await Promise.all([
      listDimensions(domain),
      db.select({ businessVertical: tenants.businessVertical }).from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1),
    ]);
    const businessVertical = tenantRows[0]?.businessVertical ?? 'general';

    // Filter out golf-domain dimensions for non-golf tenants (matches lenses filtering pattern)
    const isGolfTenant = businessVertical === 'golf' || businessVertical === 'hybrid';
    const systemDimensions = isGolfTenant
      ? systemDimensionsRaw
      : systemDimensionsRaw.filter((d) => d.domain !== 'golf');

    // Custom tenant dimensions from DB
    const customRows = await db
      .select()
      .from(semanticDimensions)
      .where(
        and(
          eq(semanticDimensions.tenantId, ctx.tenantId),
          eq(semanticDimensions.isActive, true),
        ),
      );

    const data = [
      ...systemDimensions.map((d) => ({
        slug: d.slug,
        displayName: d.displayName,
        description: d.description ?? '',
        sqlExpression: d.sqlExpression,
        isSystem: true,
      })),
      ...customRows.map((d) => ({
        slug: d.slug,
        displayName: d.displayName,
        description: d.description ?? '',
        sqlExpression: d.sqlExpression,
        isSystem: false,
      })),
    ];

    return NextResponse.json({ data, meta: { count: data.length } });
  },
  {
    entitlement: 'semantic',
    permission: 'semantic.view',
    cache: 'private, max-age=60',
  },
);

// ── POST /api/v1/semantic/dimensions ──────────────────────────────
// Create or update a custom tenant dimension. System dimensions cannot be modified.

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createDimensionSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { slug, displayName, description, sqlExpression } = parsed.data;

    // Check if slug conflicts with a system dimension
    const [systemConflict] = await db
      .select({ id: semanticDimensions.id })
      .from(semanticDimensions)
      .where(and(eq(semanticDimensions.slug, slug), isNull(semanticDimensions.tenantId)));

    if (systemConflict) {
      return NextResponse.json(
        { error: { code: 'SLUG_CONFLICT', message: `Slug "${slug}" is reserved by a system dimension.` } },
        { status: 409 },
      );
    }

    // Upsert: check if tenant already has this slug
    const [existing] = await db
      .select({ id: semanticDimensions.id })
      .from(semanticDimensions)
      .where(
        and(
          eq(semanticDimensions.tenantId, ctx.tenantId),
          eq(semanticDimensions.slug, slug),
        ),
      );

    if (existing) {
      // Update
      const [updated] = await db
        .update(semanticDimensions)
        .set({
          displayName,
          description: description ?? '',
          sqlExpression,
          updatedAt: new Date(),
        })
        .where(eq(semanticDimensions.id, existing.id))
        .returning();

      return NextResponse.json({ data: { slug: updated!.slug, updated: true } });
    }

    // Insert new custom dimension
    const [created] = await db
      .insert(semanticDimensions)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        slug,
        displayName,
        description: description ?? '',
        domain: 'custom',
        sqlExpression,
        sqlTable: 'rm_daily_sales',
      })
      .returning();

    return NextResponse.json({ data: { slug: created!.slug, created: true } }, { status: 201 });
  },
  { entitlement: 'semantic', permission: 'semantic.view', writeAccess: true },
);
