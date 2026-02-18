/**
 * Migration Pipeline Orchestrator
 *
 * Processes legacy data exports through the ETL pipeline:
 * 1. Load CSV/JSON -> 2. Clean -> 3. Transform -> 4. Insert -> 5. Validate
 *
 * Features:
 * - Per-tenant gradual migration
 * - Resumable (checkpoints after each domain)
 * - Batch inserts for performance
 * - Quarantine for bad rows
 * - Dry-run mode
 * - Progress logging
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import fs from 'fs';
import path from 'path';
import { loadConfig, DOMAIN_ORDER, SKIP_TABLES, type MigrationConfig } from './config';
import { loadTable, discoverExportFiles, countRows } from './loader';
import { cleanBatch, moneyToCents, bitToBool, datetimeToTimestamptz } from './cleaner';
import { IdMap } from './id-map';
import { TRANSFORMER_REGISTRY } from './transformers';
import type { BatchResult, MigrationProgress, MigrationSummary, MigrationError, QuarantineRecord } from './types';
import { ulid } from 'ulid';

export class MigrationPipeline {
  private config: MigrationConfig;
  private db: ReturnType<typeof drizzle>;
  private rawDb: ReturnType<typeof postgres>;
  private idMap: IdMap;
  private summary: MigrationSummary;
  private quarantineFile: fs.WriteStream | null = null;
  private errorLog: fs.WriteStream | null = null;

  constructor(config?: Partial<MigrationConfig>) {
    this.config = loadConfig(config);

    if (!this.config.adminDbUrl) {
      throw new Error('Database connection URL required (DATABASE_URL_ADMIN or DATABASE_URL)');
    }

    this.rawDb = postgres(this.config.adminDbUrl, { max: 10 });
    this.db = drizzle(this.rawDb);
    this.idMap = new IdMap(this.config.adminDbUrl);

    this.summary = {
      runId: ulid(),
      startedAt: new Date(),
      status: 'running',
      config: {
        dryRun: this.config.dryRun,
        tenantFilter: this.config.tenantFilter,
        batchSize: this.config.batchSize,
      },
      tenants: [],
      totals: { totalRows: 0, insertedRows: 0, skippedRows: 0, quarantinedRows: 0, errorCount: 0 },
      validationResults: [],
    };
  }

  /** Run the full migration pipeline */
  async run(): Promise<MigrationSummary> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Migration Pipeline -- Run ${this.summary.runId}`);
    console.log(`  Mode: ${this.config.dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`  Batch size: ${this.config.batchSize}`);
    console.log(`${'='.repeat(60)}\n`);

    // Setup output directory
    fs.mkdirSync(this.config.outputDir, { recursive: true });
    this.quarantineFile = fs.createWriteStream(
      path.join(this.config.outputDir, `quarantine-${this.summary.runId}.jsonl`),
    );
    this.errorLog = fs.createWriteStream(
      path.join(this.config.outputDir, `errors-${this.summary.runId}.jsonl`),
    );

    try {
      // Ensure ID mapping table exists
      await this.ensureIdMapTable();

      // Discover export files
      const exportFiles = discoverExportFiles(this.config.exportDir);
      console.log(`Found ${exportFiles.length} export files\n`);

      // Resolve tenant mappings
      const tenantMappings = await this.resolveTenantMappings();

      if (this.config.tenantFilter.length > 0) {
        console.log(`Filtering to tenants: ${this.config.tenantFilter.join(', ')}\n`);
      }

      // Process each tenant
      for (const tenant of tenantMappings) {
        if (this.config.tenantFilter.length > 0 &&
            !this.config.tenantFilter.includes(tenant.newTenantId)) {
          continue;
        }

        await this.migrateTenant(tenant.newTenantId, tenant.legacyClubId);
      }

      this.summary.status = 'completed';
    } catch (error) {
      this.summary.status = 'failed';
      this.logError({
        domain: 'pipeline',
        sourceTable: '',
        targetTable: '',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date(),
      });
      throw error;
    } finally {
      this.summary.completedAt = new Date();
      await this.idMap.flush();
      this.quarantineFile?.end();
      this.errorLog?.end();

      // Write summary
      fs.writeFileSync(
        path.join(this.config.outputDir, `summary-${this.summary.runId}.json`),
        JSON.stringify(this.summary, null, 2),
      );

      console.log(`\n${'='.repeat(60)}`);
      console.log(`  Migration ${this.summary.status.toUpperCase()}`);
      console.log(`  Total rows: ${this.summary.totals.totalRows}`);
      console.log(`  Inserted: ${this.summary.totals.insertedRows}`);
      console.log(`  Skipped: ${this.summary.totals.skippedRows}`);
      console.log(`  Quarantined: ${this.summary.totals.quarantinedRows}`);
      console.log(`  Errors: ${this.summary.totals.errorCount}`);
      console.log(`${'='.repeat(60)}\n`);
    }

    return this.summary;
  }

  /** Migrate all domains for a single tenant */
  private async migrateTenant(tenantId: string, legacyClubId: number): Promise<void> {
    console.log(`\n-- Tenant: ${tenantId} (legacy club: ${legacyClubId}) --`);

    const tenantProgress: MigrationProgress[] = [];
    let shouldResume = !!this.config.resumeFrom;

    for (const domain of DOMAIN_ORDER) {
      if (shouldResume && domain !== this.config.resumeFrom) {
        console.log(`  [skip] ${domain} (resuming from ${this.config.resumeFrom})`);
        continue;
      }
      shouldResume = false;

      const handlers = TRANSFORMER_REGISTRY[domain];
      if (!handlers || handlers.length === 0) {
        continue;
      }

      const progress = await this.migrateDomain(tenantId, legacyClubId, domain, handlers);
      tenantProgress.push(...progress);
    }

    this.summary.tenants.push({
      tenantId,
      tenantName: `legacy-${legacyClubId}`,
      domains: tenantProgress,
    });
  }

  /** Migrate a single domain for a tenant */
  private async migrateDomain(
    tenantId: string,
    legacyClubId: number,
    domain: string,
    handlers: Array<{
      sourceTable: string;
      targetTable: string;
      skipDeleted?: boolean;
      deletedColumn?: string;
      transform: Function;
    }>,
  ): Promise<MigrationProgress[]> {
    const results: MigrationProgress[] = [];

    for (const handler of handlers) {
      const progress: MigrationProgress = {
        tenantId,
        domain,
        status: 'in_progress',
        totalRows: 0,
        processedRows: 0,
        insertedRows: 0,
        skippedRows: 0,
        quarantinedRows: 0,
        errorCount: 0,
        startedAt: new Date(),
      };

      try {
        console.log(`  [${domain}] ${handler.sourceTable} -> ${handler.targetTable}`);

        const batches = loadTable(handler.sourceTable, this.config.exportDir, {
          batchSize: this.config.batchSize,
        });

        for await (const rawBatch of batches) {
          progress.totalRows += rawBatch.length;

          // Filter to current tenant
          const tenantRows = rawBatch.filter(row => {
            const clubId = row['ClubId'] ?? row['CourseId'] ?? row['CourseID'];
            return String(clubId) === String(legacyClubId);
          });

          if (tenantRows.length === 0) continue;

          // Clean
          const { cleaned, quarantined } = cleanBatch(
            tenantRows,
            handler.sourceTable,
            handler.targetTable,
            domain,
            {
              deletedColumn: handler.deletedColumn ?? 'IsDeleted',
            },
          );

          // Log quarantined rows
          for (const q of quarantined) {
            this.quarantineFile?.write(JSON.stringify(q) + '\n');
          }
          progress.quarantinedRows += quarantined.length;

          // Transform
          const insertRows: Record<string, unknown>[] = [];
          for (const row of cleaned) {
            try {
              const transformed = await handler.transform(row, this.idMap, tenantId);
              if (transformed == null) {
                progress.skippedRows++;
                continue;
              }
              if (Array.isArray(transformed)) {
                insertRows.push(...transformed);
              } else {
                insertRows.push(transformed);
              }
            } catch (err) {
              progress.errorCount++;
              this.logError({
                domain,
                sourceTable: handler.sourceTable,
                targetTable: handler.targetTable,
                legacyId: row['Id'] ?? row['ID'],
                tenantId,
                message: err instanceof Error ? err.message : String(err),
                timestamp: new Date(),
              });
            }
          }

          // Insert (batch)
          if (insertRows.length > 0 && !this.config.dryRun) {
            const inserted = await this.batchInsert(handler.targetTable, insertRows);
            progress.insertedRows += inserted;
          } else {
            progress.insertedRows += insertRows.length;
          }

          progress.processedRows += tenantRows.length;
        }

        progress.status = 'completed';
      } catch (error) {
        progress.status = 'failed';
        progress.errorCount++;
        this.logError({
          domain,
          sourceTable: handler.sourceTable,
          targetTable: handler.targetTable,
          tenantId,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date(),
        });
      }

      progress.completedAt = new Date();
      results.push(progress);

      // Update totals
      this.summary.totals.totalRows += progress.totalRows;
      this.summary.totals.insertedRows += progress.insertedRows;
      this.summary.totals.skippedRows += progress.skippedRows;
      this.summary.totals.quarantinedRows += progress.quarantinedRows;
      this.summary.totals.errorCount += progress.errorCount;

      const duration = progress.completedAt!.getTime() - progress.startedAt!.getTime();
      console.log(`    ${progress.status}: ${progress.insertedRows}/${progress.processedRows} rows (${duration}ms)`);

      // Flush ID map after each table
      await this.idMap.flush();
    }

    return results;
  }

  /** Batch insert rows into a target table */
  private async batchInsert(table: string, rows: Record<string, unknown>[]): Promise<number> {
    if (rows.length === 0) return 0;

    let inserted = 0;
    const columns = Object.keys(rows[0]!);
    const colList = columns.map(c => `"${c}"`).join(', ');

    for (let i = 0; i < rows.length; i += this.config.batchSize) {
      const batch = rows.slice(i, i + this.config.batchSize);

      const valuePlaceholders = batch.map((_, rowIdx) => {
        const placeholders = columns.map((_, colIdx) => `$${rowIdx * columns.length + colIdx + 1}`);
        return `(${placeholders.join(', ')})`;
      }).join(', ');

      const values = batch.flatMap(row => columns.map(col => row[col] ?? null));

      try {
        await this.rawDb.unsafe(
          `INSERT INTO ${table} (${colList}) VALUES ${valuePlaceholders} ON CONFLICT DO NOTHING`,
          values,
        );
        inserted += batch.length;
      } catch (error) {
        // Fall back to row-by-row for this batch to isolate failures
        for (const row of batch) {
          try {
            const singleValues = columns.map(col => row[col] ?? null);
            const singlePlaceholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
            await this.rawDb.unsafe(
              `INSERT INTO ${table} (${colList}) VALUES (${singlePlaceholders}) ON CONFLICT DO NOTHING`,
              singleValues,
            );
            inserted++;
          } catch (rowError) {
            this.logError({
              domain: 'insert',
              sourceTable: '',
              targetTable: table,
              message: rowError instanceof Error ? rowError.message : String(rowError),
              timestamp: new Date(),
            });
          }
        }
      }
    }

    return inserted;
  }

  /** Ensure the legacy_id_map table exists */
  private async ensureIdMapTable(): Promise<void> {
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS legacy_id_map (
        legacy_table TEXT NOT NULL,
        legacy_id    TEXT NOT NULL,
        new_table    TEXT NOT NULL,
        new_id       TEXT NOT NULL,
        tenant_id    TEXT NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (legacy_table, legacy_id)
      )
    `);
    await this.db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_legacy_id_map_new
        ON legacy_id_map (new_table, new_id)
    `);
    await this.db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_legacy_id_map_tenant
        ON legacy_id_map (tenant_id, legacy_table)
    `);
  }

  /** Resolve legacy ClubId -> new tenant_id mappings */
  private async resolveTenantMappings(): Promise<Array<{ legacyClubId: number; newTenantId: string }>> {
    // First check if we have an explicit mapping file
    const mappingFile = path.join(this.config.exportDir, 'tenant_mapping.json');
    if (fs.existsSync(mappingFile)) {
      const content = fs.readFileSync(mappingFile, 'utf-8');
      return JSON.parse(content);
    }

    // Otherwise, discover from export files -- look at GF_Courses or similar
    // and create tenant entries automatically
    const tenantsFile = path.join(this.config.exportDir, 'GF_Courses.csv');
    const tenantsJsonFile = path.join(this.config.exportDir, 'GF_Courses.json');

    if (!fs.existsSync(tenantsFile) && !fs.existsSync(tenantsJsonFile)) {
      throw new Error(
        'No tenant mapping found. Create tenant_mapping.json in the export directory ' +
        'with format: [{ "legacyClubId": 123, "newTenantId": "ulid..." }]'
      );
    }

    // Auto-create tenants from GF_Courses
    const mappings: Array<{ legacyClubId: number; newTenantId: string }> = [];
    const batches = loadTable('GF_Courses', this.config.exportDir, { batchSize: 1000 });

    for await (const batch of batches) {
      for (const row of batch) {
        const clubId = Number(row['ID'] ?? row['Id']);
        if (isNaN(clubId)) continue;

        const newId = await this.idMap.getOrCreate('GF_Courses', clubId, 'tenants', '');
        mappings.push({ legacyClubId: clubId, newTenantId: newId });
      }
    }

    return mappings;
  }

  /** Log an error */
  private logError(error: MigrationError): void {
    this.errorLog?.write(JSON.stringify(error) + '\n');
    if (error.stack) {
      console.error(`  [ERROR] ${error.domain}/${error.sourceTable}: ${error.message}`);
    }
  }
}
