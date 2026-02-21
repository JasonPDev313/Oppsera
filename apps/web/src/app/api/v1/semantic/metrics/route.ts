import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listMetrics } from '@oppsera/module-semantic/registry';

// GET /api/v1/semantic/metrics
// Returns the list of available metrics in the semantic registry.
// Optional query param: ?domain=core|golf|inventory|customer
// Consumers: registry explorer UI, LLM tooling, external API clients.

export const GET = withMiddleware(
  async (request: NextRequest, _ctx) => {
    const domain = new URL(request.url).searchParams.get('domain') ?? undefined;
    const metrics = await listMetrics(domain);

    return NextResponse.json({
      data: metrics.map((m) => ({
        slug: m.slug,
        displayName: m.displayName,
        description: m.description,
        domain: m.domain,
        category: m.category,
        dataType: m.dataType,
        formatPattern: m.formatPattern,
        unit: m.unit,
        higherIsBetter: m.higherIsBetter,
        aliases: m.aliases,
        examplePhrases: m.examplePhrases,
        isExperimental: m.isExperimental,
      })),
      meta: { count: metrics.length },
    });
  },
  {
    entitlement: 'semantic',
    permission: 'semantic.view',
    cache: 'private, max-age=300, stale-while-revalidate=600',
  },
);
