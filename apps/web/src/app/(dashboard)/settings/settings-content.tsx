'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Loader2, Check, Grid3X3, List, MapPin, Store, Monitor, MoreVertical, Copy, GitCompare, Trash2, Lock } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { usePermissionsContext } from '@/components/permissions-provider';
import { useEntitlementsContext } from '@/components/entitlements-provider';
import { AuditLogViewer } from '@/components/audit-log-viewer';
import { useRoleAccess } from '@/hooks/use-role-access';
import { RoleAccessDialog } from '@/components/settings/role-access-dialog';
import { RoleEditorPanel } from '@/components/settings/role-editor-panel';
import { RoleComparisonView } from '@/components/settings/role-comparison';
import { PERMISSION_GROUPS, getAllGroupPerms, getPermLabel, TOTAL_PERMISSION_COUNT } from '@/components/settings/permission-groups';
import { useRoles as useRolesQuery, useInvalidateSettingsData } from '@/hooks/use-settings-data';
import type { RoleListItem } from '@/hooks/use-settings-data';

// ── Types ────────────────────────────────────────────────────────

type Role = RoleListItem;

interface RoleDetail extends Omit<Role, 'userCount'> {
  assignedUsers: Array<{
    id: string;
    email: string;
    name: string;
    locationId: string | null;
  }>;
}

// Permission groups are imported from @/components/settings/permission-groups

// ── Roles Tab ────────────────────────────────────────────────────

export function RolesTab({ canManage }: { canManage: boolean }) {
  const { data: roles = [], isLoading } = useRolesQuery();
  const { invalidateRoles } = useInvalidateSettingsData();
  const [selectedRole, setSelectedRole] = useState<RoleDetail | null>(null);
  const [showAccessDialog, setShowAccessDialog] = useState(false);
  const [actionsOpenId, setActionsOpenId] = useState<string | null>(null);

  // Editor panel state
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | 'duplicate' | null>(null);
  const [duplicateSource, setDuplicateSource] = useState<RoleDetail | null>(null);

  // Compare state
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<Set<string>>(new Set());
  const [showComparison, setShowComparison] = useState(false);

  const handleSelectRole = useCallback(async (roleId: string) => {
    if (compareMode) return; // Don't select in compare mode
    try {
      const response = await apiFetch<{ data: RoleDetail }>(`/api/v1/roles/${roleId}`);
      setSelectedRole(response.data);
    } catch {
      // Ignore
    }
  }, [compareMode]);

  const handleDeleteRole = useCallback(
    async (roleId: string) => {
      if (!confirm('Are you sure you want to delete this role?')) return;
      try {
        await apiFetch(`/api/v1/roles/${roleId}`, { method: 'DELETE' });
        setSelectedRole(null);
        invalidateRoles();
      } catch (err) {
        if (err instanceof ApiError) {
          alert(err.message);
        }
      }
    },
    [invalidateRoles],
  );

  const handleDuplicate = useCallback(async (roleId: string) => {
    try {
      const response = await apiFetch<{ data: RoleDetail }>(`/api/v1/roles/${roleId}`);
      setDuplicateSource(response.data);
      setEditorMode('duplicate');
    } catch {
      // Ignore
    }
  }, []);

  const handleEdit = useCallback(async (roleId: string) => {
    try {
      const response = await apiFetch<{ data: RoleDetail }>(`/api/v1/roles/${roleId}`);
      setSelectedRole(response.data);
      setEditorMode('edit');
    } catch {
      // Ignore
    }
  }, []);

  const handleToggleCompare = useCallback((roleId: string) => {
    setCompareSelection((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  }, []);

  const comparisonRoles = roles
    .filter((r) => compareSelection.has(r.id))
    .map((r) => ({ id: r.id, name: r.name, permissions: r.permissions ?? [] }));

  const closeEditor = () => {
    setEditorMode(null);
    setDuplicateSource(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      <div className="flex-1">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Roles</h2>
          <div className="flex items-center gap-2">
            {/* Compare toggle */}
            <button
              type="button"
              onClick={() => {
                if (compareMode) {
                  setCompareMode(false);
                  setCompareSelection(new Set());
                  setShowComparison(false);
                } else {
                  setCompareMode(true);
                }
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                compareMode
                  ? 'bg-amber-500/15 text-amber-500 border border-amber-400/30'
                  : 'border border-border text-foreground hover:bg-accent'
              }`}
            >
              <GitCompare className="h-4 w-4" />
              {compareMode ? 'Exit Compare' : 'Compare'}
            </button>

            {/* Compare action */}
            {compareMode && compareSelection.size >= 2 && (
              <button
                type="button"
                onClick={() => setShowComparison(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Compare {compareSelection.size} Roles
              </button>
            )}

            {canManage && !compareMode && (
              <button
                type="button"
                onClick={() => setEditorMode('create')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                <Plus className="h-4 w-4" />
                Create Role
              </button>
            )}
          </div>
        </div>

        {/* Compare mode hint */}
        {compareMode && compareSelection.size < 2 && (
          <p className="mt-2 text-sm text-amber-500">
            Select 2-3 roles to compare their permissions side by side.
          </p>
        )}

        {/* Roles table */}
        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                {compareMode && (
                  <th className="w-10 px-3 py-3" />
                )}
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Description
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Users
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Permissions
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Type
                </th>
                {canManage && !compareMode && (
                  <th className="w-12 px-2 py-3" />
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {roles.map((role) => {
                const permCount = role.permissions?.length ?? 0;
                const coveragePct = TOTAL_PERMISSION_COUNT > 0
                  ? Math.round((permCount / TOTAL_PERMISSION_COUNT) * 100)
                  : 0;
                const isActionsOpen = actionsOpenId === role.id;

                return (
                  <tr
                    key={role.id}
                    onClick={() => compareMode ? handleToggleCompare(role.id) : handleSelectRole(role.id)}
                    className={`cursor-pointer hover:bg-accent ${
                      compareSelection.has(role.id) ? 'bg-indigo-500/10' : ''
                    }`}
                  >
                    {compareMode && (
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={compareSelection.has(role.id)}
                          onChange={() => handleToggleCompare(role.id)}
                          disabled={!compareSelection.has(role.id) && compareSelection.size >= 3}
                          className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500 disabled:opacity-40"
                        />
                      </td>
                    )}
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground">
                      {role.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {role.description || '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                      {role.userCount}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{permCount}</span>
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full transition-all ${
                              coveragePct === 100 ? 'bg-green-500' : coveragePct > 0 ? 'bg-amber-400' : 'bg-muted'
                            }`}
                            style={{ width: `${coveragePct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {role.isSystem ? (
                        <span className="inline-flex rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-500">
                          System
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-muted0/15 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          Custom
                        </span>
                      )}
                    </td>
                    {canManage && !compareMode && (
                      <td className="relative px-2 py-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setActionsOpenId(isActionsOpen ? null : role.id)}
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>

                        {isActionsOpen && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setActionsOpenId(null)} />
                            <div className="absolute right-2 top-full z-20 mt-1 w-40 rounded-lg border border-border bg-surface py-1 shadow-lg">
                              {(role.isSystem ? role.name !== 'owner' : true) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActionsOpenId(null);
                                    handleEdit(role.id);
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  Edit
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setActionsOpenId(null);
                                  handleDuplicate(role.id);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent"
                              >
                                <Copy className="h-3.5 w-3.5" />
                                Duplicate
                              </button>
                              {!role.isSystem && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActionsOpenId(null);
                                    handleDeleteRole(role.id);
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Delete
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Comparison view */}
        {showComparison && comparisonRoles.length >= 2 && (
          <RoleComparisonView
            roles={comparisonRoles}
            onClose={() => setShowComparison(false)}
          />
        )}
      </div>

      {/* Role detail side panel */}
      {selectedRole && !compareMode && (
        <div className="w-96 shrink-0 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">{selectedRole.name}</h3>
              {selectedRole.isSystem && (
                <span className="inline-flex rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-500">
                  System
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {canManage && (selectedRole.isSystem ? selectedRole.name !== 'owner' : true) && (
                <button
                  type="button"
                  onClick={() => setEditorMode('edit')}
                  className="rounded px-2 py-1 text-xs font-medium text-indigo-500 hover:bg-indigo-500/10"
                >
                  Edit
                </button>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={() => handleDuplicate(selectedRole.id)}
                  className="rounded px-2 py-1 text-xs font-medium text-indigo-500 hover:bg-indigo-500/10"
                >
                  Duplicate
                </button>
              )}
              {canManage && !selectedRole.isSystem && (
                <button
                  type="button"
                  onClick={() => handleDeleteRole(selectedRole.id)}
                  className="rounded px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10"
                >
                  Delete
                </button>
              )}
              <button type="button" onClick={() => setSelectedRole(null)}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>
          {selectedRole.description && (
            <p className="mt-1 text-xs text-muted-foreground">{selectedRole.description}</p>
          )}

          <div className="mt-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">
              Permissions ({selectedRole.permissions.length})
            </h4>
            <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
              {PERMISSION_GROUPS.map((group) => {
                const allPerms = getAllGroupPerms(group);
                const active = allPerms.filter((p) => selectedRole.permissions.includes(p));
                if (active.length === 0) return null;
                const isFullGroup = active.length === allPerms.length;
                return (
                  <div key={group.label}>
                    <div className="flex items-center gap-1.5">
                      {isFullGroup ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <span className="inline-block h-3 w-3 rounded-full border-2 border-amber-400" />
                      )}
                      <span className="text-xs font-semibold text-foreground">{group.label}</span>
                      <span className="text-xs text-muted-foreground">{active.length}/{allPerms.length}</span>
                    </div>
                    {!isFullGroup && (
                      <div className="ml-5 mt-0.5 flex flex-wrap gap-1">
                        {active.map((perm) => (
                          <span
                            key={perm}
                            className="inline-flex rounded bg-muted0/10 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                            title={perm}
                          >
                            {getPermLabel(perm)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Show any permissions not in groups */}
              {(() => {
                const allGrouped = new Set(PERMISSION_GROUPS.flatMap(getAllGroupPerms));
                const ungrouped = selectedRole.permissions.filter((p) => !allGrouped.has(p));
                if (ungrouped.length === 0) return null;
                return (
                  <div>
                    <span className="text-xs font-semibold text-foreground">Other</span>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {ungrouped.map((perm) => (
                        <span
                          key={perm}
                          className="inline-flex rounded bg-muted0/10 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          title={perm}
                        >
                          {getPermLabel(perm)}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="mt-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">
              Assigned Users ({selectedRole.assignedUsers.length})
            </h4>
            <div className="mt-2 space-y-1">
              {selectedRole.assignedUsers.map((user, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-medium text-indigo-500">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-foreground">{user.name}</span>
                  <span className="text-xs text-muted-foreground">{user.email}</span>
                </div>
              ))}
              {selectedRole.assignedUsers.length === 0 && (
                <p className="text-xs text-muted-foreground">No users assigned</p>
              )}
            </div>
          </div>

          {/* Access Scope */}
          <RoleAccessSection
            roleId={selectedRole.id}
            canManage={canManage}
            onEditAccess={() => setShowAccessDialog(true)}
          />
        </div>
      )}

      {/* Role Editor Panel */}
      {editorMode === 'create' && (
        <RoleEditorPanel
          editRole={null}
          onClose={closeEditor}
          onSaved={() => {
            closeEditor();
            invalidateRoles();
          }}
        />
      )}

      {editorMode === 'edit' && selectedRole && (
        <RoleEditorPanel
          editRole={selectedRole}
          onClose={closeEditor}
          onSaved={() => {
            closeEditor();
            invalidateRoles();
            handleSelectRole(selectedRole.id);
          }}
        />
      )}

      {editorMode === 'duplicate' && duplicateSource && (
        <RoleEditorPanel
          editRole={null}
          initialPermissions={[...duplicateSource.permissions]}
          initialName={`${duplicateSource.name} (Copy)`}
          onClose={closeEditor}
          onSaved={() => {
            closeEditor();
            invalidateRoles();
          }}
        />
      )}

      {/* Role Access Dialog */}
      {showAccessDialog && selectedRole && (
        <RoleAccessDialog
          roleId={selectedRole.id}
          roleName={selectedRole.name}
          onClose={() => setShowAccessDialog(false)}
          onSaved={() => setShowAccessDialog(false)}
        />
      )}
    </div>
  );
}

// ── Role Access Section (in side panel) ─────────────────────────

function RoleAccessSection({
  roleId,
  canManage,
  onEditAccess,
}: {
  roleId: string;
  canManage: boolean;
  onEditAccess: () => void;
}) {
  const { access, isLoading } = useRoleAccess(roleId);

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground uppercase">
          Access Scope
        </h4>
        {canManage && (
          <button
            type="button"
            onClick={onEditAccess}
            className="rounded px-2 py-1 text-xs font-medium text-indigo-500 hover:bg-indigo-500/10"
          >
            Edit Access
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading...
        </div>
      ) : !access ? (
        <p className="mt-2 text-xs text-muted-foreground">Unable to load access config</p>
      ) : (
        <div className="mt-2 space-y-2">
          {/* Locations */}
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-foreground">
              {access.locationIds.length === 0 ? (
                <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-500">
                  All Locations
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {access.locationIds.length} location{access.locationIds.length !== 1 ? 's' : ''}
                </span>
              )}
            </span>
          </div>
          {/* Profit Centers */}
          <div className="flex items-center gap-2">
            <Store className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-foreground">
              {access.profitCenterIds.length === 0 ? (
                <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-500">
                  All Profit Centers
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {access.profitCenterIds.length} profit center{access.profitCenterIds.length !== 1 ? 's' : ''}
                </span>
              )}
            </span>
          </div>
          {/* Terminals */}
          <div className="flex items-center gap-2">
            <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-foreground">
              {access.terminalIds.length === 0 ? (
                <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-500">
                  All Terminals
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {access.terminalIds.length} terminal{access.terminalIds.length !== 1 ? 's' : ''}
                </span>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// RoleFormDialog replaced by RoleEditorPanel in @/components/settings/role-editor-panel

// ── Modules Tab ──────────────────────────────────────────────────

// Static module registry — matches packages/core/src/entitlements/registry.ts
// Inlined to avoid an API call for data that never changes at runtime.
const MODULES = [
  { key: 'platform_core', name: 'Platform Core', phase: 'v1', description: 'Identity, auth, RBAC, audit logging' },
  { key: 'catalog', name: 'Product Catalog', phase: 'v1', description: 'Items, categories, modifiers, pricing, tax categories' },
  { key: 'pos_retail', name: 'Retail POS', phase: 'v1', description: 'Orders, line items, discounts, tax calculation' },
  { key: 'pos_fnb', name: 'F&B POS', phase: 'v1', description: 'Tables, tabs, coursing, kitchen tickets, server management' },
  { key: 'payments', name: 'Payments & Tenders', phase: 'v1', description: 'Cash (V1), card, split, refund (V2)' },
  { key: 'inventory', name: 'Inventory Management', phase: 'v1', description: 'Stock movements, receiving, adjustments, transfers' },
  { key: 'customers', name: 'Customer Management', phase: 'v1', description: 'Profiles, search, visit/spend tracking' },
  { key: 'marketing', name: 'Marketing Automation', phase: 'v2', description: 'Segments, campaigns, triggered journeys' },
  { key: 'kds', name: 'Kitchen Display', phase: 'v2', description: 'Kitchen order tickets, bump screen' },
  { key: 'golf_ops', name: 'Golf Operations', phase: 'v1', description: 'Tee sheet, starter sheet, pace-of-play' },
  { key: 'pms', name: 'Property Management', phase: 'v1', description: 'Reservations, calendar, front desk, housekeeping, folios, guest profiles' },
  { key: 'room_layouts', name: 'Room Layouts', phase: 'v1', description: 'Floor plan editor, templates, version management' },
  { key: 'reporting', name: 'Reports & Exports', phase: 'v1', description: 'Read models, daily sales, CSV/PDF export' },
  { key: 'semantic', name: 'OppsEra AI Assistant', phase: 'v1', description: 'Ask questions in plain English, get instant analytics, charts, and insights powered by AI' },
  { key: 'accounting', name: 'Accounting & GL', phase: 'v1', description: 'General ledger, chart of accounts, journal entries, financial statements' },
  { key: 'ap', name: 'Accounts Payable', phase: 'v1', description: 'Vendor bills, payments, aging, payment terms' },
  { key: 'ar', name: 'Accounts Receivable', phase: 'v1', description: 'Customer invoices, receipts, aging, statements' },
  { key: 'api_access', name: 'API Access', phase: 'v3', description: 'Public API with OAuth2 client credentials' },
];

function ModuleStatusBadge({ mod, enabled, hasEntitlement, accessMode }: { mod: typeof MODULES[number]; enabled: boolean; hasEntitlement: boolean; accessMode?: string }) {
  const isComingSoon = mod.phase !== 'v1';
  if (isComingSoon) {
    return (
      <span className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-500">
        Coming Soon
      </span>
    );
  }
  if (accessMode === 'locked') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 text-xs font-medium text-purple-500">
        <Lock className="h-3 w-3" /> Locked
      </span>
    );
  }
  if (enabled) {
    return (
      <span className="inline-flex rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-500">
        Active
      </span>
    );
  }
  if (hasEntitlement) {
    return (
      <span className="inline-flex rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-500">
        Disabled
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-muted0/15 px-2 py-0.5 text-xs font-medium text-muted-foreground">
      Not Enabled
    </span>
  );
}

function ModuleActions({
  mod,
  enabled: _enabled,
  hasEntitlement,
  enablingModule,
  togglingModule,
  canEnable,
  canDisable,
  isLocked,
  onEnable,
  onToggle,
}: {
  mod: typeof MODULES[number];
  enabled?: boolean;
  hasEntitlement: boolean;
  enablingModule: string | null;
  togglingModule: string | null;
  canEnable: boolean;
  canDisable: boolean;
  isLocked?: boolean;
  onEnable: (key: string) => void;
  onToggle: (key: string, enable: boolean) => void;
}) {
  if (isLocked) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-purple-500">
        <Lock className="h-3 w-3" />
        Locked by Admin
      </span>
    );
  }
  if (canEnable && !hasEntitlement) {
    return (
      <button
        type="button"
        onClick={() => onEnable(mod.key)}
        disabled={enablingModule === mod.key}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {enablingModule === mod.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        Enable
      </button>
    );
  }
  if (canEnable && hasEntitlement) {
    return (
      <button
        type="button"
        onClick={() => onToggle(mod.key, true)}
        disabled={togglingModule === mod.key}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {togglingModule === mod.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        Enable
      </button>
    );
  }
  if (canDisable) {
    return (
      <button
        type="button"
        onClick={() => onToggle(mod.key, false)}
        disabled={togglingModule === mod.key}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-surface px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10 disabled:opacity-50"
      >
        {togglingModule === mod.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
        Disable
      </button>
    );
  }
  return null;
}

export function ModulesTab() {
  const [enablingModule, setEnablingModule] = useState<string | null>(null);
  const [togglingModule, setTogglingModule] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { entitlements, isModuleEnabled, isModuleLocked, refetch: refetchEntitlements } = useEntitlementsContext();
  const { can } = usePermissionsContext();

  const handleEnableModule = useCallback(async (moduleKey: string) => {
    setEnablingModule(moduleKey);
    try {
      await apiFetch('/api/v1/entitlements', {
        method: 'POST',
        body: JSON.stringify({ moduleKey }),
      });
      await refetchEntitlements();
    } catch (err) {
      if (err instanceof ApiError) {
        alert(err.message);
      }
    } finally {
      setEnablingModule(null);
    }
  }, [refetchEntitlements]);

  const handleToggleModule = useCallback(async (moduleKey: string, enable: boolean) => {
    setTogglingModule(moduleKey);
    try {
      await apiFetch('/api/v1/entitlements', {
        method: 'PATCH',
        body: JSON.stringify({ moduleKey, isEnabled: enable }),
      });
      await refetchEntitlements();
    } catch (err) {
      if (err instanceof ApiError) {
        alert(err.message);
      }
    } finally {
      setTogglingModule(null);
    }
  }, [refetchEntitlements]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Modules</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Modules enabled for your account. Enable available modules or contact support for upgrades.
          </p>
        </div>
        <div className="flex items-center rounded-lg border border-border p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`rounded-md p-1.5 ${viewMode === 'grid' ? 'bg-muted/70 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            title="Grid view"
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`rounded-md p-1.5 ${viewMode === 'list' ? 'bg-muted/70 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            title="List view"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((mod) => {
            const ent = entitlements.get(mod.key);
            const enabled = isModuleEnabled(mod.key);
            const isComingSoon = mod.phase !== 'v1';
            const isCore = mod.key === 'platform_core';
            const hasEntitlement = !!ent;
            const locked = isModuleLocked(mod.key);
            const canEnable = !isComingSoon && !enabled && !isCore && !locked && can('settings.update');
            const canDisable = enabled && !isCore && !locked && can('settings.update');

            return (
              <div
                key={mod.key}
                className={`rounded-lg border p-4 ${
                  locked
                    ? 'border-purple-500/30 bg-surface/50'
                    : enabled
                      ? 'border-border bg-surface'
                      : 'border-border/60 bg-muted0/5'
                }`}
              >
                <div className="flex items-start justify-between">
                  <h3 className={`text-sm font-semibold ${locked ? 'text-purple-400' : enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {mod.name}
                  </h3>
                  <ModuleStatusBadge mod={mod} enabled={enabled} hasEntitlement={hasEntitlement} accessMode={ent?.accessMode} />
                </div>
                <p className={`mt-1.5 text-xs ${enabled ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
                  {mod.description}
                </p>
                {ent && enabled && ent.limits && Object.keys(ent.limits).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(ent.limits).map(([key, value]) => (
                      <span
                        key={key}
                        className="inline-flex rounded bg-indigo-500/10 px-2 py-0.5 text-xs text-indigo-500"
                      >
                        {value} {key.replace('max_', '').replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                )}
                {ent && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Plan: {ent.planTier}
                  </p>
                )}
                <div className="mt-3">
                  <ModuleActions
                    mod={mod}
                    enabled={enabled}
                    hasEntitlement={hasEntitlement}
                    enablingModule={enablingModule}
                    togglingModule={togglingModule}
                    canEnable={canEnable}
                    canDisable={canDisable}
                    isLocked={locked}
                    onEnable={handleEnableModule}
                    onToggle={handleToggleModule}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted0/5">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Module</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                <th className="hidden px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">Plan</th>
                <th className="hidden px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">Limits</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {MODULES.map((mod) => {
                const ent = entitlements.get(mod.key);
                const enabled = isModuleEnabled(mod.key);
                const isComingSoon = mod.phase !== 'v1';
                const isCore = mod.key === 'platform_core';
                const hasEntitlement = !!ent;
                const locked = isModuleLocked(mod.key);
                const canEnable = !isComingSoon && !enabled && !isCore && !locked && can('settings.update');
                const canDisable = enabled && !isCore && !locked && can('settings.update');

                return (
                  <tr key={mod.key} className="hover:bg-accent/30">
                    <td className="px-4 py-3">
                      <p className={`text-sm font-medium ${locked ? 'text-purple-400' : enabled ? 'text-foreground' : 'text-muted-foreground'}`}>{mod.name}</p>
                      <p className={`mt-0.5 text-xs ${enabled ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>{mod.description}</p>
                    </td>
                    <td className="px-4 py-3">
                      <ModuleStatusBadge mod={mod} enabled={enabled} hasEntitlement={hasEntitlement} accessMode={ent?.accessMode} />
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      {ent ? (
                        <span className="text-xs text-muted-foreground">{ent.planTier}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">&mdash;</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      {ent && enabled && ent.limits && Object.keys(ent.limits).length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(ent.limits).map(([key, value]) => (
                            <span
                              key={key}
                              className="inline-flex rounded bg-indigo-500/10 px-2 py-0.5 text-xs text-indigo-500"
                            >
                              {value} {key.replace('max_', '').replace('_', ' ')}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">&mdash;</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ModuleActions
                        mod={mod}
                        enabled={enabled}
                        hasEntitlement={hasEntitlement}
                        enablingModule={enablingModule}
                        togglingModule={togglingModule}
                        canEnable={canEnable}
                        canDisable={canDisable}
                        isLocked={locked}
                        onEnable={handleEnableModule}
                        onToggle={handleToggleModule}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Dashboard Settings Tab ─────────────────────────────────────────

const DASHBOARD_PREFS_KEY = 'dashboard_prefs';
const DASHBOARD_NOTES_KEY = 'dashboard_notes';

interface DashboardPrefs {
  showSales: boolean;
  showOrders: boolean;
  showLowStock: boolean;
  showNotes: boolean;
  showRecentOrders: boolean;
}

const DEFAULT_DASHBOARD_PREFS: DashboardPrefs = {
  showSales: true,
  showOrders: true,
  showLowStock: true,
  showNotes: true,
  showRecentOrders: true,
};

export function DashboardSettingsTab() {
  const [prefs, setPrefs] = useState<DashboardPrefs>(DEFAULT_DASHBOARD_PREFS);
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DASHBOARD_PREFS_KEY);
      if (raw) setPrefs({ ...DEFAULT_DASHBOARD_PREFS, ...JSON.parse(raw) });
      setNotes(localStorage.getItem(DASHBOARD_NOTES_KEY) ?? '');
    } catch { /* ignore */ }
  }, []);

  const handleToggle = useCallback((key: keyof DashboardPrefs) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(DASHBOARD_PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    flashSaved();
  }, []);

  const handleNotesChange = useCallback((value: string) => {
    setNotes(value);
    try { localStorage.setItem(DASHBOARD_NOTES_KEY, value); } catch { /* ignore */ }
  }, []);

  const flashSaved = useCallback(() => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, []);

  const widgets = [
    { key: 'showSales' as const, label: 'Total Sales Today', description: 'Sum of all paid/placed orders for the current business day' },
    { key: 'showOrders' as const, label: 'Orders Today', description: 'Count of non-voided orders for today' },
    { key: 'showLowStock' as const, label: 'Low Stock Alerts', description: 'Items below their reorder point' },
    { key: 'showRecentOrders' as const, label: 'Recent Orders', description: 'Last 5 orders with status and totals' },
    { key: 'showNotes' as const, label: 'Notes Widget', description: 'Quick notes and reminders on the dashboard' },
  ];

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold text-foreground">Dashboard</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose which widgets appear on your dashboard home page.
      </p>

      {saved && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-green-500/10 px-3 py-1.5 text-sm text-green-500">
          <Check className="h-4 w-4" /> Saved
        </div>
      )}

      {/* Widget Toggles */}
      <div className="mt-6 space-y-4">
        <h3 className="text-sm font-medium text-foreground">Widgets</h3>
        <div className="space-y-3">
          {widgets.map((w) => (
            <label key={w.key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4 hover:bg-accent/50">
              <input
                type="checkbox"
                checked={prefs[w.key]}
                onChange={() => handleToggle(w.key)}
                className="mt-0.5 h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <p className="text-sm font-medium text-foreground">{w.label}</p>
                <p className="text-xs text-muted-foreground">{w.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Notes Editor */}
      <div className="mt-8">
        <h3 className="text-sm font-medium text-foreground">Dashboard Notes</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          These notes appear on your dashboard. Great for daily specials, shift reminders, or team messages.
        </p>
        <textarea
          value={notes}
          onChange={(e) => handleNotesChange(e.target.value)}
          placeholder="Quick notes, reminders, daily specials..."
          className="mt-3 w-full resize-y rounded-lg border border-border bg-transparent p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          rows={6}
        />
        <p className="mt-1 text-xs text-muted-foreground">Saved to this browser (localStorage)</p>
      </div>
    </div>
  );
}

// ── Audit Log Tab ─────────────────────────────────────────────────

export function AuditLogTab() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground">Audit Log</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        View all activity and changes across your organization.
      </p>
      <div className="mt-6">
        <AuditLogViewer showActor pageSize={50} />
      </div>
    </div>
  );
}
