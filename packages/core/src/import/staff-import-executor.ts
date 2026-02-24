/**
 * Staff import executor.
 *
 * Creates or updates users in the `users` table,
 * assigns roles via `role_assignments`, assigns locations via `user_locations`,
 * and optionally hashes POS PINs into `user_security`.
 *
 * All writes happen inside a withTenant transaction.
 * Idempotent via email-based upsert.
 */

import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import {
  users,
  userSecurity,
  roleAssignments,
  userLocations,
} from '@oppsera/db';
import type { withTenant } from '@oppsera/db';
import type { ValidatedStaffRow, StaffImportResult } from './staff-import-types';

type TenantTx = Parameters<Parameters<typeof withTenant>[1]>[0];

// Simple hash for PINs — in production, use bcrypt. Here we use a
// lightweight SHA-256 approach that doesn't require an external dep.
async function hashPin(pin: string): Promise<string> {
  // Use Node.js crypto
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(pin).digest('hex');
}

export interface ExecuteStaffImportInput {
  jobId: string;
  tenantId: string;
  importedByUserId: string;
  rows: ValidatedStaffRow[];
}

/**
 * Execute a staff import inside an existing Drizzle transaction.
 * The caller is responsible for wrapping in `withTenant(tenantId, ...)`.
 */
export async function executeStaffImport(
  tx: TenantTx,
  input: ExecuteStaffImportInput,
): Promise<StaffImportResult> {
  const { jobId, tenantId, importedByUserId, rows } = input;

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const errors: Array<{ rowNumber: number; message: string }> = [];

  for (const row of rows) {
    if (row.action === 'skip') {
      skippedCount++;
      continue;
    }
    if (row.action === 'error' || !row.isValid) {
      errorCount++;
      continue;
    }

    try {
      if (row.action === 'create') {
        await createUser(tx, tenantId, importedByUserId, row);
        createdCount++;
      } else if (row.action === 'update' && row.matchedUserId) {
        await updateUser(tx, tenantId, importedByUserId, row);
        updatedCount++;
      }
    } catch (err: unknown) {
      errorCount++;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ rowNumber: row.rowNumber, message: msg });
    }
  }

  return { jobId, createdCount, updatedCount, skippedCount, errorCount, errors };
}

// ── Create User ──────────────────────────────────────────────────────

async function createUser(
  tx: any,
  tenantId: string,
  importedByUserId: string,
  row: ValidatedStaffRow,
) {
  const userId = generateUlid();
  const name = [row.firstName, row.lastName].filter(Boolean).join(' ') || 'Unnamed';

  await tx.insert(users).values({
    id: userId,
    tenantId,
    email: row.email ?? `imported-${userId}@placeholder.local`,
    username: row.username,
    name,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: name,
    status: row.statusValue,
    primaryRoleId: row.roleId,
    phone: row.phone,
    tabColor: row.tabColor,
    employeeColor: row.employeeColor,
    externalPayrollEmployeeId: row.externalPayrollEmployeeId,
    externalPayrollId: row.externalPayrollId,
    createdByUserId: importedByUserId?.startsWith('admin:') ? null : importedByUserId,
    updatedByUserId: importedByUserId?.startsWith('admin:') ? null : importedByUserId,
    // POS PINs stored in plaintext on the user row for backward compat
    // Hashed versions go into user_security
    posPin: row.posPin,
    overridePin: row.overridePin,
  });

  // ── Hash PINs into user_security if provided ──
  if (row.posPin || row.overridePin) {
    const pinHash = row.posPin ? await hashPin(row.posPin) : null;
    const overrideHash = row.overridePin ? await hashPin(row.overridePin) : null;

    await tx.insert(userSecurity).values({
      userId,
      uniqueLoginPinHash: pinHash,
      posOverridePinHash: overrideHash,
    }).onConflictDoUpdate({
      target: userSecurity.userId,
      set: {
        ...(pinHash ? { uniqueLoginPinHash: pinHash } : {}),
        ...(overrideHash ? { posOverridePinHash: overrideHash } : {}),
        updatedAt: sql`NOW()`,
      },
    });
  }

  // ── Assign role ──
  if (row.roleId) {
    await tx.insert(roleAssignments).values({
      id: generateUlid(),
      tenantId,
      userId,
      roleId: row.roleId,
      locationId: null, // tenant-wide by default
    });
  }

  // ── Assign locations ──
  for (const locId of row.locationIds) {
    await tx.insert(userLocations).values({
      id: generateUlid(),
      tenantId,
      userId,
      locationId: locId,
    });
  }
}

// ── Update User ──────────────────────────────────────────────────────

async function updateUser(
  tx: any,
  tenantId: string,
  importedByUserId: string,
  row: ValidatedStaffRow,
) {
  const userId = row.matchedUserId!;
  const name = [row.firstName, row.lastName].filter(Boolean).join(' ') || undefined;

  // Build SET clause — only update non-null imported fields
  const setValues: Record<string, unknown> = {
    updatedByUserId: importedByUserId,
    updatedAt: sql`NOW()`,
  };

  if (row.firstName) setValues.firstName = row.firstName;
  if (row.lastName) setValues.lastName = row.lastName;
  if (name) {
    setValues.name = name;
    setValues.displayName = name;
  }
  if (row.username) setValues.username = row.username;
  if (row.phone) setValues.phone = row.phone;
  if (row.statusValue) setValues.status = row.statusValue;
  if (row.roleId) setValues.primaryRoleId = row.roleId;
  if (row.tabColor) setValues.tabColor = row.tabColor;
  if (row.employeeColor) setValues.employeeColor = row.employeeColor;
  if (row.externalPayrollEmployeeId) setValues.externalPayrollEmployeeId = row.externalPayrollEmployeeId;
  if (row.externalPayrollId) setValues.externalPayrollId = row.externalPayrollId;

  // Update PINs only if provided (empty = keep existing)
  if (row.posPin) setValues.posPin = row.posPin;
  if (row.overridePin) setValues.overridePin = row.overridePin;

  await tx.update(users).set(setValues).where(
    sql`${users.id} = ${userId} AND ${users.tenantId} = ${tenantId}`
  );

  // ── Update hashed PINs ──
  if (row.posPin || row.overridePin) {
    const pinHash = row.posPin ? await hashPin(row.posPin) : null;
    const overrideHash = row.overridePin ? await hashPin(row.overridePin) : null;

    await tx.insert(userSecurity).values({
      userId,
      uniqueLoginPinHash: pinHash,
      posOverridePinHash: overrideHash,
    }).onConflictDoUpdate({
      target: userSecurity.userId,
      set: {
        ...(pinHash ? { uniqueLoginPinHash: pinHash } : {}),
        ...(overrideHash ? { posOverridePinHash: overrideHash } : {}),
        updatedAt: sql`NOW()`,
      },
    });
  }

  // ── Update role assignment ──
  if (row.roleId) {
    // Remove existing tenant-wide role assignments and insert new
    await tx.execute(
      sql`DELETE FROM role_assignments WHERE tenant_id = ${tenantId} AND user_id = ${userId} AND location_id IS NULL`
    );
    await tx.insert(roleAssignments).values({
      id: generateUlid(),
      tenantId,
      userId,
      roleId: row.roleId,
      locationId: null,
    });
  }

  // ── Update locations ──
  if (row.locationIds.length > 0) {
    // Remove existing and re-assign
    await tx.execute(
      sql`DELETE FROM user_locations WHERE tenant_id = ${tenantId} AND user_id = ${userId}`
    );
    for (const locId of row.locationIds) {
      await tx.insert(userLocations).values({
        id: generateUlid(),
        tenantId,
        userId,
        locationId: locId,
      });
    }
  }
}
