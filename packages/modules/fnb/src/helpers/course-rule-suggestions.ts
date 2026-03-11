import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

// ── Types ───────────────────────────────────────────────────────────

export interface CourseSuggestion {
  scopeType: 'department' | 'sub_department' | 'category';
  scopeId: string;
  scopeName: string;
  suggestedCourseNumber: number;
  suggestedCourseName: string;
  confidence: number; // 0-1
  reason: string;
  /** How many items are under this scope */
  itemCount: number;
  /** Whether a rule already exists for this scope */
  existingRule: boolean;
}

export interface SuggestCourseRulesInput {
  tenantId: string;
  locationId: string;
}

// ── Synonym Dictionary ──────────────────────────────────────────────

interface CoursePattern {
  courseNumber: number;
  keywords: string[];
  /** Weight multiplier for this pattern (higher = more confident) */
  weight: number;
}

const COURSE_PATTERNS: CoursePattern[] = [
  // Course 1 — Appetizers/Starters
  {
    courseNumber: 1,
    keywords: [
      'appetizer', 'appetizers', 'apps', 'starter', 'starters',
      'antipasto', 'antipasti', 'small plate', 'small plates',
      'amuse', 'amuse-bouche', 'hors d\'oeuvre', 'hors d\'oeuvres',
      'soup', 'soups', 'salad', 'salads', 'bread', 'breads',
      'shareables', 'shared', 'snack', 'snacks', 'bites',
      'tapas', 'mezze', 'dim sum', 'dumplings',
      'bruschetta', 'ceviche', 'carpaccio',
    ],
    weight: 1.0,
  },
  // Course 2 — Entrees/Mains
  {
    courseNumber: 2,
    keywords: [
      'entree', 'entrees', 'entrée', 'entrées', 'main', 'mains',
      'main course', 'main courses', 'plat principal',
      'steak', 'steaks', 'seafood', 'fish', 'chicken', 'pork', 'lamb',
      'pasta', 'pizza', 'burger', 'burgers', 'sandwich', 'sandwiches',
      'grill', 'grilled', 'roasted', 'baked',
      'protein', 'proteins', 'meat', 'meats',
      'hot food', 'hot kitchen', 'kitchen',
    ],
    weight: 1.0,
  },
  // Course 3 — Desserts
  {
    courseNumber: 3,
    keywords: [
      'dessert', 'desserts', 'sweet', 'sweets', 'pastry', 'pastries',
      'cake', 'cakes', 'pie', 'pies', 'ice cream', 'gelato', 'sorbet',
      'chocolate', 'pudding', 'puddings', 'crème brûlée',
      'cheesecake', 'tiramisu', 'mousse', 'tart', 'tarts',
      'after dinner', 'dolce', 'dolci',
    ],
    weight: 1.0,
  },
  // Beverages — typically course 1 (served immediately)
  {
    courseNumber: 1,
    keywords: [
      'beverage', 'beverages', 'drink', 'drinks', 'bar',
      'cocktail', 'cocktails', 'wine', 'wines', 'beer', 'beers',
      'spirit', 'spirits', 'liquor', 'non-alcoholic',
      'soft drink', 'soda', 'juice', 'water', 'coffee', 'tea',
      'espresso', 'latte', 'cappuccino',
    ],
    weight: 0.7, // lower confidence — beverage coursing is less predictable
  },
  // Side dishes — typically same course as entrees
  {
    courseNumber: 2,
    keywords: [
      'side', 'sides', 'side dish', 'side dishes',
      'accompaniment', 'accompaniments',
      'vegetable', 'vegetables', 'fries', 'rice', 'potato', 'potatoes',
    ],
    weight: 0.6, // sides might go with any course
  },
];

// ── String Similarity (Dice coefficient) ────────────────────────────

function bigrams(str: string): Set<string> {
  const s = str.toLowerCase();
  const result = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) {
    result.add(s.slice(i, i + 2));
  }
  return result;
}

function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigramsA = bigrams(a);
  const bigramsB = bigrams(b);
  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }
  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

// ── Core Matching Logic ─────────────────────────────────────────────

interface MatchResult {
  courseNumber: number;
  confidence: number;
  reason: string;
}

function matchNameToCourse(
  name: string,
  courseDefinitions: Map<number, string>,
): MatchResult | null {
  const normalized = name.toLowerCase().trim();
  let bestMatch: MatchResult | null = null;

  // 1. Exact keyword match
  for (const pattern of COURSE_PATTERNS) {
    for (const keyword of pattern.keywords) {
      if (normalized === keyword || normalized.includes(keyword)) {
        const courseName = courseDefinitions.get(pattern.courseNumber) ?? `Course ${pattern.courseNumber}`;
        const confidence = normalized === keyword
          ? 0.95 * pattern.weight
          : 0.80 * pattern.weight;

        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = {
            courseNumber: pattern.courseNumber,
            confidence: Math.min(confidence, 1.0),
            reason: `Name contains keyword "${keyword}" → ${courseName}`,
          };
        }
      }
    }
  }

  // 2. Fuzzy match (Dice coefficient) against keywords
  if (!bestMatch || bestMatch.confidence < 0.7) {
    for (const pattern of COURSE_PATTERNS) {
      for (const keyword of pattern.keywords) {
        const similarity = diceCoefficient(normalized, keyword);
        if (similarity >= 0.5) {
          const confidence = similarity * 0.7 * pattern.weight;
          const courseName = courseDefinitions.get(pattern.courseNumber) ?? `Course ${pattern.courseNumber}`;
          if (!bestMatch || confidence > bestMatch.confidence) {
            bestMatch = {
              courseNumber: pattern.courseNumber,
              confidence: Math.min(confidence, 1.0),
              reason: `Name similar to "${keyword}" (${Math.round(similarity * 100)}%) → ${courseName}`,
            };
          }
        }
      }
    }
  }

  // 3. Match against course definition names themselves
  for (const [courseNumber, courseName] of courseDefinitions) {
    const similarity = diceCoefficient(normalized, courseName.toLowerCase());
    if (similarity >= 0.4) {
      const confidence = similarity * 0.85;
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = {
          courseNumber,
          confidence: Math.min(confidence, 1.0),
          reason: `Name matches course definition "${courseName}" (${Math.round(similarity * 100)}%)`,
        };
      }
    }
    // Also check substring containment
    if (normalized.includes(courseName.toLowerCase()) || courseName.toLowerCase().includes(normalized)) {
      const confidence = 0.90;
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = {
          courseNumber,
          confidence,
          reason: `Name matches course definition "${courseName}"`,
        };
      }
    }
  }

  return bestMatch;
}

// ── Main Suggestion Function ────────────────────────────────────────

/**
 * Suggest course rules for departments, sub-departments, and categories
 * based on name matching against known culinary patterns.
 *
 * Uses a combination of:
 * - Exact keyword matching against a culinary synonym dictionary
 * - Fuzzy string matching (Dice coefficient) for near-matches
 * - Course definition name matching
 * - Historical ordering patterns (if available)
 */
export async function suggestCourseRules(
  input: SuggestCourseRulesInput,
): Promise<CourseSuggestion[]> {
  const { tenantId, locationId } = input;

  // 1. Fetch course definitions for this location
  const courseDefinitions = new Map<number, string>();
  const defRows = await withTenant(tenantId, async (tx) => {
    return tx.execute(
      sql`SELECT course_number, course_name FROM fnb_course_definitions
          WHERE tenant_id = ${tenantId} AND location_id = ${locationId}
            AND is_active = true
          ORDER BY course_number`,
    );
  });
  for (const row of Array.from(defRows as Iterable<Record<string, unknown>>)) {
    courseDefinitions.set(Number(row.course_number), String(row.course_name));
  }

  // If no course definitions, use defaults
  if (courseDefinitions.size === 0) {
    courseDefinitions.set(1, 'Course 1');
    courseDefinitions.set(2, 'Course 2');
    courseDefinitions.set(3, 'Course 3');
  }

  // 2. Fetch all catalog hierarchy nodes with item counts
  const hierarchyRows = await withTenant(tenantId, async (tx) => {
    return tx.execute(sql`
      WITH item_counts AS (
        SELECT
          ci.category_id,
          COUNT(*)::int AS item_count
        FROM catalog_items ci
        WHERE ci.tenant_id = ${tenantId}
          AND ci.item_type IN ('food', 'beverage')
          AND ci.archived_at IS NULL
        GROUP BY ci.category_id
      )
      SELECT
        cc.id,
        cc.name,
        cc.parent_id,
        COALESCE(ic.item_count, 0) AS direct_item_count,
        CASE
          WHEN cc.parent_id IS NULL THEN 'department'
          WHEN EXISTS (SELECT 1 FROM catalog_categories c2 WHERE c2.parent_id = cc.id AND c2.tenant_id = cc.tenant_id) THEN 'sub_department'
          ELSE 'category'
        END AS scope_type
      FROM catalog_categories cc
      LEFT JOIN item_counts ic ON ic.category_id = cc.id
      WHERE cc.tenant_id = ${tenantId}
      ORDER BY cc.name
    `);
  });

  const nodes = Array.from(hierarchyRows as Iterable<Record<string, unknown>>);

  // 3. Fetch existing course rules for this location
  const existingRuleRows = await withTenant(tenantId, async (tx) => {
    return tx.execute(sql`
      SELECT scope_type, scope_id FROM fnb_course_rules
      WHERE tenant_id = ${tenantId} AND location_id = ${locationId} AND is_active = true
    `);
  });

  const existingRules = new Set<string>();
  for (const row of Array.from(existingRuleRows as Iterable<Record<string, unknown>>)) {
    existingRules.add(`${row.scope_type}:${row.scope_id}`);
  }

  // 4. Compute item counts including children for departments/sub-departments
  const childItemCounts = new Map<string, number>();
  for (const node of nodes) {
    const id = node.id as string;
    const directCount = Number(node.direct_item_count ?? 0);
    childItemCounts.set(id, directCount);
  }
  // Add child counts to parents
  for (const node of nodes) {
    if (node.parent_id) {
      const parentCount = childItemCounts.get(node.parent_id as string) ?? 0;
      const childCount = childItemCounts.get(node.id as string) ?? 0;
      childItemCounts.set(node.parent_id as string, parentCount + childCount);
    }
  }

  // 5. Generate suggestions
  const suggestions: CourseSuggestion[] = [];

  for (const node of nodes) {
    const scopeType = node.scope_type as 'department' | 'sub_department' | 'category';
    const scopeId = node.id as string;
    const scopeName = node.name as string;
    const itemCount = childItemCounts.get(scopeId) ?? 0;

    // Skip scopes with no items
    if (itemCount === 0) continue;

    const match = matchNameToCourse(scopeName, courseDefinitions);
    if (!match || match.confidence < 0.3) continue;

    const existingRule = existingRules.has(`${scopeType}:${scopeId}`);

    suggestions.push({
      scopeType,
      scopeId,
      scopeName,
      suggestedCourseNumber: match.courseNumber,
      suggestedCourseName: courseDefinitions.get(match.courseNumber) ?? `Course ${match.courseNumber}`,
      confidence: Math.round(match.confidence * 100) / 100,
      reason: match.reason,
      itemCount,
      existingRule,
    });
  }

  // Sort by confidence descending, then by item count descending
  suggestions.sort((a, b) => b.confidence - a.confidence || b.itemCount - a.itemCount);

  return suggestions;
}
