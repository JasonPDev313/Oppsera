/**
 * Get import job detail with all mappings.
 */

import { eq, and } from 'drizzle-orm';
import {
  withTenant,
  importJobs,
  importColumnMappings,
  importTenderMappings,
  importTaxMappings,
  importItemMappings,
} from '@oppsera/db';

import type { GetImportJobInput } from '../validation';

export async function getImportJob(input: GetImportJobInput) {
  return withTenant(input.tenantId, async (tx) => {
    const [job] = await tx
      .select()
      .from(importJobs)
      .where(
        and(
          eq(importJobs.id, input.importJobId),
          eq(importJobs.tenantId, input.tenantId),
        ),
      )
      .limit(1);

    if (!job) return null;

    // Load all mappings in parallel
    const [columnMaps, tenderMaps, taxMaps, itemMaps] = await Promise.all([
      tx
        .select()
        .from(importColumnMappings)
        .where(eq(importColumnMappings.importJobId, input.importJobId)),
      tx
        .select()
        .from(importTenderMappings)
        .where(eq(importTenderMappings.importJobId, input.importJobId)),
      tx
        .select()
        .from(importTaxMappings)
        .where(eq(importTaxMappings.importJobId, input.importJobId)),
      tx
        .select()
        .from(importItemMappings)
        .where(eq(importItemMappings.importJobId, input.importJobId)),
    ]);

    return {
      ...job,
      columnMappings: columnMaps.map((m) => ({
        ...m,
        confidence: Number(m.confidence),
        sampleValues: (m.sampleValues ?? []) as string[],
      })),
      tenderMappings: tenderMaps.map((m) => ({
        ...m,
        confidence: Number(m.confidence),
      })),
      taxMappings: taxMaps.map((m) => ({
        ...m,
        confidence: Number(m.confidence),
        legacyRate: m.legacyRate ? Number(m.legacyRate) : null,
      })),
      itemMappings: itemMaps.map((m) => ({
        ...m,
      })),
    };
  });
}
