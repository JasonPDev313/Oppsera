/**
 * Bulk import customers from CSV data.
 *
 * Processes mapped + validated rows inside a publishWithOutbox transaction.
 * Handles duplicates per user resolution (skip / update / create_new).
 */

import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import {
  customers,
  customerAddresses,
  customerIdentifiers,
  customerExternalIds,
  customerActivityLog,
  customerImportLogs,
} from '@oppsera/db';
import { eq, and, sql } from 'drizzle-orm';
import type {
  MappedCustomerRow,
  DuplicateResolution,
  ColumnMapping,
  ImportResult,
} from '../services/csv-import/import-types';
import { computeDisplayName } from '../helpers/display-name';

interface BulkImportInput {
  fileName: string;
  fileSizeBytes?: number;
  mappedRows: MappedCustomerRow[];
  columnMappings: ColumnMapping[];
  duplicateResolutions: Record<number, DuplicateResolution>; // csvRowIndex → resolution
}

export async function bulkImportCustomers(
  ctx: RequestContext,
  input: BulkImportInput,
): Promise<ImportResult> {
  const {
    fileName,
    fileSizeBytes,
    mappedRows,
    columnMappings,
    duplicateResolutions,
  } = input;

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Create import log
    const [importLog] = await (tx as any).insert(customerImportLogs).values({
      tenantId: ctx.tenantId,
      fileName,
      fileSizeBytes: fileSizeBytes ?? null,
      totalRows: mappedRows.length,
      columnMappings: JSON.stringify(columnMappings),
      duplicateStrategy: determineDuplicateStrategy(duplicateResolutions),
      status: 'importing',
      importedBy: ctx.user.id,
    }).returning();

    const importLogId = importLog!.id;
    let successRows = 0;
    let updatedRows = 0;
    let skippedRows = 0;
    let errorRows = 0;
    const errors: Array<{ row: number; message: string }> = [];
    const createdCustomerIds: string[] = [];

    for (const mappedRow of mappedRows) {
      const resolution = duplicateResolutions[mappedRow.rowIndex];

      // Handle skip — no savepoint needed
      if (resolution === 'skip') {
        skippedRows++;
        continue;
      }

      // Wrap each row in a savepoint so one DB error doesn't abort
      // the entire transaction.
      const sp = `sp_cust_${mappedRow.rowIndex}`;
      try {
        await tx.execute(sql.raw(`SAVEPOINT ${sp}`));

        const c = mappedRow.customer;

        // Handle update (merge into existing)
        if (resolution === 'update') {
          const existingId = await findExistingCustomerId(tx, ctx.tenantId, mappedRow);
          if (existingId) {
            await updateExistingCustomer(tx, ctx.tenantId, existingId, mappedRow);
            updatedRows++;
            await tx.execute(sql.raw(`RELEASE SAVEPOINT ${sp}`));
            continue;
          }
          // If we can't find the existing customer, fall through to create
        }

        // Create new customer
        const displayName = c.displayName
          ? String(c.displayName)
          : computeDisplayName({
              type: (c.type as 'person' | 'organization') ?? 'person',
              firstName: c.firstName as string | undefined,
              lastName: c.lastName as string | undefined,
              organizationName: c.organizationName as string | undefined,
              email: c.email as string | undefined,
            });

        const [created] = await (tx as any).insert(customers).values({
          tenantId: ctx.tenantId,
          type: c.type ?? 'person',
          email: c.email ?? null,
          phone: c.phone ?? null,
          firstName: c.firstName ?? null,
          lastName: c.lastName ?? null,
          organizationName: c.organizationName ?? null,
          displayName,
          notes: c.notes ?? null,
          tags: c.tags ?? [],
          marketingConsent: c.marketingConsent ?? false,
          taxExempt: c.taxExempt ?? false,
          status: c.status ?? 'active',
          acquisitionSource: 'import',
          dateOfBirth: c.dateOfBirth ?? null,
          gender: c.gender ?? null,
          anniversary: c.anniversary ?? null,
          handicapIndex: c.handicapIndex ?? null,
          ghinNumber: c.ghinNumber ?? null,
          prefix: c.prefix ?? null,
          suffix: c.suffix ?? null,
          nickname: c.nickname ?? null,
          preferredContactMethod: c.preferredContactMethod ?? null,
          referralSource: c.referralSource ?? null,
          membershipType: c.membershipType ?? null,
          membershipStatus: c.membershipStatus ?? null,
          joinDate: c.joinDate ?? null,
          expirationDate: c.expirationDate ?? null,
          spouseName: c.spouseName ?? null,
          createdBy: ctx.user.id,
        }).returning();

        const customerId = created!.id;
        createdCustomerIds.push(customerId);

        // Insert address if mapped
        if (mappedRow.address && Object.keys(mappedRow.address).length > 0) {
          const addr = mappedRow.address;
          await (tx as any).insert(customerAddresses).values({
            tenantId: ctx.tenantId,
            customerId,
            addressType: 'mailing',
            line1: addr.addressLine1 ?? null,
            line2: addr.addressLine2 ?? null,
            city: addr.city ?? null,
            state: addr.state ?? null,
            postalCode: addr.postalCode ?? null,
            country: addr.country ?? null,
            isPrimary: true,
          });
        }

        // Insert member number if mapped
        if (c.memberNumber) {
          await (tx as any).insert(customerIdentifiers).values({
            tenantId: ctx.tenantId,
            customerId,
            type: 'member_number',
            value: String(c.memberNumber),
          });
        }

        // Insert external ID if mapped
        if (mappedRow.externalId) {
          await (tx as any).insert(customerExternalIds).values({
            tenantId: ctx.tenantId,
            customerId,
            provider: 'legacy_import',
            externalId: mappedRow.externalId,
          });
        }

        // Activity log
        await (tx as any).insert(customerActivityLog).values({
          tenantId: ctx.tenantId,
          customerId,
          activityType: 'system',
          title: `Imported from CSV: ${fileName}`,
          createdBy: ctx.user.id,
        });

        successRows++;
        await tx.execute(sql.raw(`RELEASE SAVEPOINT ${sp}`));
      } catch (err: unknown) {
        // Roll back to the savepoint so subsequent rows can still execute
        try { await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${sp}`)); } catch { /* ignore */ }
        errorRows++;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push({
          row: mappedRow.rowIndex + 1,
          message: formatCustomerDbError(msg),
        });
      }
    }

    // Update import log with final counts
    await (tx as any).update(customerImportLogs)
      .set({
        successRows,
        updatedRows,
        skippedRows,
        errorRows,
        errors: errors.length > 0 ? JSON.stringify(errors) : null,
        status: errorRows === mappedRows.length ? 'failed' : errorRows > 0 ? 'complete_with_errors' : 'completed',
        completedAt: new Date(),
      })
      .where(eq(customerImportLogs.id, importLogId));

    const event = buildEventFromContext(ctx, 'customers.bulk_imported.v1', {
      importLogId,
      totalRows: mappedRows.length,
      successRows,
      updatedRows,
      skippedRows,
      errorRows,
    });

    return {
      result: {
        importLogId,
        totalRows: mappedRows.length,
        successRows,
        updatedRows,
        skippedRows,
        errorRows,
        errors,
        createdCustomerIds,
      } as ImportResult,
      events: [event],
    };
  });

  await auditLog(ctx, 'customers.bulk_imported', 'customer_import_log', result.importLogId);

  return result;
}

// ── User-friendly DB error messages ─────────────────────────────

function formatCustomerDbError(raw: string): string {
  if (raw.includes('duplicate key') && raw.includes('email')) {
    return 'A customer with this email already exists';
  }
  if (raw.includes('duplicate key') && raw.includes('phone')) {
    return 'A customer with this phone number already exists';
  }
  if (raw.includes('duplicate key') && raw.includes('member_number')) {
    return 'A customer with this member number already exists';
  }
  if (raw.includes('duplicate key')) {
    return 'Duplicate record — this customer may already exist';
  }
  if (raw.includes('violates foreign key')) {
    return 'Invalid reference (linked record does not exist)';
  }
  if (raw.includes('violates not-null')) {
    return 'A required field is missing';
  }
  return raw;
}

// ── Helpers ─────────────────────────────────────────────────────

function determineDuplicateStrategy(
  resolutions: Record<number, DuplicateResolution>,
): string {
  const values = Object.values(resolutions);
  if (values.length === 0) return 'none';
  const unique = [...new Set(values)];
  if (unique.length === 1) return unique[0]!;
  return 'mixed';
}

async function findExistingCustomerId(
  tx: any,
  tenantId: string,
  mappedRow: MappedCustomerRow,
): Promise<string | null> {
  const c = mappedRow.customer;

  // Try email
  if (c.email) {
    const [match] = await tx.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.tenantId, tenantId), eq(customers.email, String(c.email))))
      .limit(1);
    if (match) return match.id;
  }

  // Try phone
  if (c.phone) {
    const [match] = await tx.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.tenantId, tenantId), eq(customers.phone, String(c.phone))))
      .limit(1);
    if (match) return match.id;
  }

  return null;
}

async function updateExistingCustomer(
  tx: any,
  tenantId: string,
  customerId: string,
  mappedRow: MappedCustomerRow,
): Promise<void> {
  const c = mappedRow.customer;
  const updates: Record<string, unknown> = {};

  // Only overwrite non-null CSV fields
  const fieldMapping: Record<string, string> = {
    firstName: 'firstName',
    lastName: 'lastName',
    organizationName: 'organizationName',
    phone: 'phone',
    notes: 'notes',
    status: 'status',
    dateOfBirth: 'dateOfBirth',
    gender: 'gender',
    anniversary: 'anniversary',
    handicapIndex: 'handicapIndex',
    ghinNumber: 'ghinNumber',
    prefix: 'prefix',
    suffix: 'suffix',
    nickname: 'nickname',
    preferredContactMethod: 'preferredContactMethod',
    referralSource: 'referralSource',
    membershipType: 'membershipType',
    membershipStatus: 'membershipStatus',
    joinDate: 'joinDate',
    expirationDate: 'expirationDate',
    spouseName: 'spouseName',
  };

  for (const [csvKey, dbKey] of Object.entries(fieldMapping)) {
    if (c[csvKey] !== undefined && c[csvKey] !== null) {
      updates[dbKey] = c[csvKey];
    }
  }

  if (c.tags && Array.isArray(c.tags) && (c.tags as unknown[]).length > 0) {
    updates.tags = c.tags;
  }
  if (c.marketingConsent !== undefined) updates.marketingConsent = c.marketingConsent;
  if (c.taxExempt !== undefined) updates.taxExempt = c.taxExempt;

  if (Object.keys(updates).length > 0) {
    updates.updatedAt = new Date();
    await tx.update(customers).set(updates)
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)));
  }

  // Update address if present
  if (mappedRow.address && Object.keys(mappedRow.address).length > 0) {
    const addr = mappedRow.address;
    // Upsert primary mailing address
    const [existing] = await tx.select({ id: customerAddresses.id }).from(customerAddresses)
      .where(and(
        eq(customerAddresses.tenantId, tenantId),
        eq(customerAddresses.customerId, customerId),
        eq(customerAddresses.isPrimary, true),
      ))
      .limit(1);

    if (existing) {
      const addrUpdates: Record<string, unknown> = {};
      if (addr.addressLine1) addrUpdates.line1 = addr.addressLine1;
      if (addr.addressLine2) addrUpdates.line2 = addr.addressLine2;
      if (addr.city) addrUpdates.city = addr.city;
      if (addr.state) addrUpdates.state = addr.state;
      if (addr.postalCode) addrUpdates.postalCode = addr.postalCode;
      if (addr.country) addrUpdates.country = addr.country;
      if (Object.keys(addrUpdates).length > 0) {
        await tx.update(customerAddresses).set(addrUpdates)
          .where(eq(customerAddresses.id, existing.id));
      }
    } else {
      await tx.insert(customerAddresses).values({
        tenantId,
        customerId,
        addressType: 'mailing',
        line1: addr.addressLine1 ?? null,
        line2: addr.addressLine2 ?? null,
        city: addr.city ?? null,
        state: addr.state ?? null,
        postalCode: addr.postalCode ?? null,
        country: addr.country ?? null,
        isPrimary: true,
      });
    }
  }
}
