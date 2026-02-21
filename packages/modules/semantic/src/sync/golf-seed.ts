#!/usr/bin/env tsx
// ── Golf Lens Seed Script ─────────────────────────────────────────
// Seeds system-level golf lenses into the semantic_lenses table.
// These are the pre-built lenses shipped with the product for golf customers.
//
// This is a sub-operation of sync-registry.ts — running the full sync
// is preferred. Use this script only when you need to quickly refresh
// lens definitions without touching metrics/dimensions.
//
// Usage:
//   pnpm --filter @oppsera/module-semantic semantic:seed-lenses
//   # or directly:
//   tsx packages/modules/semantic/src/sync/golf-seed.ts

import 'dotenv/config';
import { db } from '@oppsera/db';
import { semanticLenses } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { SYSTEM_LENSES } from '../registry/seed-data';

async function seedLenses() {
  console.log('[semantic:golf-seed] Seeding system lenses...');
  const start = Date.now();

  let count = 0;
  for (const l of SYSTEM_LENSES) {
    await db.execute(sql`
      INSERT INTO semantic_lenses (
        id, slug, display_name, description, domain,
        allowed_metrics, allowed_dimensions, default_metrics, default_dimensions,
        default_filters, system_prompt_fragment, example_questions,
        is_active, is_system, created_at, updated_at
      ) VALUES (
        ${generateUlid()}, ${l.slug}, ${l.displayName}, ${l.description ?? null}, ${l.domain},
        ${l.allowedMetrics ?? null}, ${l.allowedDimensions ?? null},
        ${l.defaultMetrics ?? null}, ${l.defaultDimensions ?? null},
        ${l.defaultFilters ? JSON.stringify(l.defaultFilters) : null}::jsonb,
        ${l.systemPromptFragment ?? null}, ${l.exampleQuestions ?? null},
        TRUE, ${l.isSystem}, NOW(), NOW()
      )
      ON CONFLICT (slug) WHERE tenant_id IS NULL DO UPDATE SET
        display_name = EXCLUDED.display_name,
        description = EXCLUDED.description,
        domain = EXCLUDED.domain,
        allowed_metrics = EXCLUDED.allowed_metrics,
        allowed_dimensions = EXCLUDED.allowed_dimensions,
        default_metrics = EXCLUDED.default_metrics,
        default_dimensions = EXCLUDED.default_dimensions,
        default_filters = EXCLUDED.default_filters,
        system_prompt_fragment = EXCLUDED.system_prompt_fragment,
        example_questions = EXCLUDED.example_questions,
        is_system = EXCLUDED.is_system,
        updated_at = NOW()
    `);
    count++;
  }

  void semanticLenses; // imported for type-checking

  const elapsed = Date.now() - start;
  console.log(`[semantic:golf-seed] ✓ ${count} system lenses seeded (${elapsed}ms)`);
}

seedLenses().catch((err) => {
  console.error('[semantic:golf-seed] ✗ Failed:', err);
  process.exit(1);
}).then(() => process.exit(0));
