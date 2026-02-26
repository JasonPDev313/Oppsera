'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatAccountingMoney } from '@/types/accounting';
import type { GLAccount, AccountType } from '@/types/accounting';

const ACCOUNT_TYPE_ORDER: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];
const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expenses',
};

type TreeNode = GLAccount & { children: GLAccount[]; depth: number };

function buildTree(accounts: GLAccount[]): TreeNode[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const roots: TreeNode[] = [];
  const childMap = new Map<string, GLAccount[]>();

  for (const acc of accounts) {
    if (acc.parentAccountId && byId.has(acc.parentAccountId)) {
      if (!childMap.has(acc.parentAccountId)) childMap.set(acc.parentAccountId, []);
      childMap.get(acc.parentAccountId)!.push(acc);
    } else {
      roots.push({ ...acc, children: [], depth: 0 });
    }
  }

  function flatten(items: TreeNode[], depth: number): TreeNode[] {
    const result: TreeNode[] = [];
    for (const item of items) {
      result.push({ ...item, depth });
      const children = childMap.get(item.id) ?? [];
      if (children.length > 0) {
        result.push(...flatten(
          children.map((c) => ({ ...c, children: [], depth: depth + 1 })),
          depth + 1,
        ));
      }
    }
    return result;
  }

  return flatten(roots, 0);
}

interface AccountTreeViewProps {
  grouped: Record<AccountType, GLAccount[]>;
  collapsedTypes: Set<AccountType>;
  onToggleCollapse: (type: AccountType) => void;
  viewMode: 'flat' | 'tree';
  search: string;
  onEditAccount: (account: GLAccount) => void;
}

export function AccountTreeView({
  grouped,
  collapsedTypes,
  onToggleCollapse,
  viewMode,
  search,
  onEditAccount,
}: AccountTreeViewProps) {
  return (
    <div className="space-y-4">
      {ACCOUNT_TYPE_ORDER.map((type) => {
        const items = grouped[type]!;
        if (items.length === 0 && search) return null;
        const isCollapsed = collapsedTypes.has(type);
        const treeItems = viewMode === 'tree' ? buildTree(items) : null;

        return (
          <div key={type} className="overflow-hidden rounded-lg border border-border bg-surface">
            {/* Section header */}
            <button
              type="button"
              onClick={() => onToggleCollapse(type)}
              className="flex w-full items-center gap-2 border-b border-border bg-muted px-4 py-3 text-left"
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm font-semibold text-foreground">
                {ACCOUNT_TYPE_LABELS[type]}
              </span>
              <span className="text-xs text-muted-foreground">({items.length})</span>
            </button>

            {/* Rows */}
            {!isCollapsed && (
              <div>
                {items.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No {ACCOUNT_TYPE_LABELS[type].toLowerCase()} accounts
                  </div>
                ) : (
                  (treeItems ?? items.map((a) => ({ ...a, depth: 0, children: [] as GLAccount[] }))).map((acc) => (
                    <div
                      key={acc.id}
                      onClick={() => onEditAccount(acc)}
                      className={`flex cursor-pointer items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-accent ${
                        !acc.isActive ? 'opacity-50' : ''
                      }`}
                      style={{ paddingLeft: `${1 + acc.depth * 1.5}rem` }}
                    >
                      {acc.depth > 0 && (
                        <span className="text-muted-foreground">&lsaquo;</span>
                      )}
                      <span className="w-20 shrink-0 font-mono text-sm font-medium text-foreground">
                        {acc.accountNumber}
                      </span>
                      <span className="flex-1 text-sm text-foreground">{acc.name}</span>
                      {acc.classificationName && (
                        <Badge variant="neutral" className="hidden sm:inline-flex">
                          {acc.classificationName}
                        </Badge>
                      )}
                      {acc.isControlAccount && (
                        <Badge variant="warning">
                          {acc.controlAccountType ?? 'Control'}
                        </Badge>
                      )}
                      {acc.balance !== undefined && (
                        <span className="w-28 text-right text-sm tabular-nums text-foreground">
                          {formatAccountingMoney(acc.balance)}
                        </span>
                      )}
                      {!acc.isActive && (
                        <Badge variant="neutral">Inactive</Badge>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
