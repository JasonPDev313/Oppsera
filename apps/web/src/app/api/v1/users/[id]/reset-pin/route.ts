import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { auditLog } from '@oppsera/core/audit';
import { ValidationError } from '@oppsera/shared';
import { resetPins } from '@oppsera/core';

const bodySchema = z.object({
  posOverridePin: z.string().optional().or(z.literal('')).nullable(),
  uniqueIdentificationPin: z.string().optional().or(z.literal('')).nullable(),
});

function extractUserId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 2]!;
}

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const userId = extractUserId(request);
    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    await resetPins({
      tenantId: ctx.tenantId,
      updatedByUserId: ctx.user.id,
      userId,
      posOverridePin: parsed.data.posOverridePin || null,
      uniqueIdentificationPin: parsed.data.uniqueIdentificationPin || null,
    });
    await auditLog(ctx, 'user.reset_pin', 'user', userId);
    return NextResponse.json({ data: { userId } });
  },
  { permission: 'users.manage' },
);
