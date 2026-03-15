import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { checkProactiveMessages, dismissProactiveMessage } from '@oppsera/module-ai-support';

// GET /api/v1/ai-support/proactive — return matching proactive messages for the current user/context
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const route = url.searchParams.get('route') ?? '/';
    const moduleKey = url.searchParams.get('moduleKey') ?? undefined;

    const messages = await checkProactiveMessages(
      ctx.tenantId,
      ctx.user.id,
      { route, moduleKey },
    );

    return NextResponse.json({ data: messages });
  },
  { entitlement: 'ai_support', permission: 'ai_support.chat' },
);

// POST /api/v1/ai-support/proactive — dismiss a proactive message
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body: { ruleId?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Invalid body handled below
    }

    if (!body.ruleId || typeof body.ruleId !== 'string') {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'ruleId is required' } },
        { status: 400 },
      );
    }

    await dismissProactiveMessage(body.ruleId, ctx.user.id, ctx.tenantId);

    return NextResponse.json({ data: { dismissed: true } });
  },
  { entitlement: 'ai_support', permission: 'ai_support.chat', writeAccess: true },
);
