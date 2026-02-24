/**
 * Enhanced import processor.
 *
 * Takes analyzed and validated accounts, then executes a transactional
 * import into the GL accounts table with full audit trail.
 *
 * Features:
 *   - Idempotent (skips existing account numbers)
 *   - Two-pass parent resolution (handles forward references)
 *   - Hierarchy depth/path recomputation
 *   - Import log tracking
 *   - Change log entries for audit
 */

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
import { resolveNormalBalance as resolveNB } from '../../helpers/resolve-normal-balance';
import { logAccountChange } from '../account-change-log';
import { recomputeHierarchyFields } from '../hierarchy-helpers';
import type { AccountPreview, ImportExecutionResult, ImportOptions } from './types';

// ── Main Import Function ────────────────────────────────────────────

export async function executeImport(
  ctx: RequestContext,
  accounts: AccountPreview[],
  options: ImportOptions,
): Promise<ImportExecutionResult> {
  // Filter out skipped rows and accounts with errors
  const importable = accounts.filter((a) =>
    a.accountNumber &&
    a.name &&
    a.accountType &&
    a.issues.every((i) => i.severity !== 'error'),
  );

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Create import log
    const importLogId = generateUlid();
    await tx.insert(glCoaImportLogs).values({
      id: importLogId,
      tenantId: ctx.tenantId,
      fileName: options.fileName ?? 'import',
      totalRows: accounts.length,
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

    // Load existing account numbers to skip duplicates
    const existingAccounts = await tx
      .select({ accountNumber: glAccounts.accountNumber, id: glAccounts.id })
      .from(glAccounts)
      .where(eq(glAccounts.tenantId, ctx.tenantId));

    const existingNumbers = new Map<string, string>();
    for (const a of existingAccounts) {
      existingNumbers.set(a.accountNumber, a.id);
    }

    // First pass: create accounts
    const accountIdMap = new Map<string, string>(); // accountNumber → id
    let accountsCreated = 0;
    let accountsSkipped = 0;
    let headersCreated = 0;
    const importErrors: Array<{ row: number; accountNumber?: string; message: string }> = [];
    const createdAccounts: Array<{ accountNumber: string; name: string; accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' }> = [];

    for (const acct of importable) {
      // Skip existing
      if (existingNumbers.has(acct.accountNumber)) {
        accountsSkipped++;
        accountIdMap.set(acct.accountNumber, existingNumbers.get(acct.accountNumber)!);
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
          normalBalance: resolveNB(acct.accountType),
          classificationId,
          isActive: acct.isActive,
          isControlAccount: false,
          allowManualPosting: true,
          description: acct.description ?? null,
          isFallback: false,
          isSystemAccount: false,
        });

        accountIdMap.set(acct.accountNumber, id);
        accountsCreated++;
        if (!acct.isPosting) headersCreated++;

        createdAccounts.push({
          accountNumber: acct.accountNumber,
          name: acct.name,
          accountType: acct.accountType,
        });

        // Log the creation
        await logAccountChange(tx, {
          tenantId: ctx.tenantId,
          accountId: id,
          action: 'CREATE',
          changes: [],
          changedBy: ctx.user.id,
          metadata: { source: 'coa_import', fileName: options.fileName },
        });
      } catch (err) {
        importErrors.push({
          row: acct.rowNumber,
          accountNumber: acct.accountNumber,
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    // Second pass: resolve parent relationships
    let parentsResolved = 0;
    for (const acct of importable) {
      if (!acct.parentAccountNumber) continue;

      const childId = accountIdMap.get(acct.accountNumber);
      const parentId = accountIdMap.get(acct.parentAccountNumber);

      if (childId && parentId && childId !== parentId) {
        try {
          await tx
            .update(glAccounts)
            .set({ parentAccountId: parentId })
            .where(eq(glAccounts.id, childId));
          parentsResolved++;
        } catch (err) {
          importErrors.push({
            row: acct.rowNumber,
            accountNumber: acct.accountNumber,
            message: `Failed to set parent: ${err instanceof Error ? err.message : 'Unknown error'}`,
          });
        }
      }
    }

    // Recompute hierarchy fields if any parents were set
    if (parentsResolved > 0) {
      try {
        await recomputeHierarchyFields(tx, ctx.tenantId);
      } catch {
        // Non-fatal — hierarchy fields can be recomputed later
      }
    }

    // Update import log
    await tx
      .update(glCoaImportLogs)
      .set({
        successRows: accountsCreated,
        errorRows: importErrors.length,
        errors: importErrors.length > 0 ? importErrors : null,
        status: 'complete',
        completedAt: new Date(),
      })
      .where(eq(glCoaImportLogs.id, importLogId));

    const event = buildEventFromContext(ctx, 'accounting.coa.imported.v1', {
      importLogId,
      totalRows: accounts.length,
      successRows: accountsCreated,
      skipCount: accountsSkipped,
      headersCreated,
    });

    return {
      result: {
        importLogId,
        totalRows: accounts.length,
        accountsCreated,
        accountsSkipped,
        headersCreated,
        errorsCount: importErrors.length,
        errors: importErrors,
        warnings: [],
        createdAccounts,
      } satisfies ImportExecutionResult,
      events: [event],
    };
  });

  await auditLog(ctx, 'accounting.coa.imported', 'gl_coa_import_log', result.importLogId);

  return result;
}
