#!/usr/bin/env tsx
// ── Semantic Registry Sync Script ────────────────────────────────
// Upserts all core and golf metrics, dimensions, relations, system lenses,
// and eval examples to the database.
//
// Usage:
//   pnpm --filter @oppsera/module-semantic semantic:sync
//   # or directly:
//   tsx packages/modules/semantic/src/sync/sync-registry.ts
//
// Environment:
//   Reads DATABASE_URL from .env.local (then .env as fallback).
//   Set SEMANTIC_DRY_RUN=true to skip DB writes and just print counts.

import 'dotenv/config';
import { syncRegistryToDb } from '../registry/sync';

const DRY_RUN = process.env.SEMANTIC_DRY_RUN === 'true';

async function main() {
  if (DRY_RUN) {
    console.log('[semantic:sync] DRY_RUN mode — no DB writes');
    console.log('[semantic:sync] Remove SEMANTIC_DRY_RUN=true to apply changes');
    process.exit(0);
  }

  console.log('[semantic:sync] Starting registry sync...');
  const start = Date.now();

  try {
    const result = await syncRegistryToDb();
    const elapsed = Date.now() - start;

    console.log('[semantic:sync] ✓ Sync complete');
    console.log(`  metrics:    ${result.metrics} upserted`);
    console.log(`  dimensions: ${result.dimensions} upserted`);
    console.log(`  relations:  ${result.relations} upserted`);
    console.log(`  lenses:     ${result.lenses} upserted`);
    console.log(`  examples:   ${result.examples} upserted`);
    console.log(`  elapsed:    ${elapsed}ms`);
  } catch (err) {
    console.error('[semantic:sync] ✗ Sync failed:', err);
    process.exit(1);
  }

  process.exit(0);
}

main();
