'use client';

import { useState, useMemo } from 'react';
import { Calculator, FileCheck2, ArrowRightLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Select } from '@/components/ui/select';
import { useAuthContext } from '@/components/auth-provider';
import { useAccountingSettings } from '@/hooks/use-accounting';
import { usePeriodicCogs, useCogsComparison } from '@/hooks/use-periodic-cogs';
import { useToast } from '@/components/ui/toast';
import {
  formatAccountingMoney,
  COGS_MODE_CONFIG,
  COGS_METHOD_CONFIG,
} from '@/types/accounting';
import type { PeriodicCogsCalculation, CogsPostingMode, CogsCalculationMethod } from '@/types/accounting';

function getDefaultPeriod(): { start: string; end: string } {
  const now = new Date();
  // Default to previous month
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  return {
    start: firstDay.toISOString().slice(0, 10),
    end: lastDay.toISOString().slice(0, 10),
  };
}

export default function CogsContent() {
  const { locations } = useAuthContext();
  const { data: settings } = useAccountingSettings();
  const { toast } = useToast();
  const defaultPeriod = useMemo(() => getDefaultPeriod(), []);

  const [periodStart, setPeriodStart] = useState(defaultPeriod.start);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriod.end);
  const [locationId, setLocationId] = useState('');
  const [isCalculating, setIsCalculating] = useState(false);
  const [isPosting, setIsPosting] = useState(false);

  const { data: calculations, isLoading, calculate, post } = usePeriodicCogs({
    locationId: locationId || undefined,
  });

  const { data: comparison } = useCogsComparison(periodStart, periodEnd, locationId || undefined);

  const locationOptions = useMemo(
    () => [
      { value: '', label: 'All Locations' },
      ...locations.map((l) => ({ value: l.id, label: l.name })),
    ],
    [locations],
  );

  const currentMode = (settings?.cogsPostingMode ?? 'disabled') as CogsPostingMode;
  const currentMethod = (settings?.periodicCogsMethod ?? 'weighted_average') as CogsCalculationMethod;

  const handleCalculate = async () => {
    setIsCalculating(true);
    try {
      await calculate({
        periodStart,
        periodEnd,
        locationId: locationId || undefined,
      });
      toast.success('COGS calculated successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to calculate COGS');
    } finally {
      setIsCalculating(false);
    }
  };

  const handlePost = async (calculationId: string) => {
    setIsPosting(true);
    try {
      await post(calculationId);
      toast.success('COGS posted to GL');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to post COGS');
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Cost of Goods Sold</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage COGS posting mode and periodic calculations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={currentMode === 'disabled' ? 'neutral' : currentMode === 'perpetual' ? 'success' : 'info'}>
            {COGS_MODE_CONFIG[currentMode].label}
          </Badge>
          {currentMode === 'periodic' && (
            <Badge variant="neutral">
              {COGS_METHOD_CONFIG[currentMethod].label}
            </Badge>
          )}
        </div>
      </div>

      {/* Mode explanation */}
      <div className="rounded-lg border border-gray-200 bg-surface p-4">
        <p className="text-sm text-gray-700">
          <span className="font-medium">Current mode:</span>{' '}
          {COGS_MODE_CONFIG[currentMode].description}.
          {currentMode === 'periodic' && settings?.periodicCogsLastCalculatedDate && (
            <span className="ml-2 text-gray-500">
              Last calculated through: {settings.periodicCogsLastCalculatedDate}
            </span>
          )}
        </p>
      </div>

      {/* Periodic COGS section — only show when mode is periodic */}
      {currentMode === 'periodic' && (
        <>
          {/* Period selector + Calculate */}
          <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-surface p-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-500">Period Start</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-500">Period End</label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-500">Location</label>
              <Select
                options={locationOptions}
                value={locationId}
                onChange={(v) => setLocationId(v as string)}
                className="w-full"
              />
            </div>
            <button
              type="button"
              onClick={handleCalculate}
              disabled={isCalculating}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              <Calculator className="h-4 w-4" />
              {isCalculating ? 'Calculating...' : 'Calculate COGS'}
            </button>
          </div>

          {/* Comparison card */}
          {comparison && (
            <div className="rounded-lg border border-gray-200 bg-surface p-4">
              <div className="flex items-center gap-2 mb-3">
                <ArrowRightLeft className="h-4 w-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Perpetual vs Periodic Comparison</h3>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-gray-500">Perpetual COGS</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {formatAccountingMoney(comparison.perpetualCogsDollars)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Periodic COGS</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {comparison.periodicCogsDollars
                      ? formatAccountingMoney(comparison.periodicCogsDollars)
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Variance</p>
                  <p className={`text-lg font-semibold ${
                    comparison.varianceDollars && Number(comparison.varianceDollars) !== 0
                      ? 'text-amber-600'
                      : 'text-gray-900'
                  }`}>
                    {comparison.varianceDollars
                      ? formatAccountingMoney(comparison.varianceDollars)
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Variance %</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {comparison.variancePercent ? `${comparison.variancePercent}%` : '—'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Calculations list */}
          {isLoading && (
            <div className="flex justify-center py-8">
              <LoadingSpinner label="Loading COGS calculations..." />
            </div>
          )}

          {!isLoading && calculations.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-900">Calculations</h3>
              <DataTable
                columns={[
                  {
                    key: 'periodStart',
                    header: 'Period',
                    render: (row) => (
                      <span className="text-sm text-gray-900">
                        {String(row.periodStart)} – {String(row.periodEnd)}
                      </span>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (row) => (
                      <Badge variant={row.status === 'posted' ? 'success' : 'warning'}>
                        {row.status === 'posted' ? 'Posted' : 'Draft'}
                      </Badge>
                    ),
                  },
                  {
                    key: 'beginningInventoryDollars',
                    header: 'Beginning',
                    render: (row) => formatAccountingMoney(String(row.beginningInventoryDollars)),
                  },
                  {
                    key: 'purchasesDollars',
                    header: 'Purchases',
                    render: (row) => formatAccountingMoney(String(row.purchasesDollars)),
                  },
                  {
                    key: 'endingInventoryDollars',
                    header: 'Ending',
                    render: (row) => formatAccountingMoney(String(row.endingInventoryDollars)),
                  },
                  {
                    key: 'cogsDollars',
                    header: 'COGS',
                    render: (row) => (
                      <span className="font-semibold text-gray-900">
                        {formatAccountingMoney(String(row.cogsDollars))}
                      </span>
                    ),
                  },
                  {
                    key: 'actions',
                    header: '',
                    render: (row) =>
                      row.status === 'draft' ? (
                        <button
                          type="button"
                          onClick={() => handlePost(String(row.id))}
                          disabled={isPosting}
                          className="inline-flex items-center gap-1 rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          <FileCheck2 className="h-3 w-3" />
                          Post to GL
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">
                          JE: {String(row.glJournalEntryId ?? '').slice(0, 8)}...
                        </span>
                      ),
                  },
                ]}
                data={calculations as unknown as (Record<string, unknown> & { id: string })[]}
                isLoading={false}
                emptyMessage="No COGS calculations"
              />
            </div>
          )}

          {!isLoading && calculations.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-surface py-12">
              <Calculator className="h-10 w-10 text-gray-300" />
              <p className="mt-3 text-sm text-gray-500">No periodic COGS calculations yet</p>
              <p className="mt-1 text-xs text-gray-400">
                Select a period above and click &quot;Calculate COGS&quot; to get started.
              </p>
            </div>
          )}
        </>
      )}

      {/* Info card for other modes */}
      {currentMode === 'perpetual' && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h3 className="text-sm font-semibold text-blue-900">Perpetual COGS Active</h3>
          <p className="mt-1 text-sm text-blue-700">
            COGS is automatically posted per-tender at the time of each sale. Each tender records a proportional share
            of cost of goods sold based on the item costs in the order. No manual calculation is needed.
          </p>
          <p className="mt-2 text-sm text-blue-700">
            To switch to periodic COGS, go to{' '}
            <a href="/accounting/settings" className="font-medium underline">
              Accounting Settings
            </a>{' '}
            and change the COGS Posting Mode.
          </p>
        </div>
      )}

      {currentMode === 'disabled' && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="text-sm font-semibold text-gray-700">COGS Posting Disabled</h3>
          <p className="mt-1 text-sm text-gray-600">
            No cost of goods sold is being recorded in the general ledger. To enable COGS posting, go to{' '}
            <a href="/accounting/settings" className="font-medium underline">
              Accounting Settings
            </a>{' '}
            and select a COGS Posting Mode (Perpetual or Periodic).
          </p>
        </div>
      )}
    </div>
  );
}
