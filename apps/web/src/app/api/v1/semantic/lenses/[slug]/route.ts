import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getCustomLens,
  updateCustomLens,
  deactivateCustomLens,
  reactivateCustomLens,
  LensNotFoundError,
  SystemLensModificationError,
  type UpdateLensInput,
} from '@oppsera/module-semantic/lenses';
import { getLens } from '@oppsera/module-semantic/registry';

// ── Validation ────────────────────────────────────────────────────

const lensFilterSchema = z.object({
  dimensionSlug: z.string().min(1),
  operator: z.enum(['eq', 'in', 'gte', 'lte', 'between']),
  value: z.unknown(),
});

const updateLensSchema = z.object({
  displayName: z.string().min(1).max(128).optional(),
  description: z.string().max(512).optional(),
  allowedMetrics: z.array(z.string().min(1)).optional(),
  allowedDimensions: z.array(z.string().min(1)).optional(),
  defaultMetrics: z.array(z.string().min(1)).optional(),
  defaultDimensions: z.array(z.string().min(1)).optional(),
  defaultFilters: z.array(lensFilterSchema).optional(),
  systemPromptFragment: z.string().max(2000).optional(),
  exampleQuestions: z.array(z.string().max(256)).max(10).optional(),
});

// ── Extract slug from URL ─────────────────────────────────────────

function slugFromUrl(url: string): string {
  const parts = new URL(url).pathname.split('/');
  return parts[parts.length - 1] ?? '';
}

// ── GET /api/v1/semantic/lenses/[slug] ───────────────────────────
// Returns a single lens. Checks custom tenant lenses first,
// then falls back to system lenses from the registry.

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const slug = decodeURIComponent(slugFromUrl(request.url));

    // Try custom (tenant-specific) first
    try {
      const lens = await getCustomLens(ctx.tenantId, slug);
      return NextResponse.json({ data: { ...lens, isSystem: false } });
    } catch {
      // Fall through to system lenses
    }

    // Try system lens from registry
    const systemLens = await getLens(slug);
    if (systemLens) {
      return NextResponse.json({ data: { ...systemLens, isSystem: true } });
    }

    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Lens not found: ${slug}` } },
      { status: 404 },
    );
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);

// ── PATCH /api/v1/semantic/lenses/[slug] ─────────────────────────
// Updates a tenant custom lens. System lenses cannot be modified.

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const slug = decodeURIComponent(slugFromUrl(request.url));

    const body = await request.json();
    const parsed = updateLensSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    try {
      const lens = await updateCustomLens({ tenantId: ctx.tenantId, slug, ...parsed.data } as UpdateLensInput);
      return NextResponse.json({ data: lens });
    } catch (err) {
      if (err instanceof LensNotFoundError) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: err.message } },
          { status: 404 },
        );
      }
      if (err instanceof SystemLensModificationError) {
        return NextResponse.json(
          { error: { code: 'SYSTEM_LENS', message: err.message } },
          { status: 403 },
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
  { entitlement: 'semantic', permission: 'semantic.manage' , writeAccess: true },
);

// ── DELETE /api/v1/semantic/lenses/[slug] ────────────────────────
// Soft-deactivates a tenant custom lens. Uses ?action=reactivate to restore.

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const slug = decodeURIComponent(slugFromUrl(request.url));
    const action = new URL(request.url).searchParams.get('action');

    try {
      const lens =
        action === 'reactivate'
          ? await reactivateCustomLens(ctx.tenantId, slug)
          : await deactivateCustomLens(ctx.tenantId, slug);

      return NextResponse.json({ data: lens });
    } catch (err) {
      if (err instanceof LensNotFoundError) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: err.message } },
          { status: 404 },
        );
      }
      if (err instanceof SystemLensModificationError) {
        return NextResponse.json(
          { error: { code: 'SYSTEM_LENS', message: err.message } },
          { status: 403 },
        );
      }
      throw err;
    }
  },
  { entitlement: 'semantic', permission: 'semantic.manage' , writeAccess: true },
);
