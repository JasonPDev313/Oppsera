'use client';

import {
  STAFF_TARGET_FIELD_LABELS,
  STAFF_TARGET_FIELD_GROUPS,
  type StaffTargetField,
  type StaffColumnMapping,
  type StaffAnalysisResult,
  type StaffImportMode,
} from '@oppsera/core/import/staff-import-types';
import { ArrowRight, ArrowLeft, AlertTriangle } from 'lucide-react';
import { ConfidenceBadge } from '@/components/import/ConfidenceBadge';

interface MappingStepProps {
  analysis: StaffAnalysisResult;
  columnMappings: StaffColumnMapping[];
  onMappingsChange: (m: StaffColumnMapping[]) => void;
  importMode: StaffImportMode;
  onImportModeChange: (m: StaffImportMode) => void;
  autoGenerateUsername: boolean;
  onAutoGenerateUsernameChange: (v: boolean) => void;
  onNext: () => void;
  onBack: () => void;
}

// All target fields for the dropdown
const ALL_TARGET_OPTIONS: Array<{ value: StaffTargetField | ''; label: string; group: string }> = [
  { value: '', label: '— Skip this column —', group: '' },
];
for (const [group, fields] of Object.entries(STAFF_TARGET_FIELD_GROUPS)) {
  for (const field of fields) {
    ALL_TARGET_OPTIONS.push({ value: field, label: STAFF_TARGET_FIELD_LABELS[field], group });
  }
}

export function MappingStep({
  analysis,
  columnMappings,
  onMappingsChange,
  importMode,
  onImportModeChange,
  autoGenerateUsername,
  onAutoGenerateUsernameChange,
  onNext,
  onBack,
}: MappingStepProps) {
  const usedTargets = new Set(columnMappings.filter((m) => m.targetField).map((m) => m.targetField));

  const handleFieldChange = (colIdx: number, newTarget: StaffTargetField | null) => {
    const updated = columnMappings.map((m) => {
      if (m.columnIndex !== colIdx) return m;
      return {
        ...m,
        targetField: newTarget,
        confidence: newTarget ? (m.alternatives.find((a) => a.targetField === newTarget)?.confidence ?? 50) : 0,
        explanation: newTarget ? `Manually mapped to ${STAFF_TARGET_FIELD_LABELS[newTarget]}` : 'Skipped',
      };
    });
    onMappingsChange(updated);
  };

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
        <span className="text-sm text-muted-foreground">
          {analysis.totalRows} rows detected &middot; {columnMappings.length} columns
        </span>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Mode:</span>
            <select
              value={importMode}
              onChange={(e) => onImportModeChange(e.target.value as StaffImportMode)}
              className="rounded border border-input bg-surface text-foreground px-2 py-1 text-sm"
            >
              <option value="upsert">Create + Update</option>
              <option value="create_only">Create Only</option>
              <option value="update_only">Update Only</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={autoGenerateUsername}
              onChange={(e) => onAutoGenerateUsernameChange(e.target.checked)}
              className="rounded border-gray-300"
            />
            Auto-generate usernames
          </label>
        </div>
      </div>

      {/* Warnings */}
      {analysis.warnings.length > 0 && (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 space-y-1">
          {analysis.warnings.map((w, i) => (
            <p key={i} className="text-sm text-yellow-500 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {w}
            </p>
          ))}
        </div>
      )}

      {/* Mapping table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="pb-2 pr-4 font-medium text-muted-foreground w-48">Source Column</th>
              <th className="pb-2 pr-4 font-medium text-muted-foreground w-64">OppsEra Field</th>
              <th className="pb-2 pr-4 font-medium text-muted-foreground w-20 text-center">Confidence</th>
              <th className="pb-2 font-medium text-muted-foreground">Sample Values</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {columnMappings.map((mapping) => (
              <tr key={mapping.columnIndex} className={!mapping.targetField ? 'opacity-50' : ''}>
                <td className="py-2.5 pr-4">
                  <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                    {mapping.sourceHeader}
                  </span>
                </td>
                <td className="py-2.5 pr-4">
                  <select
                    value={mapping.targetField ?? ''}
                    onChange={(e) => handleFieldChange(mapping.columnIndex, (e.target.value || null) as StaffTargetField | null)}
                    className="w-full rounded border border-input bg-surface text-foreground px-2 py-1.5 text-sm"
                  >
                    {ALL_TARGET_OPTIONS.map((opt) => (
                      <option
                        key={opt.value}
                        value={opt.value}
                        disabled={!!opt.value && usedTargets.has(opt.value) && mapping.targetField !== opt.value}
                      >
                        {opt.group ? `${opt.group} → ${opt.label}` : opt.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2.5 pr-4 text-center">
                  <ConfidenceBadge confidence={mapping.confidence} showLabel />
                </td>
                <td className="py-2.5">
                  <div className="flex gap-1.5 flex-wrap">
                    {mapping.sampleValues.slice(0, 3).map((v, i) => (
                      <span key={i} className="text-xs bg-muted border border-border px-1.5 py-0.5 rounded truncate max-w-[140px]">
                        {v}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex justify-between pt-4 border-t border-border">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Start Over
        </button>
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          Map Roles & Locations
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
