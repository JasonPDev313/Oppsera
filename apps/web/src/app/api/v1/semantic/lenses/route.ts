import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  createCustomLens,
  listCustomLenses,
  DuplicateLensSlugError,
  InvalidLensSlugError,
  type CreateLensInput,
} from '@oppsera/module-semantic/lenses';
import { listLenses } from '@oppsera/module-semantic/registry';

// ── Validation ────────────────────────────────────────────────────

const lensFilterSchema = z.object({
  dimensionSlug: z.string().min(1),
  operator: z.enum(['eq', 'in', 'gte', 'lte', 'between']),
  value: z.unknown(),
});

const createLensSchema = z.object({
  slug: z.string().min(2).max(64).regex(/^[a-z][a-z0-9_]{1,63}$/, 'Invalid slug format'),
  displayName: z.string().min(1).max(128),
  description: z.string().max(512).optional(),
  domain: z.string().min(1).max(64),
  allowedMetrics: z.array(z.string().min(1)).optional(),
  allowedDimensions: z.array(z.string().min(1)).optional(),
  defaultMetrics: z.array(z.string().min(1)).optional(),
  defaultDimensions: z.array(z.string().min(1)).optional(),
  defaultFilters: z.array(lensFilterSchema).optional(),
  systemPromptFragment: z.string().max(2000).optional(),
  exampleQuestions: z.array(z.string().max(256)).max(10).optional(),
});

// ── GET /api/v1/semantic/lenses ───────────────────────────────────
// Returns system lenses (from registry cache) + tenant's custom lenses.
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

// ── POST /api/v1/semantic/lenses ──────────────────────────────────
// Creates a new tenant-specific custom lens.

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createLensSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    try {
      const lens = await createCustomLens({
        tenantId: ctx.tenantId,
        ...parsed.data,
      } as CreateLensInput);

      return NextResponse.json({ data: lens }, { status: 201 });
    } catch (err) {
      if (err instanceof DuplicateLensSlugError) {
        return NextResponse.json(
          { error: { code: 'DUPLICATE_SLUG', message: err.message } },
          { status: 409 },
        );
      }
      if (err instanceof InvalidLensSlugError) {
        return NextResponse.json(
          { error: { code: 'INVALID_SLUG', message: err.message } },
          { status: 400 },
        );
      }
      if (err instanceof Error && err.message.startsWith('Lens validation failed')) {
        return NextResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: err.message } },
          { status: 400 },
        );
      }
      throw err;
    }
  },
  { entitlement: 'semantic', permission: 'semantic.manage' },
);
