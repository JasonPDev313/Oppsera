'use client';

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X, Sparkles } from 'lucide-react';
import { useGLAccounts } from '@/hooks/use-accounting';
import type { GLAccount, AccountType } from '@/types/accounting';

interface AccountPickerProps {
  value: string | null;
  onChange: (accountId: string | null) => void;
  accountTypes?: AccountType[];
  isControlAccount?: boolean;
  isActive?: boolean;
  placeholder?: string;
  error?: boolean;
  disabled?: boolean;
  className?: string;
  /** Hint for intelligent auto-suggestion (e.g., sub-department name like "Beverages") */
  suggestFor?: string;
  /** Which mapping column this picker represents — drives suggestion logic */
  mappingRole?: 'revenue' | 'cogs' | 'inventory' | 'returns' | 'discount' | 'cash' | 'clearing' | 'fee' | 'tax' | 'expense';
}

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expenses',
};

const ACCOUNT_TYPE_ORDER: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

// ── Intelligent Suggestion Engine ──────────────────────────────

/** Keyword → account name substring mappings for smart matching.
 *  Hints are checked in priority order — earlier entries in the array match first.
 *  Each hint array covers naming conventions across all 4 COA templates
 *  (golf_default, retail_default, restaurant_default, hybrid_default).
 */
const REVENUE_HINTS: [RegExp, string[]][] = [
  [/green\s*fee|tee\s*time/i, ['green fee', 'activity fee', 'golf revenue']],
  [/food|snack|sandwich|kitchen|grill|deli/i, ['food sales', 'f&b sales', 'restaurant sales', 'dining revenue']],
  [/beverage|drink|bar|alcohol|beer|wine|spirit/i, ['beverage sales', 'bar sales', 'f&b sales', 'restaurant sales']],
  [/apparel|clothing|shirt|hat|cap/i, ['pro shop', 'merchandise', 'retail sales', 'apparel']],
  [/merchandise|merch|gift|souvenir/i, ['merchandise', 'pro shop', 'retail sales']],
  [/golf\s*equip|club|ball|glove/i, ['pro shop', 'merchandise', 'retail sales', 'equipment']],
  [/cart|rental/i, ['cart rental', 'rental revenue', 'equipment rental']],
  [/lesson|instruction|clinic/i, ['lesson', 'instruction', 'teaching']],
  [/membership|dues/i, ['membership', 'dues']],
  [/event|banquet|catering/i, ['event revenue', 'catering', 'banquet']],
  [/service/i, ['service revenue']],
  [/room|lodging|accommodation/i, ['room revenue', 'lodging']],
  [/range|driving/i, ['driving range', 'range revenue']],
  [/spa|wellness|fitness/i, ['spa revenue', 'wellness', 'fitness']],
  [/tobacco|cigar/i, ['pro shop', 'merchandise', 'retail sales']],
];

const COGS_HINTS: [RegExp, string[]][] = [
  [/food|snack|sandwich|kitchen|grill|deli/i, ['food cogs', 'cogs - food', 'f&b cogs', 'food cost']],
  [/beverage|drink|bar|alcohol|beer|wine/i, ['beverage cogs', 'cogs - bev', 'f&b cogs', 'beverage cost']],
  [/apparel|clothing|merchandise|merch|golf\s*equip|pro\s*shop|gift|souvenir|tobacco|cigar/i, ['pro shop cogs', 'merchandise cogs', 'cogs - retail', 'retail cogs']],
  [/supply|supplies|maintenance/i, ['cogs - supplies', 'maintenance supplies', 'course maintenance']],
  [/green\s*fee|cart|rental|lesson|range/i, ['course maintenance', 'cogs - operations']],
];

const INVENTORY_HINTS: [RegExp, string[]][] = [
  [/food|snack|sandwich|kitchen|grill|deli/i, ['inventory - food', 'inventory - f&b', 'f&b inventory']],
  [/beverage|drink|bar|alcohol/i, ['inventory - bev', 'inventory - f&b', 'f&b inventory']],
  [/apparel|clothing|merchandise|merch|golf\s*equip|pro\s*shop|gift|souvenir|tobacco|cigar/i, ['inventory - pro shop', 'inventory - retail', 'inventory asset', 'merchandise inventory']],
  [/supply|supplies|maintenance/i, ['inventory - supplies', 'inventory - course', 'maintenance inventory']],
  [/rental|cart|equip/i, ['inventory - rental', 'inventory - equip']],
];

/** Stop words excluded from fuzzy matching */
const STOP_WORDS = new Set(['&', 'and', 'the', 'of', 'for', 'a', 'an', 'in', 'on', 'to', 'or', 'at', 'by']);

/**
 * Semantic groupings: departments that share an accounting category.
 * When a department name matches one group, its sibling keywords also
 * become search terms — so "Sandwiches" finds "Food Sales" because
 * sandwiches and food are in the same semantic group.
 */
const SEMANTIC_GROUPS: Record<string, string[][]> = {
  revenue: [
    ['food', 'snack', 'sandwich', 'kitchen', 'grill', 'deli', 'bakery', 'pizza', 'burger', 'sushi', 'salad', 'soup', 'cafe', 'dining', 'restaurant', 'f&b'],
    ['beverage', 'drink', 'bar', 'alcohol', 'beer', 'wine', 'spirit', 'cocktail', 'coffee', 'juice', 'soda'],
    ['apparel', 'clothing', 'shirt', 'hat', 'cap', 'shoe', 'accessories', 'pro shop', 'merchandise', 'merch', 'gift', 'souvenir', 'tobacco', 'cigar', 'retail'],
    ['golf', 'green fee', 'tee time', 'round'],
    ['cart', 'rental', 'equipment rental'],
    ['lesson', 'instruction', 'clinic', 'teaching', 'academy'],
    ['membership', 'dues', 'subscription'],
    ['event', 'banquet', 'catering', 'party', 'wedding'],
    ['spa', 'wellness', 'fitness', 'gym', 'pool', 'tennis'],
    ['range', 'driving range', 'practice'],
    ['room', 'lodging', 'accommodation', 'hotel'],
  ],
  cogs: [
    ['food', 'snack', 'sandwich', 'kitchen', 'grill', 'deli', 'bakery', 'pizza', 'dining', 'f&b'],
    ['beverage', 'drink', 'bar', 'alcohol', 'beer', 'wine'],
    ['apparel', 'clothing', 'merchandise', 'merch', 'pro shop', 'gift', 'retail'],
    ['supply', 'supplies', 'maintenance', 'course'],
  ],
  inventory: [
    ['food', 'snack', 'sandwich', 'kitchen', 'grill', 'deli', 'f&b'],
    ['beverage', 'drink', 'bar', 'alcohol'],
    ['apparel', 'clothing', 'merchandise', 'merch', 'pro shop', 'gift', 'retail'],
    ['supply', 'supplies', 'maintenance', 'course'],
    ['rental', 'cart', 'equipment'],
  ],
};

/**
 * Dynamic suggestion engine — analyzes the ACTUAL chart of accounts.
 *
 * Strategy:
 * 1. Tokenize the department name
 * 2. Find the semantic group the department belongs to (expands search terms)
 * 3. Score each GL account by:
 *    a. Direct token overlap with account name
 *    b. Semantic group sibling matches (e.g., "Sandwiches" → food group → "Food Sales")
 *    c. Role-relevant keyword boost (accounts with "sales"/"revenue" for revenue role)
 * 4. Return highest-scoring account above minimum threshold
 *
 * This adapts automatically when new accounts are added to the COA.
 */
function dynamicMatchAccount(
  accounts: GLAccount[],
  name: string,
  role: 'revenue' | 'cogs' | 'inventory',
): GLAccount | null {
  const tokens = name.toLowerCase().split(/[\s&/,\-()]+/).filter((t) => t.length > 1 && !STOP_WORDS.has(t));
  if (tokens.length === 0) return null;

  // Role-specific keywords that indicate the account is the right type
  const roleKeywords: Record<string, string[]> = {
    revenue: ['sales', 'revenue', 'income', 'fee', 'fees'],
    cogs: ['cogs', 'cost', 'cost of'],
    inventory: ['inventory', 'stock'],
  };
  const roleKws = roleKeywords[role] ?? [];

  // Find which semantic group(s) the department belongs to → expand search terms
  const groups = SEMANTIC_GROUPS[role] ?? [];
  const expandedTerms = new Set(tokens);
  for (const group of groups) {
    const belongsToGroup = tokens.some((t) => group.some((g) => g.includes(t) || t.includes(g)));
    if (belongsToGroup) {
      for (const g of group) expandedTerms.add(g);
    }
  }

  const tokenSet = new Set(tokens);
  let best: GLAccount | null = null;
  let bestScore = 0;

  for (const acc of accounts) {
    const accName = acc.name.toLowerCase();
    const accTokens = accName.split(/[\s\-/()&,]+/).filter((t) => t.length > 1);
    let score = 0;

    // Direct token overlap (strongest signal)
    for (const token of tokens) {
      if (accName.includes(token)) score += 20;
    }

    // Semantic group expansion (weaker but still useful)
    for (const term of expandedTerms) {
      if (tokenSet.has(term)) continue; // already counted above
      if (accName.includes(term)) score += 8;
    }

    // Role keyword presence (the account has "sales", "cogs", "inventory" etc.)
    for (const kw of roleKws) {
      if (accName.includes(kw)) score += 6;
    }

    // Penalize very generic accounts ("Other Revenue", "Miscellaneous")
    if (/\bother\b|\bmisc/i.test(accName)) score -= 5;

    // Bonus: account name starts with a matching token (e.g., "Food" in "Food Sales")
    for (const token of expandedTerms) {
      if (accTokens[0] === token) score += 3;
    }

    if (score > bestScore) {
      bestScore = score;
      best = acc;
    }
  }

  // Minimum threshold: need at least a semantic match + role keyword
  return bestScore >= 14 ? best : null;
}

function scoreSuggestion(account: GLAccount, hints: string[]): number {
  const name = account.name.toLowerCase();
  for (let i = 0; i < hints.length; i++) {
    if (name.includes(hints[i]!)) return 100 - i; // earlier hint = higher priority
  }
  return 0;
}

export function getSuggestedAccount(
  accounts: GLAccount[],
  suggestFor: string | undefined,
  mappingRole: AccountPickerProps['mappingRole'],
): GLAccount | null {
  if (!suggestFor || !mappingRole || accounts.length === 0) return null;

  let hintsTable: [RegExp, string[]][];
  switch (mappingRole) {
    case 'revenue':
      hintsTable = REVENUE_HINTS;
      break;
    case 'cogs':
      hintsTable = COGS_HINTS;
      break;
    case 'inventory':
      hintsTable = INVENTORY_HINTS;
      break;
    case 'returns':
      // For returns, suggest any account with "return" or "refund" or "discount" in name
      return accounts.find((a) => {
        const n = a.name.toLowerCase();
        return n.includes('return') || n.includes('refund');
      }) ?? accounts.find((a) => a.name.toLowerCase().includes('discount')) ?? null;
    case 'discount':
      return accounts.find((a) => a.name.toLowerCase().includes('discount')) ?? null;
    case 'cash':
      // Suggest based on transaction type / payment type name
      if (/cash/i.test(suggestFor)) {
        return accounts.find((a) => a.name.toLowerCase().includes('cash on hand'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('operating check'))
          ?? null;
      }
      if (/card|credit|debit|visa|master|vpos|ecom/i.test(suggestFor)) {
        return accounts.find((a) => a.name.toLowerCase().includes('merchant clearing'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('undeposited'))
          ?? null;
      }
      if (/gift\s*card|voucher/i.test(suggestFor)) {
        return accounts.find((a) => a.name.toLowerCase().includes('gift card liability'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('gift card'))
          ?? null;
      }
      if (/tip|gratuity/i.test(suggestFor)) {
        return accounts.find((a) => a.name.toLowerCase().includes('tips payable'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('tips undistributed'))
          ?? null;
      }
      if (/deposit/i.test(suggestFor)) {
        return accounts.find((a) => a.name.toLowerCase().includes('customer deposit'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('deposits received'))
          ?? null;
      }
      if (/membership|dues/i.test(suggestFor)) {
        return accounts.find((a) => a.name.toLowerCase().includes('membership'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('dues'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('accounts receivable'))
          ?? null;
      }
      if (/house\s*account|ar\b/i.test(suggestFor)) {
        return accounts.find((a) => a.name.toLowerCase().includes('accounts receivable'))
          ?? accounts.find((a) => a.controlAccountType === 'ar')
          ?? null;
      }
      if (/settlement|processor/i.test(suggestFor)) {
        return accounts.find((a) => a.name.toLowerCase().includes('merchant clearing'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('undeposited'))
          ?? null;
      }
      if (/chargeback|dispute/i.test(suggestFor)) {
        return accounts.find((a) => a.name.toLowerCase().includes('chargeback'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('merchant clearing'))
          ?? null;
      }
      if (/over.*short|variance/i.test(suggestFor)) {
        return accounts.find((a) => a.name.toLowerCase().includes('cash over'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('over/short'))
          ?? null;
      }
      if (/convenience\s*fee/i.test(suggestFor)) {
        return accounts.find((a) => a.name.toLowerCase().includes('convenience fee'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('fee revenue'))
          ?? null;
      }
      if (/ach|eft/i.test(suggestFor)) {
        return accounts.find((a) => a.name.toLowerCase().includes('ach'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('undeposited'))
          ?? null;
      }
      if (/check\b/i.test(suggestFor)) {
        return accounts.find((a) => a.name.toLowerCase().includes('undeposited'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('cash on hand'))
          ?? null;
      }
      if (/refund|return|void/i.test(suggestFor)) {
        return accounts.find((a) => a.name.toLowerCase().includes('return'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('refund'))
          ?? null;
      }
      if (/sales\s*tax/i.test(suggestFor)) {
        return accounts.find((a) => a.name.toLowerCase().includes('sales tax payable'))
          ?? accounts.find((a) => a.controlAccountType === 'sales_tax')
          ?? null;
      }
      if (/inventory|cogs|receiving/i.test(suggestFor)) {
        return accounts.find((a) => a.name.toLowerCase().includes('inventory'))
          ?? null;
      }
      if (/ap\b|payable|bill/i.test(suggestFor)) {
        return accounts.find((a) => a.name.toLowerCase().includes('accounts payable'))
          ?? accounts.find((a) => a.controlAccountType === 'ap')
          ?? null;
      }
      if (/discount|comp/i.test(suggestFor)) {
        return accounts.find((a) => a.name.toLowerCase().includes('discount'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('comp'))
          ?? null;
      }
      if (/tee|booking/i.test(suggestFor)) {
        return accounts.find((a) => a.name.toLowerCase().includes('green fee'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('tee'))
          ?? null;
      }
      if (/event/i.test(suggestFor)) {
        return accounts.find((a) => a.name.toLowerCase().includes('event'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('banquet'))
          ?? null;
      }
      return accounts.find((a) => a.name.toLowerCase().includes('undeposited')) ?? null;
    case 'clearing':
      if (/tip|gratuity/i.test(suggestFor ?? '')) {
        return accounts.find((a) => a.name.toLowerCase().includes('tips payable'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('clearing'))
          ?? null;
      }
      if (/gift|voucher/i.test(suggestFor ?? '')) {
        return accounts.find((a) => a.name.toLowerCase().includes('gift card'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('deferred revenue'))
          ?? null;
      }
      if (/deposit/i.test(suggestFor ?? '')) {
        return accounts.find((a) => a.name.toLowerCase().includes('customer deposit'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('clearing'))
          ?? null;
      }
      return accounts.find((a) => a.name.toLowerCase().includes('undeposited'))
        ?? accounts.find((a) => a.name.toLowerCase().includes('clearing'))
        ?? null;
    case 'fee':
      return accounts.find((a) => a.name.toLowerCase().includes('credit card processing'))
        ?? accounts.find((a) => a.name.toLowerCase().includes('processing fee'))
        ?? accounts.find((a) => a.name.toLowerCase().includes('merchant fee'))
        ?? null;
    case 'expense':
      if (/chargeback|dispute/i.test(suggestFor ?? '')) {
        return accounts.find((a) => a.name.toLowerCase().includes('chargeback'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('dispute'))
          ?? null;
      }
      if (/comp|giveaway/i.test(suggestFor ?? '')) {
        return accounts.find((a) => a.name.toLowerCase().includes('comp'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('giveaway'))
          ?? null;
      }
      if (/over.*short|variance/i.test(suggestFor ?? '')) {
        return accounts.find((a) => a.name.toLowerCase().includes('cash over'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('over/short'))
          ?? null;
      }
      return null;
    case 'tax':
      return accounts.find((a) => a.name.toLowerCase().includes('sales tax payable'))
        ?? accounts.find((a) => a.controlAccountType === 'sales_tax')
        ?? null;
    default:
      return null;
  }

  // Match suggestFor against hints table
  for (const [pattern, hints] of hintsTable) {
    if (pattern.test(suggestFor)) {
      let best: GLAccount | null = null;
      let bestScore = 0;
      for (const acc of accounts) {
        const s = scoreSuggestion(acc, hints);
        if (s > bestScore) {
          bestScore = s;
          best = acc;
        }
      }
      if (best) return best;
    }
  }

  // Dynamic fallback: analyze actual COA accounts with semantic grouping
  if (mappingRole === 'revenue' || mappingRole === 'cogs' || mappingRole === 'inventory') {
    const dynamic = dynamicMatchAccount(accounts, suggestFor, mappingRole);
    if (dynamic) return dynamic;
  }

  // Fallback: if only one account of the right type, suggest it
  if (accounts.length === 1) return accounts[0]!;

  return null;
}

/**
 * Returns top N suggested GL accounts ranked by relevance.
 * Uses the same scoring logic as getSuggestedAccount but returns multiple results.
 * Only works for revenue/cogs/inventory roles (hint + dynamic scoring).
 */
export function getTopSuggestions(
  accounts: GLAccount[],
  suggestFor: string | undefined,
  mappingRole: 'revenue' | 'cogs' | 'inventory',
  limit: number = 3,
): GLAccount[] {
  if (!suggestFor || accounts.length === 0) return [];

  const hintsTable = mappingRole === 'revenue' ? REVENUE_HINTS
    : mappingRole === 'cogs' ? COGS_HINTS
    : INVENTORY_HINTS;

  const scored: { account: GLAccount; score: number }[] = [];

  // Score via hint tables
  for (const [pattern, hints] of hintsTable) {
    if (pattern.test(suggestFor)) {
      for (const acc of accounts) {
        const s = scoreSuggestion(acc, hints);
        if (s > 0) scored.push({ account: acc, score: s });
      }
      break; // use first matching pattern
    }
  }

  // Score via dynamic matching (semantic groups + token overlap)
  const tokens = suggestFor.toLowerCase().split(/[\s&/,\-()]+/).filter((t) => t.length > 1 && !STOP_WORDS.has(t));
  if (tokens.length > 0) {
    const roleKeywords: Record<string, string[]> = {
      revenue: ['sales', 'revenue', 'income', 'fee', 'fees'],
      cogs: ['cogs', 'cost', 'cost of'],
      inventory: ['inventory', 'stock'],
    };
    const roleKws = roleKeywords[mappingRole] ?? [];
    const groups = SEMANTIC_GROUPS[mappingRole] ?? [];
    const expandedTerms = new Set(tokens);
    for (const group of groups) {
      if (tokens.some((t) => group.some((g) => g.includes(t) || t.includes(g)))) {
        for (const g of group) expandedTerms.add(g);
      }
    }
    const tokenSet = new Set(tokens);

    for (const acc of accounts) {
      if (scored.some((s) => s.account.id === acc.id)) continue;
      const accName = acc.name.toLowerCase();
      const accTokens = accName.split(/[\s\-/()&,]+/).filter((t) => t.length > 1);
      let score = 0;
      for (const token of tokens) { if (accName.includes(token)) score += 20; }
      for (const term of expandedTerms) { if (!tokenSet.has(term) && accName.includes(term)) score += 8; }
      for (const kw of roleKws) { if (accName.includes(kw)) score += 6; }
      if (/\bother\b|\bmisc/i.test(accName)) score -= 5;
      for (const token of expandedTerms) { if (accTokens[0] === token) score += 3; }
      if (score >= 14) scored.push({ account: acc, score });
    }
  }

  // Deduplicate, sort desc, take top N
  const seen = new Set<string>();
  return scored
    .filter((s) => { if (seen.has(s.account.id)) return false; seen.add(s.account.id); return true; })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.account);
}

// ── Component ──────────────────────────────────────────────────

export function AccountPicker({
  value,
  onChange,
  accountTypes,
  isControlAccount,
  isActive = true,
  placeholder = 'Select account...',
  error = false,
  disabled = false,
  className = '',
  suggestFor,
  mappingRole,
}: AccountPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const { data: accounts, isLoading } = useGLAccounts({
    accountType: accountTypes?.length === 1 ? accountTypes[0] : undefined,
    isActive,
    isControlAccount,
  });

  const filteredAccounts = useMemo(() => {
    let list = accounts;
    if (accountTypes && accountTypes.length > 0) {
      list = list.filter((a) => accountTypes.includes(a.accountType));
    }
    if (search) {
      const lower = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.accountNumber.toLowerCase().includes(lower) ||
          a.name.toLowerCase().includes(lower),
      );
    }
    return list;
  }, [accounts, accountTypes, search]);

  const grouped = useMemo(() => {
    const groups: Record<AccountType, GLAccount[]> = {
      asset: [],
      liability: [],
      equity: [],
      revenue: [],
      expense: [],
    };
    for (const acc of filteredAccounts) {
      groups[acc.accountType]?.push(acc);
    }
    return groups;
  }, [filteredAccounts]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === value) ?? null,
    [accounts, value],
  );

  const suggestedAccount = useMemo(
    () => (value ? null : getSuggestedAccount(filteredAccounts, suggestFor, mappingRole)),
    [value, filteredAccounts, suggestFor, mappingRole],
  );

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearch('');
  }, []);

  const handleOpen = useCallback(() => {
    if (disabled) return;
    if (isOpen) {
      handleClose();
      return;
    }
    // Calculate position from the button
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 300),
      });
    }
    setIsOpen(true);
  }, [disabled, isOpen, handleClose]);

  // Close on click-outside (check both button and portal dropdown)
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        handleClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, handleClose]);

  // Reposition on scroll/resize while open
  useEffect(() => {
    if (!isOpen) return;
    const reposition = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setDropdownPos({
          top: rect.bottom + 4,
          left: rect.left,
          width: Math.max(rect.width, 300),
        });
      }
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [isOpen]);

  const dropdown = isOpen && dropdownPos && createPortal(
    <div
      ref={dropdownRef}
      className="fixed z-50 rounded-lg border border-border bg-surface shadow-lg"
      style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
    >
      {/* Suggestion banner */}
      {suggestedAccount && (
        <button
          type="button"
          onClick={() => {
            onChange(suggestedAccount.id);
            handleClose();
          }}
          className="flex w-full items-center gap-2 border-b border-indigo-500/20 bg-indigo-500/10 px-3 py-2.5 text-left text-sm transition-colors hover:bg-indigo-500/20"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
          <span className="text-indigo-500">
            <span className="font-medium">Suggested:</span>{' '}
            <span className="font-mono text-xs">{suggestedAccount.accountNumber}</span>{' '}
            {suggestedAccount.name}
          </span>
        </button>
      )}
      <div className="border-b border-border p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by number or name..."
            className="w-full rounded border border-border py-1.5 pl-7 pr-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </div>
      <div className="max-h-64 overflow-auto py-1">
        {isLoading && (
          <p className="px-3 py-2 text-sm text-muted-foreground">Loading accounts...</p>
        )}
        {!isLoading && filteredAccounts.length === 0 && (
          <p className="px-3 py-2 text-sm text-muted-foreground">No accounts found</p>
        )}
        {ACCOUNT_TYPE_ORDER.map((type) => {
          const items = grouped[type];
          if (!items || items.length === 0) return null;
          return (
            <div key={type}>
              <p className="px-3 py-1.5 text-xs font-semibold uppercase text-muted-foreground">
                {ACCOUNT_TYPE_LABELS[type]}
              </p>
              {items.map((acc) => {
                const isSuggested = acc.id === suggestedAccount?.id;
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => {
                      onChange(acc.id);
                      handleClose();
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                      acc.id === value ? 'bg-indigo-500/10 text-indigo-500' :
                      isSuggested ? 'bg-indigo-500/10' : 'text-foreground'
                    }`}
                  >
                    <span className="font-mono text-xs text-muted-foreground">{acc.accountNumber}</span>
                    <span>{acc.name}</span>
                    {isSuggested && (
                      <Sparkles className="ml-auto h-3 w-3 shrink-0 text-indigo-400" />
                    )}
                    {acc.isControlAccount && (
                      <span className={`${isSuggested ? '' : 'ml-auto'} inline-flex rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-500`}>
                        Control
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm focus:ring-2 focus:outline-none ${
          error
            ? 'border-red-500/30 focus:border-red-500 focus:ring-red-500'
            : 'border-input focus:border-indigo-500 focus:ring-indigo-500'
        } ${disabled ? 'cursor-not-allowed bg-muted text-muted-foreground' : ''}`}
      >
        <span className={selectedAccount ? 'text-foreground' : 'text-muted-foreground'}>
          {selectedAccount
            ? `${selectedAccount.accountNumber} — ${selectedAccount.name}`
            : placeholder}
        </span>
        <div className="flex items-center gap-1">
          {value && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  onChange(null);
                }
              }}
              className="text-muted-foreground hover:text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
      </button>
      {dropdown}
    </div>
  );
}
