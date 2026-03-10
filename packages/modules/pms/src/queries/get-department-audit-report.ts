/**
 * Department Audit Report — folio entries grouped by department code for a date range.
 * Mirrors the classic PMS "Audit by Department" report (Jonas Chorum style).
 *
 * Guardrails:
 * - Max 31-day date range (matches Chorum "Max Date Range of 31 days")
 * - SQL LIMIT 10,000 rows to prevent unbounded result sets (#507)
 * - Tenant isolation via withTenant + explicit tenantId filter
 */
import { and, eq, gte, lte, sql, asc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  pmsFolioEntries,
  pmsFolios,
  pmsRooms,
  pmsReservations,
  pmsProperties,
} from '@oppsera/db';

// ── Constants ───────────────────────────────────────────────────
const MAX_DATE_RANGE_DAYS = 31;
const MAX_ROWS = 10_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── Types ───────────────────────────────────────────────────────

export interface DepartmentAuditEntry {
  entryId: string;
  businessDate: string;
  folioNumber: number | null;
  roomNumber: string | null;
  postedAt: string;
  entryType: string;
  description: string;
  grossCents: number;
  voidCents: number;
  adjustCents: number;
  netCents: number;
  ledger: string;
  postedBy: string | null;
}

export interface DepartmentAuditGroup {
  departmentCode: string;
  entryCount: number;
  entries: DepartmentAuditEntry[];
  totalGrossCents: number;
  totalVoidCents: number;
  totalAdjustCents: number;
  totalNetCents: number;
}

export interface DepartmentAuditReportResult {
  propertyName: string;
  startDate: string;
  endDate: string;
  departments: DepartmentAuditGroup[];
  grandTotalGrossCents: number;
  grandTotalVoidCents: number;
  grandTotalAdjustCents: number;
  grandTotalNetCents: number;
  totalEntries: number;
  truncated: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────

function daysBetween(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Main Query ──────────────────────────────────────────────────

export async function getDepartmentAuditReport(
  tenantId: string,
  propertyId: string,
  startDate: string,
  endDate: string,
  departmentFilter?: string,
): Promise<DepartmentAuditReportResult> {
  // Validate date format
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    throw new Error('Dates must be YYYY-MM-DD format');
  }
  // Validate date range
  if (endDate < startDate) {
    throw new Error('endDate must be >= startDate');
  }
  const rangeDays = daysBetween(startDate, endDate);
  if (rangeDays > MAX_DATE_RANGE_DAYS) {
    throw new Error(`Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days (requested ${rangeDays})`);
  }

  return withTenant(tenantId, async (tx) => {
    // Property name for report header
    const [prop] = await tx
      .select({ name: pmsProperties.name })
      .from(pmsProperties)
      .where(and(eq(pmsProperties.tenantId, tenantId), eq(pmsProperties.id, propertyId)));
    const propertyName = prop?.name ?? 'Unknown Property';

    // Build conditions (defense-in-depth: filter both sides of join by tenant)
    const conditions = [
      eq(pmsFolioEntries.tenantId, tenantId),
      eq(pmsFolios.tenantId, tenantId),
      eq(pmsFolios.propertyId, propertyId),
      gte(pmsFolioEntries.businessDate, startDate),
      lte(pmsFolioEntries.businessDate, endDate),
    ];

    if (departmentFilter) {
      conditions.push(eq(pmsFolioEntries.departmentCode, departmentFilter));
    }

    const rows = await tx
      .select({
        entryId: pmsFolioEntries.id,
        businessDate: pmsFolioEntries.businessDate,
        folioNumber: pmsFolios.folioNumber,
        roomNumber: pmsRooms.roomNumber,
        postedAt: pmsFolioEntries.postedAt,
        entryType: pmsFolioEntries.entryType,
        description: pmsFolioEntries.description,
        amountCents: pmsFolioEntries.amountCents,
        departmentCode: pmsFolioEntries.departmentCode,
        postedBy: pmsFolioEntries.postedBy,
        folioStatus: pmsFolios.status,
      })
      .from(pmsFolioEntries)
      .innerJoin(pmsFolios, eq(pmsFolioEntries.folioId, pmsFolios.id))
      .leftJoin(pmsReservations, eq(pmsFolios.reservationId, pmsReservations.id))
      .leftJoin(pmsRooms, eq(pmsReservations.roomId, pmsRooms.id))
      .where(and(...conditions))
      .orderBy(
        asc(sql`coalesce(${pmsFolioEntries.departmentCode}, ${pmsFolioEntries.entryType})`),
        asc(pmsFolioEntries.businessDate),
        asc(sql`${pmsFolios.folioNumber}`),
      )
      .limit(MAX_ROWS + 1); // fetch one extra to detect truncation

    const truncated = rows.length > MAX_ROWS;
    const capped = truncated ? rows.slice(0, MAX_ROWS) : rows;

    // Group by department code (or entryType fallback)
    const deptMap = new Map<string, DepartmentAuditEntry[]>();
    for (const r of capped) {
      const dept = r.departmentCode ?? r.entryType;
      const isVoid = r.entryType === 'VOID';
      const isAdjust = r.entryType === 'ADJUSTMENT';
      const gross = (!isVoid && !isAdjust) ? r.amountCents : 0;
      const voidAmt = isVoid ? Math.abs(r.amountCents) : 0;
      const adjustAmt = isAdjust ? r.amountCents : 0;

      const entry: DepartmentAuditEntry = {
        entryId: r.entryId,
        businessDate: r.businessDate,
        folioNumber: r.folioNumber,
        roomNumber: r.roomNumber ?? null,
        postedAt: r.postedAt.toISOString(),
        entryType: r.entryType,
        description: r.description,
        grossCents: gross,
        voidCents: voidAmt,
        adjustCents: adjustAmt,
        netCents: r.amountCents,
        ledger: r.folioStatus === 'OPEN' ? 'Guest' : 'Closed',
        postedBy: r.postedBy,
      };

      const list = deptMap.get(dept);
      if (list) {
        list.push(entry);
      } else {
        deptMap.set(dept, [entry]);
      }
    }

    // Build grouped result
    const departments: DepartmentAuditGroup[] = [];
    let grandTotalGross = 0;
    let grandTotalVoid = 0;
    let grandTotalAdjust = 0;
    let grandTotalNet = 0;

    for (const [departmentCode, entries] of deptMap) {
      const totalGrossCents = entries.reduce((s, e) => s + e.grossCents, 0);
      const totalVoidCents = entries.reduce((s, e) => s + e.voidCents, 0);
      const totalAdjustCents = entries.reduce((s, e) => s + e.adjustCents, 0);
      const totalNetCents = entries.reduce((s, e) => s + e.netCents, 0);

      departments.push({
        departmentCode,
        entryCount: entries.length,
        entries,
        totalGrossCents,
        totalVoidCents,
        totalAdjustCents,
        totalNetCents,
      });

      grandTotalGross += totalGrossCents;
      grandTotalVoid += totalVoidCents;
      grandTotalAdjust += totalAdjustCents;
      grandTotalNet += totalNetCents;
    }

    return {
      propertyName,
      startDate,
      endDate,
      departments,
      grandTotalGrossCents: grandTotalGross,
      grandTotalVoidCents: grandTotalVoid,
      grandTotalAdjustCents: grandTotalAdjust,
      grandTotalNetCents: grandTotalNet,
      totalEntries: capped.length,
      truncated,
    };
  });
}
