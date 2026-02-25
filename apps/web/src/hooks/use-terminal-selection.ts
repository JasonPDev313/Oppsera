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

interface PCItem {
  id: string;
  name: string;
  locationId: string;
  code: string | null;
  icon: string | null;
}

interface TermItem {
  id: string;
  name: string;
  profitCenterId: string;
  terminalNumber: number | null;
  deviceIdentifier: string | null;
}

interface AllData {
  locations: LocationItem[];
  profitCenters: PCItem[];
  terminals: TermItem[];
}

interface UseTerminalSelectionOptions {
  roleId?: string | null;
  roleName?: string | null;
}

export function useTerminalSelection(options?: UseTerminalSelectionOptions) {
  const roleId = options?.roleId ?? null;
  const roleName = options?.roleName ?? null;

  const [allData, setAllData] = useState<AllData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [selectedProfitCenterId, setSelectedProfitCenterId] = useState<string | null>(null);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null);

  // Single fetch on mount (or when roleId changes)
  useEffect(() => {
    setSelectedSiteId(null);
    setSelectedVenueId(null);
    setSelectedProfitCenterId(null);
    setSelectedTerminalId(null);
    setIsLoading(true);

    (async () => {
      try {
        const roleParam = roleId ? `?roleId=${roleId}` : '';
        const res = await apiFetch<{ data: AllData }>(
          `/api/v1/terminal-session/all${roleParam}`,
        );
        setAllData(res.data);

        // Auto-select single site
        const siteList = res.data.locations.filter((l) => l.locationType === 'site');
        if (siteList.length === 1) {
          setSelectedSiteId(siteList[0]!.id);
        }
      } catch {
        /* handle error */
      }
      setIsLoading(false);
    })();
  }, [roleId]);

  // Derived: sites
  const sites = useMemo(
    () => (allData?.locations ?? []).filter((l) => l.locationType === 'site'),
    [allData],
  );

  // Derived: venues for selected site
  const venues = useMemo(
    () =>
      selectedSiteId
        ? (allData?.locations ?? []).filter(
            (l) => l.locationType === 'venue' && l.parentLocationId === selectedSiteId,
          )
        : [],
    [allData, selectedSiteId],
  );

  const effectiveLocationId = selectedVenueId ?? (venues.length === 0 ? selectedSiteId : null);

  // Derived: profit centers for effective location (instant, no API call)
  const profitCenters = useMemo(
    () =>
      effectiveLocationId
        ? (allData?.profitCenters ?? []).filter((pc) => pc.locationId === effectiveLocationId)
        : [],
    [allData, effectiveLocationId],
  );

  // Derived: terminals for selected profit center (instant, no API call)
  const terminals = useMemo(
    () =>
      selectedProfitCenterId
        ? (allData?.terminals ?? []).filter((t) => t.profitCenterId === selectedProfitCenterId)
        : [],
    [allData, selectedProfitCenterId],
  );

  // No PCs exist across entire tenant
  const noProfitCentersExist = !isLoading && (allData?.profitCenters ?? []).length === 0;

  // Auto-select single venue when site changes
  useEffect(() => {
    if (!selectedSiteId) {
      setSelectedVenueId(null);
      setSelectedProfitCenterId(null);
      setSelectedTerminalId(null);
      return;
    }
    // Reset downstream
    setSelectedVenueId(null);
    setSelectedProfitCenterId(null);
    setSelectedTerminalId(null);

    const childVenues = (allData?.locations ?? []).filter(
      (l) => l.locationType === 'venue' && l.parentLocationId === selectedSiteId,
    );
    if (childVenues.length === 1) {
      setSelectedVenueId(childVenues[0]!.id);
    }
  }, [selectedSiteId, allData]);

  // Auto-select single PC when location changes
  useEffect(() => {
    if (!effectiveLocationId) {
      setSelectedProfitCenterId(null);
      setSelectedTerminalId(null);
      return;
    }
    setSelectedProfitCenterId(null);
    setSelectedTerminalId(null);

    if (profitCenters.length === 1) {
      setSelectedProfitCenterId(profitCenters[0]!.id);
    }
  }, [effectiveLocationId, profitCenters.length]);

  // Auto-select single terminal when PC changes
  useEffect(() => {
    if (!selectedProfitCenterId) {
      setSelectedTerminalId(null);
      return;
    }
    setSelectedTerminalId(null);

    if (terminals.length === 1) {
      setSelectedTerminalId(terminals[0]!.id);
    }
  }, [selectedProfitCenterId, terminals.length]);

  // Handle venue selection change (reset downstream)
  const handleSetSelectedVenueId = useCallback((id: string | null) => {
    setSelectedVenueId(id);
    setSelectedProfitCenterId(null);
    setSelectedTerminalId(null);
  }, []);

  const canContinue = !!(effectiveLocationId && selectedProfitCenterId && selectedTerminalId);

  const buildSession = useCallback((): TerminalSession | null => {
    if (!canContinue || !effectiveLocationId || !allData) return null;

    const loc = allData.locations.find((l) => l.id === effectiveLocationId)!;
    const site = selectedSiteId ? allData.locations.find((l) => l.id === selectedSiteId) : null;
    const pc = profitCenters.find((p) => p.id === selectedProfitCenterId)!;
    const term = terminals.find((t) => t.id === selectedTerminalId)!;

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
      roleId,
      roleName,
    };
  }, [
    canContinue,
    effectiveLocationId,
    allData,
    selectedSiteId,
    profitCenters,
    terminals,
    selectedProfitCenterId,
    selectedTerminalId,
    roleId,
    roleName,
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
