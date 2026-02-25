import { db } from '@oppsera/db';
import { semanticNarrativeConfig } from '@oppsera/db';
import { eq } from 'drizzle-orm';

// ── In-memory cache (5-min TTL) ──────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000;

let _cache: { template: string | null; loadedAt: number } | null = null;

export function invalidateNarrativeConfigCache(): void {
  _cache = null;
}

// ── Read ─────────────────────────────────────────────────────────

export async function getNarrativeConfig(): Promise<string | null> {
  if (_cache && Date.now() - _cache.loadedAt < CACHE_TTL_MS) {
    return _cache.template;
  }

  try {
    const rows = await db
      .select({ promptTemplate: semanticNarrativeConfig.promptTemplate })
      .from(semanticNarrativeConfig)
      .where(eq(semanticNarrativeConfig.id, 'global'))
      .limit(1);

    const template = rows.length > 0 ? rows[0]!.promptTemplate : null;
    _cache = { template, loadedAt: Date.now() };
    return template;
  } catch {
    // If the table doesn't exist yet (pre-migration), return null silently
    _cache = { template: null, loadedAt: Date.now() };
    return null;
  }
}

export interface NarrativeConfigRow {
  promptTemplate: string;
  updatedAt: string;
  updatedBy: string | null;
}

export async function getNarrativeConfigFull(): Promise<NarrativeConfigRow | null> {
  const rows = await db
    .select({
      promptTemplate: semanticNarrativeConfig.promptTemplate,
      updatedAt: semanticNarrativeConfig.updatedAt,
      updatedBy: semanticNarrativeConfig.updatedBy,
    })
    .from(semanticNarrativeConfig)
    .where(eq(semanticNarrativeConfig.id, 'global'))
    .limit(1);

  if (rows.length === 0) return null;
  const row = rows[0]!;
  return {
    promptTemplate: row.promptTemplate,
    updatedAt: (row.updatedAt as Date).toISOString(),
    updatedBy: row.updatedBy,
  };
}

// ── Write ────────────────────────────────────────────────────────

export async function updateNarrativeConfig(
  template: string,
  updatedBy: string,
): Promise<void> {
  await db
    .insert(semanticNarrativeConfig)
    .values({
      id: 'global',
      promptTemplate: template,
      updatedAt: new Date(),
      updatedBy,
    })
    .onConflictDoUpdate({
      target: semanticNarrativeConfig.id,
      set: {
        promptTemplate: template,
        updatedAt: new Date(),
        updatedBy,
      },
    });

  invalidateNarrativeConfigCache();
}

// ── Reset ────────────────────────────────────────────────────────

export async function resetNarrativeConfig(): Promise<void> {
  await db
    .delete(semanticNarrativeConfig)
    .where(eq(semanticNarrativeConfig.id, 'global'));

  invalidateNarrativeConfigCache();
}
