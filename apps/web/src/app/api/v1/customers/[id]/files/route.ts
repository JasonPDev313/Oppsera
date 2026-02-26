import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getCustomerFilesList,
  uploadCustomerFile,
  uploadCustomerFileSchema,
} from '@oppsera/module-customers';
import { parseLimit } from '@/lib/api-params';

function extractCustomerId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const idx = parts.indexOf('customers');
  return parts[idx + 1]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);
    const url = new URL(request.url);
    const documentType = url.searchParams.get('documentType') ?? undefined;
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limit = parseLimit(url.searchParams.get('limit'));

    const result = await getCustomerFilesList({
      tenantId: ctx.tenantId,
      customerId,
      documentType,
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
    const parsed = uploadCustomerFileSchema.safeParse({ ...body, customerId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const file = await uploadCustomerFile(ctx, parsed.data);
    return NextResponse.json({ data: file }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.manage' , writeAccess: true },
);
