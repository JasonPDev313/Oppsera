/**
 * Tender mapper: auto-map legacy tender/payment type strings
 * to OppsEra tender types using fuzzy matching.
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface TenderMappingSuggestion {
  legacyValue: string;
  oppseraTenderType: string;
  confidence: number;
  occurrenceCount: number;
}

// ── Tender Alias Registry ─────────────────────────────────────────────

const TENDER_ALIASES: Record<string, string[]> = {
  cash: [
    'cash', 'money', 'currency', 'bills', 'coin', 'coins', 'cash payment',
  ],
  card: [
    'card', 'credit', 'debit', 'visa', 'mastercard', 'mc', 'amex',
    'discover', 'credit card', 'debit card', 'cc', 'charge', 'credit/debit',
    'diners', 'diners club', 'jcb', 'unionpay', 'chip', 'swipe', 'tap',
    'contactless', 'card payment', 'eftpos',
  ],
  gift_card: [
    'gift', 'gift card', 'gc', 'gift certificate', 'store credit',
    'gift voucher', 'gift cards', 'stored value', 'giftcard',
  ],
  house_account: [
    'house', 'house account', 'charge account', 'member', 'member charge',
    'ar', 'on account', 'city ledger', 'member account', 'account',
    'house charge', 'club account', 'member billing',
  ],
  check: [
    'check', 'cheque', 'personal check', 'business check', 'travelers check',
  ],
  online: [
    'online', 'web', 'ecommerce', 'paypal', 'stripe', 'venmo',
    'apple pay', 'google pay', 'digital', 'mobile payment', 'zelle',
    'cash app', 'square', 'shopify',
  ],
  other: [
    'other', 'misc', 'miscellaneous', 'unknown', 'external',
    'third party', 'comp', 'void', 'refund',
  ],
};

// ── Matching Logic ────────────────────────────────────────────────────

function normalizeValue(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '');
}

function matchTenderType(legacyValue: string): { tenderType: string; confidence: number } {
  const normalized = normalizeValue(legacyValue);
  if (!normalized) return { tenderType: 'other', confidence: 0.3 };

  // Exact alias match
  for (const [tenderType, aliases] of Object.entries(TENDER_ALIASES)) {
    if (aliases.includes(normalized)) {
      return { tenderType, confidence: 0.90 };
    }
  }

  // Partial/substring match
  for (const [tenderType, aliases] of Object.entries(TENDER_ALIASES)) {
    for (const alias of aliases) {
      if (normalized.includes(alias) || alias.includes(normalized)) {
        return { tenderType, confidence: 0.70 };
      }
    }
  }

  // Token overlap
  const tokens = normalized.split(/\s+/);
  let bestType = 'other';
  let bestScore = 0;
  for (const [tenderType, aliases] of Object.entries(TENDER_ALIASES)) {
    for (const alias of aliases) {
      const aliasTokens = alias.split(/\s+/);
      const overlap = tokens.filter((t) => aliasTokens.includes(t)).length;
      const score = overlap / Math.max(tokens.length, aliasTokens.length);
      if (score > bestScore) {
        bestScore = score;
        bestType = tenderType;
      }
    }
  }

  if (bestScore > 0.3) {
    return { tenderType: bestType, confidence: Math.round(bestScore * 100) / 100 };
  }

  return { tenderType: 'other', confidence: 0.3 };
}

// ── Main Function ─────────────────────────────────────────────────────

/**
 * Analyze all distinct tender values from the CSV and produce mapping suggestions.
 */
export function autoMapTenders(
  tenderValues: string[],
): TenderMappingSuggestion[] {
  // Count occurrences
  const counts = new Map<string, number>();
  for (const val of tenderValues) {
    const trimmed = val.trim();
    if (!trimmed) continue;
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  }

  // Map each distinct value
  const suggestions: TenderMappingSuggestion[] = [];
  for (const [legacyValue, occurrenceCount] of counts) {
    const { tenderType, confidence } = matchTenderType(legacyValue);
    suggestions.push({
      legacyValue,
      oppseraTenderType: tenderType,
      confidence,
      occurrenceCount,
    });
  }

  // Sort by occurrence count (most common first)
  suggestions.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
  return suggestions;
}
