import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getThread,
  closeThread,
  UpdateThreadSchema,
} from '@oppsera/module-ai-support';

function extractThreadId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const idx = parts.indexOf('threads');
  return parts[idx + 1]!;
}

// GET /api/v1/ai-support/threads/:threadId — thread detail with messages
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const threadId = extractThreadId(request);
    const detail = await getThread(ctx.tenantId, threadId, ctx.user.id);
    return NextResponse.json({ data: detail });
  },
  { entitlement: 'ai_support', permission: 'ai_support.chat' },
);

// PATCH /api/v1/ai-support/threads/:threadId — update/close thread
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const threadId = extractThreadId(request);
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = UpdateThreadSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const thread = await closeThread(ctx, threadId, parsed.data);
    return NextResponse.json({ data: thread });
  },
  { entitlement: 'ai_support', permission: 'ai_support.chat', writeAccess: true },
);
