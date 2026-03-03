import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { z } from 'zod';
import { checkReservationConflicts } from '@oppsera/module-fnb';

/**
 * GET /api/v1/fnb/host/reservations/conflicts
 *
 * Query-string parameters:
 *   date                 YYYY-MM-DD (required)
 *   startTime            HH:MM      (required)
 *   durationMinutes      integer    (default 90)
 *   tableIds             comma-separated list of table IDs (required)
 *   excludeReservationId optional — omit when creating, provide when editing
 *   bufferMinutes        integer    (default 10)
 *
 * Response: { data: ConflictResult[] }
 *   An empty array means no conflicts detected.
 *
 * Requires entitlement `pos_fnb` and permission `pos_fnb.host.manage`.
 */

const querySchema = z.object({
  locationId: z.string().min(1, 'locationId is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'startTime must be HH:MM'),
  durationMinutes: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : 90))
    .pipe(z.number().int().min(1).max(720)),
  tableIds: z
    .string()
    .min(1, 'tableIds is required')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  excludeReservationId: z.string().optional(),
  bufferMinutes: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : undefined))
    .pipe(z.number().int().min(0).max(120).optional()),
});

export const GET = withMiddleware(
  async (req: NextRequest, ctx) => {
    const url = new URL(req.url);

    const locationId = ctx.locationId || url.searchParams.get('locationId') || '';

    const rawInput = {
      locationId,
      date: url.searchParams.get('date') ?? '',
      startTime: url.searchParams.get('startTime') ?? '',
      durationMinutes: url.searchParams.get('durationMinutes') ?? undefined,
      tableIds: url.searchParams.get('tableIds') ?? '',
      excludeReservationId: url.searchParams.get('excludeReservationId') ?? undefined,
      bufferMinutes: url.searchParams.get('bufferMinutes') ?? undefined,
    };

    const parsed = querySchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid conflict check parameters',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const conflicts = await checkReservationConflicts({
      tenantId: ctx.tenantId,
      locationId: parsed.data.locationId,
      date: parsed.data.date,
      startTime: parsed.data.startTime,
      durationMinutes: parsed.data.durationMinutes,
      tableIds: parsed.data.tableIds,
      excludeReservationId: parsed.data.excludeReservationId,
      bufferMinutes: parsed.data.bufferMinutes,
    });

    return NextResponse.json({ data: conflicts });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.host.manage' },
);
