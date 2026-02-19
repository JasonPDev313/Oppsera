import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getFieldCatalog } from '@oppsera/module-reporting';

export const GET = withMiddleware(
  async (request: NextRequest) => {
    const url = new URL(request.url);
    const dataset = url.searchParams.get('dataset') ?? undefined;
    const fields = await getFieldCatalog(dataset);
    return NextResponse.json({ data: fields });
  },
  { entitlement: 'reporting', permission: 'reports.view' },
);
