import { db } from '@oppsera/db';
import type { EventEnvelope } from '@oppsera/shared';
import {
  resolveSubDepartmentAccounts,
  resolvePaymentTypeAccounts,
  resolveTaxGroupAccount,
  logUnmappedEvent,
} from '../helpers/resolve-mapping';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';

interface PackageComponent {
  catalogItemId: string;
  catalogItemName: string;
  subDepartmentId: string | null;
  qty: number;
  componentUnitPriceCents: number;
  componentExtendedCents: number;
  allocatedRevenueCents: number;
  allocationWeight: number;
}

interface TenderRecordedPayload {
  tenderId: string;
  orderId: string;
  tenantId: string;
  locationId: string;
  tenderType?: string;
  paymentMethod?: string;
  amount: number; // cents
  tipAmount?: number;
  customerId?: string;
  lines?: Array<{
    catalogItemId: string;
    catalogItemName: string;
    subDepartmentId: string | null;
    qty: number;
    extendedPriceCents: number;
    taxGroupId: string | null;
    taxAmountCents: number;
    costCents: number | null;
    packageComponents: PackageComponent[] | null;
  }>;
  businessDate: string;
}

export async function handleTenderForAccounting(event: EventEnvelope): Promise<void> {
  const { tenantId } = event;
  const data = event.data as unknown as TenderRecordedPayload;

  // Check if accounting is enabled for this tenant
  const settings = await getAccountingSettings(db, tenantId);
  if (!settings) return; // no accounting — skip silently

  const accountingApi = getAccountingPostingApi();

  // Build a synthetic context for GL posting
  const ctx: RequestContext = {
    tenantId,
    locationId: data.locationId,
    user: { id: 'system', email: 'system@oppsera.io', name: 'System', tenantId, tenantStatus: 'active', membershipStatus: 'active' },
    requestId: `pos-gl-${data.tenderId}`,
    isPlatformAdmin: false,
  } as RequestContext;

  const glLines: Array<{
    accountId: string;
    debitAmount: string;
    creditAmount: string;
    locationId?: string;
    customerId?: string;
    memo?: string;
  }> = [];

  const missingMappings: string[] = [];

  // 1. Resolve payment type → deposit/clearing account (DEBIT side)
  const paymentMethod = data.tenderType ?? data.paymentMethod ?? 'unknown';
  const paymentTypeMapping = await resolvePaymentTypeAccounts(db, tenantId, paymentMethod);
  if (!paymentTypeMapping) {
    missingMappings.push(`payment_type:${paymentMethod}`);
  } else {
    // If undeposited funds workflow is enabled, use clearing account
    const depositAccountId = settings.enableUndepositedFundsWorkflow && paymentTypeMapping.clearingAccountId
      ? paymentTypeMapping.clearingAccountId
      : paymentTypeMapping.depositAccountId;

    const tenderDollars = (data.amount / 100).toFixed(2);
    glLines.push({
      accountId: depositAccountId,
      debitAmount: tenderDollars,
      creditAmount: '0',
      locationId: data.locationId,
      customerId: data.customerId,
      memo: `POS tender ${paymentMethod}`,
    });
  }

  // 2. Resolve line items → revenue accounts (CREDIT side)
  if (data.lines && data.lines.length > 0) {
    // Group by subDepartmentId for revenue lines
    const revenueBySubDept = new Map<string, number>();
    const cogsLines: Array<{ subDeptId: string; costCents: number }> = [];
    const taxByGroup = new Map<string, number>();

    for (const line of data.lines) {
      // Check if this is a package with enriched component allocations
      const hasEnrichedComponents = line.packageComponents
        && line.packageComponents.length > 0
        && line.packageComponents[0]?.allocatedRevenueCents != null;

      if (hasEnrichedComponents) {
        // Package item: split revenue across component subdepartments
        for (const comp of line.packageComponents!) {
          const compSubDeptId = comp.subDepartmentId ?? 'unmapped';
          const existing = revenueBySubDept.get(compSubDeptId) ?? 0;
          revenueBySubDept.set(compSubDeptId, existing + comp.allocatedRevenueCents);
        }
      } else {
        // Regular item or legacy package: use line-level subdepartment
        const subDeptId = line.subDepartmentId ?? 'unmapped';
        const existing = revenueBySubDept.get(subDeptId) ?? 0;
        revenueBySubDept.set(subDeptId, existing + line.extendedPriceCents);
      }

      if (line.costCents && settings.enableCogsPosting) {
        const subDeptId = line.subDepartmentId ?? 'unmapped';
        cogsLines.push({ subDeptId, costCents: line.costCents * line.qty });
      }

      if (line.taxGroupId && line.taxAmountCents) {
        const existingTax = taxByGroup.get(line.taxGroupId) ?? 0;
        taxByGroup.set(line.taxGroupId, existingTax + line.taxAmountCents);
      }
    }

    // Revenue credits
    for (const [subDeptId, amountCents] of revenueBySubDept) {
      if (subDeptId === 'unmapped') {
        missingMappings.push(`sub_department:unmapped`);
        continue;
      }

      const subDeptMapping = await resolveSubDepartmentAccounts(db, tenantId, subDeptId);
      if (!subDeptMapping) {
        missingMappings.push(`sub_department:${subDeptId}`);
        continue;
      }

      glLines.push({
        accountId: subDeptMapping.revenueAccountId,
        debitAmount: '0',
        creditAmount: (amountCents / 100).toFixed(2),
        locationId: data.locationId,
        memo: `Revenue - sub-dept ${subDeptId}`,
      });
    }

    // COGS entries (debit COGS, credit Inventory)
    if (settings.enableCogsPosting) {
      const cogsBySubDept = new Map<string, number>();
      for (const c of cogsLines) {
        const existing = cogsBySubDept.get(c.subDeptId) ?? 0;
        cogsBySubDept.set(c.subDeptId, existing + c.costCents);
      }

      for (const [subDeptId, costCents] of cogsBySubDept) {
        const subDeptMapping = await resolveSubDepartmentAccounts(db, tenantId, subDeptId);
        if (!subDeptMapping || !subDeptMapping.cogsAccountId || !subDeptMapping.inventoryAccountId) continue;

        const costDollars = (costCents / 100).toFixed(2);
        glLines.push({
          accountId: subDeptMapping.cogsAccountId,
          debitAmount: costDollars,
          creditAmount: '0',
          locationId: data.locationId,
          memo: `COGS - sub-dept ${subDeptId}`,
        });
        glLines.push({
          accountId: subDeptMapping.inventoryAccountId,
          debitAmount: '0',
          creditAmount: costDollars,
          locationId: data.locationId,
          memo: `Inventory - sub-dept ${subDeptId}`,
        });
      }
    }

    // Tax credits
    for (const [taxGroupId, taxCents] of taxByGroup) {
      const taxAccountId = await resolveTaxGroupAccount(db, tenantId, taxGroupId);
      if (!taxAccountId) {
        missingMappings.push(`tax_group:${taxGroupId}`);
        continue;
      }

      glLines.push({
        accountId: taxAccountId,
        debitAmount: '0',
        creditAmount: (taxCents / 100).toFixed(2),
        locationId: data.locationId,
        memo: `Sales tax - group ${taxGroupId}`,
      });
    }
  } else {
    // No line detail — single credit to a default revenue account or skip
    missingMappings.push('no_line_detail');
  }

  // 3. Handle missing mappings
  if (missingMappings.length > 0) {
    for (const reason of missingMappings) {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'tender.recorded.v1',
        sourceModule: 'pos',
        sourceReferenceId: data.tenderId,
        entityType: reason.split(':')[0] ?? 'unknown',
        entityId: reason.split(':')[1] ?? reason,
        reason: `Missing GL mapping: ${reason}`,
      });
    }

    // If we're missing the payment type mapping (debit side), we can't post at all
    if (!paymentTypeMapping) return;
  }

  // 4. Only post if we have valid debit and credit lines
  if (glLines.length < 2) return;

  // 5. Post GL entry via accounting API
  try {
    await accountingApi.postEntry(ctx, {
      businessDate: data.businessDate,
      sourceModule: 'pos',
      sourceReferenceId: data.tenderId,
      memo: `POS Sale - Order ${data.orderId}`,
      currency: 'USD',
      lines: glLines,
      forcePost: true,
    });
  } catch (error) {
    // POS adapter must NEVER block tenders — log and continue
    console.error(`POS GL posting failed for tender ${data.tenderId}:`, error);
    await logUnmappedEvent(db, tenantId, {
      eventType: 'tender.recorded.v1',
      sourceModule: 'pos',
      sourceReferenceId: data.tenderId,
      entityType: 'posting_error',
      entityId: data.tenderId,
      reason: `GL posting failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}
