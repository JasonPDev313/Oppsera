'use client';

import { useState, useMemo } from 'react';
import {
  Shield,
  Search,
  KeyRound,
  ShieldAlert,
  ClipboardCheck,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  PERMISSION_MATRIX,
  PERMISSION_MODULES,
  getPermissionsByModule,
} from '@oppsera/shared';
import type { PermissionDefinition } from '@oppsera/shared';

// ── Module display names ────────────────────────────────────

const MODULE_LABELS: Record<string, string> = {
  platform: 'Platform Core',
  catalog: 'Catalog',
  pos: 'Orders / POS',
  payments: 'Payments / Tenders',
  inventory: 'Inventory',
  customers: 'Customers',
  reporting: 'Reporting',
  accounting: 'Accounting / GL',
  ap: 'Accounts Payable',
  ar: 'Accounts Receivable',
  room_layouts: 'Room Layouts',
  semantic: 'AI Insights',
  pos_fnb: 'F&B POS',
  pms: 'Property Management',
};

const ROLE_ORDER = ['owner', 'manager', 'supervisor', 'cashier', 'server', 'staff'] as const;

// ── Role badge ──────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    owner: 'bg-purple-100 text-purple-700',
    manager: 'bg-indigo-100 text-indigo-700',
    supervisor: 'bg-blue-100 text-blue-700',
    cashier: 'bg-green-100 text-green-700',
    server: 'bg-amber-100 text-amber-700',
    staff: 'bg-gray-100 text-gray-700',
  };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${colors[role] ?? 'bg-gray-100 text-gray-700'}`}>
      {role}
    </span>
  );
}

// ── Permission row ──────────────────────────────────────────

function PermissionRow({ perm }: { perm: PermissionDefinition }) {
  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50/50 transition-colors">
      <td className="py-2.5 pl-4 pr-2 text-sm">
        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-700">
          {perm.key}
        </code>
      </td>
      <td className="px-2 py-2.5 text-sm text-gray-600">{perm.description}</td>
      <td className="px-2 py-2.5">
        <div className="flex flex-wrap gap-1">
          {ROLE_ORDER.filter((r) => perm.defaultRoles.includes(r)).map((role) => (
            <RoleBadge key={role} role={role} />
          ))}
        </div>
      </td>
      <td className="px-2 py-2.5 text-center">
        {perm.requiresManagerPin && (
          <KeyRound className="mx-auto h-4 w-4 text-amber-500" />
        )}
      </td>
      <td className="px-2 py-2.5 pr-4 text-center">
        {perm.requiresAudit && (
          <ClipboardCheck className="mx-auto h-4 w-4 text-blue-500" />
        )}
      </td>
    </tr>
  );
}

// ── Module section ──────────────────────────────────────────

function ModuleSection({
  module,
  permissions,
  isExpanded,
  onToggle,
}: {
  module: string;
  permissions: PermissionDefinition[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const pinCount = permissions.filter((p) => p.requiresManagerPin).length;
  const auditCount = permissions.filter((p) => p.requiresAudit).length;

  return (
    <div className="rounded-lg border border-gray-200 bg-surface overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
          <span className="text-sm font-semibold text-gray-900">
            {MODULE_LABELS[module] ?? module}
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {permissions.length}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {pinCount > 0 && (
            <span className="flex items-center gap-1">
              <KeyRound className="h-3.5 w-3.5 text-amber-500" />
              {pinCount} PIN
            </span>
          )}
          {auditCount > 0 && (
            <span className="flex items-center gap-1">
              <ClipboardCheck className="h-3.5 w-3.5 text-blue-500" />
              {auditCount} audited
            </span>
          )}
        </div>
      </button>

      {isExpanded && (
        <table className="w-full text-left">
          <thead>
            <tr className="border-t border-gray-200 bg-gray-50/80">
              <th className="py-2 pl-4 pr-2 text-xs font-medium text-gray-500 uppercase tracking-wider w-[200px]">
                Permission
              </th>
              <th className="px-2 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Description
              </th>
              <th className="px-2 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider w-[240px]">
                Default Roles
              </th>
              <th className="px-2 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider text-center w-[60px]">
                PIN
              </th>
              <th className="px-2 py-2 pr-4 text-xs font-medium text-gray-500 uppercase tracking-wider text-center w-[60px]">
                Audit
              </th>
            </tr>
          </thead>
          <tbody>
            {permissions.map((perm) => (
              <PermissionRow key={perm.key} perm={perm} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Main Content ────────────────────────────────────────────

export default function PermissionsContent() {
  const [search, setSearch] = useState('');
  const [filterModule, setFilterModule] = useState<string>('all');
  const [filterFlag, setFilterFlag] = useState<'all' | 'pin' | 'audit'>('all');
  const [expandedModules, setExpandedModules] = useState<Set<string>>(
    () => new Set(PERMISSION_MODULES),
  );

  const filteredByModule = useMemo(() => {
    const modules = filterModule === 'all' ? PERMISSION_MODULES : [filterModule];
    const result: Record<string, PermissionDefinition[]> = {};

    for (const mod of modules) {
      let perms = getPermissionsByModule(mod);

      if (search) {
        const q = search.toLowerCase();
        perms = perms.filter(
          (p) =>
            p.key.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q),
        );
      }

      if (filterFlag === 'pin') {
        perms = perms.filter((p) => p.requiresManagerPin);
      } else if (filterFlag === 'audit') {
        perms = perms.filter((p) => p.requiresAudit);
      }

      if (perms.length > 0) {
        result[mod] = perms;
      }
    }

    return result;
  }, [filterModule, filterFlag, search]);

  const totalShown = Object.values(filteredByModule).reduce(
    (sum, perms) => sum + perms.length,
    0,
  );

  function toggleModule(mod: string) {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod);
      else next.add(mod);
      return next;
    });
  }

  function expandAll() {
    setExpandedModules(new Set(Object.keys(filteredByModule)));
  }

  function collapseAll() {
    setExpandedModules(new Set());
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Permissions Matrix</h1>
          <p className="mt-1 text-sm text-gray-500">
            All {PERMISSION_MATRIX.length} system permissions across {PERMISSION_MODULES.length} modules
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Expand All
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard
          label="Total Permissions"
          value={PERMISSION_MATRIX.length}
          icon={Shield}
        />
        <SummaryCard
          label="Modules"
          value={PERMISSION_MODULES.length}
          icon={Shield}
        />
        <SummaryCard
          label="Manager PIN Required"
          value={PERMISSION_MATRIX.filter((p) => p.requiresManagerPin).length}
          icon={KeyRound}
          accent="amber"
        />
        <SummaryCard
          label="Audit Required"
          value={PERMISSION_MATRIX.filter((p) => p.requiresAudit).length}
          icon={ClipboardCheck}
          accent="blue"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search permissions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-surface py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <select
          value={filterModule}
          onChange={(e) => setFilterModule(e.target.value)}
          className="rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="all">All Modules</option>
          {PERMISSION_MODULES.map((mod) => (
            <option key={mod} value={mod}>
              {MODULE_LABELS[mod] ?? mod}
            </option>
          ))}
        </select>

        <select
          value={filterFlag}
          onChange={(e) => setFilterFlag(e.target.value as 'all' | 'pin' | 'audit')}
          className="rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="all">All Permissions</option>
          <option value="pin">Manager PIN Required</option>
          <option value="audit">Audit Required</option>
        </select>
      </div>

      {/* Results count */}
      {(search || filterModule !== 'all' || filterFlag !== 'all') && (
        <p className="text-sm text-gray-500">
          Showing {totalShown} of {PERMISSION_MATRIX.length} permissions
        </p>
      )}

      {/* Module sections */}
      <div className="space-y-3">
        {Object.entries(filteredByModule).map(([mod, perms]) => (
          <ModuleSection
            key={mod}
            module={mod}
            permissions={perms}
            isExpanded={expandedModules.has(mod)}
            onToggle={() => toggleModule(mod)}
          />
        ))}

        {Object.keys(filteredByModule).length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 py-12 text-center">
            <ShieldAlert className="h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">No permissions match your filters</p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="rounded-lg border border-gray-200 bg-surface px-4 py-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Legend</h3>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-600">
          <span className="flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5 text-amber-500" />
            Manager PIN — requires manager override to execute
          </span>
          <span className="flex items-center gap-1.5">
            <ClipboardCheck className="h-3.5 w-3.5 text-blue-500" />
            Audit — action is logged to the audit trail
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {ROLE_ORDER.map((role) => (
            <RoleBadge key={role} role={role} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Summary Card ────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: typeof Shield;
  accent?: 'amber' | 'blue';
}) {
  const iconColor = accent === 'amber'
    ? 'text-amber-500'
    : accent === 'blue'
      ? 'text-blue-500'
      : 'text-gray-400';

  return (
    <div className="rounded-lg border border-gray-200 bg-surface p-4">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
    </div>
  );
}
