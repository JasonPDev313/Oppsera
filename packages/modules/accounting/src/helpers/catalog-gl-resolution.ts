import type { Database } from '@oppsera/db';
import { resolveSubDepartmentAccounts } from './resolve-mapping';

/**
 * Resolve the revenue GL account for a given sub-department.
 * Returns null if no mapping is found.
 */
export async function resolveRevenueAccountForSubDepartment(
  db: Database,
  tenantId: string,
  subDepartmentId: string,
): Promise<string | null> {
  const mapping = await resolveSubDepartmentAccounts(db, tenantId, subDepartmentId);
  return mapping?.revenueAccountId ?? null;
}

interface PackageComponentForGL {
  subDepartmentId: string | null;
  allocatedRevenueCents: number;
}

interface GLRevenueSplit {
  subDepartmentId: string | null;
  revenueCents: number;
}

/**
 * Expand a line into per-subdepartment revenue splits for GL posting.
 *
 * If the line has enriched packageComponents (with allocatedRevenueCents),
 * returns one entry per component with its allocated revenue.
 * Otherwise, returns a single entry with the line-level data.
 */
export function expandPackageForGL(line: {
  subDepartmentId: string | null;
  extendedPriceCents: number;
  packageComponents?: PackageComponentForGL[] | null;
}): GLRevenueSplit[] {
  const hasEnrichedComponents = line.packageComponents
    && line.packageComponents.length > 0
    && line.packageComponents[0]?.allocatedRevenueCents != null;

  if (hasEnrichedComponents) {
    return line.packageComponents!.map((comp) => ({
      subDepartmentId: comp.subDepartmentId,
      revenueCents: comp.allocatedRevenueCents,
    }));
  }

  return [{ subDepartmentId: line.subDepartmentId, revenueCents: line.extendedPriceCents }];
}
