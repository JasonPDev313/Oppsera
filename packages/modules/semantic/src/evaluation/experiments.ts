import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { NotFoundError, AppError } from '@oppsera/shared';

// ── Types ────────────────────────────────────────────────────────

export type ExperimentStatus = 'draft' | 'running' | 'completed' | 'canceled';
export type ExperimentWinner = 'control' | 'treatment' | 'inconclusive' | null;
export type ExperimentVariant = 'control' | 'treatment';

export interface ExperimentInput {
  name: string;
  description?: string;
  hypothesis?: string;
  controlName: string;
  controlSystemPrompt?: string;
  controlModel?: string;
  controlTemperature?: number;
  treatmentName: string;
  treatmentSystemPrompt?: string;
  treatmentModel?: string;
  treatmentTemperature?: number;
  trafficSplitPct: number; // 0–100, percentage sent to treatment
  targetSampleSize?: number;
  tenantId?: string; // null = global experiment
}

export interface ExperimentStats {
  controlTurns: number;
  treatmentTurns: number;
  controlAvgRating: number | null;
  treatmentAvgRating: number | null;
  controlAvgLatencyMs: number | null;
  treatmentAvgLatencyMs: number | null;
  controlAvgConfidence: number | null;
  treatmentAvgConfidence: number | null;
  controlErrorRate: number | null;
  treatmentErrorRate: number | null;
}

export interface Experiment {
  id: string;
  name: string;
  description: string | null;
  hypothesis: string | null;
  status: ExperimentStatus;
  controlName: string;
  controlSystemPrompt: string | null;
  controlModel: string | null;
  controlTemperature: number | null;
  treatmentName: string;
  treatmentSystemPrompt: string | null;
  treatmentModel: string | null;
  treatmentTemperature: number | null;
  trafficSplitPct: number;
  targetSampleSize: number | null;
  tenantId: string | null;
  winner: ExperimentWinner;
  conclusionNotes: string | null;
  stats: ExperimentStats | null;
  createdBy: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListExperimentsFilters {
  status?: ExperimentStatus;
  tenantId?: string;
  cursor?: string;
  limit?: number;
}

export interface ListExperimentsResult {
  experiments: Experiment[];
  cursor: string | null;
  hasMore: boolean;
}

// ── Table name constant ──────────────────────────────────────────
// The experiments table is created by a migration but does not have
// a Drizzle schema definition yet. We use raw SQL via db.execute().

const TABLE = 'semantic_eval_experiments';

// ── createExperiment ─────────────────────────────────────────────

export async function createExperiment(
  adminId: string,
  input: ExperimentInput,
): Promise<string> {
  const id = generateUlid();

  await db.execute(
    sql`INSERT INTO ${sql.raw(TABLE)} (
      id, name, description, hypothesis, status,
      control_name, control_system_prompt, control_model, control_temperature,
      treatment_name, treatment_system_prompt, treatment_model, treatment_temperature,
      traffic_split_pct, target_sample_size, tenant_id,
      winner, conclusion_notes, stats,
      created_by, started_at, completed_at, created_at, updated_at
    ) VALUES (
      ${id}, ${input.name}, ${input.description ?? null}, ${input.hypothesis ?? null}, 'draft',
      ${input.controlName}, ${input.controlSystemPrompt ?? null}, ${input.controlModel ?? null}, ${input.controlTemperature ?? null},
      ${input.treatmentName}, ${input.treatmentSystemPrompt ?? null}, ${input.treatmentModel ?? null}, ${input.treatmentTemperature ?? null},
      ${input.trafficSplitPct}, ${input.targetSampleSize ?? null}, ${input.tenantId ?? null},
      NULL, NULL, NULL,
      ${adminId}, NULL, NULL, NOW(), NOW()
    )`,
  );

  return id;
}

// ── startExperiment ──────────────────────────────────────────────

export async function startExperiment(experimentId: string): Promise<void> {
  const experiment = await getExperimentRow(experimentId);
  if (!experiment) {
    throw new NotFoundError('Experiment', experimentId);
  }
  if (experiment.status !== 'draft') {
    throw new AppError(
      'INVALID_STATUS',
      `Cannot start experiment in status '${experiment.status}'. Expected 'draft'.`,
      409,
    );
  }

  await db.execute(
    sql`UPDATE ${sql.raw(TABLE)}
        SET status = 'running', started_at = NOW(), updated_at = NOW()
        WHERE id = ${experimentId}`,
  );
}

// ── stopExperiment ───────────────────────────────────────────────

export async function stopExperiment(
  experimentId: string,
  winner?: ExperimentWinner,
  conclusionNotes?: string,
): Promise<void> {
  const experiment = await getExperimentRow(experimentId);
  if (!experiment) {
    throw new NotFoundError('Experiment', experimentId);
  }
  if (experiment.status !== 'running') {
    throw new AppError(
      'INVALID_STATUS',
      `Cannot stop experiment in status '${experiment.status}'. Expected 'running'.`,
      409,
    );
  }

  // Compute final stats from eval turns tagged with this experiment
  const stats = await computeExperimentStats(experimentId);

  await db.execute(
    sql`UPDATE ${sql.raw(TABLE)}
        SET status = 'completed',
            winner = ${winner ?? 'inconclusive'},
            conclusion_notes = ${conclusionNotes ?? null},
            stats = ${JSON.stringify(stats)}::JSONB,
            completed_at = NOW(),
            updated_at = NOW()
        WHERE id = ${experimentId}`,
  );
}

// ── cancelExperiment ─────────────────────────────────────────────

export async function cancelExperiment(experimentId: string): Promise<void> {
  const experiment = await getExperimentRow(experimentId);
  if (!experiment) {
    throw new NotFoundError('Experiment', experimentId);
  }
  if (experiment.status === 'completed' || experiment.status === 'canceled') {
    throw new AppError(
      'INVALID_STATUS',
      `Cannot cancel experiment in status '${experiment.status}'.`,
      409,
    );
  }

  await db.execute(
    sql`UPDATE ${sql.raw(TABLE)}
        SET status = 'canceled', completed_at = NOW(), updated_at = NOW()
        WHERE id = ${experimentId}`,
  );
}

// ── getExperiment ────────────────────────────────────────────────

export async function getExperiment(experimentId: string): Promise<Experiment | null> {
  const row = await getExperimentRow(experimentId);
  if (!row) return null;

  // Compute live stats if experiment is running
  let stats = row.stats as ExperimentStats | null;
  if (row.status === 'running') {
    stats = await computeExperimentStats(experimentId);
  }

  return mapExperiment(row, stats);
}

// ── listExperiments ──────────────────────────────────────────────

export async function listExperiments(
  filters: ListExperimentsFilters = {},
): Promise<ListExperimentsResult> {
  const { status, tenantId, cursor, limit = 20 } = filters;
  const pageSize = Math.min(limit, 100);

  const conditions: ReturnType<typeof sql>[] = [sql`1=1`];

  if (status) {
    conditions.push(sql`status = ${status}`);
  }
  if (tenantId) {
    conditions.push(sql`(tenant_id = ${tenantId} OR tenant_id IS NULL)`);
  }
  if (cursor) {
    conditions.push(sql`id < ${cursor}`);
  }

  const whereClause = sql.join(conditions, sql` AND `);

  const rows = await db.execute<ExperimentRow>(
    sql`SELECT * FROM ${sql.raw(TABLE)}
        WHERE ${whereClause}
        ORDER BY created_at DESC, id DESC
        LIMIT ${pageSize + 1}`,
  );

  const items = Array.from(rows as Iterable<ExperimentRow>);
  const hasMore = items.length > pageSize;
  const page = hasMore ? items.slice(0, pageSize) : items;

  return {
    experiments: page.map((r) => mapExperiment(r, r.stats as ExperimentStats | null)),
    cursor: hasMore ? page[page.length - 1]!.id : null,
    hasMore,
  };
}

// ── routeToVariant ───────────────────────────────────────────────
// Determines which variant a new query should use based on traffic split.
// Uses random selection weighted by trafficSplitPct.

export function routeToVariant(trafficSplitPct: number): ExperimentVariant {
  const roll = Math.random() * 100;
  return roll < trafficSplitPct ? 'treatment' : 'control';
}

// ── getActiveExperiment ──────────────────────────────────────────

export async function getActiveExperiment(
  tenantId?: string,
): Promise<Experiment | null> {
  const tenantFilter = tenantId
    ? sql`AND (tenant_id = ${tenantId} OR tenant_id IS NULL)`
    : sql`AND tenant_id IS NULL`;

  const rows = await db.execute<ExperimentRow>(
    sql`SELECT * FROM ${sql.raw(TABLE)}
        WHERE status = 'running' ${tenantFilter}
        ORDER BY started_at DESC
        LIMIT 1`,
  );

  const items = Array.from(rows as Iterable<ExperimentRow>);
  if (items.length === 0) return null;

  const row = items[0]!;
  const stats = await computeExperimentStats(row.id);
  return mapExperiment(row, stats);
}

// ── updateExperimentStats ────────────────────────────────────────

export async function updateExperimentStats(experimentId: string): Promise<ExperimentStats> {
  const experiment = await getExperimentRow(experimentId);
  if (!experiment) {
    throw new NotFoundError('Experiment', experimentId);
  }

  const stats = await computeExperimentStats(experimentId);

  await db.execute(
    sql`UPDATE ${sql.raw(TABLE)}
        SET stats = ${JSON.stringify(stats)}::JSONB, updated_at = NOW()
        WHERE id = ${experimentId}`,
  );

  return stats;
}

// ── Internal helpers ─────────────────────────────────────────────

type ExperimentRow = {
  id: string;
  name: string;
  description: string | null;
  hypothesis: string | null;
  status: string;
  control_name: string;
  control_system_prompt: string | null;
  control_model: string | null;
  control_temperature: string | null;
  treatment_name: string;
  treatment_system_prompt: string | null;
  treatment_model: string | null;
  treatment_temperature: string | null;
  traffic_split_pct: string;
  target_sample_size: string | null;
  tenant_id: string | null;
  winner: string | null;
  conclusion_notes: string | null;
  stats: unknown;
  created_by: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
};

async function getExperimentRow(experimentId: string): Promise<ExperimentRow | null> {
  const rows = await db.execute<ExperimentRow>(
    sql`SELECT * FROM ${sql.raw(TABLE)} WHERE id = ${experimentId} LIMIT 1`,
  );

  const items = Array.from(rows as Iterable<ExperimentRow>);
  return items[0] ?? null;
}

async function computeExperimentStats(experimentId: string): Promise<ExperimentStats> {
  // Query eval turns that have experiment metadata matching this experiment.
  // Turns are tagged with experiment_id and variant in their context_snapshot JSONB.
  const rows = await db.execute<{
    variant: string;
    turn_count: string;
    avg_rating: string | null;
    avg_latency_ms: string | null;
    avg_confidence: string | null;
    error_rate: string | null;
  }>(
    sql`SELECT
      context_snapshot->>'experimentVariant' AS variant,
      COUNT(*) AS turn_count,
      AVG(user_rating)::NUMERIC(3,2) AS avg_rating,
      AVG(llm_latency_ms)::INTEGER AS avg_latency_ms,
      AVG(llm_confidence)::NUMERIC(3,2) AS avg_confidence,
      (COUNT(*) FILTER (WHERE execution_error IS NOT NULL)::NUMERIC
        / NULLIF(COUNT(*), 0) * 100)::NUMERIC(5,2) AS error_rate
    FROM semantic_eval_turns
    WHERE context_snapshot->>'experimentId' = ${experimentId}
      AND context_snapshot->>'experimentVariant' IS NOT NULL
    GROUP BY context_snapshot->>'experimentVariant'`,
  );

  const items = Array.from(rows as Iterable<{
    variant: string;
    turn_count: string;
    avg_rating: string | null;
    avg_latency_ms: string | null;
    avg_confidence: string | null;
    error_rate: string | null;
  }>);

  const control = items.find((r) => r.variant === 'control');
  const treatment = items.find((r) => r.variant === 'treatment');

  return {
    controlTurns: control ? parseInt(control.turn_count, 10) : 0,
    treatmentTurns: treatment ? parseInt(treatment.turn_count, 10) : 0,
    controlAvgRating: control?.avg_rating ? Number(control.avg_rating) : null,
    treatmentAvgRating: treatment?.avg_rating ? Number(treatment.avg_rating) : null,
    controlAvgLatencyMs: control?.avg_latency_ms ? Number(control.avg_latency_ms) : null,
    treatmentAvgLatencyMs: treatment?.avg_latency_ms ? Number(treatment.avg_latency_ms) : null,
    controlAvgConfidence: control?.avg_confidence ? Number(control.avg_confidence) : null,
    treatmentAvgConfidence: treatment?.avg_confidence ? Number(treatment.avg_confidence) : null,
    controlErrorRate: control?.error_rate ? Number(control.error_rate) : null,
    treatmentErrorRate: treatment?.error_rate ? Number(treatment.error_rate) : null,
  };
}

function mapExperiment(row: ExperimentRow, stats: ExperimentStats | null): Experiment {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    hypothesis: row.hypothesis,
    status: row.status as ExperimentStatus,
    controlName: row.control_name,
    controlSystemPrompt: row.control_system_prompt,
    controlModel: row.control_model,
    controlTemperature: row.control_temperature ? Number(row.control_temperature) : null,
    treatmentName: row.treatment_name,
    treatmentSystemPrompt: row.treatment_system_prompt,
    treatmentModel: row.treatment_model,
    treatmentTemperature: row.treatment_temperature ? Number(row.treatment_temperature) : null,
    trafficSplitPct: Number(row.traffic_split_pct),
    targetSampleSize: row.target_sample_size ? parseInt(row.target_sample_size, 10) : null,
    tenantId: row.tenant_id,
    winner: (row.winner as ExperimentWinner) ?? null,
    conclusionNotes: row.conclusion_notes,
    stats,
    createdBy: row.created_by,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
