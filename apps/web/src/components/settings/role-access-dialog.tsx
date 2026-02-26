'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Loader2,
  Check,
  MapPin,
  Building2,
  Store,
  Monitor,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useRoleAccess } from '@/hooks/use-role-access';

// ── Types ────────────────────────────────────────────────────────

interface LocationItem {
  id: string;
  name: string;
  locationType: 'site' | 'venue';
  parentLocationId: string | null;
}

interface ProfitCenterItem {
  id: string;
  name: string;
  code?: string | null;
  locationId: string;
}

interface TerminalItem {
  id: string;
  name: string;
  terminalNumber?: number | null;
  profitCenterId: string;
}

interface RoleAccessDialogProps {
  roleId: string;
  roleName: string;
  onClose: () => void;
  onSaved: () => void;
}

// ── Dialog ───────────────────────────────────────────────────────

export function RoleAccessDialog({ roleId, roleName, onClose, onSaved }: RoleAccessDialogProps) {
  const { access, isLoading: accessLoading } = useRoleAccess(roleId);

  // Full hierarchy data (unfiltered — all locations/PCs/terminals)
  const [allLocations, setAllLocations] = useState<LocationItem[]>([]);
  const [allProfitCenters, setAllProfitCenters] = useState<ProfitCenterItem[]>([]);
  const [allTerminals, setAllTerminals] = useState<TerminalItem[]>([]);
  const [hierarchyLoading, setHierarchyLoading] = useState(true);

  // Selected IDs (empty Set = "all" / unrestricted)
  const [locationIds, setLocationIds] = useState<Set<string>>(new Set());
  const [profitCenterIds, setProfitCenterIds] = useState<Set<string>>(new Set());
  const [terminalIds, setTerminalIds] = useState<Set<string>>(new Set());

  // "All" toggles
  const [allLocations_, setAllLocations_] = useState(true);
  const [allProfitCenters_, setAllProfitCenters_] = useState(true);
  const [allTerminals_, setAllTerminals_] = useState(true);

  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['locations']),
  );

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived data
  const sites = useMemo(
    () => allLocations.filter((l) => l.locationType === 'site'),
    [allLocations],
  );

  const venuesBySite = useMemo(() => {
    const map = new Map<string, LocationItem[]>();
    for (const loc of allLocations) {
      if (loc.locationType === 'venue' && loc.parentLocationId) {
        const arr = map.get(loc.parentLocationId) ?? [];
        arr.push(loc);
        map.set(loc.parentLocationId, arr);
      }
    }
    return map;
  }, [allLocations]);

  const pcsByLocation = useMemo(() => {
    const map = new Map<string, ProfitCenterItem[]>();
    for (const pc of allProfitCenters) {
      const arr = map.get(pc.locationId) ?? [];
      arr.push(pc);
      map.set(pc.locationId, arr);
    }
    return map;
  }, [allProfitCenters]);

  const terminalsByPc = useMemo(() => {
    const map = new Map<string, TerminalItem[]>();
    for (const t of allTerminals) {
      const arr = map.get(t.profitCenterId) ?? [];
      arr.push(t);
      map.set(t.profitCenterId, arr);
    }
    return map;
  }, [allTerminals]);

  // Load full hierarchy on mount
  useEffect(() => {
    (async () => {
      try {
        // Fetch all locations
        const locRes = await apiFetch<{ data: LocationItem[] }>(
          '/api/v1/terminal-session/locations',
        );
        setAllLocations(locRes.data);

        // Fetch profit centers for each location
        const pcResults = await Promise.all(
          locRes.data.map((loc) =>
            apiFetch<{ data: Array<{ id: string; name: string; code?: string | null }> }>(
              `/api/v1/terminal-session/profit-centers?locationId=${loc.id}`,
            )
              .then((r) =>
                r.data.map((pc) => ({ ...pc, locationId: loc.id })),
              )
              .catch(() => [] as ProfitCenterItem[]),
          ),
        );
        const allPcs = pcResults.flat();
        setAllProfitCenters(allPcs);

        // Fetch terminals for each profit center
        const termResults = await Promise.all(
          allPcs.map((pc) =>
            apiFetch<{ data: Array<{ id: string; name: string; terminalNumber?: number | null }> }>(
              `/api/v1/terminal-session/terminals?profitCenterId=${pc.id}`,
            )
              .then((r) =>
                r.data.map((t) => ({ ...t, profitCenterId: pc.id })),
              )
              .catch(() => [] as TerminalItem[]),
          ),
        );
        setAllTerminals(termResults.flat());
      } catch {
        // Ignore
      }
      setHierarchyLoading(false);
    })();
  }, []);

  // Seed selections from existing access config
  useEffect(() => {
    if (!access) return;
    if (access.locationIds.length > 0) {
      setAllLocations_(false);
      setLocationIds(new Set(access.locationIds));
    }
    if (access.profitCenterIds.length > 0) {
      setAllProfitCenters_(false);
      setProfitCenterIds(new Set(access.profitCenterIds));
    }
    if (access.terminalIds.length > 0) {
      setAllTerminals_(false);
      setTerminalIds(new Set(access.terminalIds));
    }
  }, [access]);

  // Toggle helpers
  const toggleSection = useCallback((section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  const toggleLocation = useCallback((id: string) => {
    setLocationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleProfitCenter = useCallback((id: string) => {
    setProfitCenterIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleTerminal = useCallback((id: string) => {
    setTerminalIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Check if a location is accessible (for cascading graying)
  const isLocationAccessible = useCallback(
    (locId: string) => {
      if (allLocations_) return true;
      return locationIds.has(locId);
    },
    [allLocations_, locationIds],
  );

  // Check if a profit center's location is accessible
  const isPcLocationAccessible = useCallback(
    (pc: ProfitCenterItem) => isLocationAccessible(pc.locationId),
    [isLocationAccessible],
  );

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/roles/${roleId}/access`, {
        method: 'PUT',
        body: JSON.stringify({
          locationIds: allLocations_ ? [] : [...locationIds],
          profitCenterIds: allProfitCenters_ ? [] : [...profitCenterIds],
          terminalIds: allTerminals_ ? [] : [...terminalIds],
        }),
      });
      onSaved();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'message' in err) {
        setError((err as { message: string }).message);
      } else {
        setError('Failed to save access configuration');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const isLoading = accessLoading || hierarchyLoading;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Access Scope
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Configure which locations, profit centers, and terminals the{' '}
              <span className="font-medium text-foreground">{roleName}</span> role
              can access
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-muted-foreground hover:text-muted-foreground" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">
                  {error}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                When &ldquo;All&rdquo; is enabled, the role has unrestricted
                access at that level. Disable it to restrict access to specific
                items.
              </p>

              {/* ── Locations Section ──────────────────────────── */}
              <SectionHeader
                icon={MapPin}
                title="Locations"
                expanded={expandedSections.has('locations')}
                onToggle={() => toggleSection('locations')}
                badge={
                  allLocations_
                    ? 'All Locations'
                    : `${locationIds.size} selected`
                }
              />
              {expandedSections.has('locations') && (
                <div className="ml-6 space-y-2">
                  <AllToggle
                    label="All Locations"
                    checked={allLocations_}
                    onChange={(checked) => {
                      setAllLocations_(checked);
                      if (checked) setLocationIds(new Set());
                    }}
                  />
                  {!allLocations_ && (
                    <div className="space-y-1 rounded-lg border border-border p-3">
                      {sites.length === 0 && (
                        <p className="text-xs text-muted-foreground">No locations configured</p>
                      )}
                      {sites.map((site) => {
                        const venues = venuesBySite.get(site.id) ?? [];
                        const hasVenues = venues.length > 0;
                        return (
                          <div key={site.id}>
                            <label className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent">
                              <input
                                type="checkbox"
                                checked={locationIds.has(site.id)}
                                onChange={() => toggleLocation(site.id)}
                                className="h-4 w-4 rounded border-input text-indigo-500 focus:ring-indigo-500"
                              />
                              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm text-foreground">
                                {site.name}
                              </span>
                              {hasVenues && (
                                <span className="text-xs text-muted-foreground">
                                  ({venues.length} venue{venues.length !== 1 ? 's' : ''})
                                </span>
                              )}
                            </label>
                            {hasVenues && (
                              <div className="ml-8 space-y-0.5">
                                {venues.map((venue) => (
                                  <label
                                    key={venue.id}
                                    className="flex items-center gap-2 rounded px-2 py-1 hover:bg-accent"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={locationIds.has(venue.id)}
                                      onChange={() => toggleLocation(venue.id)}
                                      className="h-3.5 w-3.5 rounded border-input text-indigo-500 focus:ring-indigo-500"
                                    />
                                    <Building2 className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-xs text-foreground">
                                      {venue.name}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Profit Centers Section ────────────────────── */}
              <SectionHeader
                icon={Store}
                title="Profit Centers"
                expanded={expandedSections.has('profitCenters')}
                onToggle={() => toggleSection('profitCenters')}
                badge={
                  allProfitCenters_
                    ? 'All Profit Centers'
                    : `${profitCenterIds.size} selected`
                }
              />
              {expandedSections.has('profitCenters') && (
                <div className="ml-6 space-y-2">
                  <AllToggle
                    label="All Profit Centers"
                    checked={allProfitCenters_}
                    onChange={(checked) => {
                      setAllProfitCenters_(checked);
                      if (checked) setProfitCenterIds(new Set());
                    }}
                  />
                  {!allProfitCenters_ && (
                    <div className="space-y-1 rounded-lg border border-border p-3">
                      {allProfitCenters.length === 0 && (
                        <p className="text-xs text-muted-foreground">No profit centers configured</p>
                      )}
                      {/* Group by location */}
                      {allLocations
                        .filter((loc) => (pcsByLocation.get(loc.id)?.length ?? 0) > 0)
                        .map((loc) => {
                          const pcs = pcsByLocation.get(loc.id) ?? [];
                          const accessible = isLocationAccessible(loc.id);
                          return (
                            <div
                              key={loc.id}
                              className={accessible ? '' : 'opacity-40'}
                            >
                              <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                                {loc.name}
                                {!accessible && (
                                  <span className="ml-1 normal-case text-amber-500">
                                    (location not selected)
                                  </span>
                                )}
                              </p>
                              {pcs.map((pc) => (
                                <label
                                  key={pc.id}
                                  className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent"
                                >
                                  <input
                                    type="checkbox"
                                    checked={profitCenterIds.has(pc.id)}
                                    onChange={() => toggleProfitCenter(pc.id)}
                                    disabled={!accessible}
                                    className="h-4 w-4 rounded border-input text-indigo-500 focus:ring-indigo-500 disabled:opacity-50"
                                  />
                                  <Store className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-sm text-foreground">
                                    {pc.name}
                                  </span>
                                  {pc.code && (
                                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                      {pc.code}
                                    </span>
                                  )}
                                </label>
                              ))}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Terminals Section ─────────────────────────── */}
              <SectionHeader
                icon={Monitor}
                title="Terminals"
                expanded={expandedSections.has('terminals')}
                onToggle={() => toggleSection('terminals')}
                badge={
                  allTerminals_
                    ? 'All Terminals'
                    : `${terminalIds.size} selected`
                }
              />
              {expandedSections.has('terminals') && (
                <div className="ml-6 space-y-2">
                  <AllToggle
                    label="All Terminals"
                    checked={allTerminals_}
                    onChange={(checked) => {
                      setAllTerminals_(checked);
                      if (checked) setTerminalIds(new Set());
                    }}
                  />
                  {!allTerminals_ && (
                    <div className="space-y-1 rounded-lg border border-border p-3">
                      {allTerminals.length === 0 && (
                        <p className="text-xs text-muted-foreground">No terminals configured</p>
                      )}
                      {/* Group by profit center */}
                      {allProfitCenters
                        .filter((pc) => (terminalsByPc.get(pc.id)?.length ?? 0) > 0)
                        .map((pc) => {
                          const terms = terminalsByPc.get(pc.id) ?? [];
                          const accessible = isPcLocationAccessible(pc);
                          return (
                            <div
                              key={pc.id}
                              className={accessible ? '' : 'opacity-40'}
                            >
                              <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                                {pc.name}
                                {pc.code && ` (${pc.code})`}
                                {!accessible && (
                                  <span className="ml-1 normal-case text-amber-500">
                                    (location not selected)
                                  </span>
                                )}
                              </p>
                              {terms.map((t) => (
                                <label
                                  key={t.id}
                                  className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent"
                                >
                                  <input
                                    type="checkbox"
                                    checked={terminalIds.has(t.id)}
                                    onChange={() => toggleTerminal(t.id)}
                                    disabled={!accessible}
                                    className="h-4 w-4 rounded border-input text-indigo-500 focus:ring-indigo-500 disabled:opacity-50"
                                  />
                                  <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-sm text-foreground">
                                    {t.name}
                                  </span>
                                  {t.terminalNumber != null && (
                                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                      #{t.terminalNumber}
                                    </span>
                                  )}
                                </label>
                              ))}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Save Access
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Sub-Components ───────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  expanded,
  onToggle,
  badge,
}: {
  icon: typeof MapPin;
  title: string;
  expanded: boolean;
  onToggle: () => void;
  badge: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-lg border border-border px-4 py-3 text-left transition-colors hover:bg-accent"
    >
      {expanded ? (
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      ) : (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      )}
      <Icon className="h-4 w-4 text-indigo-500" />
      <span className="text-sm font-medium text-foreground">{title}</span>
      <span className="ml-auto rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-medium text-indigo-400">
        {badge}
      </span>
    </button>
  );
}

function AllToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-dashed border-input px-3 py-2 hover:bg-accent">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-input text-indigo-500 focus:ring-indigo-500"
      />
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">(unrestricted)</span>
    </label>
  );
}
