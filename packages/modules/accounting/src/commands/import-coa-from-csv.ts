import { eq, sql } from 'drizzle-orm';
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

    // First pass: insert accounts — each row wrapped in a savepoint so one
    // DB error does not abort the entire transaction.
    const accountIdMap = new Map<string, string>(); // accountNumber → id
    const createdAccountIds: string[] = [];
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

      const sp = `sp_acct_${i}`;
      try {
        await tx.execute(sql.raw(`SAVEPOINT ${sp}`));

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
        createdAccountIds.push(id);
        successCount++;
        await tx.execute(sql.raw(`RELEASE SAVEPOINT ${sp}`));
      } catch (err) {
        // Roll back to the savepoint so subsequent rows can still execute
        try { await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${sp}`)); } catch { /* ignore */ }
        const msg = err instanceof Error ? err.message : 'Unknown error';
        importErrors.push({
          row: i + 2,
          message: formatCoaDbError(msg),
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
    const realErrorCount = importErrors.filter((e) => !e.message.includes('already exists')).length;
    await tx
      .update(glCoaImportLogs)
      .set({
        successRows: successCount,
        errorRows: skipCount + realErrorCount,
        errors: importErrors.length > 0 ? importErrors : null,
        status: realErrorCount > 0 ? 'complete_with_errors' : 'complete',
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
        errorCount: realErrorCount,
        warnings: warnings.map((w) => w.message),
        stateDetections,
        errors: importErrors,
        createdAccountIds,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'accounting.coa.imported', 'gl_coa_import_log', result.importLogId);

  return result;
}

// ── User-friendly DB error messages ──────────────────────────────────

function formatCoaDbError(raw: string): string {
  if (raw.includes('duplicate key') && raw.includes('account_number')) {
    return 'An account with this number already exists';
  }
  if (raw.includes('duplicate key')) {
    return 'Duplicate record — this account may already exist';
  }
  if (raw.includes('violates foreign key')) {
    return 'Invalid reference (classification does not exist)';
  }
  if (raw.includes('violates not-null')) {
    return 'A required field is missing';
  }
  return raw;
}
