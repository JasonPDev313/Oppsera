import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { CourseRuleScopeType } from '../validation';

// ── Types ───────────────────────────────────────────────────────────

export interface EffectiveCourseRule {
  defaultCourseNumber: number | null;
  allowedCourseNumbers: number[] | null;
  lockCourse: boolean;
}

export interface ResolvedCourseRule {
  effectiveRule: EffectiveCourseRule;
  source: CourseRuleScopeType | 'none';
  /** Which scope provided the defaultCourseNumber */
  defaultSource: CourseRuleScopeType | 'none';
}

interface HierarchyIds {
  itemId: string;
  categoryId: string | null;
  subDepartmentId: string | null;
  departmentId: string | null;
}

interface RawRule {
  scope_type: string;
  default_course_number: number | null;
  allowed_course_numbers: number[] | null;
  lock_course: boolean;
}

// ── Resolve hierarchy from item → category → sub-dept → dept ────────

export async function resolveItemHierarchy(
  tenantId: string,
  itemId: string,
  categoryId?: string,
): Promise<HierarchyIds> {
  const rows = await withTenant(tenantId, async (tx) => {
    return tx.execute(
      sql`SELECT ci.id AS item_id,
                 ci.category_id,
                 c1.parent_id AS sub_department_id,
                 c2.parent_id AS department_id
          FROM catalog_items ci
          LEFT JOIN catalog_categories c1 ON c1.id = ci.category_id
          LEFT JOIN catalog_categories c2 ON c2.id = c1.parent_id
          WHERE ci.tenant_id = ${tenantId}
            AND ci.id = ${itemId}
          LIMIT 1`,
    );
  });

  const arr = Array.from(rows as Iterable<Record<string, unknown>>);
  if (arr.length === 0) {
    return {
      itemId,
      categoryId: categoryId ?? null,
      subDepartmentId: null,
      departmentId: null,
    };
  }

  const r = arr[0]!;
  return {
    itemId,
    categoryId: (r.category_id as string) ?? categoryId ?? null,
    subDepartmentId: (r.sub_department_id as string) ?? null,
    departmentId: (r.department_id as string) ?? null,
  };
}

// ── Category hierarchy resolver (for preview without an item) ────────

/**
 * Walk catalog_categories parent chain from a categoryId to resolve
 * sub-department and department IDs. Used for new-item preview mode.
 */
export async function resolveCategoryHierarchy(
  tenantId: string,
  categoryId: string,
): Promise<{ categoryId: string; subDepartmentId: string | null; departmentId: string | null }> {
  const rows = await withTenant(tenantId, async (tx) => {
    return tx.execute(
      sql`SELECT c1.id AS category_id,
                 c1.parent_id AS sub_department_id,
                 c2.parent_id AS department_id
          FROM catalog_categories c1
          LEFT JOIN catalog_categories c2 ON c2.id = c1.parent_id AND c2.tenant_id = c1.tenant_id
          WHERE c1.tenant_id = ${tenantId}
            AND c1.id = ${categoryId}
          LIMIT 1`,
    );
  });

  const arr = Array.from(rows as Iterable<Record<string, unknown>>);
  if (arr.length === 0) {
    return { categoryId, subDepartmentId: null, departmentId: null };
  }

  const r = arr[0]!;
  return {
    categoryId,
    subDepartmentId: (r.sub_department_id as string) ?? null,
    departmentId: (r.department_id as string) ?? null,
  };
}

// ── Single-item resolver ────────────────────────────────────────────

const SCOPE_PRECEDENCE: CourseRuleScopeType[] = ['item', 'category', 'sub_department', 'department'];

export async function resolveCourseRule(
  tenantId: string,
  locationId: string,
  itemId: string,
  categoryId?: string,
): Promise<ResolvedCourseRule> {
  const hierarchy = await resolveItemHierarchy(tenantId, itemId, categoryId);
  return resolveCourseRuleFromHierarchy(tenantId, locationId, hierarchy);
}

export async function resolveCourseRuleFromHierarchy(
  tenantId: string,
  locationId: string,
  hierarchy: HierarchyIds,
): Promise<ResolvedCourseRule> {
  // Build scope IDs to query (skip nulls)
  const scopeEntries: Array<{ type: CourseRuleScopeType; id: string }> = [];
  scopeEntries.push({ type: 'item', id: hierarchy.itemId });
  if (hierarchy.categoryId) scopeEntries.push({ type: 'category', id: hierarchy.categoryId });
  if (hierarchy.subDepartmentId) scopeEntries.push({ type: 'sub_department', id: hierarchy.subDepartmentId });
  if (hierarchy.departmentId) scopeEntries.push({ type: 'department', id: hierarchy.departmentId });

  if (scopeEntries.length === 0) {
    return {
      effectiveRule: { defaultCourseNumber: null, allowedCourseNumbers: null, lockCourse: false },
      source: 'none',
      defaultSource: 'none',
    };
  }

  const scopeIds = scopeEntries.map((e) => e.id);

  const rows = await withTenant(tenantId, async (tx) => {
    return tx.execute(
      sql`SELECT scope_type, default_course_number, allowed_course_numbers, lock_course
          FROM fnb_course_rules
          WHERE tenant_id = ${tenantId}
            AND location_id = ${locationId}
            AND is_active = true
            AND scope_id IN (${sql.join(scopeIds.map((id) => sql`${id}`), sql`, `)})`,
    );
  });

  const rulesByScope = new Map<string, RawRule>();
  for (const r of Array.from(rows as Iterable<Record<string, unknown>>)) {
    rulesByScope.set(r.scope_type as string, {
      scope_type: r.scope_type as string,
      default_course_number: r.default_course_number as number | null,
      allowed_course_numbers: r.allowed_course_numbers as number[] | null,
      lock_course: r.lock_course as boolean,
    });
  }

  if (rulesByScope.size === 0) {
    return {
      effectiveRule: { defaultCourseNumber: null, allowedCourseNumbers: null, lockCourse: false },
      source: 'none',
      defaultSource: 'none',
    };
  }

  return mergeRules(rulesByScope);
}

// ── Merge rules by precedence ───────────────────────────────────────

function mergeRules(rulesByScope: Map<string, RawRule>): ResolvedCourseRule {
  let defaultCourseNumber: number | null = null;
  let defaultSource: CourseRuleScopeType | 'none' = 'none';
  let allowedCourseNumbers: number[] | null = null;
  let lockCourse = false;
  let highestSource: CourseRuleScopeType | 'none' = 'none';

  // Apply in precedence order: item > category > sub_department > department
  // Most specific scope that defines a field wins
  for (const scopeType of SCOPE_PRECEDENCE) {
    const rule = rulesByScope.get(scopeType);
    if (!rule) continue;

    if (highestSource === 'none') highestSource = scopeType as CourseRuleScopeType;

    if (defaultCourseNumber === null && rule.default_course_number !== null) {
      defaultCourseNumber = rule.default_course_number;
      defaultSource = scopeType as CourseRuleScopeType;
    }

    if (allowedCourseNumbers === null && rule.allowed_course_numbers !== null) {
      allowedCourseNumbers = rule.allowed_course_numbers;
    }

    // lockCourse is additive: true at ANY level means locked
    if (rule.lock_course) lockCourse = true;
  }

  return {
    effectiveRule: { defaultCourseNumber, allowedCourseNumbers, lockCourse },
    source: highestSource,
    defaultSource,
  };
}

// ── Batch resolver for POS catalog ──────────────────────────────────

export interface BatchCourseRuleResult {
  [itemId: string]: ResolvedCourseRule;
}

/**
 * Batch-resolve course rules for all active F&B items at a location.
 * Used at POS startup to populate the course rules map.
 */
export async function batchResolveCourseRules(
  tenantId: string,
  locationId: string,
): Promise<BatchCourseRuleResult> {
  // Step 1: Get all items with hierarchy
  const itemRows = await withTenant(tenantId, async (tx) => {
    return tx.execute(
      sql`SELECT ci.id AS item_id,
                 ci.category_id,
                 c1.parent_id AS sub_department_id,
                 c2.parent_id AS department_id
          FROM catalog_items ci
          LEFT JOIN catalog_categories c1 ON c1.id = ci.category_id
          LEFT JOIN catalog_categories c2 ON c2.id = c1.parent_id
          WHERE ci.tenant_id = ${tenantId}
            AND ci.item_type IN ('food', 'beverage')
            AND ci.archived_at IS NULL`,
    );
  });

  const items = Array.from(itemRows as Iterable<Record<string, unknown>>);
  if (items.length === 0) return {};

  // Step 2: Get all active course rules for this location
  const ruleRows = await withTenant(tenantId, async (tx) => {
    return tx.execute(
      sql`SELECT scope_type, scope_id, default_course_number, allowed_course_numbers, lock_course
          FROM fnb_course_rules
          WHERE tenant_id = ${tenantId}
            AND location_id = ${locationId}
            AND is_active = true`,
    );
  });

  const rulesByKey = new Map<string, RawRule>();
  for (const r of Array.from(ruleRows as Iterable<Record<string, unknown>>)) {
    // Key by scope_type:scope_id to avoid cross-scope ID collisions
    const key = `${r.scope_type as string}:${r.scope_id as string}`;
    rulesByKey.set(key, {
      scope_type: r.scope_type as string,
      default_course_number: r.default_course_number as number | null,
      allowed_course_numbers: r.allowed_course_numbers as number[] | null,
      lock_course: r.lock_course as boolean,
    });
  }

  if (rulesByKey.size === 0) {
    // No rules defined — return empty effective rules for all items
    const result: BatchCourseRuleResult = {};
    for (const item of items) {
      result[item.item_id as string] = {
        effectiveRule: { defaultCourseNumber: null, allowedCourseNumbers: null, lockCourse: false },
        source: 'none',
        defaultSource: 'none',
      };
    }
    return result;
  }

  // Step 3: Resolve each item against its hierarchy
  const result: BatchCourseRuleResult = {};
  for (const item of items) {
    const hierarchy: HierarchyIds = {
      itemId: item.item_id as string,
      categoryId: (item.category_id as string) ?? null,
      subDepartmentId: (item.sub_department_id as string) ?? null,
      departmentId: (item.department_id as string) ?? null,
    };

    const scopeIds = [
      { type: 'item' as CourseRuleScopeType, id: hierarchy.itemId },
      ...(hierarchy.categoryId ? [{ type: 'category' as CourseRuleScopeType, id: hierarchy.categoryId }] : []),
      ...(hierarchy.subDepartmentId ? [{ type: 'sub_department' as CourseRuleScopeType, id: hierarchy.subDepartmentId }] : []),
      ...(hierarchy.departmentId ? [{ type: 'department' as CourseRuleScopeType, id: hierarchy.departmentId }] : []),
    ];

    const itemRulesByScope = new Map<string, RawRule>();
    for (const entry of scopeIds) {
      const rule = rulesByKey.get(`${entry.type}:${entry.id}`);
      if (rule) itemRulesByScope.set(entry.type, rule);
    }

    if (itemRulesByScope.size === 0) {
      result[hierarchy.itemId] = {
        effectiveRule: { defaultCourseNumber: null, allowedCourseNumbers: null, lockCourse: false },
        source: 'none',
        defaultSource: 'none',
      };
    } else {
      result[hierarchy.itemId] = mergeRules(itemRulesByScope);
    }
  }

  return result;
}
