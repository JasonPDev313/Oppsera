import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateRegisterTab,
  closeRegisterTab,
  updateRegisterTabSchema,
  closeRegisterTabSchema,
} from '@oppsera/core/register-tabs';

function extractTabId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// PATCH /api/v1/register-tabs/[id] — update a tab (orderId, label, etc.)
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const tabId = extractTabId(request);
    const body = await request.json();
    const parsed = updateRegisterTabSchema.safeParse({ ...body, tabId });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateRegisterTab(ctx, parsed.data);

    return NextResponse.json({ data: result });
  },
  { entitlement: 'orders', permission: 'orders.create', writeAccess: true },
);

// DELETE /api/v1/register-tabs/[id] — close a tab (soft-delete)
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const tabId = extractTabId(request);
    const body = await request.json().catch(() => ({}));
    const parsed = closeRegisterTabSchema.safeParse({ ...body, tabId });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await closeRegisterTab(ctx, parsed.data);

    return NextResponse.json({ data: { id: result.id, status: result.status } });
  },
  { entitlement: 'orders', permission: 'orders.create', writeAccess: true },
);
