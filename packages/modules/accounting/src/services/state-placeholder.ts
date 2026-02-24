/**
 * State placeholder engine for COA account names.
 *
 * Template account names may contain `[STATE_NAME]` which gets resolved
 * to the actual state name during bootstrap or CSV import.
 *
 * Also detects hardcoded state names in account names and converts them
 * to placeholders for template normalization.
 */
import {
  STATE_PLACEHOLDER,
  US_STATES,
  TAX_CONTEXT_KEYWORDS,
} from './state-constants';

export { resolveState, isValidStateName } from './state-constants';
export { STATE_PLACEHOLDER } from './state-constants';

/** Replace all occurrences of [STATE_NAME] with the actual state name. */
export function replaceStatePlaceholder(accountName: string, stateName: string): string {
  if (!stateName || !accountName.includes(STATE_PLACEHOLDER)) {
    return accountName;
  }
  return accountName.replaceAll(STATE_PLACEHOLDER, stateName);
}

/**
 * Detect a hardcoded state name in an account name and convert to placeholder.
 *
 * Full state names (e.g., "Michigan") are always detected.
 * Two-letter abbreviations (e.g., "MI") are only detected in tax context
 * to avoid false positives like "IN" (preposition) or "OR" (conjunction).
 */
export function convertHardcodedStateToPlaceholder(name: string): {
  converted: string;
  stateDetected: string | null;
} {
  // 1. Try full state names first (longest match wins)
  const fullNames = Object.values(US_STATES).sort((a, b) => b.length - a.length);
  for (const fullName of fullNames) {
    const regex = new RegExp(`\\b${escapeRegex(fullName)}\\b`, 'i');
    if (regex.test(name)) {
      return {
        converted: name.replace(regex, STATE_PLACEHOLDER),
        stateDetected: fullName,
      };
    }
  }

  // 2. Try abbreviations only in tax-context
  const lowerName = name.toLowerCase();
  const hasTaxContext = TAX_CONTEXT_KEYWORDS.some((kw) => lowerName.includes(kw));

  if (hasTaxContext) {
    for (const [abbrev, fullName] of Object.entries(US_STATES)) {
      // Match abbreviation as a word boundary (e.g., "MI " or "MI-")
      const regex = new RegExp(`\\b${abbrev}\\b`, 'i');
      if (regex.test(name)) {
        return {
          converted: name.replace(regex, STATE_PLACEHOLDER),
          stateDetected: fullName,
        };
      }
    }
  }

  return { converted: name, stateDetected: null };
}

/** Batch apply state placeholder replacement to account templates. */
export function applyStatePlaceholders<T extends { name: string }>(
  accounts: T[],
  stateName: string,
): T[] {
  if (!stateName) return accounts;
  return accounts.map((acct) => ({
    ...acct,
    name: replaceStatePlaceholder(acct.name, stateName),
  }));
}

/** Batch detect hardcoded state names and convert to placeholders. */
export function detectAndConvertStates<T extends { name: string }>(
  accounts: T[],
): { accounts: T[]; detections: Array<{ originalName: string; stateDetected: string }> } {
  const detections: Array<{ originalName: string; stateDetected: string }> = [];

  const converted = accounts.map((acct) => {
    const result = convertHardcodedStateToPlaceholder(acct.name);
    if (result.stateDetected) {
      detections.push({
        originalName: acct.name,
        stateDetected: result.stateDetected,
      });
      return { ...acct, name: result.converted };
    }
    return acct;
  });

  return { accounts: converted, detections };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
