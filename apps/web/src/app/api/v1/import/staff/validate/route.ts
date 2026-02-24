/**
 * POST /api/v1/import/staff/validate
 *
 * Receives parsed rows + confirmed mappings + value mappings,
 * validates all rows, runs duplicate detection against existing users,
 * and returns the full validation preview.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant } from '@oppsera/db';
import { parseStaffCsv } from '@oppsera/core/import/staff-import-csv-parser';
import {
  validateStaffImport,
  type ExistingUserLookup,
} from '@oppsera/core/import/staff-import-validator';
import type {
  StaffColumnMapping,
  StaffValueMappings,
  StaffImportMode,
} from '@oppsera/core/import/staff-import-types';
import type { RequestContext } from '@oppsera/core/auth/context';

async function handler(req: NextRequest, ctx: RequestContext) {
  const body = await req.json();
  const {
    csvText,
    columnMappings,
    valueMappings,
    importMode = 'upsert',
    autoGenerateUsername = true,
    defaultRoleId = null,
    defaultLocationIds = [],
  } = body as {
    csvText: string;
    columnMappings: StaffColumnMapping[];
    valueMappings: StaffValueMappings;
    importMode?: StaffImportMode;
    autoGenerateUsername?: boolean;
    defaultRoleId?: string | null;
    defaultLocationIds?: string[];
  };

  if (!csvText || !columnMappings) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'csvText and columnMappings are required' } },
      { status: 400 },
    );
  }

  try {
    const { rows } = parseStaffCsv(csvText);

    // Build existing user lookup for duplicate detection
    const existingUsers = await buildExistingUserLookup(ctx.tenantId);

    const result = validateStaffImport({
      rows,
      columnMappings,
      valueMappings: valueMappings ?? { roles: [], locations: [] },
      existingUsers,
      importMode: importMode as StaffImportMode,
      autoGenerateUsername,
      defaultRoleId,
      defaultLocationIds,
    });

    return NextResponse.json({ data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Validation failed';
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message } },
      { status: 400 },
    );
  }
}

async function buildExistingUserLookup(tenantId: string): Promise<ExistingUserLookup> {
  const byEmail = new Map<string, string>();
  const byUsername = new Map<string, string>();
  const byPayrollId = new Map<string, string>();

  await withTenant(tenantId, async (tx) => {
    const result = await tx.execute(
      sql`SELECT id, email, username, external_payroll_employee_id
          FROM users
          WHERE tenant_id = ${tenantId}`
    );
    const rows = Array.from(result as Iterable<{
      id: string;
      email: string;
      username: string | null;
      external_payroll_employee_id: string | null;
    }>);

    for (const row of rows) {
      if (row.email) byEmail.set(row.email.toLowerCase(), row.id);
      if (row.username) byUsername.set(row.username.toLowerCase(), row.id);
      if (row.external_payroll_employee_id) byPayrollId.set(row.external_payroll_employee_id, row.id);
    }
  });

  return { byEmail, byUsername, byPayrollId };
}

export const POST = withMiddleware(handler, {
  entitlement: 'platform_core',
  permission: 'users.manage',
});
