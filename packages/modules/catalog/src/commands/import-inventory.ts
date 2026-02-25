/**
 * Atomic inventory import command.
 *
 * Inside a single publishWithOutbox transaction:
 *   1. Insert import log (status='importing')
 *   2. Load existing categories, SKUs, barcodes for tenant
 *   3. Re-validate with server-side data
 *   4. Auto-create missing departments → sub-departments → categories
 *   5. Insert items (skip or update duplicates per user choice)
 *   6. Log each item change + emit catalog.item.created.v1 events
 *   7. Update import log with final counts
 */

import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import {
  catalogItems,
  catalogCategories,
  taxCategories,
  catalogImportLogs,
} from '../schema';
import { logItemChange } from '../services/item-change-log';
import { parseCsv, isParseError } from '../services/inventory-import-parser';
import { validateImport } from '../services/inventory-import-validator';
import type { ParsedItem } from '../services/inventory-import-validator';
import type { ExecuteImportInput } from '../validation-import';

// ── Types ────────────────────────────────────────────────────────────

export interface ImportResult {
  importLogId: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
  skippedRows: number;
  updatedRows: number;
  categoriesCreated: number;
  errors: Array<{ row?: number; message: string }>;
  createdItemIds?: string[];
}

// ── Main Command ────────────────────────────────────────────────────

export async function importInventory(
  ctx: RequestContext,
  input: ExecuteImportInput,
): Promise<ImportResult> {
  // Parse CSV
  const parsed = parseCsv(input.csvContent);
  if (isParseError(parsed)) {
    return {
      importLogId: '',
      totalRows: 0,
      successRows: 0,
      errorRows: 0,
      skippedRows: 0,
      updatedRows: 0,
      categoriesCreated: 0,
      errors: [{ message: parsed.message }],
    };
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Insert import log
    const [importLog] = await tx
      .insert(catalogImportLogs)
      .values({
        tenantId: ctx.tenantId,
        fileName: input.fileName ?? 'import.csv',
        totalRows: parsed.totalRows,
        status: 'importing',
        mappings: input.mappings,
        importedBy: ctx.user.id,
      })
      .returning();

    // 2. Load existing data for validation
    const existingItems = await tx
      .select({
        id: catalogItems.id,
        sku: catalogItems.sku,
        barcode: catalogItems.barcode,
      })
      .from(catalogItems)
      .where(
        and(
          eq(catalogItems.tenantId, ctx.tenantId),
          sql`${catalogItems.archivedAt} IS NULL`,
        ),
      );

    const existingSkus = new Set(
      existingItems.filter((i) => i.sku).map((i) => i.sku!.toUpperCase()),
    );
    const existingBarcodes = new Set(
      existingItems.filter((i) => i.barcode).map((i) => i.barcode!),
    );

    // Map SKU → existing item ID for update mode
    const skuToItemId = new Map<string, string>();
    for (const item of existingItems) {
      if (item.sku) skuToItemId.set(item.sku.toUpperCase(), item.id);
    }

    const existingCats = await tx
      .select({ id: catalogCategories.id, name: catalogCategories.name, parentId: catalogCategories.parentId })
      .from(catalogCategories)
      .where(eq(catalogCategories.tenantId, ctx.tenantId));

    const existingCategoryNames = new Set(existingCats.map((c) => c.name.toLowerCase()));

    const existingTaxCats = await tx
      .select({ id: taxCategories.id, name: taxCategories.name })
      .from(taxCategories)
      .where(eq(taxCategories.tenantId, ctx.tenantId));

    const taxCatNames = new Set(existingTaxCats.map((t) => t.name.toLowerCase()));
    const taxCatByName = new Map(existingTaxCats.map((t) => [t.name.toLowerCase(), t.id]));

    // 3. Server-side validation
    const validation = validateImport({
      headers: parsed.headers,
      rows: parsed.rows,
      mappings: input.mappings,
      existingSkus,
      existingBarcodes,
      existingCategories: existingCategoryNames,
      existingTaxCategories: taxCatNames,
      defaultItemType: input.defaultItemType ?? 'retail',
    });

    if (!validation.isValid) {
      // Update import log as failed
      await tx
        .update(catalogImportLogs)
        .set({
          status: 'failed',
          errorRows: validation.stats.errorRows,
          errors: validation.errors.map((e) => ({ row: e.row, message: e.message })),
          completedAt: new Date(),
        })
        .where(eq(catalogImportLogs.id, importLog!.id));

      return {
        result: {
          importLogId: importLog!.id,
          totalRows: validation.stats.totalRows,
          successRows: 0,
          errorRows: validation.stats.errorRows,
          skippedRows: 0,
          updatedRows: 0,
          categoriesCreated: 0,
          errors: validation.errors.map((e) => ({ row: e.row, message: e.message })),
        } satisfies ImportResult,
        events: [],
      };
    }

    // 4. Auto-create missing category hierarchy
    // Build a map for looking up existing categories by name (case-insensitive)
    const catByName = new Map<string, string>(); // lowercase name → id
    const catByNameAndParent = new Map<string, string>(); // `${parentId}:${name.toLowerCase()}` → id
    for (const cat of existingCats) {
      catByName.set(cat.name.toLowerCase(), cat.id);
      catByNameAndParent.set(`${cat.parentId ?? 'null'}:${cat.name.toLowerCase()}`, cat.id);
    }

    let categoriesCreated = 0;

    // Create departments (parentId = null)
    for (const deptName of validation.stats.newDepartments) {
      const key = `null:${deptName.toLowerCase()}`;
      if (!catByNameAndParent.has(key)) {
        const [created] = await tx
          .insert(catalogCategories)
          .values({
            tenantId: ctx.tenantId,
            name: deptName,
            parentId: null,
          })
          .returning();
        catByName.set(deptName.toLowerCase(), created!.id);
        catByNameAndParent.set(key, created!.id);
        categoriesCreated++;
      }
    }

    // Create sub-departments (under departments)
    for (const item of validation.parsedItems) {
      if (item.subDepartment && item.department) {
        const parentId = catByName.get(item.department.toLowerCase());
        if (parentId) {
          const key = `${parentId}:${item.subDepartment.toLowerCase()}`;
          if (!catByNameAndParent.has(key)) {
            const [created] = await tx
              .insert(catalogCategories)
              .values({
                tenantId: ctx.tenantId,
                name: item.subDepartment,
                parentId,
              })
              .returning();
            catByName.set(item.subDepartment.toLowerCase(), created!.id);
            catByNameAndParent.set(key, created!.id);
            categoriesCreated++;
          }
        }
      }
    }

    // Create categories (under sub-departments or departments)
    for (const item of validation.parsedItems) {
      if (item.category) {
        // Find parent: prefer sub-department, fall back to department
        let parentId: string | undefined;
        if (item.subDepartment) {
          parentId = catByName.get(item.subDepartment.toLowerCase());
        } else if (item.department) {
          parentId = catByName.get(item.department.toLowerCase());
        }

        const key = `${parentId ?? 'null'}:${item.category.toLowerCase()}`;
        if (!catByNameAndParent.has(key)) {
          const [created] = await tx
            .insert(catalogCategories)
            .values({
              tenantId: ctx.tenantId,
              name: item.category,
              parentId: parentId ?? null,
            })
            .returning();
          catByName.set(item.category.toLowerCase(), created!.id);
          catByNameAndParent.set(key, created!.id);
          categoriesCreated++;
        }
      }
    }

    // 5. Insert items — each row wrapped in a savepoint so one DB error
    //    does not abort the entire transaction.
    let successRows = 0;
    let skippedRows = 0;
    let updatedRows = 0;
    const itemErrors: Array<{ row?: number; message: string }> = [];
    const events: Array<ReturnType<typeof buildEventFromContext>> = [];
    const createdItemIds: string[] = [];

    for (const item of validation.parsedItems) {
      // Check for duplicate SKU — skip doesn't need a savepoint
      if (item.sku && existingSkus.has(item.sku) && input.duplicateSkuMode === 'skip') {
        skippedRows++;
        continue;
      }

      const sp = `sp_item_${item.rowNumber}`;
      try {
        await tx.execute(sql.raw(`SAVEPOINT ${sp}`));

        // Resolve categoryId from hierarchy
        const categoryId = resolveCategoryId(item, catByName, catByNameAndParent);

        // Resolve taxCategoryId
        const taxCategoryId = item.taxCategoryName
          ? taxCatByName.get(item.taxCategoryName.toLowerCase()) ?? null
          : null;

        // Check for duplicate SKU — update mode
        if (item.sku && existingSkus.has(item.sku)) {
          const existingItemId = skuToItemId.get(item.sku);
          if (existingItemId) {
            // Fetch current state for change log
            const [before] = await tx
              .select()
              .from(catalogItems)
              .where(eq(catalogItems.id, existingItemId))
              .limit(1);

            await tx
              .update(catalogItems)
              .set({
                name: item.name,
                description: item.description,
                itemType: item.itemType,
                defaultPrice: String(item.defaultPrice),
                cost: item.cost != null ? String(item.cost) : null,
                categoryId: categoryId ?? before?.categoryId ?? null,
                taxCategoryId: taxCategoryId ?? before?.taxCategoryId ?? null,
                priceIncludesTax: item.priceIncludesTax,
                isTrackable: item.isTrackable,
                updatedBy: ctx.user.id,
                updatedAt: new Date(),
              })
              .where(eq(catalogItems.id, existingItemId));

            const [after] = await tx
              .select()
              .from(catalogItems)
              .where(eq(catalogItems.id, existingItemId))
              .limit(1);

            await logItemChange(tx, {
              tenantId: ctx.tenantId,
              itemId: existingItemId,
              before: before ?? null,
              after: after!,
              userId: ctx.user.id,
              actionType: 'IMPORTED',
              source: 'IMPORT',
            });

            updatedRows++;
            await tx.execute(sql.raw(`RELEASE SAVEPOINT ${sp}`));
            continue;
          }
        }

        // Insert new item
        const [created] = await tx
          .insert(catalogItems)
          .values({
            tenantId: ctx.tenantId,
            sku: item.sku,
            barcode: item.barcode,
            name: item.name,
            description: item.description,
            itemType: item.itemType,
            defaultPrice: String(item.defaultPrice),
            cost: item.cost != null ? String(item.cost) : null,
            categoryId: categoryId ?? null,
            taxCategoryId: taxCategoryId ?? null,
            priceIncludesTax: item.priceIncludesTax,
            isTrackable: item.isTrackable,
            createdBy: ctx.user.id,
          })
          .returning();

        createdItemIds.push(created!.id);

        // Log creation
        await logItemChange(tx, {
          tenantId: ctx.tenantId,
          itemId: created!.id,
          before: null,
          after: created!,
          userId: ctx.user.id,
          actionType: 'IMPORTED',
          source: 'IMPORT',
        });

        // Emit event
        events.push(
          buildEventFromContext(
            ctx,
            'catalog.item.created.v1',
            {
              itemId: created!.id,
              sku: created!.sku,
              name: created!.name,
              itemType: created!.itemType,
              defaultPrice: Number(created!.defaultPrice),
              cost: created!.cost != null ? Number(created!.cost) : null,
              categoryId: created!.categoryId,
              taxCategoryId: created!.taxCategoryId,
              isTrackable: created!.isTrackable,
            },
            `${ctx.tenantId}:catalog_item:${item.sku || item.name}:imported`,
          ),
        );

        successRows++;
        await tx.execute(sql.raw(`RELEASE SAVEPOINT ${sp}`));
      } catch (err) {
        // Roll back to the savepoint so subsequent rows can still execute
        try { await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${sp}`)); } catch { /* ignore */ }
        const msg = err instanceof Error ? err.message : 'Unknown error';
        itemErrors.push({
          row: item.rowNumber,
          message: formatImportDbError(msg),
        });
      }
    }

    // 6. Update import log with final counts
    await tx
      .update(catalogImportLogs)
      .set({
        status: itemErrors.length === 0 ? 'complete' : 'complete_with_errors',
        successRows,
        errorRows: itemErrors.length,
        skippedRows,
        updatedRows,
        categoriesCreated,
        errors: itemErrors.length > 0 ? itemErrors : null,
        completedAt: new Date(),
      })
      .where(eq(catalogImportLogs.id, importLog!.id));

    return {
      result: {
        importLogId: importLog!.id,
        totalRows: parsed.totalRows,
        successRows,
        errorRows: itemErrors.length,
        skippedRows,
        updatedRows,
        categoriesCreated,
        errors: itemErrors,
        createdItemIds,
      } satisfies ImportResult,
      events,
    };
  });

  await auditLog(ctx, 'catalog.import.completed', 'catalog_import_log', result.importLogId);

  return result;
}

// ── User-friendly DB error messages ──────────────────────────────────

function formatImportDbError(raw: string): string {
  if (raw.includes('duplicate key') && raw.includes('sku')) {
    return 'An item with this SKU already exists';
  }
  if (raw.includes('duplicate key') && raw.includes('barcode')) {
    return 'An item with this barcode already exists';
  }
  if (raw.includes('duplicate key')) {
    return 'Duplicate record — this item may already exist';
  }
  if (raw.includes('violates foreign key')) {
    return 'Invalid reference (category or tax category does not exist)';
  }
  if (raw.includes('violates not-null')) {
    return 'A required field is missing';
  }
  return raw;
}

// ── Helpers ──────────────────────────────────────────────────────────

function resolveCategoryId(
  item: ParsedItem,
  catByName: Map<string, string>,
  catByNameAndParent: Map<string, string>,
): string | null {
  // Resolve from most specific to least specific
  // Priority: category → subDepartment → department
  if (item.category) {
    // Try to find category under the right parent
    let parentId: string | undefined;
    if (item.subDepartment) {
      parentId = catByName.get(item.subDepartment.toLowerCase());
    } else if (item.department) {
      parentId = catByName.get(item.department.toLowerCase());
    }
    const key = `${parentId ?? 'null'}:${item.category.toLowerCase()}`;
    const catId = catByNameAndParent.get(key);
    if (catId) return catId;
    // Fall back to name-only lookup
    return catByName.get(item.category.toLowerCase()) ?? null;
  }

  if (item.subDepartment) {
    return catByName.get(item.subDepartment.toLowerCase()) ?? null;
  }

  if (item.department) {
    return catByName.get(item.department.toLowerCase()) ?? null;
  }

  return null;
}
