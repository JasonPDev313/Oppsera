'use client';

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
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
}

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expenses',
};

const ACCOUNT_TYPE_ORDER: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

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
}: AccountPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: accounts, isLoading } = useGLAccounts({
    accountType: accountTypes?.[0],
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

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearch('');
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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
  }, [handleClose]);

  useEffect(() => {
    if (isOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
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

      {isOpen && (
        <div className="absolute z-20 mt-1 w-full min-w-[300px] rounded-lg border border-gray-200 bg-surface shadow-lg">
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
                  {items.map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        onChange(acc.id);
                        handleClose();
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 ${
                        acc.id === value ? 'bg-indigo-50 text-indigo-700' : 'text-gray-900'
                      }`}
                    >
                      <span className="font-mono text-xs text-gray-500">{acc.accountNumber}</span>
                      <span>{acc.name}</span>
                      {acc.isControlAccount && (
                        <span className="ml-auto inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                          Control
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
