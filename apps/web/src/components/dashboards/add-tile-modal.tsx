'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, LineChart, BarChart3, Table2, Hash } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import type {
  DashboardTile,
  SavedReport,
  ChartType,
  TileSizePreset,
} from '@/types/custom-reports';
import { TILE_SIZE_PRESETS } from '@/types/custom-reports';

// ── Props ────────────────────────────────────────────────────
interface AddTileModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (tile: DashboardTile) => void;
  savedReports: SavedReport[];
  existingTileCount: number;
}

// ── Chart type options ───────────────────────────────────────
const CHART_TYPE_OPTIONS: { value: ChartType; label: string; icon: typeof LineChart }[] = [
  { value: 'line', label: 'Line', icon: LineChart },
  { value: 'bar', label: 'Bar', icon: BarChart3 },
  { value: 'table', label: 'Table', icon: Table2 },
  { value: 'metric', label: 'Metric', icon: Hash },
];

// ── Size preset options ──────────────────────────────────────
const SIZE_OPTIONS: { value: TileSizePreset; label: string }[] = [
  { value: 'small', label: 'Small 3\u00d72' },
  { value: 'medium', label: 'Medium 6\u00d73' },
  { value: 'large', label: 'Large 12\u00d74' },
];

// ── Component ────────────────────────────────────────────────
export function AddTileModal({
  open,
  onClose,
  onAdd,
  savedReports,
  existingTileCount,
}: AddTileModalProps) {
  const [selectedReportId, setSelectedReportId] = useState('');
  const [title, setTitle] = useState('');
  const [chartType, setChartType] = useState<ChartType>('line');
  const [sizePreset, setSizePreset] = useState<TileSizePreset>('medium');

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setSelectedReportId('');
      setTitle('');
      setChartType('line');
      setSizePreset('medium');
    }
  }, [open]);

  // Auto-fill title from selected report
  useEffect(() => {
    if (selectedReportId) {
      const report = savedReports.find((r) => r.id === selectedReportId);
      if (report) {
        setTitle(report.name);
      }
    }
  }, [selectedReportId, savedReports]);

  // ESC to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  const handleAdd = () => {
    if (!selectedReportId || !title.trim()) return;

    const size = TILE_SIZE_PRESETS[sizePreset];
    // Simple auto-layout: stack tiles in 2-column layout
    const y = Math.floor(existingTileCount / 2) * 4;
    const x = (existingTileCount % 2) * 6;

    onAdd({
      reportId: selectedReportId,
      title: title.trim(),
      chartType,
      position: { x, y },
      size: { w: size.w, h: size.h },
    });
    onClose();
  };

  const reportOptions = savedReports.map((r) => ({
    value: r.id,
    label: r.name,
  }));

  const canSubmit = selectedReportId !== '' && title.trim() !== '';

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      {/* Modal card */}
      <div className="relative w-full max-w-lg rounded-lg bg-surface p-6 shadow-xl">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-lg font-semibold text-gray-900">Add Tile</h2>

        <div className="mt-5 space-y-4">
          {/* Report selector */}
          <FormField label="Report" required>
            <Select
              options={reportOptions}
              value={selectedReportId}
              onChange={(val) => setSelectedReportId(val as string)}
              placeholder="Select a report..."
            />
          </FormField>

          {/* Title */}
          <FormField label="Title" required>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tile title"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          {/* Chart type */}
          <FormField label="Chart Type">
            <div className="flex gap-2">
              {CHART_TYPE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSelected = chartType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setChartType(opt.value)}
                    className={`flex flex-1 flex-col items-center gap-1 rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </FormField>

          {/* Tile size */}
          <FormField label="Tile Size">
            <div className="flex gap-2">
              {SIZE_OPTIONS.map((opt) => {
                const isSelected = sizePreset === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSizePreset(opt.value)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </FormField>
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!canSubmit}
            className={`rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none ${
              !canSubmit ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            Add Tile
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
