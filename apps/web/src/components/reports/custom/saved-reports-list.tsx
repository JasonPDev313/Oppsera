'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Eye, Pencil, Download, Trash2 } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { ActionMenu } from '@/components/ui/action-menu';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import {
  useCustomReports,
  useDeleteReport,
  downloadCustomReportExport,
} from '@/hooks/use-custom-reports';
import { usePermissions } from '@/hooks/use-permissions';
import { DATASET_OPTIONS } from '@/types/custom-reports';
import type { SavedReport } from '@/types/custom-reports';

function getDatasetLabel(dataset: string): string {
  const opt = DATASET_OPTIONS.find((d) => d.value === dataset);
  return opt?.label ?? dataset;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function SavedReportsList() {
  const router = useRouter();
  const { toast } = useToast();
  const { can } = usePermissions();
  const { items, isLoading, hasMore, loadMore, mutate } = useCustomReports();
  const deleteReport = useDeleteReport();

  const [deleteTarget, setDeleteTarget] = useState<SavedReport | null>(null);

  const canManage = can('reports.custom.manage');

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const result = await deleteReport.mutate(deleteTarget.id);
    if (result !== null) {
      toast.success('Report deleted');
      setDeleteTarget(null);
      mutate();
    }
  }, [deleteTarget, deleteReport, toast, mutate]);

  const handleExport = useCallback(
    async (reportId: string) => {
      try {
        await downloadCustomReportExport(reportId);
      } catch {
        toast.error('Export failed');
      }
    },
    [toast],
  );

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'Name',
        render: (row: Record<string, unknown>) => (
          <span className="font-medium text-gray-900">
            {row.name as string}
          </span>
        ),
      },
      {
        key: 'dataset',
        header: 'Dataset',
        render: (row: Record<string, unknown>) =>
          getDatasetLabel(row.dataset as string),
      },
      {
        key: 'createdAt',
        header: 'Created',
        render: (row: Record<string, unknown>) =>
          formatDate(row.createdAt as string),
      },
      {
        key: '_actions',
        header: '',
        width: '48px',
        render: (row: Record<string, unknown>) => {
          const report = row as unknown as SavedReport;
          return (
            <ActionMenu
              items={[
                {
                  key: 'view',
                  label: 'View / Run',
                  icon: Eye,
                  onClick: () =>
                    router.push(`/reports/custom/${report.id}`),
                },
                ...(canManage
                  ? [
                      {
                        key: 'edit',
                        label: 'Edit',
                        icon: Pencil,
                        onClick: () =>
                          router.push(
                            `/reports/custom/${report.id}?mode=edit`,
                          ),
                      },
                    ]
                  : []),
                {
                  key: 'export',
                  label: 'Export CSV',
                  icon: Download,
                  onClick: () => handleExport(report.id),
                },
                ...(canManage
                  ? [
                      {
                        key: 'delete',
                        label: 'Delete',
                        icon: Trash2,
                        destructive: true,
                        dividerBefore: true,
                        onClick: () => setDeleteTarget(report),
                      },
                    ]
                  : []),
              ]}
            />
          );
        },
      },
    ],
    [canManage, router, handleExport],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Custom Reports</h1>
        <button
          type="button"
          onClick={() => router.push('/reports/custom/new')}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          New Report
        </button>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={items as unknown as Record<string, unknown>[]}
        isLoading={isLoading}
        emptyMessage="No custom reports yet."
        emptyAction={{
          label: 'Create Your First Report',
          onClick: () => router.push('/reports/custom/new'),
        }}
        onRowClick={(row) => {
          const report = row as unknown as SavedReport;
          router.push(`/reports/custom/${report.id}`);
        }}
      />

      {/* Load More */}
      {hasMore && !isLoading && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Load More
          </button>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Report"
        description={`Are you sure you want to delete "${deleteTarget?.name ?? ''}"? This action cannot be undone.`}
        destructive
        isLoading={deleteReport.isLoading}
      />
    </div>
  );
}
