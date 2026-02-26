'use client';

import type {
  StaffValueMappings,
} from '@oppsera/core/import/staff-import-types';
import type { StaffImportContext } from '@/hooks/use-staff-import';
import { ArrowRight, ArrowLeft, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface ValueMappingStepProps {
  valueMappings: StaffValueMappings;
  onValueMappingsChange: (v: StaffValueMappings) => void;
  context: StaffImportContext;
  defaultRoleId: string | null;
  onDefaultRoleIdChange: (id: string | null) => void;
  defaultLocationIds: string[];
  onDefaultLocationIdsChange: (ids: string[]) => void;
  isLoading: boolean;
  onNext: () => void;
  onBack: () => void;
}

export function ValueMappingStep({
  valueMappings,
  onValueMappingsChange,
  context,
  defaultRoleId,
  onDefaultRoleIdChange,
  defaultLocationIds,
  onDefaultLocationIdsChange,
  isLoading,
  onNext,
  onBack,
}: ValueMappingStepProps) {
  const handleRoleMapping = (index: number, roleId: string | null) => {
    const updated = [...valueMappings.roles];
    updated[index] = { ...updated[index]!, oppsEraRoleId: roleId, confidence: roleId ? 100 : 0 };
    onValueMappingsChange({ ...valueMappings, roles: updated });
  };

  const handleLocationMapping = (index: number, locationIds: string[]) => {
    const updated = [...valueMappings.locations];
    updated[index] = { ...updated[index]!, oppsEraLocationIds: locationIds, confidence: locationIds.length > 0 ? 100 : 0 };
    onValueMappingsChange({ ...valueMappings, locations: updated });
  };

  const toggleLocation = (locMappingIdx: number, locationId: string) => {
    const current = valueMappings.locations[locMappingIdx]!.oppsEraLocationIds;
    const next = current.includes(locationId)
      ? current.filter((id) => id !== locationId)
      : [...current, locationId];
    handleLocationMapping(locMappingIdx, next);
  };

  const toggleDefaultLocation = (locationId: string) => {
    const next = defaultLocationIds.includes(locationId)
      ? defaultLocationIds.filter((id) => id !== locationId)
      : [...defaultLocationIds, locationId];
    onDefaultLocationIdsChange(next);
  };

  const unmappedRoles = valueMappings.roles.filter((r) => !r.oppsEraRoleId).length;
  const unmappedLocations = valueMappings.locations.filter((l) => l.oppsEraLocationIds.length === 0).length;

  // Rows at risk: unmapped with no fallback
  const rolesAtRisk = unmappedRoles > 0 && !defaultRoleId;
  const locationsAtRisk = unmappedLocations > 0 && defaultLocationIds.length === 0;

  return (
    <div className="space-y-8">
      {/* Skip warning banner */}
      {(rolesAtRisk || locationsAtRisk) && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 space-y-1.5">
          <p className="text-sm font-medium text-red-500 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Some rows will be skipped during import
          </p>
          {rolesAtRisk && (
            <p className="text-sm text-red-500 ml-6">
              {unmappedRoles} unmapped role{unmappedRoles === 1 ? '' : 's'} with no default fallback
              &mdash; rows with these roles will be <strong>skipped</strong>.
              Set a default role below or map each role to fix this.
            </p>
          )}
          {locationsAtRisk && (
            <p className="text-sm text-red-500 ml-6">
              {unmappedLocations} unmapped location{unmappedLocations === 1 ? '' : 's'} with no default fallback
              &mdash; rows with these locations will be <strong>skipped</strong>.
              Check a default location below or map each location to fix this.
            </p>
          )}
        </div>
      )}

      {/* ── Role Mappings ── */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Role Mapping
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Map each legacy role to an OppsEra system role.
          {unmappedRoles > 0 && (
            <span className="ml-2 text-yellow-500">
              ({unmappedRoles} unmapped)
            </span>
          )}
        </p>

        {valueMappings.roles.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No role column was detected in the file.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-4 font-medium text-muted-foreground">Legacy Role</th>
                  <th className="pb-2 pr-4 font-medium text-muted-foreground w-64">OppsEra Role</th>
                  <th className="pb-2 font-medium text-muted-foreground w-16 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {valueMappings.roles.map((rm, idx) => (
                  <tr key={idx}>
                    <td className="py-2.5 pr-4">
                      <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                        {rm.legacyValue}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <select
                        value={rm.oppsEraRoleId ?? ''}
                        onChange={(e) => handleRoleMapping(idx, e.target.value || null)}
                        className="w-full rounded border border-input bg-surface text-foreground px-2 py-1.5 text-sm"
                      >
                        <option value="">— Not mapped —</option>
                        {context.roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}{r.is_system ? ' (System)' : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 text-center">
                      {rm.oppsEraRoleId
                        ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                        : <AlertTriangle className="w-4 h-4 text-yellow-500 mx-auto" />
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Default role fallback */}
        <div className="mt-4 p-3 rounded-lg bg-muted">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground whitespace-nowrap">Default role for unmapped:</span>
            <select
              value={defaultRoleId ?? ''}
              onChange={(e) => onDefaultRoleIdChange(e.target.value || null)}
              className="rounded border border-input bg-surface text-foreground px-2 py-1 text-sm"
            >
              <option value="">— None (will error) —</option>
              {context.roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* ── Location Mappings ── */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Location Mapping
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Map each legacy location to one or more OppsEra locations.
          {unmappedLocations > 0 && (
            <span className="ml-2 text-yellow-500">
              ({unmappedLocations} unmapped)
            </span>
          )}
        </p>

        {valueMappings.locations.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No location column was detected in the file.</p>
        ) : (
          <div className="space-y-3">
            {valueMappings.locations.map((lm, idx) => (
              <div key={idx} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                    {lm.legacyValue}
                  </span>
                  {lm.oppsEraLocationIds.length > 0
                    ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                    : <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  }
                </div>
                <div className="flex flex-wrap gap-2">
                  {context.locations.map((loc) => (
                    <label key={loc.id} className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={lm.oppsEraLocationIds.includes(loc.id)}
                        onChange={() => toggleLocation(idx, loc.id)}
                        className="rounded border-gray-300 text-indigo-600"
                      />
                      <span className="text-foreground">
                        {loc.name}
                        <span className="text-gray-400 ml-1">({loc.location_type})</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Default location fallback */}
        <div className="mt-4 p-3 rounded-lg bg-muted">
          <p className="text-sm text-muted-foreground mb-2">Default locations for unmapped rows:</p>
          <div className="flex flex-wrap gap-2">
            {context.locations.map((loc) => (
              <label key={loc.id} className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={defaultLocationIds.includes(loc.id)}
                  onChange={() => toggleDefaultLocation(loc.id)}
                  className="rounded border-gray-300 text-indigo-600"
                />
                <span className="text-foreground">{loc.name}</span>
              </label>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="flex justify-between pt-4 border-t border-border">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={onNext}
          disabled={isLoading}
          className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Validate & Preview
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
