'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Eye, Pencil, Trash2 } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { ActionMenu } from '@/components/ui/action-menu';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useDashboards, useDeleteDashboard } from '@/hooks/use-dashboards';
import { usePermissions } from '@/hooks/use-permissions';
import type { SavedDashboard } from '@/types/custom-reports';

// ── Date formatter ───────────────────────────────────────────
function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ── Component ────────────────────────────────────────────────
export function SavedDashboardsList() {
  const router = useRouter();
  const { items, isLoading, hasMore, loadMore, mutate } = useDashboards();
  const { mutate: deleteDashboard, isLoading: isDeleting } = useDeleteDashboard();
  const { can } = usePermissions();

  const [deleteTarget, setDeleteTarget] = useState<SavedDashboard | null>(null);

  const canManage = can('reports.custom.manage');

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteDashboard(deleteTarget.id);
    if (result !== null) {
      setDeleteTarget(null);
      mutate();
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (row: SavedDashboard) => (
        <span className="font-medium text-foreground">{row.name}</span>
      ),
    },
    {
      key: 'tiles',
      header: 'Tiles',
      width: '100px',
      render: (row: SavedDashboard) => (
        <span className="text-muted-foreground">{row.tiles.length}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      width: '150px',
      render: (row: SavedDashboard) => (
        <span className="text-muted-foreground">{formatDate(row.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '48px',
      render: (row: SavedDashboard) => (
        <ActionMenu
          items={[
            {
              key: 'view',
              label: 'View',
              icon: Eye,
              onClick: () => router.push(`/dashboards/${row.id}`),
            },
            {
              key: 'edit',
              label: 'Edit',
              icon: Pencil,
              onClick: () => router.push(`/dashboards/${row.id}/edit`),
              hidden: !canManage,
            },
            {
              key: 'delete',
              label: 'Delete',
              icon: Trash2,
              onClick: () => setDeleteTarget(row),
              destructive: true,
              dividerBefore: true,
              hidden: !canManage,
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Dashboards</h1>
        {canManage && (
          <button
            type="button"
            onClick={() => router.push('/dashboards/new')}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            <Plus className="h-4 w-4" />
            New Dashboard
          </button>
        )}
      </div>

      {/* Table */}
      <DataTable<SavedDashboard & Record<string, unknown>>
        columns={columns}
        data={items as (SavedDashboard & Record<string, unknown>)[]}
        isLoading={isLoading}
        emptyMessage="No dashboards yet."
        emptyAction={
          canManage
            ? {
                label: 'Create Your First Dashboard',
                onClick: () => router.push('/dashboards/new'),
              }
            : undefined
        }
        onRowClick={(row) => router.push(`/dashboards/${row.id}`)}
      />

      {/* Load More */}
      {hasMore && !isLoading && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Load More
          </button>
        </div>
      )}

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Dashboard"
        description={`Are you sure you want to delete "${deleteTarget?.name ?? ''}"? This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        isLoading={isDeleting}
      />
    </div>
  );
}
