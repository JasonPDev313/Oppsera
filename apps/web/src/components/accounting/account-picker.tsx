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
  mappingRole?: 'revenue' | 'cogs' | 'inventory' | 'returns' | 'discount' | 'cash' | 'clearing' | 'fee' | 'tax';
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

/** Keyword → account name substring mappings for smart matching */
const REVENUE_HINTS: [RegExp, string[]][] = [
  [/green\s*fee|tee\s*time/i, ['green fee', 'activity fee', 'golf']],
  [/food|snack|kitchen|grill/i, ['food sales', 'f&b sales']],
  [/beverage|drink|bar|alcohol|beer|wine|spirit/i, ['beverage sales', 'bar sales']],
  [/apparel|clothing|shirt|hat|cap/i, ['pro shop', 'merchandise', 'retail']],
  [/merchandise|merch|gift|souvenir/i, ['merchandise', 'pro shop', 'retail']],
  [/golf\s*equip|club|ball|glove/i, ['pro shop', 'merchandise', 'retail']],
  [/cart|rental/i, ['cart rental', 'rental revenue']],
  [/lesson|instruction|clinic/i, ['lesson', 'instruction']],
  [/membership|dues/i, ['membership', 'dues']],
  [/event|banquet|catering/i, ['event revenue', 'catering']],
  [/service/i, ['service revenue']],
  [/room|lodging/i, ['room revenue', 'lodging']],
  [/range|driving/i, ['driving range', 'range revenue']],
];

const COGS_HINTS: [RegExp, string[]][] = [
  [/food|snack|kitchen|grill/i, ['cogs - food', 'f&b cogs', 'food cost']],
  [/beverage|drink|bar|alcohol|beer|wine/i, ['cogs - bev', 'beverage cost']],
  [/apparel|clothing|merchandise|merch|golf\s*equip|pro\s*shop/i, ['pro shop cogs', 'merchandise cogs', 'cogs - retail']],
  [/supply|supplies|maintenance/i, ['cogs - supplies', 'maintenance supplies']],
];

const INVENTORY_HINTS: [RegExp, string[]][] = [
  [/food|snack|kitchen|grill/i, ['inventory - food', 'f&b']],
  [/beverage|drink|bar|alcohol/i, ['inventory - bev']],
  [/apparel|clothing|merchandise|merch|golf\s*equip|pro\s*shop/i, ['inventory - pro shop', 'inventory - retail', 'inventory asset']],
  [/supply|supplies|maintenance/i, ['inventory - supplies', 'inventory - course']],
  [/rental|cart|equip/i, ['inventory - rental', 'inventory - equip']],
];

function scoreSuggestion(account: GLAccount, hints: string[]): number {
  const name = account.name.toLowerCase();
  for (let i = 0; i < hints.length; i++) {
    if (name.includes(hints[i]!)) return 100 - i; // earlier hint = higher priority
  }
  return 0;
}

function getSuggestedAccount(
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
      // Suggest based on payment type name
      if (/cash/i.test(suggestFor)) {
        return accounts.find((a) => a.name.toLowerCase().includes('cash on hand'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('operating check'))
          ?? null;
      }
      if (/card|credit|debit|visa|master/i.test(suggestFor)) {
        return accounts.find((a) => a.name.toLowerCase().includes('merchant clearing'))
          ?? accounts.find((a) => a.name.toLowerCase().includes('undeposited'))
          ?? null;
      }
      if (/gift/i.test(suggestFor)) {
        return accounts.find((a) => a.name.toLowerCase().includes('gift card'))
          ?? null;
      }
      return accounts.find((a) => a.name.toLowerCase().includes('undeposited')) ?? null;
    case 'clearing':
      return accounts.find((a) => a.name.toLowerCase().includes('undeposited'))
        ?? accounts.find((a) => a.name.toLowerCase().includes('clearing'))
        ?? null;
    case 'fee':
      return accounts.find((a) => a.name.toLowerCase().includes('credit card processing'))
        ?? accounts.find((a) => a.name.toLowerCase().includes('processing fee'))
        ?? null;
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

  // Fallback: if only one account of the right type, suggest it
  if (accounts.length === 1) return accounts[0]!;

  return null;
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
      className="fixed z-50 rounded-lg border border-gray-200 bg-surface shadow-lg"
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
          className="flex w-full items-center gap-2 border-b border-indigo-100 bg-indigo-50 px-3 py-2.5 text-left text-sm transition-colors hover:bg-indigo-100"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
          <span className="text-indigo-700">
            <span className="font-medium">Suggested:</span>{' '}
            <span className="font-mono text-xs">{suggestedAccount.accountNumber}</span>{' '}
            {suggestedAccount.name}
          </span>
        </button>
      )}
      <div className="border-b border-gray-100 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by number or name..."
            className="w-full rounded border border-gray-200 py-1.5 pl-7 pr-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </div>
      <div className="max-h-64 overflow-auto py-1">
        {isLoading && (
          <p className="px-3 py-2 text-sm text-gray-500">Loading accounts...</p>
        )}
        {!isLoading && filteredAccounts.length === 0 && (
          <p className="px-3 py-2 text-sm text-gray-500">No accounts found</p>
        )}
        {ACCOUNT_TYPE_ORDER.map((type) => {
          const items = grouped[type];
          if (!items || items.length === 0) return null;
          return (
            <div key={type}>
              <p className="px-3 py-1.5 text-xs font-semibold uppercase text-gray-400">
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
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 ${
                      acc.id === value ? 'bg-indigo-50 text-indigo-700' :
                      isSuggested ? 'bg-indigo-50/50' : 'text-gray-900'
                    }`}
                  >
                    <span className="font-mono text-xs text-gray-500">{acc.accountNumber}</span>
                    <span>{acc.name}</span>
                    {isSuggested && (
                      <Sparkles className="ml-auto h-3 w-3 shrink-0 text-indigo-400" />
                    )}
                    {acc.isControlAccount && (
                      <span className={`${isSuggested ? '' : 'ml-auto'} inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700`}>
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
            ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
            : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'
        } ${disabled ? 'cursor-not-allowed bg-gray-50 text-gray-400' : ''}`}
      >
        <span className={selectedAccount ? 'text-gray-900' : 'text-gray-400'}>
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
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
        </div>
      </button>
      {dropdown}
    </div>
  );
}
