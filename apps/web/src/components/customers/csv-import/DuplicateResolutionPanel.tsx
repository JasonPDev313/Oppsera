'use client';

import { Users } from 'lucide-react';
import type { DuplicateMatch, DuplicateResolution } from '@/hooks/use-customer-import';

interface DuplicateResolutionPanelProps {
  duplicates: DuplicateMatch[];
  resolutions: Record<number, DuplicateResolution>;
  onSetResolution: (csvRowIndex: number, resolution: DuplicateResolution) => void;
  onSetAllResolutions: (resolution: DuplicateResolution) => void;
  onContinue: () => void;
  onBack: () => void;
}

const MATCH_TYPE_LABELS: Record<string, string> = {
  email: 'Email',
  phone: 'Phone',
  member_number: 'Member #',
  external_id: 'External ID',
};

export function DuplicateResolutionPanel({
  duplicates,
  resolutions,
  onSetResolution,
  onSetAllResolutions,
  onContinue,
  onBack,
}: DuplicateResolutionPanelProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-foreground">
          Duplicate Records Found
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {duplicates.length} record{duplicates.length !== 1 ? 's' : ''} match existing customers.
          Choose how to handle each duplicate.
        </p>
      </div>

      {/* Bulk actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onSetAllResolutions('skip')}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
        >
          Skip All
        </button>
        <button
          onClick={() => onSetAllResolutions('update')}
          className="rounded-md border border-blue-500/30 px-3 py-1.5 text-xs font-medium text-blue-500 hover:bg-blue-500/10"
        >
          Update All
        </button>
        <button
          onClick={() => onSetAllResolutions('create_new')}
          className="rounded-md border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-500 hover:bg-amber-500/10"
        >
          Create All New
        </button>
      </div>

      {/* Duplicate list */}
      <div className="max-h-[360px] space-y-2 overflow-y-auto">
        {duplicates.map((dup) => (
          <div
            key={dup.csvRowIndex}
            className="rounded-lg border border-border p-3"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Row {dup.csvRowIndex + 1} → {dup.existingDisplayName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Matched by{' '}
                    <span className="font-medium">{MATCH_TYPE_LABELS[dup.matchType] ?? dup.matchType}</span>
                    {dup.existingEmail && ` · ${dup.existingEmail}`}
                  </p>
                </div>
              </div>
            </div>

            {/* Resolution toggle */}
            <div className="mt-2 flex gap-1">
              {(['skip', 'update', 'create_new'] as DuplicateResolution[]).map((resolution) => (
                <button
                  key={resolution}
                  onClick={() => onSetResolution(dup.csvRowIndex, resolution)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    resolutions[dup.csvRowIndex] === resolution
                      ? resolution === 'skip'
                        ? 'bg-muted text-foreground'
                        : resolution === 'update'
                          ? 'bg-blue-500/20 text-blue-500'
                          : 'bg-amber-500/20 text-amber-500'
                      : 'text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {resolution === 'skip' ? 'Skip' : resolution === 'update' ? 'Update' : 'Create New'}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          Back
        </button>
        <button
          onClick={onContinue}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Import Now
        </button>
      </div>
    </div>
  );
}
