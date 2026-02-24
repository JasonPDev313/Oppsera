import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { reanalyzeWithOverrides } from '@oppsera/module-accounting';
import type { HierarchyStrategy } from '@oppsera/module-accounting';

// POST /api/v1/accounting/coa-import/reanalyze — re-analyze with user overrides
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const { content, fileName, stateName, customMappings, hierarchyStrategy, rowOverrides, skipRows } = body as {
      content: string;
      fileName?: string;
      stateName?: string;
      customMappings?: Record<string, string>;
      hierarchyStrategy?: HierarchyStrategy;
      rowOverrides?: Record<number, Record<string, string>>;
      skipRows?: number[];
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

    const result = reanalyzeWithOverrides(content, fileName ?? 'import', existingNumbers, {
      stateName,
      customMappings,
      hierarchyStrategy,
      rowOverrides,
      skipRows,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);
