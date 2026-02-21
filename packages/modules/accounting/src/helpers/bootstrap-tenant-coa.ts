import { eq } from 'drizzle-orm';
import type { Database } from '@oppsera/db';
import {
  glAccounts,
  glClassifications,
  glAccountTemplates,
  glClassificationTemplates,
  accountingSettings,
} from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { resolveNormalBalance } from './resolve-normal-balance';

export async function bootstrapTenantCoa(
  tx: Database,
  tenantId: string,
  templateKey: string,
): Promise<{ accountCount: number; classificationCount: number }> {
  // 1. Load classification templates (shared across business types)
  const classificationTemplates = await tx
    .select()
    .from(glClassificationTemplates)
    .where(eq(glClassificationTemplates.templateKey, 'shared'));

  // 2. Insert classifications
  const classificationMap = new Map<string, string>(); // name → id
  for (const ct of classificationTemplates) {
    const id = generateUlid();
    classificationMap.set(ct.name, id);
    await tx.insert(glClassifications).values({
      id,
      tenantId,
      name: ct.name,
      accountType: ct.accountType,
      sortOrder: ct.sortOrder,
    });
  }

  // 3. Load account templates for the requested business type
  const accountTemplates = await tx
    .select()
    .from(glAccountTemplates)
    .where(eq(glAccountTemplates.templateKey, templateKey));

  if (accountTemplates.length === 0) {
    throw new Error(`No account templates found for key: ${templateKey}`);
  }

  // 4. Insert accounts
  const controlAccountIds: Record<string, string> = {};

  for (const at of accountTemplates) {
    const id = generateUlid();
    const classificationId = classificationMap.get(at.classificationName) ?? null;

    await tx.insert(glAccounts).values({
      id,
      tenantId,
      accountNumber: at.accountNumber,
      name: at.name,
      accountType: at.accountType,
      normalBalance: at.normalBalance,
      classificationId,
      isActive: true,
      isControlAccount: at.isControlAccount,
      controlAccountType: at.controlAccountType,
      allowManualPosting: true,
    });

    if (at.controlAccountType) {
      controlAccountIds[at.controlAccountType] = id;
    }

    // Track retained earnings and rounding accounts by number
    if (at.accountNumber === '3000') {
      controlAccountIds['retained_earnings'] = id;
    }
    if (at.accountNumber === '9999') {
      controlAccountIds['rounding'] = id;
    }
  }

  // 5. Create accounting_settings with sensible defaults
  await tx.insert(accountingSettings).values({
    tenantId,
    baseCurrency: 'USD',
    fiscalYearStartMonth: 1,
    autoPostMode: 'auto_post',
    defaultAPControlAccountId: controlAccountIds['ap'] ?? null,
    defaultARControlAccountId: controlAccountIds['ar'] ?? null,
    defaultSalesTaxPayableAccountId: controlAccountIds['sales_tax'] ?? null,
    defaultUndepositedFundsAccountId: controlAccountIds['undeposited_funds'] ?? null,
    defaultRetainedEarningsAccountId: controlAccountIds['retained_earnings'] ?? null,
    defaultRoundingAccountId: controlAccountIds['rounding'] ?? null,
    roundingToleranceCents: 5,
  });

  return {
    accountCount: accountTemplates.length,
    classificationCount: classificationTemplates.length,
  };
}
