'use client';

import { useState, useMemo, useCallback } from 'react';
import { Plus, Settings2, Upload } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { AccountingEmptyState } from '@/components/accounting/accounting-empty-state';
import { AccountFilterBar } from '@/components/accounting/account-filter-bar';
import { AccountTreeView } from '@/components/accounting/account-tree-view';
import { useGLAccounts, useAccountingBootstrapStatus } from '@/hooks/use-accounting';
import type { GLAccount, AccountType } from '@/types/accounting';
import { AccountDialog } from '@/components/accounting/account-dialog';
import { ClassificationsPanel } from '@/components/accounting/classifications-panel';
import { BootstrapWizard } from '@/components/accounting/bootstrap-wizard';
import { ImportWizard } from '@/components/accounting/import-wizard';
import { useQueryClient } from '@tanstack/react-query';

const ACCOUNT_TYPE_ORDER: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

const VIEW_KEY = 'coa_view_mode';

export default function AccountsContent() {
  const queryClient = useQueryClient();
  const { data: accounts, isLoading, mutate } = useGLAccounts();
  const { isBootstrapped, isLoading: bootstrapLoading } = useAccountingBootstrapStatus();

  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'flat' | 'tree'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(VIEW_KEY) as 'flat' | 'tree') ?? 'flat';
    }
    return 'flat';
  });
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [collapsedTypes, setCollapsedTypes] = useState<Set<AccountType>>(new Set());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<GLAccount | null>(null);
  const [classificationsOpen, setClassificationsOpen] = useState(false);
  const [showBootstrap, setShowBootstrap] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const toggleViewMode = useCallback(() => {
    const next = viewMode === 'flat' ? 'tree' : 'flat';
    setViewMode(next);
    if (typeof window !== 'undefined') localStorage.setItem(VIEW_KEY, next);
  }, [viewMode]);

  const toggleTypeCollapse = useCallback((type: AccountType) => {
    setCollapsedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    let list = accounts;
    if (statusFilter === 'active') list = list.filter((a) => a.isActive);
    else if (statusFilter === 'inactive') list = list.filter((a) => !a.isActive);
    if (search) {
      const lower = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.accountNumber.toLowerCase().includes(lower) ||
          a.name.toLowerCase().includes(lower),
      );
    }
    return list;
  }, [accounts, search, statusFilter]);

  const grouped = useMemo(() => {
    const groups: Record<AccountType, GLAccount[]> = {
      asset: [], liability: [], equity: [], revenue: [], expense: [],
    };
    for (const acc of filtered) {
      groups[acc.accountType]?.push(acc);
    }
    for (const type of ACCOUNT_TYPE_ORDER) {
      groups[type]!.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
    }
    return groups;
  }, [filtered]);

  const handleEdit = useCallback((account: GLAccount) => {
    setEditingAccount(account);
    setDialogOpen(true);
  }, []);

  const handleCreate = useCallback(() => {
    setEditingAccount(null);
    setDialogOpen(true);
  }, []);

  // Show bootstrap wizard if not bootstrapped
  if (!bootstrapLoading && !isBootstrapped) {
    return (
      <AccountingPageShell
        title="Chart of Accounts"
        breadcrumbs={[{ label: 'Chart of Accounts' }]}
      >
        {showBootstrap ? (
          <BootstrapWizard onComplete={() => {
            queryClient.refetchQueries({ queryKey: ['accounting-settings'] });
            queryClient.refetchQueries({ queryKey: ['gl-accounts'] });
            mutate();
            setShowBootstrap(false);
          }} />
        ) : (
          <AccountingEmptyState
            title="No chart of accounts configured"
            description="Set up your accounts to start tracking finances. Choose a template to get started quickly."
            action={{ label: 'Bootstrap from Template', onClick: () => setShowBootstrap(true) }}
          />
        )}
      </AccountingPageShell>
    );
  }

  return (
    <AccountingPageShell
      title="Chart of Accounts"
      breadcrumbs={[{ label: 'Chart of Accounts' }]}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setClassificationsOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">Classifications</span>
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Import COA</span>
          </button>
          <button
            type="button"
            onClick={handleCreate}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            <Plus className="h-4 w-4" />
            New Account
          </button>
        </div>
      }
    >
      <AccountFilterBar
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        viewMode={viewMode}
        onToggleViewMode={toggleViewMode}
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={`skeleton-${i}`} className="flex items-center gap-4 rounded-lg border border-border p-4">
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              <div className="h-4 w-48 animate-pulse rounded bg-muted" />
              <div className="ml-auto h-4 w-24 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : (
        <AccountTreeView
          grouped={grouped}
          collapsedTypes={collapsedTypes}
          onToggleCollapse={toggleTypeCollapse}
          viewMode={viewMode}
          search={search}
          onEditAccount={handleEdit}
        />
      )}

      <AccountDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingAccount(null); }}
        account={editingAccount}
        onSuccess={() => { mutate(); setDialogOpen(false); setEditingAccount(null); }}
      />

      <ClassificationsPanel
        open={classificationsOpen}
        onClose={() => setClassificationsOpen(false)}
      />

      <ImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={() => { mutate(); setImportOpen(false); }}
      />
    </AccountingPageShell>
  );
}
