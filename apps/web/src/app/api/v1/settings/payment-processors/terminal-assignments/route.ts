import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listTerminalAssignments,
  assignTerminalMerchant,
  assignTerminalMerchantSchema,
} from '@oppsera/module-payments';

/**
 * GET /api/v1/settings/payment-processors/terminal-assignments
 * List all terminal → MID assignments for the tenant.
 */
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const assignments = await listTerminalAssignments(ctx.tenantId);
    return NextResponse.json({ data: assignments });
  },
  { entitlement: 'payments', permission: 'settings.view' },
);

/**
 * POST /api/v1/settings/payment-processors/terminal-assignments
 * Assign a terminal to a merchant account (MID).
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = assignTerminalMerchantSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await assignTerminalMerchant(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'payments', permission: 'settings.manage', writeAccess: true },
);
