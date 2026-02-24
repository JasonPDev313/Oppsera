import { eq, and } from 'drizzle-orm';
import type { Database } from '@oppsera/db';
import {
  glAccounts,
  glClassifications,
  glAccountTemplates,
  glClassificationTemplates,
  accountingSettings,
} from '@oppsera/db';
import { generateUlid, AppError } from '@oppsera/shared';
import { resolveNormalBalance } from './resolve-normal-balance';
import { applyStatePlaceholders } from '../services/state-placeholder';

export async function bootstrapTenantCoa(
  tx: Database,
  tenantId: string,
  templateKey: string,
  stateName?: string,
): Promise<{ accountCount: number; classificationCount: number }> {
  // Idempotency: check if this tenant already has accounting settings
  const existingSettings = await tx
    .select({ tenantId: accountingSettings.tenantId })
    .from(accountingSettings)
    .where(eq(accountingSettings.tenantId, tenantId))
    .limit(1);

  if (existingSettings.length > 0) {
    // Already bootstrapped — count existing entities and return
    const existingClassifications = await tx
      .select({ id: glClassifications.id })
      .from(glClassifications)
      .where(eq(glClassifications.tenantId, tenantId));
    const existingAccounts = await tx
      .select({ id: glAccounts.id })
      .from(glAccounts)
      .where(eq(glAccounts.tenantId, tenantId));
    return {
      accountCount: existingAccounts.length,
      classificationCount: existingClassifications.length,
    };
  }

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
    throw new AppError(
      'VALIDATION_ERROR',
      `No account templates found for key: ${templateKey}. Have all migrations been run? (pnpm db:migrate)`,
      400,
    );
  }

  // 3b. Apply state name to placeholders if provided
  const resolvedTemplates = stateName
    ? applyStatePlaceholders(accountTemplates, stateName)
    : accountTemplates;

  // 4. Insert accounts
  const controlAccountIds: Record<string, string> = {};

  for (const at of resolvedTemplates) {
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

    // Track special accounts by number
    if (at.accountNumber === '3000') {
      controlAccountIds['retained_earnings'] = id;
    }
    if (at.accountNumber === '9999') {
      controlAccountIds['rounding'] = id;
    }
    if (at.accountNumber === '2160') {
      controlAccountIds['tips_payable'] = id;
    }
    if (at.accountNumber === '4500') {
      controlAccountIds['service_charge_revenue'] = id;
    }
    if (at.accountNumber === '49900') {
      controlAccountIds['uncategorized_revenue'] = id;
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
    defaultPmsGuestLedgerAccountId: controlAccountIds['pms_guest_ledger'] ?? null,
    defaultTipsPayableAccountId: controlAccountIds['tips_payable'] ?? null,
    defaultServiceChargeRevenueAccountId: controlAccountIds['service_charge_revenue'] ?? null,
    defaultUncategorizedRevenueAccountId: controlAccountIds['uncategorized_revenue'] ?? null,
    roundingToleranceCents: 5,
  });

  return {
    accountCount: resolvedTemplates.length,
    classificationCount: classificationTemplates.length,
  };
}
