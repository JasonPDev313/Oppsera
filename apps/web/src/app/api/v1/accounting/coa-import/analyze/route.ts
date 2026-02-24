import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { analyzeFile } from '@oppsera/module-accounting';

// POST /api/v1/accounting/coa-import/analyze — analyze uploaded file
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const { content, fileName, stateName } = body as {
      content: string;
      fileName?: string;
      stateName?: string;
    };

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'content is required' } },
        { status: 400 },
      );
    }

    // Fetch existing account numbers for duplicate detection
    const existingNumbers = await withTenant(ctx.tenantId, async (tx) => {
      const rows = await tx.execute(
        sql`SELECT account_number FROM gl_accounts WHERE tenant_id = ${ctx.tenantId}`,
      );
      return new Set(Array.from(rows as Iterable<{ account_number: string }>).map((r) => r.account_number));
    });

    const result = analyzeFile(content, fileName ?? 'import', existingNumbers, { stateName });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);
