/**
 * US states and state placeholder constants for COA template name resolution.
 */

export const STATE_PLACEHOLDER = '[STATE_NAME]';

/** All 50 US states + DC. Maps abbreviation → full name. */
export const US_STATES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  DC: 'District of Columbia',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
};

/** Reverse lookup: full name (lowercase) → abbreviation */
const NAME_TO_ABBREV: Record<string, string> = {};
for (const [abbrev, name] of Object.entries(US_STATES)) {
  NAME_TO_ABBREV[name.toLowerCase()] = abbrev;
}

/**
 * Resolve a state string (abbreviation or full name) to { name, abbrev }.
 * Returns null if not a valid US state.
 */
export function resolveState(input: string): { name: string; abbrev: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Try as abbreviation
  const upper = trimmed.toUpperCase();
  if (US_STATES[upper]) {
    return { name: US_STATES[upper]!, abbrev: upper };
  }

  // Try as full name
  const lower = trimmed.toLowerCase();
  const abbrev = NAME_TO_ABBREV[lower];
  if (abbrev) {
    return { name: US_STATES[abbrev]!, abbrev };
  }

  return null;
}

/** Check if a string is a valid US state name or abbreviation. */
export function isValidStateName(input: string): boolean {
  return resolveState(input) !== null;
}

/**
 * Tax-context keywords that make abbreviation matching safe.
 * We only match 2-letter abbreviations when they appear near these words
 * to avoid false positives (e.g., "IN" as a preposition).
 */
export const TAX_CONTEXT_KEYWORDS = [
  'tax',
  'payable',
  'withholding',
  'unemployment',
  'sales',
  'use',
  'excise',
  'income',
  'franchise',
  'filing',
  'remittance',
  'jurisdiction',
];
