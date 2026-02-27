import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listCustomLenses, getTenantLensPreferences } from '@oppsera/module-semantic/lenses';
import { listLenses } from '@oppsera/module-semantic/registry';
import { db, tenants } from '@oppsera/db';
import { eq } from 'drizzle-orm';

// ── GET /api/v1/semantic/lenses ───────────────────────────────────
// Returns system lenses (from registry cache) + tenant's custom lenses.
// Read-only — lens management is handled by the admin portal.
// Optional query params: ?domain=golf&includeSystem=true&includeDisabled=true
// System lenses are filtered by tenant's business vertical (targetBusinessTypes).

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const domain = url.searchParams.get('domain') ?? undefined;
    const includeSystem = url.searchParams.get('includeSystem') !== 'false';
    const includeInactive = url.searchParams.get('includeInactive') === 'true';
    const includeDisabled = url.searchParams.get('includeDisabled') === 'true';

    const [systemLenses, customLenses, preferences, tenantRows] = await Promise.all([
      includeSystem ? listLenses(domain) : Promise.resolve([]),
      listCustomLenses({ tenantId: ctx.tenantId, domain, includeInactive }),
      getTenantLensPreferences(ctx.tenantId),
      db.select({ businessVertical: tenants.businessVertical }).from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1),
    ]);

    const businessVertical = tenantRows[0]?.businessVertical ?? 'general';

    // Filter system lenses by business type targeting:
    // null targetBusinessTypes = available to all, otherwise must include tenant's vertical
    const filteredSystemLenses = systemLenses.filter(
      (l) => !l.targetBusinessTypes || l.targetBusinessTypes.length === 0 || l.targetBusinessTypes.includes(businessVertical),
    );

    const allLenses = [
      ...(includeSystem
        ? filteredSystemLenses.map((l) => ({
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
            tenantId: null,
            enabled: preferences.get(l.slug) ?? true,
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
        tenantId: l.tenantId,
        enabled: preferences.get(l.slug) ?? true,
      })),
    ];

    // Filter out disabled lenses unless caller wants them all
    const data = includeDisabled
      ? allLenses
      : allLenses.filter((l) => l.enabled);

    return NextResponse.json({ data, meta: { count: data.length } });
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);
