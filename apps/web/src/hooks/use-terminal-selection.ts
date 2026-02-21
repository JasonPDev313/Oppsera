'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { TerminalSession } from '@oppsera/core/profit-centers';

interface LocationItem {
  id: string;
  name: string;
  locationType: 'site' | 'venue';
  parentLocationId: string | null;
}

interface SelectionItem {
  id: string;
  name: string;
  code?: string | null;
  icon?: string | null;
  terminalNumber?: number | null;
  deviceIdentifier?: string | null;
}

export function useTerminalSelection() {
  const [allLocations, setAllLocations] = useState<LocationItem[]>([]);
  const [profitCenters, setProfitCenters] = useState<SelectionItem[]>([]);
  const [terminals, setTerminals] = useState<SelectionItem[]>([]);

  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [selectedProfitCenterId, setSelectedProfitCenterId] = useState<string | null>(null);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [noProfitCentersExist, setNoProfitCentersExist] = useState(false);

  // Derived lists
  const sites = useMemo(
    () => allLocations.filter((l) => l.locationType === 'site'),
    [allLocations],
  );

  const venues = useMemo(
    () =>
      selectedSiteId
        ? allLocations.filter(
            (l) => l.locationType === 'venue' && l.parentLocationId === selectedSiteId,
          )
        : [],
    [allLocations, selectedSiteId],
  );

  // The effective locationId for fetching profit centers:
  // if a venue is selected, use it; otherwise use the site directly (when no venues exist)
  const effectiveLocationId = selectedVenueId ?? (venues.length === 0 ? selectedSiteId : null);

  // Load all locations on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{ data: LocationItem[] }>(
          '/api/v1/terminal-session/locations',
        );
        setAllLocations(res.data);

        const siteList = res.data.filter((l) => l.locationType === 'site');
        // Auto-select if only 1 site
        if (siteList.length === 1) {
          setSelectedSiteId(siteList[0]!.id);
        }

        // Check if any profit centers exist across all locations
        if (res.data.length > 0) {
          const checks = await Promise.all(
            res.data.map((loc) =>
              apiFetch<{ data: SelectionItem[] }>(
                `/api/v1/terminal-session/profit-centers?locationId=${loc.id}`,
              )
                .then((r) => r.data.length)
                .catch(() => 0),
            ),
          );
          const totalProfitCenters = checks.reduce((sum, n) => sum + n, 0);
          if (totalProfitCenters === 0) {
            setNoProfitCentersExist(true);
          }
        }
      } catch {
        /* handle error */
      }
      setIsLoading(false);
    })();
  }, []);

  // Auto-select venue when site changes
  useEffect(() => {
    if (!selectedSiteId) {
      setSelectedVenueId(null);
      setProfitCenters([]);
      setSelectedProfitCenterId(null);
      setTerminals([]);
      setSelectedTerminalId(null);
      return;
    }

    const childVenues = allLocations.filter(
      (l) => l.locationType === 'venue' && l.parentLocationId === selectedSiteId,
    );

    // Reset downstream
    setSelectedVenueId(null);
    setProfitCenters([]);
    setSelectedProfitCenterId(null);
    setTerminals([]);
    setSelectedTerminalId(null);

    // Auto-select if only 1 venue
    if (childVenues.length === 1) {
      setSelectedVenueId(childVenues[0]!.id);
    }
  }, [selectedSiteId, allLocations]);

  // Load profit centers when effective location changes
  useEffect(() => {
    if (!effectiveLocationId) {
      setProfitCenters([]);
      setSelectedProfitCenterId(null);
      setTerminals([]);
      setSelectedTerminalId(null);
      return;
    }
    (async () => {
      const res = await apiFetch<{ data: SelectionItem[] }>(
        `/api/v1/terminal-session/profit-centers?locationId=${effectiveLocationId}`,
      );
      setProfitCenters(res.data);
      setSelectedProfitCenterId(null);
      setTerminals([]);
      setSelectedTerminalId(null);
      // Auto-select if only 1
      if (res.data.length === 1) {
        setSelectedProfitCenterId(res.data[0]!.id);
      }
    })();
  }, [effectiveLocationId]);

  // Load terminals when profit center changes
  useEffect(() => {
    if (!selectedProfitCenterId) {
      setTerminals([]);
      setSelectedTerminalId(null);
      return;
    }
    (async () => {
      const res = await apiFetch<{ data: SelectionItem[] }>(
        `/api/v1/terminal-session/terminals?profitCenterId=${selectedProfitCenterId}`,
      );
      setTerminals(res.data);
      setSelectedTerminalId(null);
      // Auto-select if only 1
      if (res.data.length === 1) {
        setSelectedTerminalId(res.data[0]!.id);
      }
    })();
  }, [selectedProfitCenterId]);

  // Handle venue selection change (reset downstream)
  const handleSetSelectedVenueId = useCallback((id: string | null) => {
    setSelectedVenueId(id);
    setProfitCenters([]);
    setSelectedProfitCenterId(null);
    setTerminals([]);
    setSelectedTerminalId(null);
  }, []);

  const canContinue = !!(effectiveLocationId && selectedProfitCenterId && selectedTerminalId);

  const buildSession = useCallback((): TerminalSession | null => {
    if (!canContinue || !effectiveLocationId) return null;

    const loc = allLocations.find((l) => l.id === effectiveLocationId)!;
    const site = selectedSiteId ? allLocations.find((l) => l.id === selectedSiteId) : null;
    const pc = profitCenters.find((p) => p.id === selectedProfitCenterId)!;
    const term = terminals.find((t) => t.id === selectedTerminalId)!;

    // If the effective location IS a site, siteLocationId is null (no parent)
    // If the effective location is a venue, siteLocationId is the parent site
    const isVenue = loc.locationType === 'venue';

    return {
      locationId: loc.id,
      locationName: loc.name,
      siteLocationId: isVenue && site ? site.id : null,
      siteLocationName: isVenue && site ? site.name : null,
      profitCenterId: pc.id,
      profitCenterName: pc.name,
      terminalId: term.id,
      terminalName: term.name,
      terminalNumber: term.terminalNumber ?? null,
    };
  }, [
    canContinue,
    effectiveLocationId,
    allLocations,
    selectedSiteId,
    profitCenters,
    terminals,
    selectedProfitCenterId,
    selectedTerminalId,
  ]);

  return {
    sites,
    venues,
    profitCenters,
    terminals,
    selectedSiteId,
    selectedVenueId,
    selectedProfitCenterId,
    selectedTerminalId,
    setSelectedSiteId,
    setSelectedVenueId: handleSetSelectedVenueId,
    setSelectedProfitCenterId,
    setSelectedTerminalId,
    effectiveLocationId,
    canContinue,
    buildSession,
    isLoading,
    noProfitCentersExist,
  };
}
