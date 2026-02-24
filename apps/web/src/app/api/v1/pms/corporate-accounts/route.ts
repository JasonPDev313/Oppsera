import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listCorporateAccounts,
  createCorporateAccount,
  createCorporateAccountSchema,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';

// GET /api/v1/pms/corporate-accounts — list corporate accounts
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const isActiveParam = url.searchParams.get('isActive');

    const result = await listCorporateAccounts({
      tenantId: ctx.tenantId,
      propertyId: url.searchParams.get('propertyId') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
      isActive: isActiveParam != null ? isActiveParam !== 'false' : undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: limitParam ? Math.min(parseInt(limitParam, 10), 100) : undefined,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.CORPORATE_VIEW },
);

// POST /api/v1/pms/corporate-accounts — create corporate account
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createCorporateAccountSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await createCorporateAccount(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.CORPORATE_MANAGE, writeAccess: true },
);
