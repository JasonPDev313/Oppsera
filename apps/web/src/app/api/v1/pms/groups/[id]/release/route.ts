import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  releaseGroupBlocks,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';

// POST /api/v1/pms/groups/[id]/release — release unreleased group blocks
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    // URL: .../groups/{id}/release
    const groupId = segments[segments.length - 2]!;

    const result = await releaseGroupBlocks(ctx, groupId);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.GROUPS_MANAGE, writeAccess: true },
);
