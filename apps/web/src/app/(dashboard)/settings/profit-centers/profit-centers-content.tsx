'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useProfitCenters, useProfitCenterMutations } from '@/hooks/use-profit-centers';
import { useTerminals, useTerminalsByLocation } from '@/hooks/use-terminals';
import { LocationsPane } from '@/components/settings/LocationsPane';
import { ProfitCenterPane } from '@/components/settings/ProfitCenterPane';
import { TerminalPane } from '@/components/settings/TerminalPane';
import { ProfitCenterFormModal } from '@/components/settings/ProfitCenterFormModal';
import { TerminalFormModal } from '@/components/settings/TerminalFormModal';

interface LocationWithHierarchy {
  id: string;
  name: string;
  locationType?: 'site' | 'venue';
  parentLocationId?: string | null;
}

type Mode = 'simple' | 'advanced';

function usePersistentMode(): [Mode, (m: Mode) => void] {
  const [mode, setModeState] = useState<Mode>('advanced');

  useEffect(() => {
    const stored = localStorage.getItem('profitCenters_mode');
    if (stored === 'simple' || stored === 'advanced') setModeState(stored);
  }, []);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    localStorage.setItem('profitCenters_mode', m);
  }, []);

  return [mode, setMode];
}

export default function ProfitCentersContent() {
  const [mode, setMode] = usePersistentMode();

  // Location state
  const [allLocations, setAllLocations] = useState<LocationWithHierarchy[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [selectedProfitCenterId, setSelectedProfitCenterId] = useState<string | null>(null);

  // Modal state
  const [pcModal, setPcModal] = useState<{ open: boolean; editId: string | null }>({
    open: false,
    editId: null,
  });
  const [termModal, setTermModal] = useState<{
    open: boolean;
    editId: string | null;
    profitCenterId: string | null;
  }>({ open: false, editId: null, profitCenterId: null });

  const [locationsError, setLocationsError] = useState<string | null>(null);

  // Fetch locations once
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{ data: LocationWithHierarchy[] }>(
          '/api/v1/terminal-session/locations',
        );
        setAllLocations(res.data);
        setLocationsError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[ProfitCenters] Failed to load locations:', msg);
        setLocationsError(msg);
      }
    })();
  }, []);

  // Derived state
  const venuesBySite = useMemo(() => {
    const map = new Map<string, LocationWithHierarchy[]>();
    for (const loc of allLocations) {
      if (loc.locationType === 'venue' && loc.parentLocationId) {
        const list = map.get(loc.parentLocationId) ?? [];
        list.push(loc);
        map.set(loc.parentLocationId, list);
      }
    }
    return map;
  }, [allLocations]);

  const selectedSiteHasVenues = selectedSiteId
    ? (venuesBySite.get(selectedSiteId)?.length ?? 0) > 0
    : false;

  const effectiveLocationId = selectedVenueId
    ?? (selectedSiteId && !selectedSiteHasVenues ? selectedSiteId : null);

  const showSiteLevelWarning =
    !!selectedSiteId && !selectedVenueId && selectedSiteHasVenues;

  // Selection cascade
  const handleSelectSite = useCallback((siteId: string) => {
    setSelectedSiteId(siteId);
    setSelectedVenueId(null);
    setSelectedProfitCenterId(null);
  }, []);

  const handleSelectVenue = useCallback(
    (venueId: string) => {
      const venue = allLocations.find((l) => l.id === venueId);
      if (venue?.parentLocationId) setSelectedSiteId(venue.parentLocationId);
      setSelectedVenueId(venueId);
      setSelectedProfitCenterId(null);
    },
    [allLocations],
  );

  // Data hooks
  const {
    data: profitCenters,
    isLoading: pcLoading,
    refetch: refetchPCs,
  } = useProfitCenters({ locationId: effectiveLocationId ?? undefined });

  // Advanced mode: terminals for selected PC
  const {
    data: pcTerminals,
    isLoading: pcTermLoading,
    refetch: refetchPCTerminals,
  } = useTerminals(mode === 'advanced' ? (selectedProfitCenterId ?? '') : '');

  // Simple mode: terminals for selected location
  const {
    data: locTerminals,
    isLoading: locTermLoading,
    refetch: refetchLocTerminals,
  } = useTerminalsByLocation(
    mode === 'simple' ? (effectiveLocationId ?? undefined) : undefined,
  );

  const { deactivate: deactivatePC } = useProfitCenterMutations();

  // Which terminal data to show
  const terminals = mode === 'simple' ? locTerminals : pcTerminals;
  const terminalsLoading = mode === 'simple' ? locTermLoading : pcTermLoading;

  // Reset profit center selection when mode switches
  useEffect(() => {
    setSelectedProfitCenterId(null);
  }, [mode]);

  // Handlers — Profit Centers
  const handleAddPC = useCallback(() => {
    setPcModal({ open: true, editId: null });
  }, []);

  const handleEditPC = useCallback((id: string) => {
    setPcModal({ open: true, editId: id });
  }, []);

  const handleDeactivatePC = useCallback(
    async (id: string) => {
      try {
        await deactivatePC(id);
        if (selectedProfitCenterId === id) setSelectedProfitCenterId(null);
        refetchPCs();
      } catch {
        // silently fail — future: toast
      }
    },
    [deactivatePC, refetchPCs, selectedProfitCenterId],
  );

  // Handlers — Terminals
  const handleAddTerminal = useCallback(async () => {
    if (mode === 'simple') {
      if (!effectiveLocationId) return;
      try {
        const res = await apiFetch<{ data: { id: string; created: boolean } }>(
          '/api/v1/profit-centers/ensure-default',
          {
            method: 'POST',
            body: JSON.stringify({ locationId: effectiveLocationId }),
          },
        );
        setTermModal({ open: true, editId: null, profitCenterId: res.data.id });
      } catch {
        // silently fail — future: toast
      }
    } else {
      if (!selectedProfitCenterId) return;
      setTermModal({
        open: true,
        editId: null,
        profitCenterId: selectedProfitCenterId,
      });
    }
  }, [mode, effectiveLocationId, selectedProfitCenterId]);

  const handleEditTerminal = useCallback(
    (id: string) => {
      const t = terminals?.find((term) => term.id === id);
      if (t) {
        setTermModal({ open: true, editId: id, profitCenterId: t.profitCenterId });
      }
    },
    [terminals],
  );

  const handleDeactivateTerminal = useCallback(
    async (id: string) => {
      try {
        await apiFetch(`/api/v1/terminals/${id}`, { method: 'DELETE' });
        if (mode === 'simple') refetchLocTerminals();
        else refetchPCTerminals();
        refetchPCs();
      } catch {
        // silently fail — future: toast
      }
    },
    [mode, refetchLocTerminals, refetchPCTerminals, refetchPCs],
  );

  const handleTerminalSaved = useCallback(() => {
    setTermModal({ open: false, editId: null, profitCenterId: null });
    if (mode === 'simple') refetchLocTerminals();
    else refetchPCTerminals();
    refetchPCs();
  }, [mode, refetchLocTerminals, refetchPCTerminals, refetchPCs]);

  const handlePCSaved = useCallback(() => {
    setPcModal({ open: false, editId: null });
    refetchPCs();
  }, [refetchPCs]);

  // Terminal pane state
  const terminalDisabled =
    mode === 'simple' ? !effectiveLocationId : !selectedProfitCenterId;
  const terminalEmptyMessage =
    mode === 'simple' ? 'Select a location first' : 'Select a profit center first';

  return (
    <div>
      {/* Header with mode toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profit Centers</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage revenue areas and terminals across your locations
          </p>
        </div>
        <div className="flex rounded-lg border border-gray-200 bg-surface p-0.5">
          <button
            type="button"
            onClick={() => setMode('simple')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'simple'
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Simple
          </button>
          <button
            type="button"
            onClick={() => setMode('advanced')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'advanced'
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Advanced
          </button>
        </div>
      </div>

      {/* Site-level warning banner */}
      {showSiteLevelWarning && mode === 'advanced' && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
          <p className="text-sm text-yellow-700">
            This site has venues. Profit centers are usually assigned to a specific
            venue. Select a venue, or acknowledge the site-level assignment when
            creating a profit center.
          </p>
        </div>
      )}

      {/* 3-panel (or 2-panel) grid */}
      <div
        className={`mt-4 grid min-h-[500px] grid-cols-1 gap-4 ${
          mode === 'advanced' ? 'md:grid-cols-3' : 'md:grid-cols-2'
        }`}
      >
        <LocationsPane
          locations={allLocations}
          selectedSiteId={selectedSiteId}
          selectedVenueId={selectedVenueId}
          onSelectSite={handleSelectSite}
          onSelectVenue={handleSelectVenue}
        />

        {mode === 'advanced' && (
          <ProfitCenterPane
            profitCenters={profitCenters}
            isLoading={pcLoading}
            selectedId={selectedProfitCenterId}
            onSelect={setSelectedProfitCenterId}
            onAdd={handleAddPC}
            onEdit={handleEditPC}
            onDeactivate={handleDeactivatePC}
            disabled={!effectiveLocationId}
          />
        )}

        <TerminalPane
          terminals={terminals}
          isLoading={terminalsLoading}
          onAdd={handleAddTerminal}
          onEdit={handleEditTerminal}
          onDeactivate={handleDeactivateTerminal}
          disabled={terminalDisabled}
          emptyMessage={terminalEmptyMessage}
        />
      </div>

      {/* Modals */}
      {pcModal.open && (
        <ProfitCenterFormModal
          profitCenterId={pcModal.editId}
          locations={allLocations}
          prefilledLocationId={effectiveLocationId ?? undefined}
          requireSiteLevelConfirm={showSiteLevelWarning}
          onClose={() => setPcModal({ open: false, editId: null })}
          onSaved={handlePCSaved}
        />
      )}

      {termModal.open && termModal.profitCenterId && (
        <TerminalFormModal
          profitCenterId={termModal.profitCenterId}
          terminalId={termModal.editId}
          onClose={() =>
            setTermModal({ open: false, editId: null, profitCenterId: null })
          }
          onSaved={handleTerminalSaved}
        />
      )}
    </div>
  );
}
