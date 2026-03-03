import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { z } from 'zod';
import { updateGuestNotes } from '@oppsera/module-fnb';

const bodySchema = z.object({
  notes: z.string().max(4000).optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
});

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // URL: /api/v1/fnb/host/guests/:id/notes
  return parts[parts.length - 2]!;
}

export const PATCH = withMiddleware(
  async (req: NextRequest, ctx) => {
    const id = extractId(req);
    if (!id) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Guest profile ID is required' } },
        { status: 400 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } },
        { status: 400 },
      );
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid input',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateGuestNotes(ctx, {
      id,
      notes: parsed.data.notes,
      tags: parsed.data.tags,
    });

    if (!result) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Guest profile not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.host.guests.write', writeAccess: true },
);
