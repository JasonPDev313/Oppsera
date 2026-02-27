import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, sql } from '@oppsera/db';
import { glJournalEntries, glJournalLines } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { getReconciliationReadApi } from '@oppsera/core/helpers/reconciliation-read-api';
import {
  resolveSubDepartmentAccounts,
  resolvePaymentTypeAccounts,
  resolveTaxGroupAccount,
  getAccountingSettings,
} from '@oppsera/module-accounting';

// POST /api/v1/accounting/unmapped-events/remap/preview — dry-run showing GL diff
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const tenderIds: string[] = body.tenderIds;

    if (!Array.isArray(tenderIds) || tenderIds.length === 0 || tenderIds.length > 50) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'tenderIds must be an array of 1-50 strings' } },
        { status: 400 },
      );
    }

    const settings = await getAccountingSettings(db, ctx.tenantId);
    if (!settings) {
      return NextResponse.json(
        { error: { code: 'NOT_CONFIGURED', message: 'Accounting not bootstrapped for this tenant' } },
        { status: 400 },
      );
    }

    const api = getReconciliationReadApi();
    const previews = [];

    for (const tenderId of tenderIds) {
      // Load current GL entry lines
      const [currentEntry] = await db
        .select()
        .from(glJournalEntries)
        .where(
          and(
            eq(glJournalEntries.tenantId, ctx.tenantId),
            eq(glJournalEntries.sourceReferenceId, tenderId),
            eq(glJournalEntries.status, 'posted'),
          ),
        )
        .limit(1);

      if (!currentEntry) {
        previews.push({ tenderId, error: 'No posted GL entry found' });
        continue;
      }

      const currentLines = await db
        .select()
        .from(glJournalLines)
        .where(eq(glJournalLines.journalEntryId, currentEntry.id));

      // Load account names for current lines
      const accountIds = [...new Set(currentLines.map(l => l.accountId))];
      const accountNameRows = accountIds.length > 0
        ? await db.execute(sql`
            SELECT id, account_number, name
            FROM gl_accounts
            WHERE tenant_id = ${ctx.tenantId}
              AND id IN ${sql`(${sql.join(accountIds.map(id => sql`${id}`), sql`, `)})`}
          `)
        : [];
      const accountMap = new Map<string, { number: string; name: string }>();
      for (const row of Array.from(accountNameRows as Iterable<Record<string, unknown>>)) {
        accountMap.set(String(row.id), {
          number: String(row.account_number),
          name: String(row.name),
        });
      }

      const originalLines = currentLines.map(l => {
        const acct = accountMap.get(l.accountId);
        const isFallback = (l.memo ?? '').includes('fallback');
        return {
          accountId: l.accountId,
          accountNumber: acct?.number ?? '',
          accountName: acct?.name ?? '',
          debitAmount: l.debitAmount,
          creditAmount: l.creditAmount,
          memo: l.memo,
          isFallback,
        };
      });

      // Simulate what the new posting would look like
      const tenderData = await api.getTenderForGlRepost(ctx.tenantId, tenderId);

      const projectedLines: Array<{
        accountId: string;
        accountNumber: string;
        accountName: string;
        debitAmount: string;
        creditAmount: string;
        memo: string;
        isFallback: boolean;
      }> = [];

      if (tenderData && tenderData.lines && tenderData.lines.length > 0) {
        // Simulate mapping resolution to show projected accounts
        const paymentMethod = tenderData.tenderType ?? tenderData.paymentMethod ?? 'unknown';
        const paymentTypeMapping = await resolvePaymentTypeAccounts(db, ctx.tenantId, paymentMethod);

        // Deposit account
        let depositAccountId: string | null = null;
        let depositFallback = false;
        if (paymentTypeMapping) {
          depositAccountId = (settings as any).enableUndepositedFundsWorkflow && paymentTypeMapping.clearingAccountId
            ? paymentTypeMapping.clearingAccountId
            : paymentTypeMapping.depositAccountId;
        } else {
          depositAccountId = (settings as any).defaultUndepositedFundsAccountId ?? null;
          depositFallback = true;
        }

        if (depositAccountId) {
          const totalDebitCents = tenderData.amount + (tenderData.tipAmount ?? 0);
          projectedLines.push({
            accountId: depositAccountId,
            accountNumber: '',
            accountName: '',
            debitAmount: (totalDebitCents / 100).toFixed(2),
            creditAmount: '0',
            memo: `POS tender ${paymentMethod}${depositFallback ? ' (fallback)' : ''}`,
            isFallback: depositFallback,
          });
        }

        // Revenue lines
        const orderTotal = tenderData.orderTotal ?? tenderData.amount;
        const tenderRatio = orderTotal > 0 ? tenderData.amount / orderTotal : 1;

        for (const line of tenderData.lines) {
          const subDeptId = line.subDepartmentId ?? 'unmapped';
          let revenueAccountId: string | null = null;
          let revenueFallback = false;

          if (subDeptId !== 'unmapped') {
            const mapping = await resolveSubDepartmentAccounts(db, ctx.tenantId, subDeptId);
            revenueAccountId = mapping?.revenueAccountId ?? null;
          }
          if (!revenueAccountId) {
            revenueAccountId = (settings as any).defaultUncategorizedRevenueAccountId ?? null;
            revenueFallback = true;
          }

          if (revenueAccountId) {
            const revenueCents = Math.round(line.extendedPriceCents * tenderRatio);
            projectedLines.push({
              accountId: revenueAccountId,
              accountNumber: '',
              accountName: '',
              debitAmount: '0',
              creditAmount: (revenueCents / 100).toFixed(2),
              memo: `Revenue - sub-dept ${subDeptId}${revenueFallback ? ' (fallback)' : ''}`,
              isFallback: revenueFallback,
            });
          }

          // Tax
          if (line.taxGroupId && line.taxAmountCents) {
            let taxAccountId = await resolveTaxGroupAccount(db, ctx.tenantId, line.taxGroupId);
            let taxFallback = false;
            if (!taxAccountId) {
              taxAccountId = (settings as any).defaultSalesTaxPayableAccountId ?? null;
              taxFallback = true;
            }
            if (taxAccountId) {
              const taxCents = Math.round(line.taxAmountCents * tenderRatio);
              projectedLines.push({
                accountId: taxAccountId,
                accountNumber: '',
                accountName: '',
                debitAmount: '0',
                creditAmount: (taxCents / 100).toFixed(2),
                memo: `Tax - group ${line.taxGroupId}${taxFallback ? ' (fallback)' : ''}`,
                isFallback: taxFallback,
              });
            }
          }
        }

        // Resolve account names for projected lines
        const projectedAccountIds = [...new Set(projectedLines.map(l => l.accountId))];
        if (projectedAccountIds.length > 0) {
          const projAccountRows = await db.execute(sql`
            SELECT id, account_number, name
            FROM gl_accounts
            WHERE tenant_id = ${ctx.tenantId}
              AND id IN ${sql`(${sql.join(projectedAccountIds.map(id => sql`${id}`), sql`, `)})`}
          `);
          const projAccountMap = new Map<string, { number: string; name: string }>();
          for (const row of Array.from(projAccountRows as Iterable<Record<string, unknown>>)) {
            projAccountMap.set(String(row.id), {
              number: String(row.account_number),
              name: String(row.name),
            });
          }
          for (const line of projectedLines) {
            const acct = projAccountMap.get(line.accountId);
            if (acct) {
              line.accountNumber = acct.number;
              line.accountName = acct.name;
            }
          }
        }
      }

      previews.push({
        tenderId,
        businessDate: currentEntry.businessDate,
        originalLines,
        projectedLines,
        hasChanges: JSON.stringify(originalLines.map(l => l.accountId).sort())
          !== JSON.stringify(projectedLines.map(l => l.accountId).sort()),
      });
    }

    return NextResponse.json({ data: previews });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);
