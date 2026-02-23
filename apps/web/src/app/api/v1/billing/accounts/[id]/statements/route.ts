import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { generateStatement, generateStatementSchema } from '@oppsera/module-customers';

function extractAccountId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

// POST /api/v1/billing/accounts/:id/statements — generate statement
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractAccountId(request);
    const body = await request.json();
    const parsed = generateStatementSchema.safeParse({ ...body, billingAccountId: id });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const statement = await generateStatement(ctx, parsed.data);

    return NextResponse.json({ data: statement }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'billing.manage' , writeAccess: true },
);
