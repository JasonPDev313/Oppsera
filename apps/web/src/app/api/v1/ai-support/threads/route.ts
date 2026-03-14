import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listThreads,
  createThread,
  CreateThreadSchema,
} from '@oppsera/module-ai-support';

// GET /api/v1/ai-support/threads — list user's threads
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 20;

    const result = await listThreads({
      tenantId: ctx.tenantId,
      userId: ctx.user.id,
      cursor,
      limit,
    });

    return NextResponse.json({
      data: result.threads,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { permission: 'ai_support.chat' },
);

// POST /api/v1/ai-support/threads — create a new thread
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = CreateThreadSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const thread = await createThread(ctx, parsed.data);
    return NextResponse.json({ data: thread }, { status: 201 });
  },
  { permission: 'ai_support.chat', writeAccess: true },
);
