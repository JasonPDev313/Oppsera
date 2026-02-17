import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getEffectivePermissions } from '@oppsera/core/permissions';

export const GET = withMiddleware(async (_request, ctx) => {
  const result = await getEffectivePermissions(
    ctx.tenantId,
    ctx.user.id,
    ctx.locationId,
  );

  return NextResponse.json({ data: result });
});
