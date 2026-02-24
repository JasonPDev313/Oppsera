import { eq, and, isNull, sql, gt } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  customers,
  customerTags,
  smartTagRules,
  smartTagEvaluations,
  tagAuditLog,
  tags,
} from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { evaluateCustomerForRule } from '../services/smart-tag-evaluator';
import type { SmartTagConditionGroup } from '../types/smart-tag-conditions';

export interface EvaluateSmartTagsInput {
  tenantId: string;
  ruleId: string;
  triggerType: 'scheduled' | 'event' | 'manual';
  triggerEventId?: string;
  /** If provided, only evaluate this single customer (event-driven mode) */
  customerId?: string;
}

export interface EvaluateSmartTagsResult {
  evaluationId: string;
  customersEvaluated: number;
  tagsApplied: number;
  tagsRemoved: number;
  tagsUnchanged: number;
  durationMs: number;
  status: 'completed' | 'failed' | 'partial';
  errorMessage?: string;
}

const PAGE_SIZE = 100;

export async function evaluateSmartTags(
  input: EvaluateSmartTagsInput,
): Promise<EvaluateSmartTagsResult> {
  const startTime = Date.now();

  return withTenant(input.tenantId, async (tx) => {
    // 1. Load the rule
    const [rule] = await (tx as any)
      .select()
      .from(smartTagRules)
      .where(
        and(
          eq(smartTagRules.tenantId, input.tenantId),
          eq(smartTagRules.id, input.ruleId),
        ),
      )
      .limit(1);

    if (!rule) {
      throw new Error(`Smart tag rule not found: ${input.ruleId}`);
    }

    if (!rule.isActive) {
      throw new Error(`Smart tag rule is not active: ${input.ruleId}`);
    }

    // 2. Create evaluation record
    const evaluationId = generateUlid();
    await (tx as any).insert(smartTagEvaluations).values({
      id: evaluationId,
      tenantId: input.tenantId,
      ruleId: input.ruleId,
      triggerType: input.triggerType,
      triggerEventId: input.triggerEventId ?? null,
      status: 'running',
    });

    let customersEvaluated = 0;
    let tagsApplied = 0;
    let tagsRemoved = 0;
    let tagsUnchanged = 0;
    let errorMessage: string | undefined;
    let status: 'completed' | 'failed' | 'partial' = 'completed';

    try {
      const ruleData = {
        id: rule.id as string,
        name: rule.name as string,
        tagId: rule.tagId as string,
        conditions: rule.conditions as unknown as SmartTagConditionGroup[],
        autoRemove: rule.autoRemove as boolean,
      };

      if (input.customerId) {
        // Event-driven: evaluate single customer
        const result = await evaluateCustomerForRule(
          tx, input.tenantId, input.customerId, ruleData,
        );
        customersEvaluated = 1;

        if (result.action === 'apply') {
          await applySmartTag(tx, input.tenantId, input.customerId, rule, result.evidence);
          tagsApplied = 1;
        } else if (result.action === 'remove') {
          await removeSmartTag(tx, input.tenantId, input.customerId, rule, result.evidence);
          tagsRemoved = 1;
        } else {
          tagsUnchanged = 1;
        }
      } else {
        // Batch: page through all customers
        let cursor: string | null = null;

        while (true) {
          const conditions = [eq(customers.tenantId, input.tenantId)];
          if (cursor) {
            conditions.push(gt(customers.id, cursor));
          }

          const batch = await (tx as any)
            .select({ id: customers.id })
            .from(customers)
            .where(and(...conditions))
            .orderBy(customers.id)
            .limit(PAGE_SIZE);

          if (batch.length === 0) break;

          for (const cust of batch) {
            try {
              const result = await evaluateCustomerForRule(
                tx, input.tenantId, cust.id, ruleData,
              );
              customersEvaluated++;

              if (result.action === 'apply') {
                await applySmartTag(tx, input.tenantId, cust.id, rule, result.evidence);
                tagsApplied++;
              } else if (result.action === 'remove') {
                await removeSmartTag(tx, input.tenantId, cust.id, rule, result.evidence);
                tagsRemoved++;
              } else {
                tagsUnchanged++;
              }
            } catch (err) {
              // Log per-customer errors but continue
              console.error(`Smart tag eval error for customer ${cust.id}:`, err);
              tagsUnchanged++;
              customersEvaluated++;
              status = 'partial';
            }
          }

          cursor = batch[batch.length - 1]!.id;
          if (batch.length < PAGE_SIZE) break;
        }
      }
    } catch (err) {
      status = 'failed';
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    const durationMs = Date.now() - startTime;

    // 3. Update evaluation record
    await (tx as any)
      .update(smartTagEvaluations)
      .set({
        completedAt: new Date(),
        status,
        customersEvaluated,
        tagsApplied,
        tagsRemoved,
        tagsUnchanged,
        errorMessage: errorMessage ?? null,
        durationMs,
      })
      .where(eq(smartTagEvaluations.id, evaluationId));

    // 4. Update rule stats
    await (tx as any)
      .update(smartTagRules)
      .set({
        lastEvaluatedAt: new Date(),
        lastEvaluationDurationMs: durationMs,
        customersMatched: tagsApplied + tagsUnchanged,
        customersAdded: tagsApplied,
        customersRemoved: tagsRemoved,
        updatedAt: new Date(),
      })
      .where(eq(smartTagRules.id, input.ruleId));

    return {
      evaluationId,
      customersEvaluated,
      tagsApplied,
      tagsRemoved,
      tagsUnchanged,
      durationMs,
      status,
      errorMessage,
    };
  });
}

// ── Helpers ─────────────────────────────────────────────────────────

async function applySmartTag(
  tx: any,
  tenantId: string,
  customerId: string,
  rule: any,
  evidence: any,
): Promise<void> {
  const id = generateUlid();
  await tx.insert(customerTags).values({
    id,
    tenantId,
    customerId,
    tagId: rule.tagId,
    source: 'smart_rule',
    sourceRuleId: rule.id,
    evidence,
    appliedBy: 'system',
  });

  // Increment customer_count
  await tx
    .update(tags)
    .set({
      customerCount: sql`${tags.customerCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(tags.id, rule.tagId));

  // Audit log
  await tx.insert(tagAuditLog).values({
    id: generateUlid(),
    tenantId,
    customerId,
    tagId: rule.tagId,
    action: 'auto_applied',
    source: 'smart_rule',
    sourceRuleId: rule.id,
    actorId: 'system',
    evidence,
  });
}

async function removeSmartTag(
  tx: any,
  tenantId: string,
  customerId: string,
  rule: any,
  evidence: any,
): Promise<void> {
  await tx
    .update(customerTags)
    .set({
      removedAt: new Date(),
      removedBy: 'system',
      removedReason: 'Smart tag rule conditions no longer met',
    })
    .where(
      and(
        eq(customerTags.tenantId, tenantId),
        eq(customerTags.customerId, customerId),
        eq(customerTags.tagId, rule.tagId),
        isNull(customerTags.removedAt),
      ),
    );

  // Decrement customer_count
  await tx
    .update(tags)
    .set({
      customerCount: sql`GREATEST(${tags.customerCount} - 1, 0)`,
      updatedAt: new Date(),
    })
    .where(eq(tags.id, rule.tagId));

  // Audit log
  await tx.insert(tagAuditLog).values({
    id: generateUlid(),
    tenantId,
    customerId,
    tagId: rule.tagId,
    action: 'auto_removed',
    source: 'smart_rule',
    sourceRuleId: rule.id,
    actorId: 'system',
    evidence,
  });
}
