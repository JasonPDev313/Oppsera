import { eq } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { glAccounts } from '@oppsera/db';
import { validateFullCoa } from '../services/coa-validation';
import type { GLAccountForValidation } from '../services/coa-validation';

export interface CoaHealthReport {
  overallStatus: 'healthy' | 'warning' | 'error';
  errorCount: number;
  warningCount: number;
  errors: Array<{ field?: string; message: string }>;
  warnings: Array<{ field?: string; message: string }>;
  accountDistribution: Record<string, number>;
  totalAccounts: number;
  activeAccounts: number;
  fallbackCount: number;
  systemAccountCount: number;
}

export async function getCoaHealth(tenantId: string): Promise<CoaHealthReport> {
  return withTenant(tenantId, async (tx) => {
    const allAccounts = await tx
      .select()
      .from(glAccounts)
      .where(eq(glAccounts.tenantId, tenantId));

    // Map to validation interface
    const forValidation: GLAccountForValidation[] = allAccounts.map((a) => ({
      id: a.id,
      accountNumber: a.accountNumber,
      parentAccountId: a.parentAccountId,
      name: a.name,
      accountType: a.accountType,
      isActive: a.isActive ?? true,
      isFallback: a.isFallback ?? false,
      isSystemAccount: a.isSystemAccount ?? false,
      isControlAccount: a.isControlAccount ?? false,
      controlAccountType: a.controlAccountType ?? null,
      status: a.status ?? 'active',
    }));

    const { errors, warnings } = validateFullCoa(forValidation);

    // Account type distribution
    const distribution: Record<string, number> = {};
    const activeAccounts = allAccounts.filter((a) => a.isActive);
    for (const a of activeAccounts) {
      distribution[a.accountType] = (distribution[a.accountType] ?? 0) + 1;
    }

    const overallStatus = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'healthy';

    return {
      overallStatus,
      errorCount: errors.length,
      warningCount: warnings.length,
      errors: errors.map((e) => ({ field: e.field, message: e.message })),
      warnings: warnings.map((w) => ({ field: w.field, message: w.message })),
      accountDistribution: distribution,
      totalAccounts: allAccounts.length,
      activeAccounts: activeAccounts.length,
      fallbackCount: allAccounts.filter((a) => a.isFallback).length,
      systemAccountCount: allAccounts.filter((a) => a.isSystemAccount).length,
    };
  });
}
