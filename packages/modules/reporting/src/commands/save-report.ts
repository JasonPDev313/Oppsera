import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { ValidationError, NotFoundError } from '@oppsera/shared';
import { reportDefinitions, reportingFieldCatalog } from '@oppsera/db';
import { eq, and, ne, inArray } from 'drizzle-orm';
import { resolveDatasets } from '../compiler';
import type { ReportDefinitionBody } from '../compiler';

export interface SaveReportInput {
  id?: string;  // if provided, update; otherwise create
  name: string;
  description?: string;
  dataset: string;
  definition: ReportDefinitionBody;
}

const VALID_DATASETS = new Set(['daily_sales', 'item_sales', 'inventory', 'customers']);

const JOINABLE_PAIRS = new Set([
  'daily_sales+item_sales',
  'inventory+item_sales',
]);

const STANDALONE_DATASETS = new Set(['customers']);

/** Parse composite key 'dataset:fieldKey' with fallback */
function parseFieldKey(key: string, fallbackDataset: string): { dataset: string; fieldKey: string } {
  const colonIdx = key.indexOf(':');
  if (colonIdx === -1) return { dataset: fallbackDataset, fieldKey: key };
  return { dataset: key.slice(0, colonIdx), fieldKey: key.slice(colonIdx + 1) };
}

export async function saveReport(ctx: RequestContext, input: SaveReportInput) {
  // Resolve effective datasets
  const datasets = resolveDatasets(input.dataset, input.definition);

  // Validate all datasets are known
  for (const ds of datasets) {
    if (!VALID_DATASETS.has(ds)) {
      throw new ValidationError(`Unknown dataset: ${ds}`);
    }
  }

  // Validate multi-dataset combination
  if (datasets.length > 1) {
    if (datasets.some((d) => STANDALONE_DATASETS.has(d))) {
      throw new ValidationError('Customer Activity cannot be combined with other datasets');
    }
    const sorted = [...datasets].sort();
    const key = sorted.join('+');
    if (!JOINABLE_PAIRS.has(key)) {
      throw new ValidationError(`Datasets "${datasets.join(', ')}" cannot be combined`);
    }
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch field catalog for all relevant datasets
    const catalogRows = datasets.length === 1
      ? await (tx as any).select().from(reportingFieldCatalog)
          .where(eq(reportingFieldCatalog.dataset, datasets[0]!))
      : await (tx as any).select().from(reportingFieldCatalog)
          .where(inArray(reportingFieldCatalog.dataset, datasets));

    // Build valid key set: 'dataset:fieldKey'
    const validKeys = new Set<string>();
    for (const r of catalogRows as any[]) {
      validKeys.add(`${r.dataset}:${r.fieldKey}`);
    }

    // Validate columns
    for (const col of input.definition.columns) {
      const { dataset: colDs, fieldKey } = parseFieldKey(col, input.dataset);
      const lookupKey = `${colDs}:${fieldKey}`;
      if (!validKeys.has(lookupKey)) {
        throw new ValidationError(`Unknown field "${col}" for dataset(s) "${datasets.join(', ')}"`);
      }
    }

    // Validate filter fields
    for (const filter of input.definition.filters ?? []) {
      const { dataset: fDs, fieldKey } = parseFieldKey(filter.fieldKey, input.dataset);
      const lookupKey = `${fDs}:${fieldKey}`;
      if (!validKeys.has(lookupKey)) {
        throw new ValidationError(`Unknown filter field "${filter.fieldKey}" for dataset(s) "${datasets.join(', ')}"`);
      }
    }

    // Enforce unique report name within tenant (non-archived)
    const nameConditions = [
      eq(reportDefinitions.tenantId, ctx.tenantId),
      eq(reportDefinitions.name, input.name.trim()),
      eq(reportDefinitions.isArchived, false),
    ];
    if (input.id) {
      nameConditions.push(ne(reportDefinitions.id, input.id));
    }
    const [duplicate] = await (tx as any).select({ id: reportDefinitions.id })
      .from(reportDefinitions)
      .where(and(...nameConditions))
      .limit(1);
    if (duplicate) {
      throw new ValidationError('A report with this name already exists. Please choose a different name.');
    }

    if (input.id) {
      // Update existing
      const [existing] = await (tx as any).select().from(reportDefinitions)
        .where(and(
          eq(reportDefinitions.id, input.id),
          eq(reportDefinitions.tenantId, ctx.tenantId),
        ))
        .limit(1);

      if (!existing) throw new NotFoundError('Report not found');
      if (existing.isArchived) throw new ValidationError('Cannot update an archived report');

      const [updated] = await (tx as any).update(reportDefinitions)
        .set({
          name: input.name,
          description: input.description ?? null,
          dataset: input.dataset,
          definition: input.definition,
          updatedAt: new Date(),
        })
        .where(eq(reportDefinitions.id, input.id))
        .returning();

      const event = buildEventFromContext(ctx, 'reporting.report.saved.v1', {
        reportId: updated!.id,
        name: updated!.name,
        dataset: updated!.dataset,
        action: 'updated',
      });
      return { result: updated!, events: [event] };
    } else {
      // Create new
      const [created] = await (tx as any).insert(reportDefinitions).values({
        tenantId: ctx.tenantId,
        name: input.name,
        description: input.description ?? null,
        dataset: input.dataset,
        definition: input.definition,
        createdBy: ctx.user.id,
      }).returning();

      const event = buildEventFromContext(ctx, 'reporting.report.saved.v1', {
        reportId: created!.id,
        name: created!.name,
        dataset: created!.dataset,
        action: 'created',
      });
      return { result: created!, events: [event] };
    }
  });

  await auditLog(ctx, 'reporting.report.saved', 'report_definition', result.id);
  return result;
}
