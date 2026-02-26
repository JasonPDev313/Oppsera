'use client';

import { useState } from 'react';
import type { StaffValidationResult } from '@oppsera/core/import/staff-import-types';
import {
  ArrowLeft,
  Loader2,
  Play,
  FlaskConical,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  UserPlus,
  UserCog,
  UserX,
} from 'lucide-react';
import { PreviewBanner } from '@/components/import/PreviewBanner';
import { ReadinessIndicator } from '@/components/import/ReadinessIndicator';

interface PreviewStepProps {
  validation: StaffValidationResult;
  isExecuting: boolean;
  isLoading: boolean;
  onExecute: () => void;
  onDryRun: () => void;
  onBack: () => void;
}

const ACTION_ICONS: Record<string, typeof UserPlus> = {
  create: UserPlus,
  update: UserCog,
  skip: UserX,
  error: XCircle,
};

const ACTION_COLORS: Record<string, string> = {
  create: 'text-green-500',
  update: 'text-blue-500',
  skip: 'text-muted-foreground',
  error: 'text-red-500',
};

export function PreviewStep({
  validation,
  isExecuting,
  isLoading,
  onExecute,
  onDryRun,
  onBack,
}: PreviewStepProps) {
  const [filter, setFilter] = useState<string>('all');
  const [showConfirm, setShowConfirm] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const { summary, rows } = validation;

  const skippedTotal = summary.errorRows + summary.skipCount;

  const handleImportClick = () => {
    if (skippedTotal > 0) {
      setShowConfirm(true);
      setAcknowledged(false);
    } else {
      onExecute();
    }
  };

  const filteredRows = filter === 'all' ? rows : rows.filter((r) => r.action === filter);
  const displayRows = filteredRows.slice(0, 100);

  if (isExecuting) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
        <p className="text-sm text-muted-foreground">
          Importing {summary.createCount + summary.updateCount} users...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Preview banner */}
      <PreviewBanner
        readyCount={summary.createCount + summary.updateCount}
        attentionCount={summary.errorRows}
        entityLabel="users"
      />

      {/* Readiness indicator */}
      <ReadinessIndicator
        readyCount={summary.createCount + summary.updateCount}
        attentionCount={summary.errorRows}
        totalCount={summary.totalRows}
      />

      {/* Persistent skip/error notice */}
      {skippedTotal > 0 && (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-500">
            <strong>{skippedTotal} row{skippedTotal === 1 ? '' : 's'}</strong> will be skipped
            {summary.errorRows > 0 && ` (${summary.errorRows} with errors)`}
            {summary.skipCount > 0 && ` (${summary.skipCount} duplicates/skipped)`}
            . Only <strong>{summary.createCount + summary.updateCount}</strong> user{summary.createCount + summary.updateCount === 1 ? '' : 's'} will actually be imported.
            Go back to fix mappings, or proceed and these rows will be ignored.
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard label="Total" value={summary.totalRows} color="text-foreground" />
        <SummaryCard label="Will Create" value={summary.createCount} color="text-green-500" icon={UserPlus} />
        <SummaryCard label="Will Update" value={summary.updateCount} color="text-blue-500" icon={UserCog} />
        <SummaryCard label="Skipped" value={summary.skipCount} color="text-muted-foreground" icon={UserX} />
        <SummaryCard label="Errors" value={summary.errorRows} color="text-red-500" icon={XCircle} />
      </div>

      {/* Warnings */}
      {(summary.distinctRolesUnmapped.length > 0 || summary.distinctLocationsUnmapped.length > 0 || summary.duplicateEmailsInFile.length > 0) && (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 space-y-1 text-sm text-yellow-500">
          {summary.distinctRolesUnmapped.length > 0 && (
            <p className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              Unmapped roles: {summary.distinctRolesUnmapped.join(', ')}
            </p>
          )}
          {summary.distinctLocationsUnmapped.length > 0 && (
            <p className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              Unmapped locations: {summary.distinctLocationsUnmapped.join(', ')}
            </p>
          )}
          {summary.duplicateEmailsInFile.length > 0 && (
            <p className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              Duplicate emails in file: {summary.duplicateEmailsInFile.join(', ')}
            </p>
          )}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        {[
          { key: 'all', label: `All (${rows.length})` },
          { key: 'create', label: `Create (${summary.createCount})` },
          { key: 'update', label: `Update (${summary.updateCount})` },
          { key: 'skip', label: `Skip (${summary.skipCount})` },
          { key: 'error', label: `Errors (${summary.errorRows})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filter === tab.key
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Row preview table */}
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-border text-left">
              <th className="pb-2 pr-3 font-medium text-muted-foreground w-10">#</th>
              <th className="pb-2 pr-3 font-medium text-muted-foreground w-16">Action</th>
              <th className="pb-2 pr-3 font-medium text-muted-foreground">Name</th>
              <th className="pb-2 pr-3 font-medium text-muted-foreground">Email</th>
              <th className="pb-2 pr-3 font-medium text-muted-foreground">Username</th>
              <th className="pb-2 pr-3 font-medium text-muted-foreground">Status</th>
              <th className="pb-2 font-medium text-muted-foreground">Issues</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {displayRows.map((row) => {
              const Icon = ACTION_ICONS[row.action] ?? XCircle;
              const color = ACTION_COLORS[row.action] ?? '';
              return (
                <tr key={row.rowNumber} className={!row.isValid ? 'bg-red-500/5' : ''}>
                  <td className="py-2 pr-3 text-gray-400 text-xs">{row.rowNumber}</td>
                  <td className="py-2 pr-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
                      <Icon className="w-3.5 h-3.5" />
                      {row.action}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-foreground">
                    {[row.firstName, row.lastName].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground text-xs">{row.email || '—'}</td>
                  <td className="py-2 pr-3 text-muted-foreground text-xs font-mono">{row.username || '—'}</td>
                  <td className="py-2 pr-3">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      row.statusValue === 'active'
                        ? 'bg-green-500/20 text-green-500'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {row.statusValue}
                    </span>
                  </td>
                  <td className="py-2">
                    {row.errors.length > 0 && (
                      <span className="text-xs text-red-500">
                        {row.errors.map((e) => e.message).join('; ')}
                      </span>
                    )}
                    {row.warnings.length > 0 && row.errors.length === 0 && (
                      <span className="text-xs text-yellow-500">
                        {row.warnings.map((w) => w.message).join('; ')}
                      </span>
                    )}
                    {row.errors.length === 0 && row.warnings.length === 0 && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredRows.length > 100 && (
          <p className="text-xs text-gray-400 mt-2 text-center">
            Showing first 100 of {filteredRows.length} rows
          </p>
        )}
      </div>

      {/* Confirmation prompt */}
      {showConfirm && skippedTotal > 0 && (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-4 space-y-3">
          <p className="text-sm font-medium text-yellow-500 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {skippedTotal} row{skippedTotal === 1 ? '' : 's'} will not be imported
          </p>
          <p className="text-sm text-yellow-500 ml-6">
            {summary.errorRows > 0 && (
              <>{summary.errorRows} row{summary.errorRows === 1 ? ' has' : 's have'} errors. </>
            )}
            {summary.skipCount > 0 && (
              <>{summary.skipCount} row{summary.skipCount === 1 ? ' is' : 's are'} marked to skip. </>
            )}
            These rows will be ignored and only <strong>{summary.createCount + summary.updateCount}</strong> user{summary.createCount + summary.updateCount === 1 ? '' : 's'} will be imported.
          </p>
          <label className="flex items-center gap-2 ml-6 text-sm text-yellow-500 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="rounded border-yellow-400 text-yellow-600"
            />
            I understand that {skippedTotal} row{skippedTotal === 1 ? '' : 's'} will be skipped
          </label>
          <div className="flex gap-3 ml-6">
            <button
              onClick={() => { setShowConfirm(false); setAcknowledged(false); }}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={() => { setShowConfirm(false); onExecute(); }}
              disabled={!acknowledged}
              className="px-4 py-1.5 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Proceed with Import
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex justify-between pt-4 border-t border-border">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex gap-3">
          <button
            onClick={onDryRun}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent text-foreground disabled:opacity-50"
          >
            <FlaskConical className="w-4 h-4" />
            Test (Dry Run)
          </button>
          <button
            onClick={handleImportClick}
            disabled={isLoading || summary.createCount + summary.updateCount === 0}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Import {summary.createCount + summary.updateCount} Users
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color, icon: Icon }: {
  label: string;
  value: number;
  color: string;
  icon?: typeof UserPlus;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color} flex items-center gap-2`}>
        {Icon && <Icon className="w-5 h-5" />}
        {value}
      </p>
    </div>
  );
}
