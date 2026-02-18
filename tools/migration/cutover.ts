/**
 * Per-Tenant Gradual Cutover Strategy
 *
 * Workflow per tenant:
 * 1. Pre-cutover: Migrate historical data in background (no downtime)
 * 2. Freeze: Put tenant in read-only mode in legacy system
 * 3. Delta sync: Migrate any rows created since initial migration
 * 4. Validate: Run full validation suite
 * 5. Switch: Update tenant's connection to new system
 * 6. Monitor: Watch for 48 hours
 * 7. Complete: Archive legacy data
 *
 * Rollback is available at any point before step 7.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import fs from 'fs';
import path from 'path';
import { MigrationValidator } from './validate';

export type CutoverPhase =
  | 'not_started'
  | 'historical_migrated'
  | 'frozen'
  | 'delta_synced'
  | 'validated'
  | 'switched'
  | 'monitoring'
  | 'completed'
  | 'rolled_back';

export interface CutoverState {
  tenantId: string;
  phase: CutoverPhase;
  historicalMigratedAt?: string;
  frozenAt?: string;
  deltaSyncedAt?: string;
  validatedAt?: string;
  switchedAt?: string;
  monitoringStartedAt?: string;
  completedAt?: string;
  rolledBackAt?: string;
  notes: string[];
}

export class TenantCutover {
  private db: ReturnType<typeof drizzle>;
  private adminUrl: string;

  constructor(adminUrl: string) {
    this.adminUrl = adminUrl;
    const client = postgres(adminUrl, { max: 3 });
    this.db = drizzle(client);
  }

  /** Initialize cutover tracking table */
  async init(): Promise<void> {
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS migration_cutover_state (
        tenant_id    TEXT PRIMARY KEY,
        phase        TEXT NOT NULL DEFAULT 'not_started',
        state_json   JSONB NOT NULL DEFAULT '{}',
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  /** Get current cutover state for a tenant */
  async getState(tenantId: string): Promise<CutoverState> {
    const rows = await this.db.execute(sql`
      SELECT state_json FROM migration_cutover_state
      WHERE tenant_id = ${tenantId}
    `);
    const existing = Array.from(rows as Iterable<{ state_json: CutoverState }>);
    if (existing.length > 0) return existing[0]!.state_json;

    return {
      tenantId,
      phase: 'not_started',
      notes: [],
    };
  }

  /** Update cutover state */
  private async setState(state: CutoverState): Promise<void> {
    await this.db.execute(sql`
      INSERT INTO migration_cutover_state (tenant_id, phase, state_json, updated_at)
      VALUES (${state.tenantId}, ${state.phase}, ${JSON.stringify(state)}::jsonb, NOW())
      ON CONFLICT (tenant_id)
      DO UPDATE SET phase = ${state.phase}, state_json = ${JSON.stringify(state)}::jsonb, updated_at = NOW()
    `);
  }

  /** Phase 1: Mark historical migration as complete */
  async markHistoricalComplete(tenantId: string): Promise<void> {
    const state = await this.getState(tenantId);
    state.phase = 'historical_migrated';
    state.historicalMigratedAt = new Date().toISOString();
    state.notes.push(`Historical data migrated at ${state.historicalMigratedAt}`);
    await this.setState(state);
    console.log(`[cutover] ${tenantId}: Historical migration complete`);
  }

  /** Phase 2: Freeze legacy tenant (set read-only flag) */
  async freezeTenant(tenantId: string): Promise<void> {
    const state = await this.getState(tenantId);
    if (state.phase !== 'historical_migrated') {
      throw new Error(`Cannot freeze tenant in phase: ${state.phase}. Must be 'historical_migrated'.`);
    }

    // Set a migration flag on the tenant
    await this.db.execute(sql`
      UPDATE tenants SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"migration_status": "frozen"}'::jsonb
      WHERE id = ${tenantId}
    `);

    state.phase = 'frozen';
    state.frozenAt = new Date().toISOString();
    state.notes.push(`Tenant frozen at ${state.frozenAt}. Legacy system should be read-only.`);
    await this.setState(state);
    console.log(`[cutover] ${tenantId}: Tenant frozen — legacy system is read-only`);
  }

  /** Phase 3: Delta sync (migrate rows created since initial migration) */
  async markDeltaSynced(tenantId: string, deltaRowCount: number): Promise<void> {
    const state = await this.getState(tenantId);
    if (state.phase !== 'frozen') {
      throw new Error(`Cannot delta sync in phase: ${state.phase}. Must be 'frozen'.`);
    }

    state.phase = 'delta_synced';
    state.deltaSyncedAt = new Date().toISOString();
    state.notes.push(`Delta sync complete: ${deltaRowCount} rows at ${state.deltaSyncedAt}`);
    await this.setState(state);
    console.log(`[cutover] ${tenantId}: Delta sync complete (${deltaRowCount} rows)`);
  }

  /** Phase 4: Run validation and mark validated */
  async validateAndMark(tenantId: string, exportDir: string): Promise<boolean> {
    const state = await this.getState(tenantId);
    if (state.phase !== 'delta_synced') {
      throw new Error(`Cannot validate in phase: ${state.phase}. Must be 'delta_synced'.`);
    }

    const validator = new MigrationValidator(this.adminUrl);
    const results = await validator.runAll(exportDir, tenantId);
    const failures = results.filter(r => !r.passed);

    if (failures.length === 0) {
      state.phase = 'validated';
      state.validatedAt = new Date().toISOString();
      state.notes.push(`Validation passed at ${state.validatedAt}: ${results.length} checks`);
      await this.setState(state);
      console.log(`[cutover] ${tenantId}: Validation passed`);
      return true;
    } else {
      state.notes.push(`Validation FAILED at ${new Date().toISOString()}: ${failures.length} failures`);
      for (const f of failures) {
        state.notes.push(`  FAIL: ${f.check} (${f.table}) expected ${f.expected}, got ${f.actual}`);
      }
      await this.setState(state);
      console.log(`[cutover] ${tenantId}: Validation FAILED — ${failures.length} checks failed`);
      return false;
    }
  }

  /** Phase 5: Switch tenant to new system */
  async switchToNew(tenantId: string): Promise<void> {
    const state = await this.getState(tenantId);
    if (state.phase !== 'validated') {
      throw new Error(`Cannot switch in phase: ${state.phase}. Must be 'validated'.`);
    }

    // Update tenant metadata
    await this.db.execute(sql`
      UPDATE tenants SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"migration_status": "live", "migrated_at": "${sql.raw(new Date().toISOString())}"}'::jsonb
      WHERE id = ${tenantId}
    `);

    state.phase = 'switched';
    state.switchedAt = new Date().toISOString();
    state.notes.push(`Switched to new system at ${state.switchedAt}`);
    await this.setState(state);
    console.log(`[cutover] ${tenantId}: LIVE on new system`);
  }

  /** Phase 6: Start monitoring period */
  async startMonitoring(tenantId: string): Promise<void> {
    const state = await this.getState(tenantId);
    state.phase = 'monitoring';
    state.monitoringStartedAt = new Date().toISOString();
    state.notes.push(`Monitoring started at ${state.monitoringStartedAt} (48 hours)`);
    await this.setState(state);
  }

  /** Phase 7: Complete the migration */
  async complete(tenantId: string): Promise<void> {
    const state = await this.getState(tenantId);
    state.phase = 'completed';
    state.completedAt = new Date().toISOString();
    state.notes.push(`Migration completed at ${state.completedAt}`);
    await this.setState(state);
    console.log(`[cutover] ${tenantId}: Migration COMPLETE`);
  }

  /** List all tenants and their cutover status */
  async listAll(): Promise<CutoverState[]> {
    const rows = await this.db.execute(sql`
      SELECT state_json FROM migration_cutover_state ORDER BY updated_at DESC
    `);
    return Array.from(rows as Iterable<{ state_json: CutoverState }>).map(r => r.state_json);
  }
}
