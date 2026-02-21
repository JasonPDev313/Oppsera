import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetItemAllergensInput } from '../validation';

export interface ItemAllergenDetail {
  id: string;
  allergenId: string;
  allergenName: string;
  icon: string | null;
  severity: string;
  notes: string | null;
}

export async function getItemAllergens(
  input: GetItemAllergensInput,
): Promise<ItemAllergenDetail[]> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT ia.id, ia.allergen_id, ad.name AS allergen_name,
                 ad.icon, ad.severity, ia.notes
          FROM fnb_item_allergens ia
          INNER JOIN fnb_allergen_definitions ad ON ad.id = ia.allergen_id
          WHERE ia.tenant_id = ${input.tenantId}
            AND ia.catalog_item_id = ${input.catalogItemId}
          ORDER BY ad.sort_order ASC, ad.name ASC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      allergenId: r.allergen_id as string,
      allergenName: r.allergen_name as string,
      icon: (r.icon as string) ?? null,
      severity: r.severity as string,
      notes: (r.notes as string) ?? null,
    }));
  });
}
