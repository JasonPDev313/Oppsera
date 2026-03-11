'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import {
  useProfitCenterSettings,
  useVenuesBySite,
  filterProfitCenters,
  filterTerminalsByLocation,
  filterTerminalsByPC,
} from '@/hooks/use-profit-center-settings';
import { useProfitCenterMutations } from '@/hooks/use-profit-centers';
import { LocationsPane } from '@/components/settings/LocationsPane';
import { ProfitCenterPane } from '@/components/settings/ProfitCenterPane';
import { TerminalPane } from '@/components/settings/TerminalPane';
import { ProfitCenterFormModal } from '@/components/settings/ProfitCenterFormModal';
import { TerminalFormModal } from '@/components/settings/TerminalFormModal';
import { VenueFormModal } from '@/components/settings/VenueFormModal';

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

  // Single API call fetches everything
  const { data: settingsData, isLoading, error: locationsError, refetch } = useProfitCenterSettings();

  const allLocations = settingsData?.locations ?? [];
  const allProfitCenters = settingsData?.profitCenters ?? undefined;
  const allTerminals = settingsData?.terminals ?? undefined;

  // Selection state
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
  const [venueModal, setVenueModal] = useState<{
    open: boolean;
    editId: string | null;
    siteId: string | null;
  }>({ open: false, editId: null, siteId: null });
  const [deleteVenueConfirm, setDeleteVenueConfirm] = useState<{
    id: string;
    name: string;
    assignedPCCount: number;
  } | null>(null);

  // Derived state
  const venuesBySite = useVenuesBySite(allLocations);

  const selectedSiteHasVenues = selectedSiteId
    ? (venuesBySite.get(selectedSiteId)?.length ?? 0) > 0
    : false;

  const effectiveLocationId = selectedVenueId
    ?? (selectedSiteId && !selectedSiteHasVenues ? selectedSiteId : null);

  const showSiteLevelWarning =
    !!selectedSiteId && !selectedVenueId && selectedSiteHasVenues;

  // Client-side filtering (instant, no API calls)
  const profitCenters = useMemo(
    () => filterProfitCenters(allProfitCenters, effectiveLocationId),
    [allProfitCenters, effectiveLocationId],
  );

  const terminals = useMemo(() => {
    if (mode === 'simple') {
      return filterTerminalsByLocation(allTerminals, allProfitCenters, effectiveLocationId);
    }
    return filterTerminalsByPC(allTerminals, selectedProfitCenterId);
  }, [mode, allTerminals, allProfitCenters, effectiveLocationId, selectedProfitCenterId]);

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

  // Reset profit center selection when mode switches
  useEffect(() => {
    setSelectedProfitCenterId(null);
  }, [mode]);

  const { deactivate: deactivatePC } = useProfitCenterMutations();

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
        refetch();
      } catch {
        // silently fail — future: toast
      }
    },
    [deactivatePC, refetch, selectedProfitCenterId],
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
        refetch();
      } catch {
        // silently fail — future: toast
      }
    },
    [refetch],
  );

  const handleTerminalSaved = useCallback(() => {
    setTermModal({ open: false, editId: null, profitCenterId: null });
    refetch();
  }, [refetch]);

  const handlePCSaved = useCallback(() => {
    setPcModal({ open: false, editId: null });
    refetch();
  }, [refetch]);

  // Handlers — Venues
  const handleAddVenue = useCallback((siteId: string) => {
    setVenueModal({ open: true, editId: null, siteId });
  }, []);

  const handleEditVenue = useCallback((venueId: string) => {
    const venue = allLocations.find((l) => l.id === venueId);
    setVenueModal({
      open: true,
      editId: venueId,
      siteId: venue?.parentLocationId ?? null,
    });
  }, [allLocations]);

  const handleDeleteVenue = useCallback((venueId: string) => {
    const venue = allLocations.find((l) => l.id === venueId);
    const pcCount = allProfitCenters?.filter((pc) => pc.locationId === venueId).length ?? 0;
    setDeleteVenueConfirm({
      id: venueId,
      name: venue?.name ?? 'this venue',
      assignedPCCount: pcCount,
    });
  }, [allLocations, allProfitCenters]);

  const confirmDeleteVenue = useCallback(async () => {
    if (!deleteVenueConfirm) return;
    try {
      await apiFetch(`/api/v1/locations/venues/${deleteVenueConfirm.id}`, { method: 'DELETE' });
      if (selectedVenueId === deleteVenueConfirm.id) setSelectedVenueId(null);
      refetch();
    } catch {
      // silently fail — future: toast
    } finally {
      setDeleteVenueConfirm(null);
    }
  }, [deleteVenueConfirm, refetch, selectedVenueId]);

  const handleVenueSaved = useCallback(() => {
    setVenueModal({ open: false, editId: null, siteId: null });
    refetch();
  }, [refetch]);

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
          <h1 className="text-2xl font-bold text-foreground">Profit Centers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage revenue areas and terminals across your locations
          </p>
        </div>
        <div className="flex rounded-lg border border-border bg-surface p-0.5">
          <button
            type="button"
            onClick={() => setMode('simple')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'simple'
                ? 'bg-indigo-600 text-white'
                : 'text-muted-foreground hover:text-foreground'
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
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Advanced
          </button>
        </div>
      </div>

      {/* Site-level warning banner */}
      {showSiteLevelWarning && mode === 'advanced' && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
          <p className="text-sm text-yellow-500">
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
          onAddVenue={handleAddVenue}
          onEditVenue={handleEditVenue}
          onDeleteVenue={handleDeleteVenue}
          error={locationsError}
        />

        {mode === 'advanced' && (
          <ProfitCenterPane
            profitCenters={profitCenters}
            isLoading={isLoading}
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
          isLoading={isLoading}
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

      {venueModal.open && venueModal.siteId && (
        <VenueFormModal
          venueId={venueModal.editId}
          parentSiteId={venueModal.siteId}
          parentSiteName={
            allLocations.find((l) => l.id === venueModal.siteId)?.name ?? 'Site'
          }
          onClose={() => setVenueModal({ open: false, editId: null, siteId: null })}
          onSaved={handleVenueSaved}
        />
      )}

      {deleteVenueConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-surface p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-foreground">Delete Venue</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete <span className="font-medium text-foreground">{deleteVenueConfirm.name}</span>?
            </p>
            {deleteVenueConfirm.assignedPCCount > 0 && (
              <p className="mt-2 text-sm text-yellow-500">
                This venue has {deleteVenueConfirm.assignedPCCount} profit center{deleteVenueConfirm.assignedPCCount > 1 ? 's' : ''} assigned.
                They will remain but will need to be reassigned to another venue.
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteVenueConfirm(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteVenue}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
