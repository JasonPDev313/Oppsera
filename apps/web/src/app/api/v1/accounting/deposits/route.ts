import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  listDepositSlips,
  createDepositSlip,
} from '@oppsera/module-accounting';
import { parseLimit } from '@/lib/api-params';

const CreateDepositSlipSchema = z
  .object({
    locationId: z.string(),
    businessDate: z.string(),
    depositType: z.string(),
    totalAmountCents: z.number(),
    bankAccountId: z.string().optional(),
    retailCloseBatchIds: z.array(z.string()).optional(),
    fnbCloseBatchId: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const result = await listDepositSlips({
      tenantId: ctx.tenantId,
      locationId: url.searchParams.get('locationId') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: parseLimit(url.searchParams.get('limit')),
    });
    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = CreateDepositSlipSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }
    const result = await createDepositSlip(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' , writeAccess: true },
);
