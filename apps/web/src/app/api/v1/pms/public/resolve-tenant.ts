import { eq } from 'drizzle-orm';
import { createAdminClient, tenants } from '@oppsera/db';

export interface ResolvedPmsTenant {
  tenantId: string;
  tenantName: string;
}

/**
 * Resolves a tenant by slug for PMS public routes.
 * Runs OUTSIDE withTenant() — no RLS context.
 */
export async function resolvePmsTenantBySlug(
  slug: string,
): Promise<ResolvedPmsTenant | null> {
  const adminDb = createAdminClient();

  const [tenant] = await adminDb
    .select({
      id: tenants.id,
      name: tenants.name,
      status: tenants.status,
    })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);

  if (!tenant || tenant.status !== 'active') {
    return null;
  }

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
  };
}
