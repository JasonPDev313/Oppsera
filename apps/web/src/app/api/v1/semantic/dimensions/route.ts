import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listDimensions } from '@oppsera/module-semantic/registry';

// GET /api/v1/semantic/dimensions
// Returns the list of available dimensions in the semantic registry.
// Optional query param: ?domain=core|golf|inventory|customer
// Consumers: registry explorer UI, LLM tooling, external API clients.

export const GET = withMiddleware(
  async (request: NextRequest, _ctx) => {
    const domain = new URL(request.url).searchParams.get('domain') ?? undefined;
    const dimensions = await listDimensions(domain);

    return NextResponse.json({
      data: dimensions.map((d) => ({
        slug: d.slug,
        displayName: d.displayName,
        description: d.description,
        domain: d.domain,
        category: d.category,
        sqlDataType: d.sqlDataType,
        isTimeDimension: d.isTimeDimension,
        timeGranularities: d.timeGranularities,
        hierarchyParent: d.hierarchyParent,
        hierarchyLevel: d.hierarchyLevel,
        aliases: d.aliases,
        exampleValues: d.exampleValues,
        examplePhrases: d.examplePhrases,
      })),
      meta: { count: dimensions.length },
    });
  },
  {
    entitlement: 'semantic',
    permission: 'semantic.view',
    cache: 'private, max-age=300, stale-while-revalidate=600',
  },
);
