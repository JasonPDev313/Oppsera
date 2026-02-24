import { eq, and, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { smartTagRules, tags, smartTagEvaluations } from '@oppsera/db';
import type { SmartTagConditionGroup } from '@oppsera/db';

export interface GetSmartTagRuleInput {
  tenantId: string;
  ruleId: string;
}

export interface SmartTagRuleDetail {
  id: string;
  tenantId: string;
  tagId: string;
  tagName: string;
  tagColor: string;
  tagSlug: string;
  name: string;
  description: string | null;
  isActive: boolean;
  evaluationMode: string;
  scheduleCron: string | null;
  conditions: SmartTagConditionGroup[];
  autoRemove: boolean;
  cooldownHours: number | null;
  priority: number;
  version: number;
  lastEvaluatedAt: Date | null;
  lastEvaluationDurationMs: number | null;
  customersMatched: number;
  customersAdded: number;
  customersRemoved: number;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  recentEvaluations: SmartTagEvaluationSummary[];
}

export interface SmartTagEvaluationSummary {
  id: string;
  triggerType: string;
  startedAt: Date;
  completedAt: Date | null;
  status: string;
  customersEvaluated: number;
  tagsApplied: number;
  tagsRemoved: number;
  durationMs: number | null;
}

export async function getSmartTagRule(
  input: GetSmartTagRuleInput,
): Promise<SmartTagRuleDetail | null> {
  return withTenant(input.tenantId, async (tx) => {
    const [row] = await (tx as any)
      .select({
        id: smartTagRules.id,
        tenantId: smartTagRules.tenantId,
        tagId: smartTagRules.tagId,
        tagName: tags.name,
        tagColor: tags.color,
        tagSlug: tags.slug,
        name: smartTagRules.name,
        description: smartTagRules.description,
        isActive: smartTagRules.isActive,
        evaluationMode: smartTagRules.evaluationMode,
        scheduleCron: smartTagRules.scheduleCron,
        conditions: smartTagRules.conditions,
        autoRemove: smartTagRules.autoRemove,
        cooldownHours: smartTagRules.cooldownHours,
        priority: smartTagRules.priority,
        version: smartTagRules.version,
        lastEvaluatedAt: smartTagRules.lastEvaluatedAt,
        lastEvaluationDurationMs: smartTagRules.lastEvaluationDurationMs,
        customersMatched: smartTagRules.customersMatched,
        customersAdded: smartTagRules.customersAdded,
        customersRemoved: smartTagRules.customersRemoved,
        metadata: smartTagRules.metadata,
        createdAt: smartTagRules.createdAt,
        updatedAt: smartTagRules.updatedAt,
        createdBy: smartTagRules.createdBy,
      })
      .from(smartTagRules)
      .innerJoin(tags, eq(smartTagRules.tagId, tags.id))
      .where(
        and(
          eq(smartTagRules.tenantId, input.tenantId),
          eq(smartTagRules.id, input.ruleId),
        ),
      )
      .limit(1);

    if (!row) return null;

    // Fetch last 10 evaluations
    const evaluations = await (tx as any)
      .select({
        id: smartTagEvaluations.id,
        triggerType: smartTagEvaluations.triggerType,
        startedAt: smartTagEvaluations.startedAt,
        completedAt: smartTagEvaluations.completedAt,
        status: smartTagEvaluations.status,
        customersEvaluated: smartTagEvaluations.customersEvaluated,
        tagsApplied: smartTagEvaluations.tagsApplied,
        tagsRemoved: smartTagEvaluations.tagsRemoved,
        durationMs: smartTagEvaluations.durationMs,
      })
      .from(smartTagEvaluations)
      .where(
        and(
          eq(smartTagEvaluations.tenantId, input.tenantId),
          eq(smartTagEvaluations.ruleId, input.ruleId),
        ),
      )
      .orderBy(desc(smartTagEvaluations.startedAt))
      .limit(10);

    return {
      id: row.id,
      tenantId: row.tenantId,
      tagId: row.tagId,
      tagName: row.tagName,
      tagColor: row.tagColor,
      tagSlug: row.tagSlug,
      name: row.name,
      description: row.description ?? null,
      isActive: row.isActive,
      evaluationMode: row.evaluationMode,
      scheduleCron: row.scheduleCron ?? null,
      conditions: row.conditions as SmartTagConditionGroup[],
      autoRemove: row.autoRemove,
      cooldownHours: row.cooldownHours ?? null,
      priority: row.priority,
      version: row.version,
      lastEvaluatedAt: row.lastEvaluatedAt ?? null,
      lastEvaluationDurationMs: row.lastEvaluationDurationMs ?? null,
      customersMatched: row.customersMatched,
      customersAdded: row.customersAdded,
      customersRemoved: row.customersRemoved,
      metadata: row.metadata ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
      recentEvaluations: evaluations.map((e: any) => ({
        id: e.id,
        triggerType: e.triggerType,
        startedAt: e.startedAt,
        completedAt: e.completedAt ?? null,
        status: e.status,
        customersEvaluated: e.customersEvaluated,
        tagsApplied: e.tagsApplied,
        tagsRemoved: e.tagsRemoved,
        durationMs: e.durationMs ?? null,
      })),
    };
  });
}
