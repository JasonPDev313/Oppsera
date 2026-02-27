import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { stampLoginTerminal } from '@oppsera/core/security';
import { ValidationError } from '@oppsera/shared';

const stampSchema = z.object({
  terminalId: z.string().min(1),
  terminalName: z.string().nullable().optional(),
});

export const POST = withMiddleware(
  async (request, ctx) => {
    const body = await request.json();
    const parsed = stampSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    await stampLoginTerminal(
      ctx.tenantId,
      ctx.user.id,
      parsed.data.terminalId,
      parsed.data.terminalName ?? null,
    );

    return NextResponse.json({ data: { ok: true } });
  },
  { authenticated: true },
);
