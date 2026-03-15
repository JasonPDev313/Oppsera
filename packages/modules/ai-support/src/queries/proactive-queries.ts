import { eq, and, isNull, or, inArray } from 'drizzle-orm';
import { db, aiSupportProactiveRules, aiSupportProactiveDismissals } from '@oppsera/db';

// ── Types ─────────────────────────────────────────────────────────────

export interface ProactiveMessage {
  id: string;
  messageTemplate: string;
  triggerType: string;
  moduleKey: string | null;
  priority: number;
}

// ── checkProactiveMessages ────────────────────────────────────────────
// Load enabled rules, filter by context, skip recently-shown ones,
// and return up to 3 sorted by priority DESC.

export async function checkProactiveMessages(
  tenantId: string,
  userId: string,
  context: { route: string; moduleKey?: string },
): Promise<ProactiveMessage[]> {
  // Step 1: load all enabled rules for this tenant (global + tenant-scoped)
  const rules = await db
    .select()
    .from(aiSupportProactiveRules)
    .where(
      and(
        eq(aiSupportProactiveRules.enabled, 'true'),
        or(
          isNull(aiSupportProactiveRules.tenantId),
          eq(aiSupportProactiveRules.tenantId, tenantId),
        ),
      ),
    );

  // Step 2: filter by context (module_key + route_pattern matching)
  const contextMatched = rules.filter((rule) => {
    if (rule.moduleKey && rule.moduleKey !== context.moduleKey) return false;
    if (rule.routePattern && !context.route.startsWith(rule.routePattern)) return false;
    return true;
  });

  if (contextMatched.length === 0) return [];

  // Step 3: batch-load dismissals for all matching rules (eliminates N+1)
  const ruleIds = contextMatched.map((r) => r.id);
  const dismissals = await db
    .select()
    .from(aiSupportProactiveDismissals)
    .where(
      and(
        inArray(aiSupportProactiveDismissals.ruleId, ruleIds),
        eq(aiSupportProactiveDismissals.userId, userId),
        eq(aiSupportProactiveDismissals.tenantId, tenantId),
      ),
    );

  const dismissalByRuleId = new Map(dismissals.map((d) => [d.ruleId, d]));

  const now = Date.now();
  const messages: ProactiveMessage[] = [];

  for (const rule of contextMatched) {
    const dismissal = dismissalByRuleId.get(rule.id);
    if (dismissal) {
      const shownMs = dismissal.shownAt instanceof Date
        ? dismissal.shownAt.getTime()
        : new Date(dismissal.shownAt as string).getTime();
      const cooldownMs = rule.cooldownHours * 60 * 60 * 1000;
      if (now - shownMs < cooldownMs) {
        continue;
      }
    }

    messages.push({
      id: rule.id,
      messageTemplate: rule.messageTemplate,
      triggerType: rule.triggerType,
      moduleKey: rule.moduleKey,
      priority: rule.priority,
    });
  }

  // Step 4: sort by priority DESC, limit to 3
  messages.sort((a, b) => b.priority - a.priority);
  return messages.slice(0, 3);
}

// ── dismissProactiveMessage ───────────────────────────────────────────
// Upsert a dismissal record for the given rule + user + tenant.

export async function dismissProactiveMessage(
  ruleId: string,
  userId: string,
  tenantId: string,
): Promise<void> {
  await db
    .insert(aiSupportProactiveDismissals)
    .values({ ruleId, userId, tenantId, shownAt: new Date() })
    .onConflictDoUpdate({
      target: [
        aiSupportProactiveDismissals.ruleId,
        aiSupportProactiveDismissals.userId,
        aiSupportProactiveDismissals.tenantId,
      ],
      set: { shownAt: new Date() },
    });
}
