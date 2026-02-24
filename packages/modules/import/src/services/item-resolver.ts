/**
 * Item resolver: match legacy item names/SKUs to existing catalog items.
 *
 * Resolution order:
 * 1. Exact SKU match (confidence 0.99)
 * 2. Exact barcode match (confidence 0.95)
 * 3. Exact name match (confidence 0.90)
 * 4. Fuzzy name match via token overlap (confidence 0.60-0.80)
 * 5. No match → placeholder or skip
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface CatalogItemRef {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
}

export interface ItemResolution {
  legacyItemName: string;
  legacyItemSku: string | null;
  catalogItemId: string | null;
  catalogItemName: string | null;
  strategy: 'auto' | 'mapped' | 'placeholder' | 'skip';
  confidence: number;
  occurrenceCount: number;
  totalRevenueCents: number;
}

// ── Fuzzy Matching ────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
}

function tokenOverlapScore(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setB = new Set(tokensB);
  const overlap = tokensA.filter((t) => setB.has(t)).length;
  return overlap / Math.max(tokensA.length, tokensB.length);
}

// ── Resolver ──────────────────────────────────────────────────────────

/**
 * Resolve legacy items against a catalog.
 *
 * @param legacyItems - Distinct items from the CSV with occurrence counts
 * @param catalogItems - Existing catalog items to match against
 */
export function resolveItems(
  legacyItems: Array<{
    name: string;
    sku: string | null;
    occurrenceCount: number;
    totalRevenueCents: number;
  }>,
  catalogItems: CatalogItemRef[],
): ItemResolution[] {
  // Build lookup indexes
  const bySku = new Map<string, CatalogItemRef>();
  const byBarcode = new Map<string, CatalogItemRef>();
  const byNameExact = new Map<string, CatalogItemRef>();

  for (const item of catalogItems) {
    if (item.sku) bySku.set(item.sku.toLowerCase(), item);
    if (item.barcode) byBarcode.set(item.barcode.toLowerCase(), item);
    byNameExact.set(item.name.toLowerCase(), item);
  }

  return legacyItems.map((legacy) => {
    // 1. Exact SKU match
    if (legacy.sku) {
      const match = bySku.get(legacy.sku.toLowerCase());
      if (match) {
        return {
          legacyItemName: legacy.name,
          legacyItemSku: legacy.sku,
          catalogItemId: match.id,
          catalogItemName: match.name,
          strategy: 'auto' as const,
          confidence: 0.99,
          occurrenceCount: legacy.occurrenceCount,
          totalRevenueCents: legacy.totalRevenueCents,
        };
      }
    }

    // 2. Exact barcode match (treat SKU as potential barcode)
    if (legacy.sku) {
      const match = byBarcode.get(legacy.sku.toLowerCase());
      if (match) {
        return {
          legacyItemName: legacy.name,
          legacyItemSku: legacy.sku,
          catalogItemId: match.id,
          catalogItemName: match.name,
          strategy: 'auto' as const,
          confidence: 0.95,
          occurrenceCount: legacy.occurrenceCount,
          totalRevenueCents: legacy.totalRevenueCents,
        };
      }
    }

    // 3. Exact name match
    const nameMatch = byNameExact.get(legacy.name.toLowerCase());
    if (nameMatch) {
      return {
        legacyItemName: legacy.name,
        legacyItemSku: legacy.sku,
        catalogItemId: nameMatch.id,
        catalogItemName: nameMatch.name,
        strategy: 'auto' as const,
        confidence: 0.90,
        occurrenceCount: legacy.occurrenceCount,
        totalRevenueCents: legacy.totalRevenueCents,
      };
    }

    // 4. Fuzzy name match
    let bestFuzzyMatch: CatalogItemRef | null = null;
    let bestFuzzyScore = 0;
    for (const item of catalogItems) {
      const score = tokenOverlapScore(legacy.name, item.name);
      if (score > bestFuzzyScore && score >= 0.5) {
        bestFuzzyScore = score;
        bestFuzzyMatch = item;
      }
    }

    if (bestFuzzyMatch && bestFuzzyScore >= 0.5) {
      return {
        legacyItemName: legacy.name,
        legacyItemSku: legacy.sku,
        catalogItemId: bestFuzzyMatch.id,
        catalogItemName: bestFuzzyMatch.name,
        strategy: 'auto' as const,
        confidence: Math.round((0.60 + bestFuzzyScore * 0.20) * 100) / 100,
        occurrenceCount: legacy.occurrenceCount,
        totalRevenueCents: legacy.totalRevenueCents,
      };
    }

    // 5. No match
    return {
      legacyItemName: legacy.name,
      legacyItemSku: legacy.sku,
      catalogItemId: null,
      catalogItemName: null,
      strategy: 'placeholder' as const,
      confidence: 0,
      occurrenceCount: legacy.occurrenceCount,
      totalRevenueCents: legacy.totalRevenueCents,
    };
  });
}

/**
 * Extract distinct items from grouped orders for resolution.
 */
export function extractDistinctItems(
  orders: Array<{ lines: Array<Record<string, string>> }>,
): Array<{ name: string; sku: string | null; occurrenceCount: number; totalRevenueCents: number }> {
  const items = new Map<string, { name: string; sku: string | null; occurrenceCount: number; totalRevenueCents: number }>();

  for (const order of orders) {
    for (const line of order.lines) {
      const name = line.catalogItemName ?? line.catalogItemSku ?? '';
      if (!name) continue;

      const key = name.toLowerCase();
      const existing = items.get(key);
      const lineTotalCents = parseCurrencyToCents(line.lineTotal ?? line.unitPrice ?? '0');

      if (existing) {
        existing.occurrenceCount++;
        existing.totalRevenueCents += lineTotalCents;
      } else {
        items.set(key, {
          name,
          sku: line.catalogItemSku ?? null,
          occurrenceCount: 1,
          totalRevenueCents: lineTotalCents,
        });
      }
    }
  }

  return [...items.values()].sort((a, b) => b.totalRevenueCents - a.totalRevenueCents);
}

function parseCurrencyToCents(value: string): number {
  const cleaned = value.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}
