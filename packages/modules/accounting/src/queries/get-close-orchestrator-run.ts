import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { StepResult } from '../commands/run-close-orchestrator';

// ── Types ────────────────────────────────────────────────────────

export interface CloseOrchestratorRun {
  id: string;
  tenantId: string;
  businessDate: string;
  locationId: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'partial';
  totalSteps: number;
  completedSteps: number;
  skippedSteps: number;
  failedSteps: number;
  stepResults: StepResult[];
  startedAt: string | null;
  completedAt: string | null;
  triggeredBy: string;
  createdAt: string;
}

export interface CloseOrchestratorRunListItem {
  id: string;
  businessDate: string;
  locationId: string | null;
  status: string;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  triggeredBy: string;
  createdAt: string;
}

export interface ListCloseOrchestratorRunsResult {
  items: CloseOrchestratorRunListItem[];
  cursor: string | null;
  hasMore: boolean;
}

interface ListFilters {
  tenantId: string;
  locationId?: string;
  businessDateFrom?: string;
  businessDateTo?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

// ── Helpers ──────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): CloseOrchestratorRun {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    businessDate: String(row.business_date),
    locationId: row.location_id ? String(row.location_id) : null,
    status: String(row.status) as CloseOrchestratorRun['status'],
    totalSteps: Number(row.total_steps),
    completedSteps: Number(row.completed_steps),
    skippedSteps: Number(row.skipped_steps),
    failedSteps: Number(row.failed_steps),
    stepResults: (row.step_results ?? []) as StepResult[],
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    triggeredBy: String(row.triggered_by),
    createdAt: String(row.created_at),
  };
}

function mapListItem(row: Record<string, unknown>): CloseOrchestratorRunListItem {
  return {
    id: String(row.id),
    businessDate: String(row.business_date),
    locationId: row.location_id ? String(row.location_id) : null,
    status: String(row.status),
    totalSteps: Number(row.total_steps),
    completedSteps: Number(row.completed_steps),
    failedSteps: Number(row.failed_steps),
    triggeredBy: String(row.triggered_by),
    createdAt: String(row.created_at),
  };
}

// ── Queries ──────────────────────────────────────────────────────

/**
 * Get a single orchestrator run with full step details.
 */
export async function getCloseOrchestratorRun(
  tenantId: string,
  runId: string,
): Promise<CloseOrchestratorRun | null> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT * FROM erp_close_orchestrator_runs
      WHERE id = ${runId}
        AND tenant_id = ${tenantId}
      LIMIT 1
    `);
    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    return arr.length > 0 ? mapRow(arr[0]!) : null;
  });
}

/**
 * List orchestrator runs with cursor pagination and optional filters.
 */
export async function listCloseOrchestratorRuns(
  input: ListFilters,
): Promise<ListCloseOrchestratorRunsResult> {
  const limit = input.limit ?? 25;

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`tenant_id = ${input.tenantId}`,
    ];

    if (input.locationId) {
      conditions.push(sql`location_id = ${input.locationId}`);
    }
    if (input.businessDateFrom) {
      conditions.push(sql`business_date >= ${input.businessDateFrom}::date`);
    }
    if (input.businessDateTo) {
      conditions.push(sql`business_date <= ${input.businessDateTo}::date`);
    }
    if (input.status) {
      conditions.push(sql`status = ${input.status}`);
    }
    if (input.cursor) {
      conditions.push(sql`id < ${input.cursor}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT id, business_date, location_id, status, total_steps,
             completed_steps, failed_steps, triggered_by, created_at
      FROM erp_close_orchestrator_runs
      WHERE ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit + 1}
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = arr.length > limit;
    const items = hasMore ? arr.slice(0, limit) : arr;

    return {
      items: items.map(mapListItem),
      cursor: hasMore ? String(items[items.length - 1]!.id) : null,
      hasMore,
    };
  });
}

/**
 * Get the most recent orchestrator run for display on the dashboard.
 */
export async function getLastCloseRun(
  tenantId: string,
  locationId?: string,
): Promise<CloseOrchestratorRun | null> {
  return withTenant(tenantId, async (tx) => {
    const locationFilter = locationId
      ? sql`AND location_id = ${locationId}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT * FROM erp_close_orchestrator_runs
      WHERE tenant_id = ${tenantId}
        ${locationFilter}
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    return arr.length > 0 ? mapRow(arr[0]!) : null;
  });
}
