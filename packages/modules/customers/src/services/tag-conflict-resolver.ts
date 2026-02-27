/**
 * Tag Conflict Resolver Service
 *
 * Handles mutual exclusion between tags via `tags.conflicts_with[]` and `tags.priority`.
 * When a tag is about to be applied, check if the customer already has a conflicting tag.
 * The tag with lower priority number wins (lower = higher priority).
 */

import { eq, and, isNull, inArray } from 'drizzle-orm';
import { tags, customerTags } from '@oppsera/db';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConflictResolution {
  /** Whether the incoming tag should be applied */
  allowed: boolean;
  /** Tags that were auto-removed because the incoming tag won */
  removedTagIds: string[];
  /** Tags that blocked the incoming tag from being applied */
  blockingTagIds: string[];
  /** Human-readable explanation of the resolution */
  explanation: string;
}

interface TagForConflict {
  id: string;
  name: string;
  slug: string;
  priority: number;
  conflictsWith: string[];
  tagGroup: string | null;
}

// ── Conflict Resolver ─────────────────────────────────────────────────────────

/**
 * Check if applying a tag would conflict with existing customer tags.
 *
 * Resolution rules:
 * 1. Read `tags.conflicts_with[]` for the incoming tag
 * 2. Check if customer has any conflicting active tags (by slug)
 * 3. Use `tags.priority` to determine winner (lower number = higher priority)
 * 4. If incoming tag wins: return removedTagIds for the caller to remove
 * 5. If existing tag wins: block the incoming tag
 *
 * Also handles tag groups: tags in the same `tag_group` are mutually exclusive.
 */
export async function resolveTagConflicts(
  tx: any,
  tenantId: string,
  customerId: string,
  incomingTagId: string,
): Promise<ConflictResolution> {
  // 1. Fetch the incoming tag's conflict config
  const [incomingTag] = await tx
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      priority: tags.priority,
      conflictsWith: tags.conflictsWith,
      tagGroup: tags.tagGroup,
    })
    .from(tags)
    .where(and(eq(tags.tenantId, tenantId), eq(tags.id, incomingTagId)))
    .limit(1);

  if (!incomingTag) {
    return { allowed: true, removedTagIds: [], blockingTagIds: [], explanation: 'Tag not found, allowing.' };
  }

  const conflicts = (incomingTag.conflictsWith as string[] | null) ?? [];
  const tagGroup = incomingTag.tagGroup;

  // NOTE: Do NOT early-return when conflicts is empty — active tags may have
  // reverse conflicts that reference the incoming tag's slug.

  // 2. Get the customer's active tags
  const activeAssignments = await tx
    .select({
      customerTagId: customerTags.id,
      tagId: customerTags.tagId,
    })
    .from(customerTags)
    .where(
      and(
        eq(customerTags.tenantId, tenantId),
        eq(customerTags.customerId, customerId),
        isNull(customerTags.removedAt),
      ),
    );

  if (activeAssignments.length === 0) {
    return { allowed: true, removedTagIds: [], blockingTagIds: [], explanation: 'Customer has no active tags.' };
  }

  const activeTagIds = activeAssignments.map((a: { tagId: string }) => a.tagId);

  // 3. Fetch details for all active tags
  const activeTags: TagForConflict[] = await tx
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      priority: tags.priority,
      conflictsWith: tags.conflictsWith,
      tagGroup: tags.tagGroup,
    })
    .from(tags)
    .where(
      and(
        eq(tags.tenantId, tenantId),
        inArray(tags.id, activeTagIds),
      ),
    );

  // 4. Identify conflicting tags
  const conflictingTags: TagForConflict[] = [];

  for (const activeTag of activeTags) {
    // Skip self (shouldn't happen but defensive)
    if (activeTag.id === incomingTagId) continue;

    let isConflicting = false;

    // Check explicit conflicts_with (by slug)
    if (conflicts.includes(activeTag.slug)) {
      isConflicting = true;
    }

    // Check reverse: does the active tag list the incoming tag as a conflict?
    const activeConflicts = (activeTag.conflictsWith as string[] | null) ?? [];
    if (activeConflicts.includes(incomingTag.slug)) {
      isConflicting = true;
    }

    // Check tag group mutual exclusion
    if (tagGroup && activeTag.tagGroup === tagGroup) {
      isConflicting = true;
    }

    if (isConflicting) {
      conflictingTags.push(activeTag);
    }
  }

  if (conflictingTags.length === 0) {
    return { allowed: true, removedTagIds: [], blockingTagIds: [], explanation: 'No conflicting active tags found.' };
  }

  // 5. Resolve by priority (lower number = higher priority)
  const removedTagIds: string[] = [];
  const blockingTagIds: string[] = [];

  for (const conflicting of conflictingTags) {
    if (incomingTag.priority < conflicting.priority) {
      // Incoming wins — existing tag should be removed
      removedTagIds.push(conflicting.id);
    } else if (incomingTag.priority > conflicting.priority) {
      // Existing wins — block incoming
      blockingTagIds.push(conflicting.id);
    } else {
      // Same priority — existing tag wins (tie-break: incumbent advantage)
      blockingTagIds.push(conflicting.id);
    }
  }

  // If ANY existing tag blocks, the incoming tag is not allowed
  if (blockingTagIds.length > 0) {
    const blockingNames = conflictingTags
      .filter((t) => blockingTagIds.includes(t.id))
      .map((t) => t.name);
    return {
      allowed: false,
      removedTagIds: [],
      blockingTagIds,
      explanation: `Blocked by higher-priority tag(s): ${blockingNames.join(', ')}`,
    };
  }

  // All conflicts resolved in favor of incoming tag
  const removedNames = conflictingTags
    .filter((t) => removedTagIds.includes(t.id))
    .map((t) => t.name);
  return {
    allowed: true,
    removedTagIds,
    blockingTagIds: [],
    explanation: `Incoming tag wins over: ${removedNames.join(', ')}`,
  };
}
