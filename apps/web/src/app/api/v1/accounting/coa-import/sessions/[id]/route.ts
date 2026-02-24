import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';

function extractId(request: NextRequest): string {
  // /api/v1/accounting/coa-import/sessions/:id
  return request.nextUrl.pathname.split('/').at(-1)!;
}

// GET /api/v1/accounting/coa-import/sessions/:id — get session detail
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);

    const rows = await withTenant(ctx.tenantId, async (tx) => {
      return tx.execute(sql`
        SELECT * FROM coa_import_sessions
        WHERE id = ${id} AND tenant_id = ${ctx.tenantId}
        LIMIT 1
      `);
    });

    const row = Array.from(rows as Iterable<Record<string, unknown>>)[0];
    if (!row) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Import session not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data: {
        id: row.id,
        fileName: row.file_name,
        fileFormat: row.file_format,
        fileSizeBytes: row.file_size_bytes,
        status: row.status,
        analysisResult: row.analysis_result,
        customMappings: row.custom_mappings,
        hierarchyStrategy: row.hierarchy_strategy,
        previewAccounts: row.preview_accounts,
        validationResult: row.validation_result,
        importLogId: row.import_log_id,
        accountsCreated: row.accounts_created,
        accountsSkipped: row.accounts_skipped,
        headersCreated: row.headers_created,
        errorsCount: row.errors_count,
        stateName: row.state_name,
        mergeMode: row.merge_mode,
        rowOverrides: row.row_overrides,
        skipRows: row.skip_rows,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);

// PATCH /api/v1/accounting/coa-import/sessions/:id — update session state
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const updates = body as Record<string, unknown>;

    // Build SET clause dynamically from allowed fields
    const allowedFields: Record<string, string> = {
      status: 'status',
      analysisResult: 'analysis_result',
      customMappings: 'custom_mappings',
      hierarchyStrategy: 'hierarchy_strategy',
      previewAccounts: 'preview_accounts',
      validationResult: 'validation_result',
      importLogId: 'import_log_id',
      accountsCreated: 'accounts_created',
      accountsSkipped: 'accounts_skipped',
      headersCreated: 'headers_created',
      errorsCount: 'errors_count',
      stateName: 'state_name',
      mergeMode: 'merge_mode',
      rowOverrides: 'row_overrides',
      skipRows: 'skip_rows',
    };

    const jsonbFields = new Set([
      'analysisResult', 'customMappings', 'previewAccounts',
      'validationResult', 'rowOverrides', 'skipRows',
    ]);

    const setClauses: string[] = [];
    const values: unknown[] = [];

    for (const [key, dbCol] of Object.entries(allowedFields)) {
      if (key in updates) {
        const val = updates[key];
        setClauses.push(dbCol);
        values.push(jsonbFields.has(key) && val != null ? JSON.stringify(val) : val);
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' } },
        { status: 400 },
      );
    }

    const jsonbCols = new Set([
      'analysis_result', 'custom_mappings', 'preview_accounts',
      'validation_result', 'row_overrides', 'skip_rows',
    ]);

    await withTenant(ctx.tenantId, async (tx) => {
      for (let i = 0; i < setClauses.length; i++) {
        const col = setClauses[i]!;
        const val = values[i];
        if (jsonbCols.has(col)) {
          await tx.execute(
            sql`UPDATE coa_import_sessions SET ${sql.raw(col)} = ${val != null ? sql`${val}::jsonb` : sql`NULL`}, updated_at = now() WHERE id = ${id} AND tenant_id = ${ctx.tenantId}`,
          );
        } else {
          await tx.execute(
            sql`UPDATE coa_import_sessions SET ${sql.raw(col)} = ${val}, updated_at = now() WHERE id = ${id} AND tenant_id = ${ctx.tenantId}`,
          );
        }
      }
    });

    return NextResponse.json({ data: { id, updated: true } });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);

// DELETE /api/v1/accounting/coa-import/sessions/:id — delete session
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);

    await withTenant(ctx.tenantId, async (tx) => {
      await tx.execute(sql`
        DELETE FROM coa_import_sessions
        WHERE id = ${id} AND tenant_id = ${ctx.tenantId}
      `);
    });

    return NextResponse.json({ data: { id, deleted: true } });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
