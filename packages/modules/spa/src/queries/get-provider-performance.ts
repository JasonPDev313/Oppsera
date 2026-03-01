import { eq, and, gte, lte, sql } from 'drizzle-orm';
import {
  withTenant,
  spaProviders,
  spaAppointments,
  spaCommissionLedger,
} from '@oppsera/db';

// ── Types ────────────────────────────────────────────────────────

export interface GetProviderPerformanceInput {
  tenantId: string;
  providerId?: string;    // specific provider, or all if omitted
  startDate?: string;     // YYYY-MM-DD — filter appointments by startAt
  endDate?: string;       // YYYY-MM-DD — filter appointments by startAt
}

export interface ProviderPerformanceRow {
  providerId: string;
  providerName: string;
  totalAppointments: number;
  completedAppointments: number;
  canceledAppointments: number;
  noShowAppointments: number;
  completionRate: number;                     // completed / total * 100
  totalRevenueCents: number;                  // sum of finalPriceCents from completed appointment items
  avgRevenueCentsPerAppointment: number;      // totalRevenue / completedAppointments
  totalCommissionCents: number;               // sum of commissionAmountCents (all statuses except voided)
  avgServiceDurationMinutes: number | null;   // avg duration of completed appointments
}

export interface GetProviderPerformanceResult {
  items: ProviderPerformanceRow[];
}

// ── Query ────────────────────────────────────────────────────────

/**
 * Aggregate provider performance metrics from appointments and commissions.
 *
 * Runs 3 parallel queries inside `withTenant` and merges results:
 * 1. Active providers (id, displayName)
 * 2. Appointment stats grouped by providerId (counts by status, avg duration)
 * 3. Revenue from completed appointment items grouped by providerId
 * 4. Commission totals grouped by providerId (excludes voided)
 *
 * Derived fields (completionRate, avgRevenueCentsPerAppointment) are computed
 * in the mapping layer after merge.
 */
export async function getProviderPerformance(
  input: GetProviderPerformanceInput,
): Promise<GetProviderPerformanceResult> {
  return withTenant(input.tenantId, async (tx) => {
    // ── Build date boundaries for appointment filtering ──────────
    const dateConditions: ReturnType<typeof eq>[] = [];
    if (input.startDate) {
      dateConditions.push(gte(spaAppointments.startAt, new Date(`${input.startDate}T00:00:00.000Z`)));
    }
    if (input.endDate) {
      dateConditions.push(lte(spaAppointments.startAt, new Date(`${input.endDate}T23:59:59.999Z`)));
    }

    // ── Provider filter condition (reusable across queries) ──────
    const providerFilterSql = input.providerId
      ? sql`AND provider_id = ${input.providerId}`
      : sql``;

    // ── 1. Providers lookup ──────────────────────────────────────
    const providerConditions: ReturnType<typeof eq>[] = [
      eq(spaProviders.tenantId, input.tenantId),
      eq(spaProviders.isActive, true),
    ];
    if (input.providerId) {
      providerConditions.push(eq(spaProviders.id, input.providerId));
    }

    const providersPromise = tx
      .select({
        id: spaProviders.id,
        displayName: spaProviders.displayName,
      })
      .from(spaProviders)
      .where(and(...providerConditions));

    // ── 2. Appointment stats (counts by status + avg duration) ───
    // Uses CASE WHEN for conditional counting in a single pass.
    const apptConditions: ReturnType<typeof eq>[] = [
      eq(spaAppointments.tenantId, input.tenantId),
      ...dateConditions,
    ];
    if (input.providerId) {
      apptConditions.push(eq(spaAppointments.providerId, input.providerId));
    }

    const apptStatsPromise = tx
      .select({
        providerId: spaAppointments.providerId,
        totalAppointments: sql<number>`count(*)::int`,
        completedAppointments: sql<number>`count(*) FILTER (WHERE ${spaAppointments.status} IN ('completed', 'checked_out'))::int`,
        canceledAppointments: sql<number>`count(*) FILTER (WHERE ${spaAppointments.status} = 'canceled')::int`,
        noShowAppointments: sql<number>`count(*) FILTER (WHERE ${spaAppointments.status} = 'no_show')::int`,
        avgServiceDurationMinutes: sql<number | null>`
          CASE
            WHEN count(*) FILTER (WHERE ${spaAppointments.status} IN ('completed', 'checked_out') AND ${spaAppointments.endAt} IS NOT NULL) > 0
            THEN round(avg(EXTRACT(EPOCH FROM (${spaAppointments.endAt} - ${spaAppointments.startAt})) / 60) FILTER (WHERE ${spaAppointments.status} IN ('completed', 'checked_out') AND ${spaAppointments.endAt} IS NOT NULL))::int
            ELSE NULL
          END
        `,
      })
      .from(spaAppointments)
      .where(and(...apptConditions))
      .groupBy(spaAppointments.providerId);

    // ── 3. Revenue from completed appointment items ──────────────
    // Only count items whose parent appointment is completed or checked_out.
    const revenuePromise = tx.execute<{
      provider_id: string;
      total_revenue_cents: string;
    }>(sql`
      SELECT
        a.provider_id,
        COALESCE(SUM(ai.final_price_cents), 0)::bigint AS total_revenue_cents
      FROM spa_appointment_items ai
      INNER JOIN spa_appointments a ON a.id = ai.appointment_id AND a.tenant_id = ai.tenant_id
      WHERE ai.tenant_id = ${input.tenantId}
        AND a.status IN ('completed', 'checked_out')
        ${providerFilterSql}
        ${input.startDate ? sql`AND a.start_at >= ${new Date(`${input.startDate}T00:00:00.000Z`)}` : sql``}
        ${input.endDate ? sql`AND a.start_at <= ${new Date(`${input.endDate}T23:59:59.999Z`)}` : sql``}
      GROUP BY a.provider_id
    `);

    // ── 4. Commission totals (exclude voided) ────────────────────
    const commissionConditions: ReturnType<typeof eq>[] = [
      eq(spaCommissionLedger.tenantId, input.tenantId),
    ];
    if (input.providerId) {
      commissionConditions.push(eq(spaCommissionLedger.providerId, input.providerId));
    }

    const commissionPromise = tx
      .select({
        providerId: spaCommissionLedger.providerId,
        totalCommissionCents: sql<number>`COALESCE(SUM(${spaCommissionLedger.commissionAmountCents}), 0)::bigint`,
      })
      .from(spaCommissionLedger)
      .where(
        and(
          ...commissionConditions,
          sql`${spaCommissionLedger.status} != 'voided'`,
        ),
      )
      .groupBy(spaCommissionLedger.providerId);

    // ── Execute all queries in parallel ──────────────────────────
    const [providers, apptStats, revenueResult, commissions] = await Promise.all([
      providersPromise,
      apptStatsPromise,
      revenuePromise,
      commissionPromise,
    ]);

    // ── Build lookup maps ────────────────────────────────────────
    const apptMap = new Map(
      apptStats
        .filter((r) => r.providerId != null)
        .map((r) => [r.providerId!, r]),
    );

    const revenueRows = Array.from(revenueResult as Iterable<{ provider_id: string; total_revenue_cents: string }>);
    const revenueMap = new Map(
      revenueRows.map((r) => [r.provider_id, Number(r.total_revenue_cents)]),
    );

    const commissionMap = new Map(
      commissions.map((r) => [r.providerId, Number(r.totalCommissionCents)]),
    );

    // ── Merge and compute derived fields ─────────────────────────
    const items: ProviderPerformanceRow[] = providers.map((provider) => {
      const appt = apptMap.get(provider.id);
      const totalAppointments = appt?.totalAppointments ?? 0;
      const completedAppointments = appt?.completedAppointments ?? 0;
      const canceledAppointments = appt?.canceledAppointments ?? 0;
      const noShowAppointments = appt?.noShowAppointments ?? 0;
      const avgServiceDurationMinutes = appt?.avgServiceDurationMinutes ?? null;

      const totalRevenueCents = revenueMap.get(provider.id) ?? 0;
      const totalCommissionCents = commissionMap.get(provider.id) ?? 0;

      const completionRate =
        totalAppointments > 0
          ? Math.round((completedAppointments / totalAppointments) * 10000) / 100
          : 0;

      const avgRevenueCentsPerAppointment =
        completedAppointments > 0
          ? Math.round(totalRevenueCents / completedAppointments)
          : 0;

      return {
        providerId: provider.id,
        providerName: provider.displayName,
        totalAppointments,
        completedAppointments,
        canceledAppointments,
        noShowAppointments,
        completionRate,
        totalRevenueCents,
        avgRevenueCentsPerAppointment,
        totalCommissionCents,
        avgServiceDurationMinutes,
      };
    });

    // Sort by total revenue descending for a useful default order
    items.sort((a, b) => b.totalRevenueCents - a.totalRevenueCents);

    return { items };
  });
}
