import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { createGlClassification, createGlClassificationSchema } from '@oppsera/module-accounting';
import { withTenant, sql } from '@oppsera/db';

// GET /api/v1/accounting/classifications — list classifications
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const items = await withTenant(ctx.tenantId, async (tx) => {
      const rows = await tx.execute(sql`
        SELECT id, name, account_type, sort_order, created_at, updated_at
        FROM gl_classifications
        WHERE tenant_id = ${ctx.tenantId}
        ORDER BY sort_order, name
      `);

      return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        accountType: String(row.account_type),
        sortOrder: Number(row.sort_order),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      }));
    });

    return NextResponse.json({ data: items });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);

// POST /api/v1/accounting/classifications — create classification
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createGlClassificationSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const classification = await createGlClassification(ctx, parsed.data);
    return NextResponse.json({ data: classification }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' , writeAccess: true },
);
