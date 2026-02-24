import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, catalogItems, catalogCategories, taxCategories } from '@oppsera/db';
import { ValidationError } from '@oppsera/shared';
import { parseCsv, isParseError } from '@oppsera/module-catalog/services/inventory-import-parser';
import { validateImport } from '@oppsera/module-catalog/services/inventory-import-validator';
import { validateImportSchema } from '@oppsera/module-catalog/validation-import';

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = validateImportSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    // Parse CSV
    const csvResult = parseCsv(parsed.data.csvContent);
    if (isParseError(csvResult)) {
      throw new ValidationError(csvResult.message, []);
    }

    // Load existing data for uniqueness checks
    const result = await withTenant(ctx.tenantId, async (tx) => {
      const items = await tx
        .select({ sku: catalogItems.sku, barcode: catalogItems.barcode })
        .from(catalogItems)
        .where(
          and(
            eq(catalogItems.tenantId, ctx.tenantId),
            sql`${catalogItems.archivedAt} IS NULL`,
          ),
        );

      const existingSkus = new Set(
        items.filter((i) => i.sku).map((i) => i.sku!.toUpperCase()),
      );
      const existingBarcodes = new Set(
        items.filter((i) => i.barcode).map((i) => i.barcode!),
      );

      const cats = await tx
        .select({ name: catalogCategories.name })
        .from(catalogCategories)
        .where(eq(catalogCategories.tenantId, ctx.tenantId));
      const existingCategories = new Set(cats.map((c) => c.name.toLowerCase()));

      const taxCats = await tx
        .select({ name: taxCategories.name })
        .from(taxCategories)
        .where(eq(taxCategories.tenantId, ctx.tenantId));
      const existingTaxCategories = new Set(taxCats.map((t) => t.name.toLowerCase()));

      return { existingSkus, existingBarcodes, existingCategories, existingTaxCategories };
    });

    // Validate
    const validation = validateImport({
      headers: csvResult.headers,
      rows: csvResult.rows,
      mappings: parsed.data.mappings,
      existingSkus: result.existingSkus,
      existingBarcodes: result.existingBarcodes,
      existingCategories: result.existingCategories,
      existingTaxCategories: result.existingTaxCategories,
      defaultItemType: parsed.data.defaultItemType ?? 'retail',
    });

    // Build preview (first 50 items)
    const preview = validation.parsedItems.slice(0, 50).map((item) => ({
      name: item.name,
      sku: item.sku,
      barcode: item.barcode,
      itemType: item.itemType,
      defaultPrice: item.defaultPrice,
      cost: item.cost,
      department: item.department,
      subDepartment: item.subDepartment,
      category: item.category,
    }));

    return NextResponse.json({
      data: {
        isValid: validation.isValid,
        errors: validation.errors,
        warnings: validation.warnings,
        preview,
        stats: validation.stats,
      },
    });
  },
  { entitlement: 'catalog', permission: 'catalog.manage' },
);
