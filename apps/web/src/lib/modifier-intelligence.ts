/**
 * Smart modifier group classification.
 *
 * Detects modifier groups where "None / Extra / On Side" instructions
 * don't make logical sense (e.g., temperature/doneness, size selections).
 *
 * These are "exclusive choice" groups where you pick an attribute value,
 * not "additive" groups where you add/remove toppings.
 */

// ── Known Exclusive-Choice Patterns ────────────────────────────────

const DONENESS_PATTERNS = new Set([
  'rare', 'medium rare', 'medium-rare', 'med rare', 'mr',
  'medium', 'med',
  'medium well', 'medium-well', 'med well', 'mw',
  'well done', 'well-done', 'well',
  'blue', 'blue rare', 'pittsburgh', 'black and blue', 'black & blue',
  'chicago',
]);

const SIZE_PATTERNS = new Set([
  'small', 'sm', 'regular', 'reg',
  'medium', 'med',
  'large', 'lg', 'extra large', 'xl', 'xxl',
  'tall', 'grande', 'venti', 'trenta',
  'short', 'petit', 'half', 'full',
  '6 inch', '6"', '12 inch', '12"', 'footlong',
  '8 oz', '10 oz', '12 oz', '16 oz', '20 oz', '24 oz', '32 oz',
  'single', 'double', 'triple',
  'kid', 'kids', 'child',
]);

const BREAD_PATTERNS = new Set([
  'white', 'wheat', 'whole wheat', 'rye', 'pumpernickel',
  'sourdough', 'brioche', 'ciabatta', 'focaccia',
  'wrap', 'tortilla', 'pita', 'flatbread', 'naan',
  'english muffin', 'croissant', 'bagel', 'biscuit',
  'gluten free', 'gluten-free', 'gf',
  'lettuce wrap', 'no bun',
  'multigrain', 'marble rye', 'texas toast',
  'hoagie', 'sub roll', 'kaiser',
]);

const COOKING_METHOD_PATTERNS = new Set([
  'grilled', 'fried', 'deep fried', 'pan fried',
  'baked', 'roasted', 'broiled', 'steamed',
  'sauteed', 'sautéed', 'blackened', 'cajun',
  'pan seared', 'pan-seared', 'seared',
  'poached', 'smoked', 'braised',
  'raw', 'tartare',
]);

const EGG_STYLE_PATTERNS = new Set([
  'scrambled', 'over easy', 'over-easy',
  'over medium', 'over-medium',
  'over hard', 'over-hard',
  'sunny side up', 'sunny-side-up', 'sunny side',
  'poached', 'soft boiled', 'hard boiled',
  'basted', 'fried',
]);

const EXCLUSIVE_CHOICE_PATTERNS: Record<string, Set<string>> = {
  doneness: DONENESS_PATTERNS,
  size: SIZE_PATTERNS,
  bread: BREAD_PATTERNS,
  cooking_method: COOKING_METHOD_PATTERNS,
  egg_style: EGG_STYLE_PATTERNS,
};

/** Group name hints that strongly suggest exclusive-choice */
const GROUP_NAME_HINTS: Record<string, string[]> = {
  doneness: ['temperature', 'temp', 'doneness', 'cook temp', 'how would you like', 'meat temp', 'steak temp'],
  size: ['size', 'portion'],
  bread: ['bread', 'bun', 'roll', 'toast'],
  cooking_method: ['preparation', 'prep', 'cooking', 'cook method', 'style'],
  egg_style: ['egg', 'eggs', 'egg style', 'egg prep'],
};

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Normalize an option name for pattern matching.
 * Lowercases, trims, collapses whitespace, strips punctuation except & and -.
 */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s&'-]/g, '');
}

/** Minimum fraction of options that must match a category to trigger suppression */
const MATCH_THRESHOLD = 0.6;

/** When the group name also matches a category hint, lower the threshold */
const MATCH_THRESHOLD_WITH_NAME_HINT = 0.4;

/** Minimum number of options in the group to even bother checking */
const MIN_OPTIONS = 2;

// ── Public API ──────────────────────────────────────────────────────

export interface ModifierGroupClassification {
  /** Whether None/Extra/On Side instructions should be suppressed */
  suppressInstructions: boolean;
  /** Which category was detected, if any */
  detectedCategory: string | null;
  /** Fraction of options that matched the category */
  matchRatio: number;
}

/**
 * Analyze a modifier group's options to determine if instruction buttons
 * (None / Extra / On Side) should be suppressed.
 *
 * Returns true for "exclusive choice" groups like temperature/doneness,
 * size selections, bread types, cooking methods, and egg styles — where
 * these instructions don't make logical sense.
 *
 * Detection is content-based: it looks at the option names, not the
 * group name. The group name is used as a secondary hint to lower the
 * matching threshold.
 *
 * @example
 * ```ts
 * // A doneness group — suppress instructions
 * classifyModifierGroup('Temperature', [
 *   { name: 'Rare' }, { name: 'Medium Rare' },
 *   { name: 'Medium' }, { name: 'Well Done' }
 * ])
 * // → { suppressInstructions: true, detectedCategory: 'doneness', matchRatio: 1.0 }
 *
 * // A toppings group — show instructions normally
 * classifyModifierGroup('Toppings', [
 *   { name: 'Lettuce' }, { name: 'Tomato' },
 *   { name: 'Onion' }, { name: 'Pickles' }
 * ])
 * // → { suppressInstructions: false, detectedCategory: null, matchRatio: 0 }
 * ```
 */
export function classifyModifierGroup(
  groupName: string,
  options: Array<{ name: string }>,
): ModifierGroupClassification {
  if (options.length < MIN_OPTIONS) {
    return { suppressInstructions: false, detectedCategory: null, matchRatio: 0 };
  }

  const normalizedGroupName = normalize(groupName);
  const normalizedOptions = options.map((o) => normalize(o.name));

  let bestCategory: string | null = null;
  let bestRatio = 0;

  for (const [category, patterns] of Object.entries(EXCLUSIVE_CHOICE_PATTERNS)) {
    // Count how many options match this category
    let matchCount = 0;
    for (const optName of normalizedOptions) {
      if (patterns.has(optName)) {
        matchCount++;
      }
    }

    const ratio = matchCount / options.length;

    // Check if group name also hints at this category (lower threshold)
    const nameHints = GROUP_NAME_HINTS[category] ?? [];
    const nameMatches = nameHints.some((hint) => normalizedGroupName.includes(hint));

    const effectiveThreshold = nameMatches
      ? MATCH_THRESHOLD_WITH_NAME_HINT
      : MATCH_THRESHOLD;

    if (ratio >= effectiveThreshold && ratio > bestRatio) {
      bestRatio = ratio;
      bestCategory = category;
    }
  }

  return {
    suppressInstructions: bestCategory !== null,
    detectedCategory: bestCategory,
    matchRatio: bestRatio,
  };
}

/**
 * Quick check: should instructions be suppressed for this modifier group?
 *
 * @example
 * ```ts
 * shouldSuppressInstructions('Doneness', [
 *   { name: 'Rare' }, { name: 'Medium' }, { name: 'Well Done' }
 * ])
 * // → true
 * ```
 */
export function shouldSuppressInstructions(
  groupName: string,
  options: Array<{ name: string }>,
): boolean {
  return classifyModifierGroup(groupName, options).suppressInstructions;
}
