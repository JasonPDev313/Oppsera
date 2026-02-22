import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listStatements,
  generateStatement,
  generateStatementSchema,
} from '@oppsera/module-membership';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const accountId = (ctx as any).params?.accountId;
    const url = new URL(request.url);

    const result = await listStatements({
      tenantId: ctx.tenantId,
      membershipAccountId: accountId,
      status: url.searchParams.get('status') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.has('limit')
        ? parseInt(url.searchParams.get('limit')!, 10)
        : undefined,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'club_membership', permission: 'club_membership.view' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const accountId = (ctx as any).params?.accountId;
    const body = await request.json();
    const parsed = generateStatementSchema.safeParse({
      ...body,
      membershipAccountId: accountId,
    });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await generateStatement(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'club_membership', permission: 'club_membership.manage' },
);
