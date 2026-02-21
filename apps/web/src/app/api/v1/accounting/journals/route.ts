import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listJournalEntries,
  postJournalEntry,
  postJournalEntrySchema,
} from '@oppsera/module-accounting';

// GET /api/v1/accounting/journals — list journal entries
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');

    const result = await listJournalEntries({
      tenantId: ctx.tenantId,
      startDate: url.searchParams.get('startDate') ?? undefined,
      endDate: url.searchParams.get('endDate') ?? undefined,
      sourceModule: url.searchParams.get('sourceModule') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      accountId: url.searchParams.get('accountId') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: limitParam ? parseInt(limitParam, 10) : undefined,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);

// POST /api/v1/accounting/journals — create/post journal entry
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = postJournalEntrySchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const entry = await postJournalEntry(ctx, parsed.data, {
      hasControlAccountPermission: ctx.isPlatformAdmin,
    });

    return NextResponse.json({ data: entry }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);
