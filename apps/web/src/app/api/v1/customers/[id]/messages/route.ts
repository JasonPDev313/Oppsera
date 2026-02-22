import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getCommunicationTimeline,
  sendCustomerMessage,
  sendCustomerMessageSchema,
} from '@oppsera/module-customers';

function extractCustomerId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const idx = parts.indexOf('customers');
  return parts[idx + 1]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);
    const url = new URL(request.url);
    const channel = url.searchParams.get('channel') ?? undefined;
    const direction = url.searchParams.get('direction') ?? undefined;
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limit = url.searchParams.get('limit')
      ? Number(url.searchParams.get('limit'))
      : undefined;

    const result = await getCommunicationTimeline({
      tenantId: ctx.tenantId,
      customerId,
      channel,
      direction,
      cursor,
      limit,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);
    const body = await request.json();
    const parsed = sendCustomerMessageSchema.safeParse({ ...body, customerId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const message = await sendCustomerMessage(ctx, parsed.data);
    return NextResponse.json({ data: message }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.manage' },
);
