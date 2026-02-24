import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listCustomLenses } from '@oppsera/module-semantic/lenses';
import { listLenses } from '@oppsera/module-semantic/registry';

// ── GET /api/v1/semantic/lenses ───────────────────────────────────
// Returns system lenses (from registry cache) + tenant's custom lenses.
// Read-only — lens management is handled by the admin portal.
// Optional query params: ?domain=golf&includeSystem=true

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const domain = url.searchParams.get('domain') ?? undefined;
    const includeSystem = url.searchParams.get('includeSystem') !== 'false';
    const includeInactive = url.searchParams.get('includeInactive') === 'true';

    const [systemLenses, customLenses] = await Promise.all([
      includeSystem ? listLenses(domain) : Promise.resolve([]),
      listCustomLenses({ tenantId: ctx.tenantId, domain, includeInactive }),
    ]);

    const data = [
      ...(includeSystem
        ? systemLenses.map((l) => ({
            slug: l.slug,
            displayName: l.displayName,
            description: l.description,
            domain: l.domain,
            allowedMetrics: l.allowedMetrics,
            allowedDimensions: l.allowedDimensions,
            defaultMetrics: l.defaultMetrics,
            defaultDimensions: l.defaultDimensions,
            exampleQuestions: l.exampleQuestions,
            isSystem: true,
            isActive: l.isActive,
          }))
        : []),
      ...customLenses.map((l) => ({
        slug: l.slug,
        displayName: l.displayName,
        description: l.description,
        domain: l.domain,
        allowedMetrics: l.allowedMetrics,
        allowedDimensions: l.allowedDimensions,
        defaultMetrics: l.defaultMetrics,
        defaultDimensions: l.defaultDimensions,
        exampleQuestions: l.exampleQuestions,
        isSystem: false,
        isActive: l.isActive,
      })),
    ];

    return NextResponse.json({ data, meta: { count: data.length } });
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);
