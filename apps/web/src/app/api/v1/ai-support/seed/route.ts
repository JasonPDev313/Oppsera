import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { seedDemoData } from '@oppsera/module-ai-support';

// POST /api/v1/ai-support/seed — populate route manifests + answer cards for the tenant
export const POST = withMiddleware(
  async (_request, ctx) => {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Seed route is disabled in production' } },
        { status: 403 },
      );
    }

    const result = await seedDemoData(ctx.tenantId);

    return NextResponse.json({
      data: {
        routeManifests: result.routeManifestsCount,
        answerCards: result.answerCardsCount,
      },
    });
  },
  { permission: 'ai_support.admin', writeAccess: true },
);
