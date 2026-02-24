import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminAuth } from '@/lib/with-admin-auth';
import type { UpdateSystemLensInput } from '@oppsera/module-semantic/lenses';
import {
  getSystemLens,
  updateSystemLens,
  deactivateSystemLens,
  reactivateSystemLens,
  LensNotFoundError,
} from '@oppsera/module-semantic/lenses';

// ── Validation ────────────────────────────────────────────────────

const lensFilterSchema = z.object({
  dimensionSlug: z.string().min(1),
  operator: z.enum(['eq', 'in', 'gte', 'lte', 'between']),
  value: z.unknown(),
});

const updateLensSchema = z.object({
  displayName: z.string().min(1).max(128).optional(),
  description: z.string().max(512).optional(),
  domain: z.string().min(1).max(64).optional(),
  allowedMetrics: z.array(z.string().min(1)).optional(),
  allowedDimensions: z.array(z.string().min(1)).optional(),
  defaultMetrics: z.array(z.string().min(1)).optional(),
  defaultDimensions: z.array(z.string().min(1)).optional(),
  defaultFilters: z.array(lensFilterSchema).optional(),
  systemPromptFragment: z.string().max(2000).optional(),
  exampleQuestions: z.array(z.string().max(256)).max(10).optional(),
});

// ── GET /api/v1/eval/lenses/[slug] ───────────────────────────────

export const GET = withAdminAuth(async (_req: NextRequest, _session, params) => {
  const slug = decodeURIComponent(params?.slug ?? '');

  try {
    const lens = await getSystemLens(slug);
    return NextResponse.json({ data: lens });
  } catch (err) {
    if (err instanceof LensNotFoundError) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: err.message } },
        { status: 404 },
      );
    }
    throw err;
  }
}, 'viewer');

// ── PATCH /api/v1/eval/lenses/[slug] ─────────────────────────────

export const PATCH = withAdminAuth(async (req: NextRequest, _session, params) => {
  const slug = decodeURIComponent(params?.slug ?? '');
  const body = await req.json();
  const parsed = updateLensSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map((i) => i.message).join('; ') } },
      { status: 400 },
    );
  }

  try {
    const lens = await updateSystemLens({ slug, ...parsed.data } as UpdateSystemLensInput);
    return NextResponse.json({ data: lens });
  } catch (err) {
    if (err instanceof LensNotFoundError) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: err.message } },
        { status: 404 },
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
}, 'admin');

// ── DELETE /api/v1/eval/lenses/[slug] ────────────────────────────

export const DELETE = withAdminAuth(async (req: NextRequest, _session, params) => {
  const slug = decodeURIComponent(params?.slug ?? '');
  const action = new URL(req.url).searchParams.get('action');

  try {
    const lens =
      action === 'reactivate'
        ? await reactivateSystemLens(slug)
        : await deactivateSystemLens(slug);

    return NextResponse.json({ data: lens });
  } catch (err) {
    if (err instanceof LensNotFoundError) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: err.message } },
        { status: 404 },
      );
    }
    throw err;
  }
}, 'admin');
