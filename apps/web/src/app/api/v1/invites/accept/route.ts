import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { acceptInvite } from '@oppsera/core';

const bodySchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8).max(128),
});

export const POST = withMiddleware(
  async (request: NextRequest) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await acceptInvite(parsed.data);
    return NextResponse.json({ data: result });
  },
  { public: true },
);
