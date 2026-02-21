import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListAllergensInput } from '../validation';

export interface AllergenItem {
  id: string;
  name: string;
  icon: string | null;
  severity: string;
  isSystem: boolean;
  sortOrder: number;
}

export async function listAllergens(
  input: ListAllergensInput,
): Promise<AllergenItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id, name, icon, severity, is_system, sort_order
          FROM fnb_allergen_definitions
          WHERE tenant_id = ${input.tenantId}
          ORDER BY sort_order ASC, name ASC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      icon: (r.icon as string) ?? null,
      severity: r.severity as string,
      isSystem: r.is_system as boolean,
      sortOrder: Number(r.sort_order),
    }));
  });
}
