'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Loader2, Check, ChevronsUpDown, Shield, AlertTriangle } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useDialogA11y } from '@/lib/dialog-a11y';
import { SearchInput } from '@/components/ui/search-input';
import {
  PERMISSION_GROUPS,
  CATEGORY_TABS,
  TOTAL_PERMISSION_COUNT,
  getAllGroupPerms,
  getPermLabel,
  getPermMeta,
  permMatchesSearch,
} from './permission-groups';
import type { PermissionGroupEntry, PermissionSubGroup } from './permission-groups';

// ── Types ────────────────────────────────────────────────────

export interface RoleEditorPanelProps {
  editRole: {
    id: string;
    name: string;
    description: string | null;
    permissions: string[];
    isSystem: boolean;
  } | null; // null = creating new
  initialPermissions?: string[]; // for duplicate mode
  initialName?: string; // for duplicate mode
  onClose: () => void;
  onSaved: () => void;
}

// ── Coverage Bar ─────────────────────────────────────────────

function CoverageBar({ selected, total, className = '' }: { selected: number; total: number; className?: string }) {
  const pct = total > 0 ? (selected / total) * 100 : 0;
  const color = pct === 100 ? 'bg-green-500' : pct > 0 ? 'bg-amber-400' : 'bg-muted';

  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-muted ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-300 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Permission Badge ─────────────────────────────────────────

function PermBadges({ permKey }: { permKey: string }) {
  const meta = getPermMeta(permKey);
  if (!meta) return null;
  return (
    <span className="inline-flex gap-1">
      {meta.requiresManagerPin && (
        <span className="inline-flex items-center rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-medium text-amber-500" title="Requires Manager PIN">
          PIN
        </span>
      )}
      {meta.requiresAudit && (
        <span className="inline-flex items-center rounded bg-purple-500/15 px-1 py-0.5 text-[9px] font-medium text-purple-500" title="Audit Required">
          Audit
        </span>
      )}
    </span>
  );
}

// ── Main Component ───────────────────────────────────────────

export function RoleEditorPanel({
  editRole: role,
  initialPermissions,
  initialName,
  onClose,
  onSaved,
}: RoleEditorPanelProps) {
  const isEditing = !!role;
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Form state ─────────────────────────────────────────────
  const [name, setName] = useState(initialName ?? role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(
    () => new Set(initialPermissions ?? role?.permissions ?? []),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Original perms snapshot for diffing ─────────────────────
  const originalPermsRef = useRef<Set<string>>(new Set(role?.permissions ?? []));

  // ── UI state ───────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryTab, setActiveCategoryTab] = useState('all');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const perms = initialPermissions ?? role?.permissions ?? [];
    if (perms.length === 0) return new Set<string>();
    const expanded = new Set<string>();
    for (const group of PERMISSION_GROUPS) {
      const all = getAllGroupPerms(group);
      if (all.some((p) => perms.includes(p))) {
        expanded.add(group.label);
      }
    }
    return expanded;
  });
  const [showChangeSummary, setShowChangeSummary] = useState(false);

  // ── Accessibility ──────────────────────────────────────────
  useDialogA11y(panelRef, true, {
    labelledBy: 'role-editor-title',
    onClose,
    role: 'dialog',
  });

  // ── Computed: changes diff ─────────────────────────────────
  const changes = useMemo(() => {
    const added = new Set<string>();
    const removed = new Set<string>();
    for (const p of selectedPerms) {
      if (!originalPermsRef.current.has(p)) added.add(p);
    }
    for (const p of originalPermsRef.current) {
      if (!selectedPerms.has(p)) removed.add(p);
    }
    return { added, removed, hasChanges: added.size > 0 || removed.size > 0 };
  }, [selectedPerms]);

  // ── Computed: all perms for current category tab ──────────
  const categoryPerms = useMemo(() => {
    if (activeCategoryTab === 'all') return null;
    const tab = CATEGORY_TABS.find((t) => t.key === activeCategoryTab);
    if (!tab || tab.groupLabels.length === 0) return null;
    return PERMISSION_GROUPS
      .filter((g) => tab.groupLabels.includes(g.label))
      .flatMap((g) => getAllGroupPerms(g));
  }, [activeCategoryTab]);

  // ── Computed: filtered groups ──────────────────────────────
  const filteredGroups = useMemo(() => {
    let groups = PERMISSION_GROUPS;

    // Filter by category tab
    if (activeCategoryTab !== 'all') {
      const tab = CATEGORY_TABS.find((t) => t.key === activeCategoryTab);
      if (tab && tab.groupLabels.length > 0) {
        groups = groups.filter((g) => tab.groupLabels.includes(g.label));
      }
    }

    // Filter by search query
    if (searchQuery.trim()) {
      groups = groups
        .map((group) => {
          if (group.permissions) {
            const matching = group.permissions.filter((p) =>
              permMatchesSearch(p, group.label, null, searchQuery),
            );
            if (matching.length === 0) return null;
            return { ...group, permissions: matching };
          }
          if (group.subGroups) {
            const matchingSubs = group.subGroups
              .map((sg) => {
                const matching = sg.permissions.filter((p) =>
                  permMatchesSearch(p, group.label, sg.label, searchQuery),
                );
                if (matching.length === 0) return null;
                return { ...sg, permissions: matching };
              })
              .filter(Boolean) as PermissionSubGroup[];
            if (matchingSubs.length === 0) return null;
            return { ...group, subGroups: matchingSubs };
          }
          return group;
        })
        .filter(Boolean) as PermissionGroupEntry[];
    }

    return groups;
  }, [activeCategoryTab, searchQuery]);

  // Auto-expand groups that match search
  useEffect(() => {
    if (searchQuery.trim()) {
      setExpandedGroups(new Set(filteredGroups.map((g) => g.label)));
    }
  }, [searchQuery, filteredGroups]);

  // ── Helpers ────────────────────────────────────────────────
  const togglePerm = useCallback((perm: string) => {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((perms: string[]) => {
    setSelectedPerms((prev) => {
      const allSelected = perms.every((p) => prev.has(p));
      const next = new Set(prev);
      for (const p of perms) {
        if (allSelected) next.delete(p);
        else next.add(p);
      }
      return next;
    });
  }, []);

  const expandAll = () => setExpandedGroups(new Set(PERMISSION_GROUPS.map((g) => g.label)));
  const collapseAll = () => setExpandedGroups(new Set());

  const toggleExpanded = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  // ── Submit ─────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (selectedPerms.size === 0) {
      setError('At least one permission is required');
      return;
    }
    if (!name.trim()) {
      setError('Role name is required');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (isEditing) {
        await apiFetch(`/api/v1/roles/${role.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: role.isSystem ? undefined : name,
            description,
            permissions: [...selectedPerms],
          }),
        });
      } else {
        await apiFetch('/api/v1/roles', {
          method: 'POST',
          body: JSON.stringify({
            name,
            description: description || undefined,
            permissions: [...selectedPerms],
          }),
        });
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('An error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────
  const panel = (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative flex h-full w-[720px] max-w-[90vw] flex-col bg-surface shadow-2xl"
      >
        {/* ── Sticky Header ───────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-indigo-500" />
            <h2 id="role-editor-title" className="text-lg font-semibold text-foreground">
              {isEditing ? `Edit: ${role.name}` : initialPermissions ? 'Duplicate Role' : 'Create Role'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving || !name.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {isEditing ? 'Save Changes' : 'Create Role'}
            </button>
          </div>
        </div>

        {/* ── Scrollable Content ──────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-500">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Name + Description */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-foreground">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isEditing && role.isSystem}
                className="mt-1 block w-full rounded-lg border border-input px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-muted"
                placeholder="e.g. Shift Lead"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-input px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="What can this role do?"
              />
            </div>
          </div>

          {/* Permissions section header */}
          <div className="mt-6 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Permissions</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={expandAll}
                className="text-xs font-medium text-indigo-500 hover:text-indigo-400"
              >
                Expand All
              </button>
              <span className="text-muted-foreground/50">|</span>
              <button
                type="button"
                onClick={collapseAll}
                className="text-xs font-medium text-indigo-500 hover:text-indigo-400"
              >
                Collapse All
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="mt-3">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search permissions..."
              debounceMs={200}
            />
          </div>

          {/* Category tabs */}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {CATEGORY_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveCategoryTab(tab.key)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    activeCategoryTab === tab.key
                      ? 'bg-indigo-600 text-white'
                      : 'bg-muted text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {categoryPerms && categoryPerms.length > 0 && (
              <div className="ml-auto flex shrink-0 items-center gap-2 pb-1">
                {categoryPerms.every((p) => selectedPerms.has(p)) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPerms((prev) => {
                        const next = new Set(prev);
                        for (const p of categoryPerms) next.delete(p);
                        return next;
                      });
                    }}
                    className="rounded-md border border-red-500/30 px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10"
                  >
                    Disable All
                  </button>
                ) : categoryPerms.some((p) => selectedPerms.has(p)) ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPerms((prev) => {
                          const next = new Set(prev);
                          for (const p of categoryPerms) next.add(p);
                          return next;
                        });
                      }}
                      className="rounded-md border border-input px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
                    >
                      Enable All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPerms((prev) => {
                          const next = new Set(prev);
                          for (const p of categoryPerms) next.delete(p);
                          return next;
                        });
                      }}
                      className="rounded-md border border-red-500/30 px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10"
                    >
                      Disable All
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPerms((prev) => {
                        const next = new Set(prev);
                        for (const p of categoryPerms) next.add(p);
                        return next;
                      });
                    }}
                    className="rounded-md border border-input px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
                  >
                    Enable All
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Overall coverage */}
          <div className="mt-4 flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">
              Overall: {selectedPerms.size}/{TOTAL_PERMISSION_COUNT}
            </span>
            <CoverageBar selected={selectedPerms.size} total={TOTAL_PERMISSION_COUNT} className="max-w-xs" />
          </div>

          {/* Permission groups */}
          <div className="mt-4 space-y-2">
            {filteredGroups.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No permissions match your search.</p>
            )}

            {filteredGroups.map((group) => {
              const allPerms = getAllGroupPerms(group);
              const selectedCount = allPerms.filter((p) => selectedPerms.has(p)).length;
              const allSelected = selectedCount === allPerms.length && allPerms.length > 0;
              const someSelected = selectedCount > 0;
              const isExpanded = expandedGroups.has(group.label);

              return (
                <div key={group.label} className="rounded-lg border border-border overflow-hidden">
                  {/* Group header */}
                  <div className="flex items-center gap-3 bg-muted/50 px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                      onChange={() => toggleGroup(allPerms)}
                      className="h-4 w-4 rounded border-input text-indigo-500 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => toggleExpanded(group.label)}
                      className="flex flex-1 items-center gap-2 text-left"
                    >
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <span className="text-sm font-medium text-foreground">{group.label}</span>
                    </button>
                    <span className="text-xs font-medium text-muted-foreground">
                      {selectedCount}/{allPerms.length}
                    </span>
                    <CoverageBar selected={selectedCount} total={allPerms.length} className="w-16" />
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t border-border px-4 py-3">
                      {/* Flat permissions */}
                      {group.permissions && (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {group.permissions.map((perm) => (
                            <PermissionItem
                              key={perm}
                              permKey={perm}
                              checked={selectedPerms.has(perm)}
                              onChange={() => togglePerm(perm)}
                            />
                          ))}
                        </div>
                      )}

                      {/* Sub-grouped permissions */}
                      {group.subGroups && (
                        <div className="space-y-3">
                          {group.subGroups.map((sg) => {
                            const sgAll = sg.permissions.every((p) => selectedPerms.has(p));
                            const sgSome = sg.permissions.some((p) => selectedPerms.has(p));
                            return (
                              <div key={sg.label}>
                                <div className="flex items-center gap-2 mb-1.5">
                                  <input
                                    type="checkbox"
                                    checked={sgAll}
                                    ref={(el) => { if (el) el.indeterminate = sgSome && !sgAll; }}
                                    onChange={() => toggleGroup(sg.permissions)}
                                    className="h-3.5 w-3.5 rounded border-input text-indigo-500 focus:ring-indigo-500"
                                  />
                                  <span className="text-xs font-semibold text-muted-foreground">{sg.label}</span>
                                  {sgAll && (
                                    <Check className="h-3 w-3 text-green-500" />
                                  )}
                                </div>
                                <div className="ml-5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                                  {sg.permissions.map((perm) => (
                                    <PermissionItem
                                      key={perm}
                                      permKey={perm}
                                      checked={selectedPerms.has(perm)}
                                      onChange={() => togglePerm(perm)}
                                    />
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Sticky Footer (change summary) ──────────────── */}
        {isEditing && changes.hasChanges && (
          <div className="shrink-0 border-t border-border bg-surface px-6 py-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowChangeSummary(!showChangeSummary)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronsUpDown className="h-4 w-4" />
                <span className="font-medium">
                  {changes.added.size > 0 && (
                    <span className="text-green-500">+{changes.added.size} added</span>
                  )}
                  {changes.added.size > 0 && changes.removed.size > 0 && ', '}
                  {changes.removed.size > 0 && (
                    <span className="text-red-500">-{changes.removed.size} removed</span>
                  )}
                </span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Save Changes
                </button>
              </div>
            </div>

            {/* Expanded change list */}
            {showChangeSummary && (
              <div className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-muted p-3 text-xs">
                {[...changes.added].map((p) => (
                  <div key={`add-${p}`} className="flex items-center gap-2 py-0.5">
                    <span className="font-medium text-green-500">+</span>
                    <span className="text-foreground">{getPermLabel(p)}</span>
                    <span className="font-mono text-muted-foreground">{p}</span>
                  </div>
                ))}
                {[...changes.removed].map((p) => (
                  <div key={`rm-${p}`} className="flex items-center gap-2 py-0.5">
                    <span className="font-medium text-red-500">-</span>
                    <span className="text-foreground line-through">{getPermLabel(p)}</span>
                    <span className="font-mono text-muted-foreground">{p}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}

// ── Permission Item ──────────────────────────────────────────

function PermissionItem({
  permKey,
  checked,
  onChange,
}: {
  permKey: string;
  checked: boolean;
  onChange: () => void;
}) {
  const label = getPermLabel(permKey);
  return (
    <label className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-3.5 w-3.5 rounded border-input text-indigo-500 focus:ring-indigo-500"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-foreground">{label}</span>
          <PermBadges permKey={permKey} />
        </div>
        <span className="text-xs font-mono text-muted-foreground">{permKey}</span>
      </div>
    </label>
  );
}
