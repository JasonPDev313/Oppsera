#!/usr/bin/env tsx
/**
 * Migration Pipeline CLI
 *
 * Usage:
 *   npx tsx tools/migration/run.ts migrate --export-dir ./exports
 *   npx tsx tools/migration/run.ts migrate --dry-run --export-dir ./exports
 *   npx tsx tools/migration/run.ts validate --export-dir ./exports
 *   npx tsx tools/migration/run.ts rollback --tenant <tenant-id>
 *   npx tsx tools/migration/run.ts monitor --tenant <tenant-id>
 *   npx tsx tools/migration/run.ts status
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { MigrationPipeline } from './pipeline';
import { MigrationValidator } from './validate';
import { MigrationMonitor } from './monitor';
import { rollbackTenant } from './rollback';
import { loadConfig } from './config';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    printUsage();
    process.exit(1);
  }

  const config = loadConfig(parseFlags(args));

  switch (command) {
    case 'migrate': {
      const pipeline = new MigrationPipeline(config);
      const summary = await pipeline.run();

      if (!config.skipValidation && !config.dryRun) {
        console.log('\nRunning post-migration validation...\n');
        const validator = new MigrationValidator(config.adminDbUrl);
        const results = await validator.runAll(config.exportDir);
        summary.validationResults = results;

        const failed = results.filter(r => !r.passed);
        if (failed.length > 0) {
          console.log(`\n${failed.length} validation checks failed. Review before proceeding.\n`);
          process.exit(2);
        }
      }

      process.exit(summary.status === 'completed' ? 0 : 1);
      break;
    }

    case 'validate': {
      const validator = new MigrationValidator(config.adminDbUrl);
      const tenantId = getFlag(args, '--tenant');
      const results = await validator.runAll(config.exportDir, tenantId ?? undefined);

      const failed = results.filter(r => !r.passed);
      process.exit(failed.length > 0 ? 1 : 0);
      break;
    }

    case 'rollback': {
      const tenantId = getFlag(args, '--tenant');
      if (!tenantId) {
        console.error('--tenant flag is required for rollback');
        process.exit(1);
      }
      await rollbackTenant(config.adminDbUrl, tenantId);
      break;
    }

    case 'monitor': {
      const monitor = new MigrationMonitor(config.adminDbUrl);
      const tenantId = getFlag(args, '--tenant');
      await monitor.runDailyCheck(tenantId ?? undefined);
      break;
    }

    case 'status': {
      const monitor = new MigrationMonitor(config.adminDbUrl);
      await monitor.printIdMapStats();
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

function parseFlags(args: string[]): Record<string, unknown> {
  const flags: Record<string, unknown> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--skip-validation') flags.skipValidation = true;
    else if (arg === '--export-dir' && args[i + 1]) { flags.exportDir = args[++i]; }
    else if (arg === '--output-dir' && args[i + 1]) { flags.outputDir = args[++i]; }
    else if (arg === '--batch-size' && args[i + 1]) { flags.batchSize = parseInt(args[++i]!, 10); }
    else if (arg === '--tenant' && args[i + 1]) {
      flags.tenantFilter = [args[++i]!];
    }
    else if (arg === '--resume-from' && args[i + 1]) { flags.resumeFrom = args[++i]; }
  }

  return flags;
}

function getFlag(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1]! : null;
}

function printUsage() {
  console.log(`
OppsEra Legacy Data Migration Pipeline

Commands:
  migrate     Run the full migration pipeline
  validate    Run post-migration validation only
  rollback    Roll back a tenant's migrated data
  monitor     Run post-migration monitoring checks
  status      Show ID mapping statistics

Flags:
  --export-dir <dir>     Directory containing CSV/JSON exports
  --output-dir <dir>     Directory for logs and quarantine files
  --dry-run              Validate without writing to database
  --batch-size <n>       Rows per INSERT batch (default: 500)
  --tenant <id>          Filter to a specific tenant
  --resume-from <domain> Resume from a specific domain
  --skip-validation      Skip post-migration validation

Examples:
  npx tsx tools/migration/run.ts migrate --export-dir ./exports --dry-run
  npx tsx tools/migration/run.ts migrate --export-dir ./exports --tenant tenant_abc123
  npx tsx tools/migration/run.ts validate --export-dir ./exports
  npx tsx tools/migration/run.ts rollback --tenant tenant_abc123
  npx tsx tools/migration/run.ts monitor
`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
