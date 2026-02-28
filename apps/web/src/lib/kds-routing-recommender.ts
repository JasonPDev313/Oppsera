/**
 * KDS Routing Recommender — Semantic keyword matching engine
 *
 * Analyzes department/sub-department names and suggests which KDS station type
 * each should route to. Uses keyword matching against known food service patterns.
 */

// ── Station-type keyword groups ───────────────────────────────────

const STATION_KEYWORDS: Record<string, string[]> = {
  grill: [
    'grill', 'grilled', 'bbq', 'barbecue', 'burger', 'steak', 'char',
    'broil', 'smoker', 'smoke', 'smoked', 'flame', 'sear', 'roast',
    'meat', 'ribs', 'brisket', 'chop', 'filet', 'tenderloin', 'wings',
    'chicken', 'poultry', 'rotisserie',
  ],
  bar: [
    'bar', 'beverage', 'drink', 'cocktail', 'beer', 'wine', 'spirit',
    'liquor', 'mixer', 'mocktail', 'juice', 'smoothie', 'coffee', 'tea',
    'espresso', 'latte', 'cappuccino', 'soda', 'soft drink', 'non-alc',
    'alcohol', 'draft', 'tap', 'bottle',
  ],
  fry: [
    'fry', 'fryer', 'fried', 'fries', 'deep fry', 'tempura', 'batter',
    'breaded', 'crispy', 'crunchy', 'nugget', 'tender', 'fish and chips',
    'onion ring', 'mozzarella stick', 'jalapeño popper',
  ],
  salad: [
    'salad', 'cold', 'raw', 'fresh', 'slaw', 'coleslaw', 'ceviche',
    'carpaccio', 'tartare', 'gazpacho', 'cold prep', 'garde manger',
    'charcuterie', 'cheese board', 'antipasto', 'crudité',
  ],
  dessert: [
    'dessert', 'pastry', 'cake', 'pie', 'ice cream', 'gelato', 'sorbet',
    'pudding', 'mousse', 'brownie', 'cookie', 'sweet', 'bakery', 'bake',
    'confection', 'chocolate', 'crème', 'tart', 'cheesecake', 'soufflé',
    'donut', 'doughnut', 'muffin', 'scone', 'waffle', 'pancake', 'crêpe',
  ],
  pizza: [
    'pizza', 'flatbread', 'calzone', 'stromboli', 'wood fire', 'brick oven',
    'neapolitan', 'margherita', 'pepperoni',
  ],
  prep: [
    'prep', 'sandwich', 'sub', 'wrap', 'burrito', 'taco', 'quesadilla',
    'panini', 'deli', 'soup', 'chowder', 'stew', 'broth', 'bisque',
    'noodle', 'pasta', 'rice', 'grain', 'bowl', 'poke', 'sushi', 'roll',
    'dim sum', 'dumpling', 'wonton', 'spring roll', 'egg roll',
    'appetizer', 'starter', 'side', 'sides', 'accompaniment',
    'hot prep', 'entrée', 'entree', 'main', 'platter',
    'breakfast', 'brunch', 'lunch', 'dinner',
  ],
  expo: [
    'expo', 'expeditor', 'pass', 'window', 'garnish', 'plating', 'finish',
  ],
};

// ── Types ─────────────────────────────────────────────────────────

export interface DepartmentForRecommendation {
  id: string;
  name: string;
  children?: Array<{ id: string; name: string; itemCount?: number }>;
  itemCount?: number;
}

export interface StationRecommendation {
  departmentId: string;
  departmentName: string;
  recommendedStationType: string;
  confidence: 'high' | 'medium' | 'low';
  matchedKeywords: string[];
  /** If the department has sub-departments, each gets its own recommendation */
  subDepartmentRecommendations?: Array<{
    id: string;
    name: string;
    recommendedStationType: string;
    confidence: 'high' | 'medium' | 'low';
    matchedKeywords: string[];
  }>;
}

// ── Core matching logic ───────────────────────────────────────────

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function scoreStationType(
  name: string,
  tokens: string[],
): { stationType: string; score: number; matched: string[] } {
  const lowerName = name.toLowerCase();
  let bestType = 'prep'; // default fallback
  let bestScore = 0;
  let bestMatched: string[] = [];

  for (const [stationType, keywords] of Object.entries(STATION_KEYWORDS)) {
    let score = 0;
    const matched: string[] = [];

    for (const keyword of keywords) {
      // Exact token match (strongest signal)
      if (tokens.includes(keyword)) {
        score += 3;
        matched.push(keyword);
        continue;
      }
      // Multi-word keyword substring match
      if (keyword.includes(' ') && lowerName.includes(keyword)) {
        score += 4; // multi-word matches are very specific
        matched.push(keyword);
        continue;
      }
      // Partial token match (weaker — e.g., "grilled" contains "grill")
      for (const token of tokens) {
        if (token.length >= 4 && (token.includes(keyword) || keyword.includes(token))) {
          score += 1.5;
          matched.push(keyword);
          break;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestType = stationType;
      bestMatched = matched;
    }
  }

  return { stationType: bestType, score: bestScore, matched: bestMatched };
}

function scoreToConfidence(score: number): 'high' | 'medium' | 'low' {
  if (score >= 6) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Generate KDS station routing recommendations for a set of departments.
 * Analyzes department names (and sub-department/item names) to suggest
 * which station type each should route to.
 */
export function recommendRoutingForDepartments(
  departments: DepartmentForRecommendation[],
): StationRecommendation[] {
  return departments.map((dept) => {
    const deptTokens = tokenize(dept.name);
    const deptResult = scoreStationType(dept.name, deptTokens);

    // If department has sub-departments, recommend per sub-department
    let subRecs: StationRecommendation['subDepartmentRecommendations'];
    if (dept.children && dept.children.length > 0) {
      subRecs = dept.children.map((sub) => {
        // Combine department + sub-department name for context
        const subTokens = tokenize(sub.name);
        const combinedTokens = [...new Set([...deptTokens, ...subTokens])];
        const combinedName = `${dept.name} ${sub.name}`;
        const subResult = scoreStationType(combinedName, combinedTokens);

        return {
          id: sub.id,
          name: sub.name,
          recommendedStationType: subResult.stationType,
          confidence: scoreToConfidence(subResult.score),
          matchedKeywords: [...new Set(subResult.matched)],
        };
      });
    }

    return {
      departmentId: dept.id,
      departmentName: dept.name,
      recommendedStationType: deptResult.stationType,
      confidence: scoreToConfidence(deptResult.score),
      matchedKeywords: [...new Set(deptResult.matched)],
      subDepartmentRecommendations: subRecs,
    };
  });
}

/**
 * Find the best matching station from a list based on station type.
 * Matches on stationType first, then on name similarity.
 */
export function findBestStation(
  stationType: string,
  stations: Array<{ id: string; name: string; displayName: string; stationType: string; isActive: boolean }>,
): { id: string; name: string } | null {
  if (stations.length === 0) return null;

  // Active stations only
  const active = stations.filter((s) => s.isActive);
  if (active.length === 0) return null;

  // Exact station type match
  const typeMatch = active.find((s) => s.stationType === stationType);
  if (typeMatch) return { id: typeMatch.id, name: typeMatch.displayName || typeMatch.name };

  // Name-based fuzzy match
  const stationTypeLabel = stationType.toLowerCase();
  const nameMatch = active.find((s) => {
    const sName = (s.displayName || s.name).toLowerCase();
    return sName.includes(stationTypeLabel) || stationTypeLabel.includes(sName);
  });
  if (nameMatch) return { id: nameMatch.id, name: nameMatch.displayName || nameMatch.name };

  // Fallback: first active station
  return { id: active[0]!.id, name: active[0]!.displayName || active[0]!.name };
}
