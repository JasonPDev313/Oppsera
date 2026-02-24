/**
 * Account type inference engine.
 *
 * Infers account types from multiple signals:
 *   1. Explicit type column value (highest weight)
 *   2. Detail type column value
 *   3. Account code numeric range (common accounting convention)
 *   4. Keywords in account name
 *   5. Parent account type (inheritance)
 *
 * Each signal contributes a weighted vote. Final type is the highest-scoring
 * candidate with a confidence score.
 */

import type { AccountType, NormalBalance, TypeInference, TypeSignal } from './types';

// ── Explicit Type Normalization ─────────────────────────────────────

const TYPE_ALIASES: Record<string, AccountType> = {
  // Asset
  asset: 'asset', assets: 'asset',
  'current asset': 'asset', 'current assets': 'asset',
  'fixed asset': 'asset', 'fixed assets': 'asset',
  'other asset': 'asset', 'other assets': 'asset',
  'other current asset': 'asset', 'other current assets': 'asset',
  'contra asset': 'asset',
  bank: 'asset',
  'accounts receivable': 'asset', receivable: 'asset', receivables: 'asset',
  'a/r': 'asset',
  cash: 'asset',
  inventory: 'asset',
  prepaid: 'asset',

  // Liability
  liability: 'liability', liabilities: 'liability',
  'current liability': 'liability', 'current liabilities': 'liability',
  'long term liability': 'liability', 'long-term liability': 'liability',
  'other liability': 'liability', 'other liabilities': 'liability',
  'other current liability': 'liability', 'other current liabilities': 'liability',
  'accounts payable': 'liability', payable: 'liability', payables: 'liability',
  'a/p': 'liability',
  'credit card': 'liability',
  deferred: 'liability',

  // Equity
  equity: 'equity',
  "owner's equity": 'equity', 'owners equity': 'equity',
  'shareholders equity': 'equity', "shareholders' equity": 'equity',
  'retained earnings': 'equity',
  capital: 'equity',
  'opening balance equity': 'equity',

  // Revenue
  revenue: 'revenue', revenues: 'revenue',
  income: 'revenue',
  sales: 'revenue',
  'other income': 'revenue', 'other revenue': 'revenue',
  'service revenue': 'revenue',

  // Expense
  expense: 'expense', expenses: 'expense',
  cogs: 'expense',
  'cost of goods sold': 'expense', 'cost of goods': 'expense',
  'cost of sales': 'expense',
  'other expense': 'expense', 'other expenses': 'expense',
  'operating expense': 'expense', 'operating expenses': 'expense',
};

// ── Name Keywords ───────────────────────────────────────────────────

const NAME_KEYWORDS: Array<{ patterns: RegExp[]; type: AccountType; weight: number }> = [
  // Asset signals
  { patterns: [/\bcash\b/i, /\bbank\b/i, /\bchecking\b/i, /\bsavings?\b/i], type: 'asset', weight: 8 },
  { patterns: [/\breceivable\b/i, /\ba[/]?r\b/i], type: 'asset', weight: 8 },
  { patterns: [/\binventory\b/i, /\bstock\b/i], type: 'asset', weight: 7 },
  { patterns: [/\bprepaid\b/i, /\bdeposit\b/i], type: 'asset', weight: 6 },
  { patterns: [/\bequipment\b/i, /\bfurniture\b/i, /\bfixture/i, /\bvehicle/i], type: 'asset', weight: 7 },
  { patterns: [/\baccumulated\s+depreciation\b/i, /\baccum\.\s*dep/i], type: 'asset', weight: 9 },
  { patterns: [/\bproperty\b/i, /\bbuilding/i, /\bland\b/i], type: 'asset', weight: 6 },
  { patterns: [/\bundeposited\s+funds\b/i], type: 'asset', weight: 9 },

  // Liability signals
  { patterns: [/\bpayable\b/i, /\ba[/]?p\b/i], type: 'liability', weight: 8 },
  { patterns: [/\btax\s*(payable|liability)\b/i, /\bsales\s*tax\b/i], type: 'liability', weight: 9 },
  { patterns: [/\bdeferred\s+(revenue|income)\b/i], type: 'liability', weight: 9 },
  { patterns: [/\baccrued\b/i, /\bwithholding\b/i], type: 'liability', weight: 7 },
  { patterns: [/\bloan\b/i, /\bnote\s*payable\b/i, /\bmortgage\b/i], type: 'liability', weight: 7 },
  { patterns: [/\bcredit\s*card\b/i], type: 'liability', weight: 7 },
  { patterns: [/\bunearned\b/i, /\bgift\s*card\s*liability\b/i], type: 'liability', weight: 8 },
  { patterns: [/\btips?\s*payable\b/i], type: 'liability', weight: 9 },

  // Equity signals
  { patterns: [/\bretained\s*earnings\b/i], type: 'equity', weight: 10 },
  { patterns: [/\bowner.?s?\s*(equity|draw|contribution|investment)\b/i], type: 'equity', weight: 9 },
  { patterns: [/\bcapital\s*(stock|account)\b/i, /\bpartner.?s?\s*equity\b/i], type: 'equity', weight: 9 },
  { patterns: [/\bopening\s*balance\s*equity\b/i], type: 'equity', weight: 10 },
  { patterns: [/\bcommon\s*stock\b/i, /\bpreferred\s*stock\b/i], type: 'equity', weight: 9 },
  { patterns: [/\bdividend/i, /\bdistribution/i], type: 'equity', weight: 7 },

  // Revenue signals
  { patterns: [/\bsales\b/i, /\brevenue\b/i], type: 'revenue', weight: 7 },
  { patterns: [/\bincome\b/i], type: 'revenue', weight: 5 }, // weaker — "other income" etc.
  { patterns: [/\bservice\s*(charge|fee|revenue)\b/i], type: 'revenue', weight: 8 },
  { patterns: [/\bgreen\s*fee/i, /\bcart\s*rental/i, /\bpro\s*shop/i], type: 'revenue', weight: 8 },
  { patterns: [/\bfood\s*(sales|revenue)\b/i, /\bbeverage\s*(sales|revenue)\b/i], type: 'revenue', weight: 8 },
  { patterns: [/\bmembership\s*(dues|revenue)\b/i], type: 'revenue', weight: 8 },
  { patterns: [/\binterest\s*(income|earned)\b/i], type: 'revenue', weight: 7 },
  { patterns: [/\bdiscount\b/i, /\breturns?\s*(&|and)\s*allowances?\b/i], type: 'revenue', weight: 6 },

  // Expense signals
  { patterns: [/\bcost\s*of\s*(goods|sales|services)\b/i, /\bcogs\b/i], type: 'expense', weight: 9 },
  { patterns: [/\bpayroll\b/i, /\bsalar(y|ies)\b/i, /\bwages?\b/i], type: 'expense', weight: 8 },
  { patterns: [/\brent\b/i, /\butilities?\b/i, /\binsurance\b/i], type: 'expense', weight: 7 },
  { patterns: [/\bdepreciation\s*(expense)?\b/i, /\bamortization\b/i], type: 'expense', weight: 8 },
  { patterns: [/\boffice\s*(supplies|expense)\b/i], type: 'expense', weight: 7 },
  { patterns: [/\badvertising\b/i, /\bmarketing\b/i], type: 'expense', weight: 7 },
  { patterns: [/\brepair/i, /\bmaintenance\b/i], type: 'expense', weight: 7 },
  { patterns: [/\btravel\b/i, /\bmeals?\b/i, /\bentertainment\b/i], type: 'expense', weight: 7 },
  { patterns: [/\bprofessional\s*(fee|service)/i, /\blegal\b/i, /\baccounting\s*fee/i], type: 'expense', weight: 7 },
  { patterns: [/\btelephone\b/i, /\binternet\b/i, /\bsubscription/i], type: 'expense', weight: 7 },
  { patterns: [/\btax\s*(expense|provision)\b/i, /\bincome\s*tax\s*expense\b/i], type: 'expense', weight: 8 },
  { patterns: [/\bprocessing\s*fee/i, /\bmerchant\s*fee/i, /\bbank\s*(charge|fee)/i], type: 'expense', weight: 7 },
  { patterns: [/\bcash\s*over\s*(&|and)?\s*short\b/i], type: 'expense', weight: 8 },
];

// ── Code Range Rules ────────────────────────────────────────────────

function inferTypeFromCodeRange(code: string): { type: AccountType; weight: number } | null {
  const n = parseInt(code.replace(/[^0-9]/g, ''), 10);
  if (isNaN(n)) return null;

  // Standard US COA ranges
  if (n >= 1000 && n < 2000) return { type: 'asset', weight: 6 };
  if (n >= 2000 && n < 3000) return { type: 'liability', weight: 6 };
  if (n >= 3000 && n < 4000) return { type: 'equity', weight: 6 };
  if (n >= 4000 && n < 5000) return { type: 'revenue', weight: 6 };
  if (n >= 5000 && n < 6000) return { type: 'expense', weight: 7 }; // COGS range
  if (n >= 6000 && n < 10000) return { type: 'expense', weight: 6 };

  // Extended ranges (5-digit codes)
  if (n >= 10000 && n < 20000) return { type: 'asset', weight: 5 };
  if (n >= 20000 && n < 30000) return { type: 'liability', weight: 5 };
  if (n >= 30000 && n < 40000) return { type: 'equity', weight: 5 };
  if (n >= 40000 && n < 50000) return { type: 'revenue', weight: 5 };
  if (n >= 50000 && n < 100000) return { type: 'expense', weight: 5 };

  return null;
}

// ── Main Inference Engine ───────────────────────────────────────────

export function inferAccountType(
  accountNumber: string,
  accountName: string,
  explicitType?: string,
  detailType?: string,
  parentType?: AccountType,
): TypeInference {
  const signals: TypeSignal[] = [];

  // 1. Explicit type column (strongest signal)
  if (explicitType) {
    const normalized = explicitType.toLowerCase().trim();
    const mapped = TYPE_ALIASES[normalized];
    if (mapped) {
      signals.push({
        source: 'explicit_column',
        value: explicitType,
        suggestedType: mapped,
        weight: 15,
      });
    }
  }

  // 2. Detail type column
  if (detailType) {
    const normalized = detailType.toLowerCase().trim();
    const mapped = TYPE_ALIASES[normalized];
    if (mapped) {
      signals.push({
        source: 'detail_type',
        value: detailType,
        suggestedType: mapped,
        weight: 12,
      });
    }
  }

  // 3. Code range
  if (accountNumber) {
    const codeResult = inferTypeFromCodeRange(accountNumber);
    if (codeResult) {
      signals.push({
        source: 'code_range',
        value: accountNumber,
        suggestedType: codeResult.type,
        weight: codeResult.weight,
      });
    }
  }

  // 4. Name keywords
  if (accountName) {
    for (const rule of NAME_KEYWORDS) {
      for (const pattern of rule.patterns) {
        if (pattern.test(accountName)) {
          signals.push({
            source: 'name_keyword',
            value: accountName,
            suggestedType: rule.type,
            weight: rule.weight,
          });
          break; // only one match per rule group
        }
      }
    }
  }

  // 5. Parent type inheritance (weakest signal)
  if (parentType) {
    signals.push({
      source: 'parent_type',
      value: parentType,
      suggestedType: parentType,
      weight: 4,
    });
  }

  // Aggregate votes
  const votes = new Map<AccountType, number>();
  for (const signal of signals) {
    votes.set(signal.suggestedType, (votes.get(signal.suggestedType) ?? 0) + signal.weight);
  }

  if (votes.size === 0) {
    return {
      accountType: 'expense', // safe default
      confidence: 10,
      reason: 'No type signals detected — defaulting to expense',
      signals: [],
    };
  }

  // Find winner
  let bestType: AccountType = 'expense';
  let bestScore = 0;
  let totalScore = 0;
  for (const [type, score] of votes) {
    totalScore += score;
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  // Confidence: based on winner dominance and total signal strength
  const dominance = bestScore / totalScore; // 0-1: how much the winner dominates
  const signalStrength = Math.min(totalScore / 20, 1); // 0-1: total evidence (20 = max)
  const confidence = Math.round(Math.min(100, dominance * signalStrength * 100 + (signals.length > 1 ? 10 : 0)));

  // Build reason string
  const topSignals = signals
    .filter((s) => s.suggestedType === bestType)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);

  const reasonParts = topSignals.map((s) => {
    switch (s.source) {
      case 'explicit_column': return `type column says "${s.value}"`;
      case 'detail_type': return `detail type "${s.value}"`;
      case 'code_range': return `code ${s.value} is in ${bestType} range`;
      case 'name_keyword': return `name contains ${bestType} keywords`;
      case 'parent_type': return `parent is ${bestType}`;
    }
  });

  return {
    accountType: bestType,
    confidence,
    reason: reasonParts.join(', '),
    signals,
  };
}

// ── Helper ──────────────────────────────────────────────────────────

export function resolveNormalBalance(accountType: AccountType): NormalBalance {
  return accountType === 'asset' || accountType === 'expense' ? 'debit' : 'credit';
}
