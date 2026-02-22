import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { NotFoundError } from '@oppsera/shared';
import { getStatementDetail } from '@oppsera/module-membership';

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const statementId = (ctx as any).params?.statementId;
    if (!statementId) {
      throw new NotFoundError('Statement');
    }

    const result = await getStatementDetail({
      tenantId: ctx.tenantId,
      statementId,
    });

    if (!result) {
      throw new NotFoundError('Statement', statementId);
    }

    return NextResponse.json({ data: result });
  },
  { entitlement: 'club_membership', permission: 'club_membership.view' },
);
