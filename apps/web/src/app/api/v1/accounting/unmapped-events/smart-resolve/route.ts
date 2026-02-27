import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  getSmartResolutionSuggestions,
  applySmartResolutions,
} from '@oppsera/module-accounting';

const applySuggestionsSchema = z.object({
  suggestions: z.array(
    z.object({
      entityType: z.string().min(1),
      entityId: z.string().min(1),
      suggestedAccountId: z.string().min(1),
    }),
  ).min(1, 'At least one suggestion is required'),
});

// GET /api/v1/accounting/unmapped-events/smart-resolve — get smart suggestions
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const result = await getSmartResolutionSuggestions(ctx.tenantId);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);

// POST /api/v1/accounting/unmapped-events/smart-resolve — apply suggestions
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = applySuggestionsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }

    const result = await applySmartResolutions(ctx, parsed.data);

    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);
