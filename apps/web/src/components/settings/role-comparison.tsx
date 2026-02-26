'use client';

import { useState, useMemo } from 'react';
import { X, Check, Eye, EyeOff } from 'lucide-react';
import {
  PERMISSION_GROUPS,
  getAllGroupPerms,
  getPermLabel,
} from './permission-groups';

// ── Types ────────────────────────────────────────────────────

export interface ComparisonRole {
  id: string;
  name: string;
  permissions: string[];
}

export interface RoleComparisonViewProps {
  roles: ComparisonRole[];
  onClose: () => void;
}

// ── Component ────────────────────────────────────────────────

export function RoleComparisonView({ roles, onClose }: RoleComparisonViewProps) {
  const [differencesOnly, setDifferencesOnly] = useState(false);

  // Build permission sets for quick lookup
  const permSets = useMemo(
    () => roles.map((r) => new Set(r.permissions)),
    [roles],
  );

  // Get all unique permissions across all selected roles, organized by group
  const groupedRows = useMemo(() => {
    const allPerms = new Set<string>();
    for (const role of roles) {
      for (const p of role.permissions) allPerms.add(p);
    }

    const result: Array<{
      type: 'group-header' | 'subgroup-header' | 'permission';
      label: string;
      permKey?: string;
      hasDiff?: boolean;
      groupLabel?: string;
    }> = [];

    for (const group of PERMISSION_GROUPS) {
      const groupPerms = getAllGroupPerms(group);
      const relevantPerms = groupPerms.filter((p) => allPerms.has(p));
      if (relevantPerms.length === 0) continue;

      // Check if any perm in this group differs across roles
      const groupHasDiff = relevantPerms.some((p) => {
        const first = permSets[0]?.has(p);
        return permSets.some((s) => s.has(p) !== first);
      });

      if (differencesOnly && !groupHasDiff) continue;

      result.push({ type: 'group-header', label: group.label, hasDiff: groupHasDiff });

      if (group.permissions) {
        for (const perm of group.permissions) {
          if (!allPerms.has(perm)) continue;
          const hasDiff = permSets.some((s) => s.has(perm) !== permSets[0]?.has(perm));
          if (differencesOnly && !hasDiff) continue;
          result.push({ type: 'permission', label: getPermLabel(perm), permKey: perm, hasDiff, groupLabel: group.label });
        }
      }

      if (group.subGroups) {
        for (const sg of group.subGroups) {
          const sgRelevant = sg.permissions.filter((p) => allPerms.has(p));
          if (sgRelevant.length === 0) continue;

          const sgHasDiff = sgRelevant.some((p) => {
            const first = permSets[0]?.has(p);
            return permSets.some((s) => s.has(p) !== first);
          });
          if (differencesOnly && !sgHasDiff) continue;

          result.push({ type: 'subgroup-header', label: sg.label, hasDiff: sgHasDiff, groupLabel: group.label });
          for (const perm of sg.permissions) {
            if (!allPerms.has(perm)) continue;
            const hasDiff = permSets.some((s) => s.has(perm) !== permSets[0]?.has(perm));
            if (differencesOnly && !hasDiff) continue;
            result.push({ type: 'permission', label: getPermLabel(perm), permKey: perm, hasDiff, groupLabel: group.label });
          }
        }
      }
    }

    return result;
  }, [roles, permSets, differencesOnly]);

  const diffCount = useMemo(() => {
    const allPerms = new Set<string>();
    for (const r of roles) for (const p of r.permissions) allPerms.add(p);
    let count = 0;
    for (const p of allPerms) {
      const first = permSets[0]?.has(p);
      if (permSets.some((s) => s.has(p) !== first)) count++;
    }
    return count;
  }, [roles, permSets]);

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-foreground">
            Comparing {roles.length} Roles
          </h3>
          <span className="text-xs text-muted-foreground">
            {diffCount} difference{diffCount !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDifferencesOnly(!differencesOnly)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              differencesOnly
                ? 'bg-amber-500/15 text-amber-500'
                : 'bg-muted text-muted-foreground hover:bg-muted'
            }`}
          >
            {differencesOnly ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {differencesOnly ? 'Differences Only' : 'Show All'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Scrollable table */}
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="bg-muted">
              <th className="sticky left-0 z-10 bg-muted px-4 py-2.5 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase">
                Permission
              </th>
              {roles.map((r) => (
                <th key={r.id} className="px-4 py-2.5 text-center text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {groupedRows.map((row, idx) => {
              if (row.type === 'group-header') {
                return (
                  <tr key={`gh-${idx}`} className="bg-muted/50">
                    <td
                      colSpan={roles.length + 1}
                      className="px-4 py-2 text-xs font-bold tracking-wide text-foreground uppercase"
                    >
                      {row.label}
                    </td>
                  </tr>
                );
              }

              if (row.type === 'subgroup-header') {
                return (
                  <tr key={`sg-${idx}`}>
                    <td
                      colSpan={roles.length + 1}
                      className="px-4 py-1.5 pl-8 text-xs font-semibold text-muted-foreground"
                    >
                      {row.label}
                    </td>
                  </tr>
                );
              }

              // Permission row
              return (
                <tr
                  key={`p-${row.permKey}`}
                  className={row.hasDiff ? 'bg-amber-500/10' : ''}
                >
                  <td className="sticky left-0 z-10 bg-inherit px-4 py-2 pl-10">
                    <div className="text-sm text-foreground">{row.label}</div>
                    <div className="text-xs font-mono text-muted-foreground">{row.permKey}</div>
                  </td>
                  {permSets.map((pSet, i) => (
                    <td key={roles[i]!.id} className="px-4 py-2 text-center">
                      {pSet.has(row.permKey!) ? (
                        <Check className="mx-auto h-4 w-4 text-green-500" />
                      ) : (
                        <span className="inline-block h-4 w-4 rounded-full border border-border" />
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
