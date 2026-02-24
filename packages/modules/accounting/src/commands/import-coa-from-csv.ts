import { eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import {
  glAccounts,
  glClassifications,
  glCoaImportLogs,
} from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { resolveNormalBalance } from '../helpers/resolve-normal-balance';
import { parseCsvImport } from '../services/csv-import';
import type { ImportCoaFromCsvInput } from '../validation';

export async function importCoaFromCsv(
  ctx: RequestContext,
  input: ImportCoaFromCsvInput,
) {
  // 1. Validate
  const validation = parseCsvImport(input.csvContent, input.stateName);

  if (!validation.isValid) {
    throw new Error(
      `CSV validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
    );
  }

  const { parsedAccounts, warnings, stateDetections } = validation;

  // 2. Execute import in a single transaction
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Create import log
    const importLogId = generateUlid();
    await tx.insert(glCoaImportLogs).values({
      id: importLogId,
      tenantId: ctx.tenantId,
      fileName: input.fileName ?? 'import.csv',
      totalRows: parsedAccounts.length,
      successRows: 0,
      errorRows: 0,
      errors: null,
      status: 'importing',
      importedBy: ctx.user.id,
    });

    // Load existing classifications for matching
    const existingClassifications = await tx
      .select()
      .from(glClassifications)
      .where(eq(glClassifications.tenantId, ctx.tenantId));

    const classMap = new Map<string, string>();
    for (const c of existingClassifications) {
      classMap.set(c.name.toLowerCase(), c.id);
    }

    // Load existing accounts to avoid duplicates
    const existingAccounts = await tx
      .select({ accountNumber: glAccounts.accountNumber })
      .from(glAccounts)
      .where(eq(glAccounts.tenantId, ctx.tenantId));

    const existingNumbers = new Set(existingAccounts.map((a) => a.accountNumber));

    // First pass: insert accounts (skip existing account numbers)
    const accountIdMap = new Map<string, string>(); // accountNumber → id
    let successCount = 0;
    let skipCount = 0;
    const importErrors: Array<{ row: number; message: string }> = [];

    for (let i = 0; i < parsedAccounts.length; i++) {
      const acct = parsedAccounts[i]!;

      if (existingNumbers.has(acct.accountNumber)) {
        skipCount++;
        importErrors.push({
          row: i + 2, // 1-indexed + header
          message: `Account ${acct.accountNumber} already exists — skipped`,
        });
        continue;
      }

      try {
        const id = generateUlid();
        const classificationId = acct.classificationName
          ? classMap.get(acct.classificationName.toLowerCase()) ?? null
          : null;

        await tx.insert(glAccounts).values({
          id,
          tenantId: ctx.tenantId,
          accountNumber: acct.accountNumber,
          name: acct.name,
          accountType: acct.accountType,
          normalBalance: resolveNormalBalance(acct.accountType),
          classificationId,
          isActive: acct.isActive,
          isControlAccount: false,
          allowManualPosting: true,
          description: acct.description ?? null,
          isFallback: acct.isFallback,
        });

        accountIdMap.set(acct.accountNumber, id);
        successCount++;
      } catch (err) {
        importErrors.push({
          row: i + 2,
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    // Second pass: resolve parent account IDs
    for (const acct of parsedAccounts) {
      if (acct.parentAccountNumber) {
        const childId = accountIdMap.get(acct.accountNumber);
        const parentId = accountIdMap.get(acct.parentAccountNumber);
        if (childId && parentId) {
          await tx
            .update(glAccounts)
            .set({ parentAccountId: parentId })
            .where(eq(glAccounts.id, childId));
        }
      }
    }

    // Update import log
    await tx
      .update(glCoaImportLogs)
      .set({
        successRows: successCount,
        errorRows: skipCount + importErrors.filter((e) => !e.message.includes('already exists')).length,
        errors: importErrors.length > 0 ? importErrors : null,
        status: 'complete',
        completedAt: new Date(),
      })
      .where(eq(glCoaImportLogs.id, importLogId));

    const event = buildEventFromContext(ctx, 'accounting.coa.imported.v1', {
      importLogId,
      totalRows: parsedAccounts.length,
      successRows: successCount,
      skipCount,
    });

    return {
      result: {
        importLogId,
        totalRows: parsedAccounts.length,
        successRows: successCount,
        skipCount,
        errorCount: importErrors.filter((e) => !e.message.includes('already exists')).length,
        warnings: warnings.map((w) => w.message),
        stateDetections,
        errors: importErrors,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'accounting.coa.imported', 'gl_coa_import_log', result.importLogId);

  return result;
}
