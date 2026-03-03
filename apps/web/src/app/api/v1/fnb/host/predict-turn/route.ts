/**
 * GET /api/v1/fnb/host/predict-turn
 *
 * Returns a calibrated turn-time prediction for the given table / party.
 *
 * Query parameters:
 *   tableId    — required; the fnb_tables.id to predict for
 *   partySize  — required; integer ≥ 1
 *   mealPeriod — optional; overrides the server-side heuristic
 *
 * Response:
 *   200 { data: PredictionResult }
 *   400 { error: { code, message } }
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { z } from 'zod';
import { getTurnTimePrediction } from '@oppsera/module-fnb';

const querySchema = z.object({
  locationId: z.string().min(1, 'locationId is required'),
  tableId: z.string().min(1, 'tableId is required'),
  partySize: z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1, 'partySize must be a positive integer')),
  mealPeriod: z.string().optional(),
});

export const GET = withMiddleware(
  async (req: NextRequest, ctx) => {
    const url = new URL(req.url);
    const input = {
      locationId: ctx.locationId || url.searchParams.get('locationId') || '',
      tableId: url.searchParams.get('tableId') ?? '',
      partySize: url.searchParams.get('partySize') ?? '',
      mealPeriod: url.searchParams.get('mealPeriod') ?? undefined,
    };

    const parsed = querySchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid predict-turn parameters',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const data = await getTurnTimePrediction({
      tenantId: ctx.tenantId,
      locationId: parsed.data.locationId,
      tableId: parsed.data.tableId,
      partySize: parsed.data.partySize,
      mealPeriod: parsed.data.mealPeriod,
    });

    return NextResponse.json({ data });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.host.view' },
);
