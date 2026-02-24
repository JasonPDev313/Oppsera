import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';

// GET /api/v1/accounting/coa-import/sessions — list active import sessions
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const rows = await withTenant(ctx.tenantId, async (tx) => {
      return tx.execute(sql`
        SELECT id, file_name, file_format, status, created_at, updated_at,
               accounts_created, accounts_skipped, errors_count
        FROM coa_import_sessions
        WHERE tenant_id = ${ctx.tenantId}
          AND status NOT IN ('complete', 'failed')
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY updated_at DESC
        LIMIT 20
      `);
    });

    return NextResponse.json({
      data: Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
        id: r.id,
        fileName: r.file_name,
        fileFormat: r.file_format,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        accountsCreated: r.accounts_created,
        accountsSkipped: r.accounts_skipped,
        errorsCount: r.errors_count,
      })),
    });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);

// POST /api/v1/accounting/coa-import/sessions — create a new import session
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const { fileName, fileFormat, fileSizeBytes, content } = body as {
      fileName: string;
      fileFormat?: string;
      fileSizeBytes?: number;
      content?: string;
    };

    if (!fileName) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'fileName is required' } },
        { status: 400 },
      );
    }

    const id = generateUlid();
    await withTenant(ctx.tenantId, async (tx) => {
      await tx.execute(sql`
        INSERT INTO coa_import_sessions (id, tenant_id, file_name, file_format, file_size_bytes, status, created_by, expires_at)
        VALUES (
          ${id},
          ${ctx.tenantId},
          ${fileName},
          ${fileFormat ?? 'csv'},
          ${fileSizeBytes ?? null},
          'uploaded',
          ${ctx.user.id},
          now() + INTERVAL '7 days'
        )
      `);

      // If content was provided, store it in the import log for re-analysis
      if (content) {
        const logId = generateUlid();
        await tx.execute(sql`
          INSERT INTO gl_coa_import_logs (id, tenant_id, file_name, raw_content, file_format, status, imported_by)
          VALUES (${logId}, ${ctx.tenantId}, ${fileName}, ${content}, ${fileFormat ?? 'csv'}, 'pending', ${ctx.user.id})
        `);
        await tx.execute(sql`
          UPDATE coa_import_sessions SET import_log_id = ${logId} WHERE id = ${id}
        `);
      }
    });

    return NextResponse.json({ data: { id } }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
