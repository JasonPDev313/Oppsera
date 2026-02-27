import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminAuth } from '@/lib/with-admin-auth';
import type { CreateSystemLensInput } from '@oppsera/module-semantic/lenses';
import {
  createSystemLens,
  listSystemLenses,
  DuplicateLensSlugError,
  InvalidLensSlugError,
} from '@oppsera/module-semantic/lenses';
import { BUSINESS_VERTICALS } from '@oppsera/shared';

const validBusinessTypes = BUSINESS_VERTICALS.map((v) => v.key);
const businessTypeItem = z.string().refine((v) => validBusinessTypes.includes(v), { message: 'Invalid business type' });

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
  targetBusinessTypes: z.array(businessTypeItem).optional(),
});

// ── GET /api/v1/eval/lenses ──────────────────────────────────────

export const GET = withAdminAuth(async (req: NextRequest) => {
  const url = new URL(req.url);
  const domain = url.searchParams.get('domain') ?? undefined;
  const includeInactive = url.searchParams.get('includeInactive') === 'true';

  const lenses = await listSystemLenses({ domain, includeInactive });
  return NextResponse.json({ data: lenses, meta: { count: lenses.length } });
}, 'viewer');

// ── POST /api/v1/eval/lenses ─────────────────────────────────────

export const POST = withAdminAuth(async (req: NextRequest) => {
  const body = await req.json();
  const parsed = createLensSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map((i) => i.message).join('; ') } },
      { status: 400 },
    );
  }

  try {
    const lens = await createSystemLens(parsed.data as CreateSystemLensInput);
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
}, 'admin');
