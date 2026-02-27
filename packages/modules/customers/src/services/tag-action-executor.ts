/**
 * Tag Action Executor Service
 *
 * Core execution engine for tag actions. When a tag is applied, removed, or expires,
 * this service queries active actions for the tag and executes them in order.
 *
 * Design principles:
 * - Never throws — catches errors per-action and continues
 * - Records audit trail for every execution (success, failed, skipped)
 * - Executes actions in `execution_order` ASC order
 * - Each action type handler is a pure function that performs the DB mutation
 */

import { eq, and, asc } from 'drizzle-orm';
import {
  tagActions,
  tagActionExecutions,
  customerActivityLog,
  customerServiceFlags,
  customerSegmentMemberships,
  customerWalletAccounts,
  customerAlerts,
  customerPreferences,
  customers,
} from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { TagActionTrigger, TagActionConfig } from '@oppsera/db';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExecuteTagActionsResult {
  executed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: ActionExecutionResult[];
}

export interface ActionExecutionResult {
  actionId: string;
  actionType: string;
  status: 'success' | 'failed' | 'skipped';
  resultSummary?: Record<string, unknown>;
  errorMessage?: string;
  durationMs: number;
}

/** Whitelisted customer fields that can be set via `set_customer_field` action */
const ALLOWED_CUSTOMER_FIELDS = new Set([
  'category',
  'status',
  'preferredLanguage',
  'vipLevel',
  'referralSource',
]);

// ── Executor ──────────────────────────────────────────────────────────────────

/**
 * Execute all active tag actions for a given trigger.
 *
 * Called by:
 * - `applyTagToCustomer` → trigger='on_apply'
 * - `removeTagFromCustomer` → trigger='on_remove'
 * - `processExpiredTags` → trigger='on_expire'
 * - `evaluateSmartTags` → trigger='on_apply' / 'on_remove'
 */
export async function executeTagActions(
  tx: any,
  tenantId: string,
  customerId: string,
  tagId: string,
  trigger: TagActionTrigger,
): Promise<ExecuteTagActionsResult> {
  const results: ActionExecutionResult[] = [];
  let succeeded = 0;
  let failed = 0;
  const skipped = 0;

  try {
    // 1. Query active actions for this tag + trigger, ordered by execution_order
    const actions = await tx
      .select({
        id: tagActions.id,
        actionType: tagActions.actionType,
        config: tagActions.config,
        isActive: tagActions.isActive,
      })
      .from(tagActions)
      .where(
        and(
          eq(tagActions.tenantId, tenantId),
          eq(tagActions.tagId, tagId),
          eq(tagActions.trigger, trigger),
          eq(tagActions.isActive, true),
        ),
      )
      .orderBy(asc(tagActions.executionOrder));

    if (actions.length === 0) {
      return { executed: 0, succeeded: 0, failed: 0, skipped: 0, results: [] };
    }

    // 2. Execute each action in order
    for (const action of actions) {
      const startTime = Date.now();
      let status: 'success' | 'failed' | 'skipped' = 'success';
      let resultSummary: Record<string, unknown> | undefined;
      let errorMessage: string | undefined;

      try {
        resultSummary = await executeAction(
          tx,
          tenantId,
          customerId,
          action.actionType,
          action.config as TagActionConfig,
          trigger,
        );
        succeeded++;
      } catch (err) {
        status = 'failed';
        errorMessage = err instanceof Error ? err.message : String(err);
        failed++;
      }

      const durationMs = Date.now() - startTime;

      // 3. Record execution audit trail
      try {
        await tx.insert(tagActionExecutions).values({
          id: generateUlid(),
          tenantId,
          tagActionId: action.id,
          customerId,
          trigger,
          status,
          resultSummary: resultSummary ?? null,
          errorMessage: errorMessage ?? null,
          durationMs,
        });
      } catch {
        // Audit insert failure should never block — log and continue
        console.error(`Failed to record tag action execution for action ${action.id}`);
      }

      results.push({
        actionId: action.id,
        actionType: action.actionType,
        status,
        resultSummary,
        errorMessage,
        durationMs,
      });
    }
  } catch (err) {
    // Top-level query failure — return empty result, never throw
    console.error('Failed to query tag actions:', err);
    return { executed: 0, succeeded: 0, failed: 0, skipped: 0, results: [] };
  }

  return {
    executed: results.length,
    succeeded,
    failed,
    skipped,
    results,
  };
}

// ── Action Handlers ───────────────────────────────────────────────────────────

async function executeAction(
  tx: any,
  tenantId: string,
  customerId: string,
  actionType: string,
  config: TagActionConfig,
  trigger: TagActionTrigger,
): Promise<Record<string, unknown>> {
  switch (actionType) {
    case 'log_activity':
      return handleLogActivity(tx, tenantId, customerId, config, trigger);
    case 'set_customer_field':
      return handleSetCustomerField(tx, tenantId, customerId, config);
    case 'add_to_segment':
      return handleAddToSegment(tx, tenantId, customerId, config);
    case 'remove_from_segment':
      return handleRemoveFromSegment(tx, tenantId, customerId, config);
    case 'set_service_flag':
      return handleSetServiceFlag(tx, tenantId, customerId, config);
    case 'remove_service_flag':
      return handleRemoveServiceFlag(tx, tenantId, customerId, config);
    case 'send_notification':
      return handleSendNotification(config);
    case 'adjust_wallet':
      return handleAdjustWallet(tx, tenantId, customerId, config);
    case 'set_preference':
      return handleSetPreference(tx, tenantId, customerId, config);
    case 'create_alert':
      return handleCreateAlert(tx, tenantId, customerId, config);
    default:
      throw new Error(`Unknown action type: ${actionType}`);
  }
}

// ── Individual Handlers ───────────────────────────────────────────────────────

async function handleLogActivity(
  tx: any,
  tenantId: string,
  customerId: string,
  config: TagActionConfig,
  trigger: TagActionTrigger,
): Promise<Record<string, unknown>> {
  const activityType = (config.activityType as string) ?? 'tag_action';
  const message = (config.message as string) ?? `Tag action triggered (${trigger})`;
  const metadata = (config.metadata as Record<string, unknown>) ?? {};

  await tx.insert(customerActivityLog).values({
    tenantId,
    customerId,
    activityType,
    title: message,
    details: JSON.stringify(metadata),
    createdBy: 'system:tag_action',
  });

  return { activityType, message };
}

async function handleSetCustomerField(
  tx: any,
  tenantId: string,
  customerId: string,
  config: TagActionConfig,
): Promise<Record<string, unknown>> {
  const field = config.field as string;
  const value = config.value;

  if (!field) throw new Error('set_customer_field requires "field" in config');
  if (!ALLOWED_CUSTOMER_FIELDS.has(field)) {
    throw new Error(`Field "${field}" is not allowed for set_customer_field. Allowed: ${[...ALLOWED_CUSTOMER_FIELDS].join(', ')}`);
  }

  await tx
    .update(customers)
    .set({ [field]: value, updatedAt: new Date() })
    .where(and(eq(customers.tenantId, tenantId), eq(customers.id, customerId)));

  return { field, value };
}

async function handleAddToSegment(
  tx: any,
  tenantId: string,
  customerId: string,
  config: TagActionConfig,
): Promise<Record<string, unknown>> {
  const segmentId = config.segmentId as string;
  if (!segmentId) throw new Error('add_to_segment requires "segmentId" in config');

  // Upsert — only add if not already a member (ignore active removedAt rows)
  const [existing] = await tx
    .select({ id: customerSegmentMemberships.id })
    .from(customerSegmentMemberships)
    .where(
      and(
        eq(customerSegmentMemberships.tenantId, tenantId),
        eq(customerSegmentMemberships.customerId, customerId),
        eq(customerSegmentMemberships.segmentId, segmentId),
      ),
    )
    .limit(1);

  if (existing) {
    // Re-activate if previously removed
    await tx
      .update(customerSegmentMemberships)
      .set({ removedAt: null, addedBy: 'system:tag_action' })
      .where(eq(customerSegmentMemberships.id, existing.id));
    return { segmentId, action: 'reactivated' };
  }

  await tx.insert(customerSegmentMemberships).values({
    tenantId,
    customerId,
    segmentId,
    addedBy: 'system:tag_action',
  });

  return { segmentId, action: 'added' };
}

async function handleRemoveFromSegment(
  tx: any,
  tenantId: string,
  customerId: string,
  config: TagActionConfig,
): Promise<Record<string, unknown>> {
  const segmentId = config.segmentId as string;
  if (!segmentId) throw new Error('remove_from_segment requires "segmentId" in config');

  await tx
    .update(customerSegmentMemberships)
    .set({ removedAt: new Date() })
    .where(
      and(
        eq(customerSegmentMemberships.tenantId, tenantId),
        eq(customerSegmentMemberships.customerId, customerId),
        eq(customerSegmentMemberships.segmentId, segmentId),
      ),
    );

  return { segmentId, action: 'removed' };
}

async function handleSetServiceFlag(
  tx: any,
  tenantId: string,
  customerId: string,
  config: TagActionConfig,
): Promise<Record<string, unknown>> {
  const flagType = config.flagType as string;
  if (!flagType) throw new Error('set_service_flag requires "flagType" in config');

  const severity = (config.severity as string) ?? 'info';
  const note = (config.note as string) ?? null;

  await tx.insert(customerServiceFlags).values({
    tenantId,
    customerId,
    flagType,
    severity,
    notes: note,
    createdBy: 'system:tag_action',
  });

  return { flagType, severity };
}

async function handleRemoveServiceFlag(
  tx: any,
  tenantId: string,
  customerId: string,
  config: TagActionConfig,
): Promise<Record<string, unknown>> {
  const flagType = config.flagType as string;
  if (!flagType) throw new Error('remove_service_flag requires "flagType" in config');

  // Soft-remove all matching flags by setting expiresAt to now
  await tx
    .update(customerServiceFlags)
    .set({ expiresAt: new Date() })
    .where(
      and(
        eq(customerServiceFlags.tenantId, tenantId),
        eq(customerServiceFlags.customerId, customerId),
        eq(customerServiceFlags.flagType, flagType),
      ),
    );

  return { flagType, action: 'deactivated' };
}

async function handleSendNotification(
  config: TagActionConfig,
): Promise<Record<string, unknown>> {
  // Fire-and-forget notification — V1 just logs, actual delivery is future work
  const channel = (config.channel as string) ?? 'internal';
  const template = (config.template as string) ?? '';
  const recipientRole = (config.recipientRole as string) ?? 'manager';

  console.log(`[Tag Action] Notification: channel=${channel}, template=${template}, recipient=${recipientRole}`);

  return { channel, template, recipientRole, status: 'logged' };
}

async function handleAdjustWallet(
  tx: any,
  tenantId: string,
  customerId: string,
  config: TagActionConfig,
): Promise<Record<string, unknown>> {
  const walletType = (config.walletType as string) ?? 'loyalty';
  const amountCents = config.amountCents as number;
  const _reason = (config.reason as string) ?? 'Tag action adjustment';

  if (typeof amountCents !== 'number' || amountCents === 0) {
    throw new Error('adjust_wallet requires non-zero "amountCents" in config');
  }

  // Find or create wallet
  const [wallet] = await tx
    .select({ id: customerWalletAccounts.id, balanceCents: customerWalletAccounts.balanceCents })
    .from(customerWalletAccounts)
    .where(
      and(
        eq(customerWalletAccounts.tenantId, tenantId),
        eq(customerWalletAccounts.customerId, customerId),
        eq(customerWalletAccounts.walletType, walletType),
        eq(customerWalletAccounts.status, 'active'),
      ),
    )
    .limit(1);

  if (!wallet) {
    // Create wallet with initial balance
    await tx.insert(customerWalletAccounts).values({
      tenantId,
      customerId,
      walletType,
      balanceCents: Math.max(amountCents, 0),
      status: 'active',
    });
    return { walletType, amountCents, newBalance: Math.max(amountCents, 0), action: 'created' };
  }

  const newBalance = (wallet.balanceCents as number) + amountCents;
  await tx
    .update(customerWalletAccounts)
    .set({ balanceCents: Math.max(newBalance, 0), updatedAt: new Date() })
    .where(eq(customerWalletAccounts.id, wallet.id));

  return { walletType, amountCents, newBalance: Math.max(newBalance, 0), action: 'adjusted' };
}

async function handleSetPreference(
  tx: any,
  tenantId: string,
  customerId: string,
  config: TagActionConfig,
): Promise<Record<string, unknown>> {
  const category = (config.category as string) ?? 'general';
  const key = config.key as string;
  const value = config.value as string;

  if (!key) throw new Error('set_preference requires "key" in config');
  if (value === undefined || value === null) throw new Error('set_preference requires "value" in config');

  // Upsert preference
  const [existing] = await tx
    .select({ id: customerPreferences.id })
    .from(customerPreferences)
    .where(
      and(
        eq(customerPreferences.tenantId, tenantId),
        eq(customerPreferences.customerId, customerId),
        eq(customerPreferences.category, category),
        eq(customerPreferences.key, key),
      ),
    )
    .limit(1);

  if (existing) {
    await tx
      .update(customerPreferences)
      .set({ value: String(value), source: 'tag_action', updatedAt: new Date(), updatedBy: 'system:tag_action' })
      .where(eq(customerPreferences.id, existing.id));
    return { category, key, value, action: 'updated' };
  }

  await tx.insert(customerPreferences).values({
    tenantId,
    customerId,
    category,
    key,
    value: String(value),
    source: 'tag_action',
    updatedBy: 'system:tag_action',
  });

  return { category, key, value, action: 'created' };
}

async function handleCreateAlert(
  tx: any,
  tenantId: string,
  customerId: string,
  config: TagActionConfig,
): Promise<Record<string, unknown>> {
  const alertType = (config.alertType as string) ?? 'tag_action';
  const severity = (config.severity as string) ?? 'info';
  const message = config.message as string;

  if (!message) throw new Error('create_alert requires "message" in config');

  await tx.insert(customerAlerts).values({
    tenantId,
    customerId,
    alertType,
    severity,
    message,
  });

  return { alertType, severity, message };
}
