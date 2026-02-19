'use client';

import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import type { InventorySummaryRow } from '@/types/reports';

interface InventoryTabProps {
  data: InventorySummaryRow[];
  isLoading: boolean;
  belowThresholdOnly: boolean;
  onToggleThreshold: (v: boolean) => void;
}

const COLUMNS = [
  {
    key: 'itemName',
    header: 'Item Name',
  },
  {
    key: 'locationId',
    header: 'Location',
  },
  {
    key: 'onHand',
    header: 'On Hand',
  },
  {
    key: 'lowStockThreshold',
    header: 'Threshold',
  },
  {
    key: 'status',
    header: 'Status',
    render: (row: Record<string, unknown>) =>
      row.isBelowThreshold ? (
        <Badge variant="warning">Low Stock</Badge>
      ) : (
        <Badge variant="success">OK</Badge>
      ),
  },
];

export function InventoryTab({
  data,
  isLoading,
  belowThresholdOnly,
  onToggleThreshold,
}: InventoryTabProps) {
  return (
    <div className="space-y-4">
      {/* Filter toggle */}
      <label className="inline-flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={belowThresholdOnly}
          onChange={(e) => onToggleThreshold(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        <span className="text-sm font-medium text-gray-700">Show low stock only</span>
      </label>

      {/* Table */}
      <DataTable
        columns={COLUMNS}
        data={data as unknown as Record<string, unknown>[]}
        isLoading={isLoading}
        emptyMessage={
          belowThresholdOnly
            ? 'No low stock items found'
            : 'No inventory data available'
        }
      />
    </div>
  );
}
