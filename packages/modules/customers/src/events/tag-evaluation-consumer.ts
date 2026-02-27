/**
 * Tag Evaluation Consumer — Event-Driven Smart Tag Re-evaluation
 *
 * When business events occur (order placed, tender recorded, etc.),
 * this consumer re-evaluates smart tag rules that are configured
 * for event-driven evaluation. Tags can be auto-applied or auto-removed
 * based on updated customer data.
 *
 * All handlers are fire-and-forget: errors are logged, never thrown.
 */

import { eq, and, sql } from 'drizzle-orm';
import { withTenant, smartTagRules } from '@oppsera/db';
import type { EventEnvelope } from '@oppsera/shared';
import { evaluateSmartTags } from '../commands/evaluate-smart-tags';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TagEvaluationConsumerResult {
  rulesEvaluated: number;
  rulesSkipped: number;
  errors: number;
}

// ── Core Evaluation Function ──────────────────────────────────────────────────

/**
 * Evaluate all eligible smart tag rules for a single customer in response
 * to a business event.
 *
 * Steps:
 * 1. Query active rules where evaluationMode IN ('event_driven', 'hybrid')
 *    AND (trigger_events contains the event OR trigger_events is empty)
 * 2. Check cooldown: skip if lastEvaluatedAt + cooldownHours > now()
 * 3. For each rule, call evaluateSmartTags in single-customer mode
 * 4. Update nextScheduledRunAt for hybrid rules
 *
 * @param tenantId - Tenant ID
 * @param customerId - Customer to evaluate
 * @param triggerEvent - The event type that triggered this evaluation
 * @param triggerEventId - The event ID for audit trail
 */
export async function evaluateCustomerTagsOnEvent(
  tenantId: string,
  customerId: string,
  triggerEvent: string,
  triggerEventId?: string,
): Promise<TagEvaluationConsumerResult> {
  const result: TagEvaluationConsumerResult = {
    rulesEvaluated: 0,
    rulesSkipped: 0,
    errors: 0,
  };

  try {
    const rules = await withTenant(tenantId, async (tx) => {
      // Find all active rules that should be evaluated for this event
      return (tx as any)
        .select({
          id: smartTagRules.id,
          evaluationMode: smartTagRules.evaluationMode,
          cooldownHours: smartTagRules.cooldownHours,
          lastEvaluatedAt: smartTagRules.lastEvaluatedAt,
          triggerEvents: smartTagRules.triggerEvents,
        })
        .from(smartTagRules)
        .where(
          and(
            eq(smartTagRules.tenantId, tenantId),
            eq(smartTagRules.isActive, true),
            // evaluationMode must be event_driven or hybrid
            sql`${smartTagRules.evaluationMode} IN ('event_driven', 'hybrid')`,
          ),
        );
    });

    const now = Date.now();

    for (const rule of rules) {
      try {
        // Check if this event matches the rule's trigger events
        const triggers = rule.triggerEvents as string[] | null;
        if (triggers && triggers.length > 0 && !triggers.includes(triggerEvent)) {
          result.rulesSkipped++;
          continue;
        }

        // Check cooldown
        const cooldownHours = rule.cooldownHours as number | null;
        if (cooldownHours && cooldownHours > 0 && rule.lastEvaluatedAt) {
          const lastEval = new Date(rule.lastEvaluatedAt).getTime();
          const cooldownMs = cooldownHours * 3600000;
          if (now - lastEval < cooldownMs) {
            result.rulesSkipped++;
            continue;
          }
        }

        // Evaluate the rule for this single customer
        await evaluateSmartTags({
          tenantId,
          ruleId: rule.id as string,
          triggerType: 'event',
          triggerEventId,
          customerId,
        });

        result.rulesEvaluated++;
      } catch (err) {
        // Per-rule error: log and continue
        console.error(
          `[tag-evaluation-consumer] Error evaluating rule ${rule.id} for customer ${customerId}:`,
          err,
        );
        result.errors++;
      }
    }
  } catch (err) {
    // Top-level error: log and return partial result
    console.error(
      `[tag-evaluation-consumer] Error loading rules for tenant ${tenantId}:`,
      err,
    );
    result.errors++;
  }

  return result;
}

// ── Event Wrapper Consumers ─────────────────────────────────────────────────

/**
 * Handle order.placed.v1 — re-evaluate smart tags for the customer who placed the order.
 * Fire-and-forget: errors logged, never thrown.
 */
export async function handleTagEvaluationOnOrderPlaced(event: EventEnvelope): Promise<void> {
  const customerId = (event.data as any)?.customerId;
  if (!customerId) return; // No customer attached to order

  try {
    await evaluateCustomerTagsOnEvent(
      event.tenantId,
      customerId,
      'order.placed.v1',
      event.eventId,
    );
  } catch (err) {
    console.error('[tag-evaluation-consumer] handleTagEvaluationOnOrderPlaced failed:', err);
  }
}

/**
 * Handle tender.recorded.v1 — re-evaluate after payment recorded.
 * Fire-and-forget.
 */
export async function handleTagEvaluationOnTenderRecorded(event: EventEnvelope): Promise<void> {
  const customerId = (event.data as any)?.customerId;
  if (!customerId) return;

  try {
    await evaluateCustomerTagsOnEvent(
      event.tenantId,
      customerId,
      'tender.recorded.v1',
      event.eventId,
    );
  } catch (err) {
    console.error('[tag-evaluation-consumer] handleTagEvaluationOnTenderRecorded failed:', err);
  }
}

/**
 * Handle order.voided.v1 — re-evaluate after order voided (customer stats change).
 * Fire-and-forget.
 */
export async function handleTagEvaluationOnOrderVoided(event: EventEnvelope): Promise<void> {
  const customerId = (event.data as any)?.customerId;
  if (!customerId) return;

  try {
    await evaluateCustomerTagsOnEvent(
      event.tenantId,
      customerId,
      'order.voided.v1',
      event.eventId,
    );
  } catch (err) {
    console.error('[tag-evaluation-consumer] handleTagEvaluationOnOrderVoided failed:', err);
  }
}

/**
 * Handle customer.visit.recorded.v1 — re-evaluate after visit recorded.
 * Fire-and-forget.
 */
export async function handleTagEvaluationOnVisitRecorded(event: EventEnvelope): Promise<void> {
  const customerId = (event.data as any)?.customerId;
  if (!customerId) return;

  try {
    await evaluateCustomerTagsOnEvent(
      event.tenantId,
      customerId,
      'customer.visit.recorded.v1',
      event.eventId,
    );
  } catch (err) {
    console.error('[tag-evaluation-consumer] handleTagEvaluationOnVisitRecorded failed:', err);
  }
}

/**
 * Handle customer.membership.created.v1 — re-evaluate after membership change.
 * Fire-and-forget.
 */
export async function handleTagEvaluationOnMembershipChanged(event: EventEnvelope): Promise<void> {
  const customerId = (event.data as any)?.customerId;
  if (!customerId) return;

  try {
    await evaluateCustomerTagsOnEvent(
      event.tenantId,
      customerId,
      'customer.membership.created.v1',
      event.eventId,
    );
  } catch (err) {
    console.error('[tag-evaluation-consumer] handleTagEvaluationOnMembershipChanged failed:', err);
  }
}

// ── Scheduled Evaluation (for Cron) ─────────────────────────────────────────

/**
 * Process all scheduled smart tag rules that are due for evaluation.
 * Called from the cron route.
 *
 * Finds rules where:
 * - isActive = true
 * - evaluationMode IN ('scheduled', 'hybrid')
 * - nextScheduledRunAt <= now() OR nextScheduledRunAt IS NULL
 *
 * @param tenantId - Tenant ID
 * @param batchSize - Max rules to process per call (default 50)
 */
export async function processScheduledRules(
  tenantId: string,
  batchSize = 50,
): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  try {
    const now = new Date();

    const dueRules = await withTenant(tenantId, async (tx) => {
      return (tx as any)
        .select({
          id: smartTagRules.id,
          reEvaluationIntervalHours: sql<number | null>`(
            SELECT re_evaluation_interval_hours FROM tags
            WHERE tags.id = ${smartTagRules.tagId}
            AND tags.tenant_id = ${tenantId}
          )`,
        })
        .from(smartTagRules)
        .where(
          and(
            eq(smartTagRules.tenantId, tenantId),
            eq(smartTagRules.isActive, true),
            sql`${smartTagRules.evaluationMode} IN ('scheduled', 'hybrid')`,
            sql`(${smartTagRules.nextScheduledRunAt} IS NULL OR ${smartTagRules.nextScheduledRunAt} <= ${now})`,
          ),
        )
        .limit(batchSize);
    });

    for (const rule of dueRules) {
      try {
        // Run batch evaluation (no customerId = all customers)
        await evaluateSmartTags({
          tenantId,
          ruleId: rule.id as string,
          triggerType: 'scheduled',
        });

        // Update nextScheduledRunAt based on re-evaluation interval
        const intervalHours = rule.reEvaluationIntervalHours as number | null;
        if (intervalHours && intervalHours > 0) {
          const nextRun = new Date(Date.now() + intervalHours * 3600000);
          await withTenant(tenantId, async (tx) => {
            await (tx as any)
              .update(smartTagRules)
              .set({ nextScheduledRunAt: nextRun })
              .where(eq(smartTagRules.id, rule.id as string));
          });
        }

        processed++;
      } catch (err) {
        console.error(
          `[tag-evaluation-consumer] Error processing scheduled rule ${rule.id}:`,
          err,
        );
        errors++;
      }
    }
  } catch (err) {
    console.error(
      `[tag-evaluation-consumer] Error loading scheduled rules for tenant ${tenantId}:`,
      err,
    );
    errors++;
  }

  return { processed, errors };
}
