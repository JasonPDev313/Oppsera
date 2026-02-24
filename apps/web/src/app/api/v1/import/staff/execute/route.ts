/**
 * POST /api/v1/import/staff/execute
 *
 * Executes the validated staff import — creates/updates users in the database.
 * Receives the validated rows from the /validate step.
 * Writes to users, user_security, role_assignments, user_locations.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, staffImportJobs } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { executeStaffImport } from '@oppsera/core/import/staff-import-executor';
import type { ValidatedStaffRow, StaffImportMode } from '@oppsera/core/import/staff-import-types';
import type { RequestContext } from '@oppsera/core/auth/context';

async function handler(req: NextRequest, ctx: RequestContext) {
  const body = await req.json();
  const {
    rows,
    fileName = 'staff-import.csv',
    importMode = 'upsert',
    columnMappings,
    valueMappings,
    defaultRoleId,
    defaultLocationIds,
    dryRun = false,
  } = body as {
    rows: ValidatedStaffRow[];
    fileName?: string;
    importMode?: StaffImportMode;
    columnMappings?: unknown;
    valueMappings?: unknown;
    defaultRoleId?: string | null;
    defaultLocationIds?: string[];
    dryRun?: boolean;
  };

  if (!rows || !Array.isArray(rows)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'rows array is required' } },
      { status: 400 },
    );
  }

  // Filter to actionable rows only
  const actionableRows = rows.filter((r) => r.action === 'create' || r.action === 'update');

  if (actionableRows.length === 0) {
    return NextResponse.json(
      { error: { code: 'NO_ACTIONABLE_ROWS', message: 'No rows to import (all skipped or errored)' } },
      { status: 400 },
    );
  }

  if (dryRun) {
    return NextResponse.json({
      data: {
        dryRun: true,
        wouldCreate: rows.filter((r) => r.action === 'create').length,
        wouldUpdate: rows.filter((r) => r.action === 'update').length,
        wouldSkip: rows.filter((r) => r.action === 'skip').length,
        wouldError: rows.filter((r) => r.action === 'error').length,
      },
    });
  }

  try {
    const jobId = generateUlid();

    const result = await withTenant(ctx.tenantId, async (tx) => {
      // Create import job record
      await tx.insert(staffImportJobs).values({
        id: jobId,
        tenantId: ctx.tenantId,
        fileName,
        totalRows: rows.length,
        importMode,
        status: 'importing',
        columnMappings: columnMappings as any,
        valueMappings: valueMappings as any,
        defaultRoleId: defaultRoleId ?? null,
        defaultLocationIds: (defaultLocationIds ?? []) as any,
        importedBy: ctx.user.id,
        startedAt: sql`NOW()`,
      });

      // Execute the import
      const importResult = await executeStaffImport(tx, {
        jobId,
        tenantId: ctx.tenantId,
        importedByUserId: ctx.user.id,
        rows,
      });

      // Update job with results
      await tx.update(staffImportJobs).set({
        status: 'complete',
        createdCount: importResult.createdCount,
        updatedCount: importResult.updatedCount,
        skippedCount: importResult.skippedCount,
        errorCount: importResult.errorCount,
        completedAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      }).where(sql`id = ${jobId}`);

      return importResult;
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Import execution failed';
    return NextResponse.json(
      { error: { code: 'IMPORT_ERROR', message } },
      { status: 500 },
    );
  }
}

export const POST = withMiddleware(handler, {
  entitlement: 'platform_core',
  permission: 'users.manage',
});
