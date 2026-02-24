import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant } from '@oppsera/db';
import { glCoaImportLogs } from '@oppsera/db';
import { eq, desc } from 'drizzle-orm';

// GET /api/v1/accounting/import/history — list past COA imports
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const logs = await withTenant(ctx.tenantId, async (tx) => {
      return tx
        .select()
        .from(glCoaImportLogs)
        .where(eq(glCoaImportLogs.tenantId, ctx.tenantId))
        .orderBy(desc(glCoaImportLogs.startedAt))
        .limit(50);
    });

    return NextResponse.json({
      data: logs.map((l) => ({
        id: l.id,
        fileName: l.fileName,
        totalRows: l.totalRows,
        successRows: l.successRows,
        errorRows: l.errorRows,
        status: l.status,
        importedBy: l.importedBy,
        startedAt: l.startedAt,
        completedAt: l.completedAt,
        errors: l.errors,
      })),
    });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
