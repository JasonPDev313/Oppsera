'use client';

import { Plus, X } from 'lucide-react';
import { ConditionRow } from './ConditionRow';
import type { SmartTagCondition } from './ConditionRow';

export interface ConditionGroup {
  conditions: SmartTagCondition[];
}

function emptyCondition(): SmartTagCondition {
  return { metric: '', operator: 'gt', value: '' };
}

interface ConditionGroupEditorProps {
  groups: ConditionGroup[];
  onChange: (groups: ConditionGroup[]) => void;
}

export function ConditionGroupEditor({ groups, onChange }: ConditionGroupEditorProps) {
  const handleConditionChange = (groupIdx: number, condIdx: number, updated: SmartTagCondition) => {
    const next = groups.map((g, gi) =>
      gi === groupIdx
        ? { conditions: g.conditions.map((c, ci) => (ci === condIdx ? updated : c)) }
        : g,
    );
    onChange(next);
  };

  const handleRemoveCondition = (groupIdx: number, condIdx: number) => {
    const next = groups.map((g, gi) =>
      gi === groupIdx
        ? { conditions: g.conditions.filter((_, ci) => ci !== condIdx) }
        : g,
    );
    onChange(next);
  };

  const handleAddCondition = (groupIdx: number) => {
    const next = groups.map((g, gi) =>
      gi === groupIdx
        ? { conditions: [...g.conditions, emptyCondition()] }
        : g,
    );
    onChange(next);
  };

  const handleRemoveGroup = (groupIdx: number) => {
    onChange(groups.filter((_, gi) => gi !== groupIdx));
  };

  const handleAddGroup = () => {
    onChange([...groups, { conditions: [emptyCondition()] }]);
  };

  return (
    <div className="space-y-3">
      {groups.map((group, groupIdx) => (
        <div key={groupIdx}>
          {/* OR divider between groups */}
          {groupIdx > 0 && (
            <div className="flex items-center gap-3 py-2">
              <div className="flex-1 border-t border-border" />
              <span className="shrink-0 rounded-full bg-indigo-500/20 px-3 py-0.5 text-xs font-semibold uppercase text-indigo-500">
                OR
              </span>
              <div className="flex-1 border-t border-border" />
            </div>
          )}

          {/* Group card */}
          <div className="relative rounded-lg border border-border bg-surface p-4">
            {/* Remove group button */}
            <button
              type="button"
              onClick={() => handleRemoveGroup(groupIdx)}
              disabled={groups.length <= 1}
              className="absolute right-2 top-2 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
              title="Remove group"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="pr-8">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Condition Group {groupIdx + 1}
              </p>

              <div className="space-y-2">
                {group.conditions.map((cond, condIdx) => (
                  <div key={condIdx}>
                    {/* AND label between conditions */}
                    {condIdx > 0 && (
                      <div className="flex items-center gap-2 py-1 pl-2">
                        <span className="text-xs font-semibold uppercase text-muted-foreground">
                          AND
                        </span>
                        <div className="flex-1 border-t border-dashed border-border" />
                      </div>
                    )}

                    <ConditionRow
                      condition={cond}
                      onChange={(updated) => handleConditionChange(groupIdx, condIdx, updated)}
                      onRemove={() => handleRemoveCondition(groupIdx, condIdx)}
                      canRemove={group.conditions.length > 1}
                    />
                  </div>
                ))}
              </div>

              {/* Add condition button */}
              <button
                type="button"
                onClick={() => handleAddCondition(groupIdx)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-500/10"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Condition
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Add group button */}
      <button
        type="button"
        onClick={handleAddGroup}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-500/5"
      >
        <Plus className="h-4 w-4" />
        Add Group (OR)
      </button>
    </div>
  );
}
