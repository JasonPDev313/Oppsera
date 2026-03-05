import { eq, and, asc, desc, sql, type SQL } from 'drizzle-orm';
import { withTenant, spaPackageDefinitions } from '@oppsera/db';

/** Encode a composite cursor as "sortOrder|id". */
function encodeCursor(sortOrder: number, id: string): string {
  return Buffer.from(`${sortOrder}|${id}`).toString('base64url');
}

/** Decode a composite cursor. Returns null for legacy plain-id cursors. */
function decodeCursor(cursor: string): { sortOrder: number; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const pipe = decoded.indexOf('|');
    if (pipe === -1) return null; // legacy id-only cursor
    const sortOrder = parseInt(decoded.slice(0, pipe), 10);
    const id = decoded.slice(pipe + 1);
    if (isNaN(sortOrder) || !id) return null;
    return { sortOrder, id };
  } catch {
    return null;
  }
}

export interface ListPackageDefinitionsInput {
  tenantId: string;
  isActive?: boolean;
  packageType?: string;
  cursor?: string;
  limit?: number;
}

export interface PackageDefinitionRow {
  id: string;
  name: string;
  description: string | null;
  packageType: string;
  totalSessions: number | null;
  totalCredits: string | null;
  sellingPriceCents: number;
  validityDays: number;
  isTransferable: boolean;
  freezeAllowed: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
}

export interface ListPackageDefinitionsResult {
  items: PackageDefinitionRow[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * Returns paginated package definitions with cursor pagination.
 * Filters by isActive and packageType.
 * Order by sortOrder ASC, then id DESC.
 * Default limit 50.
 */
export async function listPackageDefinitions(
  input: ListPackageDefinitionsInput,
): Promise<ListPackageDefinitionsResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions: SQL[] = [
      eq(spaPackageDefinitions.tenantId, input.tenantId),
    ];

    if (input.cursor) {
      const parsed = decodeCursor(input.cursor);
      if (parsed) {
        // Composite cursor: ORDER BY sortOrder ASC, id DESC
        // Next page condition: (sortOrder > cursorSortOrder) OR (sortOrder = cursorSortOrder AND id < cursorId)
        conditions.push(sql`(
          ${spaPackageDefinitions.sortOrder} > ${parsed.sortOrder}
          OR (${spaPackageDefinitions.sortOrder} = ${parsed.sortOrder} AND ${spaPackageDefinitions.id} < ${parsed.id})
        )`);
      } else {
        // Legacy plain-id cursor fallback
        conditions.push(sql`${spaPackageDefinitions.id} < ${input.cursor}`);
      }
    }

    if (input.isActive !== undefined) {
      conditions.push(eq(spaPackageDefinitions.isActive, input.isActive));
    }

    if (input.packageType) {
      conditions.push(eq(spaPackageDefinitions.packageType, input.packageType));
    }

    const rows = await tx
      .select({
        id: spaPackageDefinitions.id,
        name: spaPackageDefinitions.name,
        description: spaPackageDefinitions.description,
        packageType: spaPackageDefinitions.packageType,
        totalSessions: spaPackageDefinitions.totalSessions,
        totalCredits: spaPackageDefinitions.totalCredits,
        sellingPriceCents: spaPackageDefinitions.sellingPriceCents,
        validityDays: spaPackageDefinitions.validityDays,
        isTransferable: spaPackageDefinitions.isTransferable,
        freezeAllowed: spaPackageDefinitions.freezeAllowed,
        isActive: spaPackageDefinitions.isActive,
        sortOrder: spaPackageDefinitions.sortOrder,
        createdAt: spaPackageDefinitions.createdAt,
      })
      .from(spaPackageDefinitions)
      .where(and(...conditions))
      .orderBy(asc(spaPackageDefinitions.sortOrder), desc(spaPackageDefinitions.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = sliced[sliced.length - 1];
    const nextCursor = hasMore && lastRow
      ? encodeCursor(lastRow.sortOrder, lastRow.id)
      : null;

    const items: PackageDefinitionRow[] = sliced.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? null,
      packageType: r.packageType,
      totalSessions: r.totalSessions ?? null,
      totalCredits: r.totalCredits ?? null,
      sellingPriceCents: r.sellingPriceCents,
      validityDays: r.validityDays,
      isTransferable: r.isTransferable,
      freezeAllowed: r.freezeAllowed,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt,
    }));

    return { items, cursor: nextCursor, hasMore };
  });
}
