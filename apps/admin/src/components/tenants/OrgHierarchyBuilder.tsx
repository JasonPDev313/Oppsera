'use client';

import { useEffect, useState, useMemo } from 'react';
import { useOrgHierarchy } from '@/hooks/use-tenant-management';
import { HierarchyPanel } from './HierarchyPanel';
import { LocationFormModal } from './LocationFormModal';
import { ProfitCenterFormModal } from './ProfitCenterFormModal';
import { TerminalFormModal } from './TerminalFormModal';
import type { LocationItem, ProfitCenterItem, TerminalItem } from '@/types/tenant';

type ModalState =
  | { type: 'none' }
  | { type: 'createSite' }
  | { type: 'editSite'; item: LocationItem }
  | { type: 'createVenue'; parentId: string }
  | { type: 'editVenue'; item: LocationItem }
  | { type: 'createPC'; locationId: string }
  | { type: 'editPC'; item: ProfitCenterItem }
  | { type: 'createTerminal'; profitCenterId: string }
  | { type: 'editTerminal'; item: TerminalItem };

export function OrgHierarchyBuilder({ tenantId }: { tenantId: string }) {
  const hierarchy = useOrgHierarchy(tenantId);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [selectedPCId, setSelectedPCId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ type: 'none' });

  useEffect(() => {
    hierarchy.load();
  }, []);

  // Derived lists
  const sites = useMemo(
    () => hierarchy.locations.filter((l) => l.locationType === 'site'),
    [hierarchy.locations],
  );

  const venues = useMemo(
    () =>
      selectedSiteId
        ? hierarchy.locations.filter((l) => l.locationType === 'venue' && l.parentLocationId === selectedSiteId)
        : [],
    [hierarchy.locations, selectedSiteId],
  );

  // Profit centers: show for venue if selected, otherwise for site
  const pcLocationId = selectedVenueId ?? selectedSiteId;
  const profitCenters = useMemo(
    () =>
      pcLocationId
        ? hierarchy.profitCenters.filter((pc) => pc.locationId === pcLocationId)
        : [],
    [hierarchy.profitCenters, pcLocationId],
  );

  const terminals = useMemo(
    () =>
      selectedPCId
        ? hierarchy.terminals.filter((t) => t.profitCenterId === selectedPCId)
        : [],
    [hierarchy.terminals, selectedPCId],
  );

  // Reset child selections when parent changes
  const selectSite = (id: string) => {
    setSelectedSiteId(id);
    setSelectedVenueId(null);
    setSelectedPCId(null);
  };
  const selectVenue = (id: string) => {
    setSelectedVenueId(id);
    setSelectedPCId(null);
  };

  if (hierarchy.isLoading && hierarchy.locations.length === 0) {
    return <p className="text-slate-500 text-sm py-8 text-center">Loading hierarchy...</p>;
  }
  if (hierarchy.error) {
    return <p className="text-red-400 text-sm py-4">{hierarchy.error}</p>;
  }

  return (
    <>
      <div className="grid grid-cols-4 gap-3" style={{ minHeight: 500 }}>
        {/* Sites */}
        <HierarchyPanel<LocationItem>
          title="Sites"
          items={sites}
          selectedId={selectedSiteId}
          onSelect={selectSite}
          onCreate={() => setModal({ type: 'createSite' })}
          onEdit={(item) => setModal({ type: 'editSite', item })}
          emptyMessage="No sites. Click + to create one."
          renderItem={(loc) => (
            <div>
              <p className="font-medium">{loc.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {loc.childVenueCount} venue{loc.childVenueCount !== 1 ? 's' : ''}
                <span className="mx-1">·</span>
                {loc.profitCenterCount} PC{loc.profitCenterCount !== 1 ? 's' : ''}
                {!loc.isActive && <span className="ml-1 text-red-400">(inactive)</span>}
              </p>
            </div>
          )}
        />

        {/* Venues */}
        <HierarchyPanel<LocationItem>
          title="Venues"
          items={venues}
          selectedId={selectedVenueId}
          onSelect={selectVenue}
          onCreate={selectedSiteId ? () => setModal({ type: 'createVenue', parentId: selectedSiteId! }) : undefined}
          onEdit={(item) => setModal({ type: 'editVenue', item })}
          emptyMessage={selectedSiteId ? 'No venues at this site. Click + to add one, or assign PCs directly to the site.' : 'Select a site first'}
          disableCreate={!selectedSiteId}
          renderItem={(loc) => (
            <div>
              <p className="font-medium">{loc.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {loc.profitCenterCount} PC{loc.profitCenterCount !== 1 ? 's' : ''}
                {!loc.isActive && <span className="ml-1 text-red-400">(inactive)</span>}
              </p>
            </div>
          )}
        />

        {/* Profit Centers */}
        <HierarchyPanel<ProfitCenterItem>
          title="Profit Centers"
          items={profitCenters}
          selectedId={selectedPCId}
          onSelect={setSelectedPCId}
          onCreate={pcLocationId ? () => setModal({ type: 'createPC', locationId: pcLocationId! }) : undefined}
          onEdit={(item) => setModal({ type: 'editPC', item })}
          emptyMessage={pcLocationId ? 'No profit centers. Click + to add one.' : 'Select a site or venue first'}
          disableCreate={!pcLocationId}
          renderItem={(pc) => (
            <div>
              <p className="font-medium">{pc.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {pc.code && <span className="font-mono mr-1">{pc.code}</span>}
                {pc.terminalCount} terminal{pc.terminalCount !== 1 ? 's' : ''}
                {!pc.isActive && <span className="ml-1 text-red-400">(inactive)</span>}
              </p>
            </div>
          )}
        />

        {/* Terminals */}
        <HierarchyPanel<TerminalItem>
          title="Terminals"
          items={terminals}
          selectedId={null}
          onSelect={() => {}}
          onCreate={selectedPCId ? () => setModal({ type: 'createTerminal', profitCenterId: selectedPCId! }) : undefined}
          onEdit={(item) => setModal({ type: 'editTerminal', item })}
          emptyMessage={selectedPCId ? 'No terminals. Click + to add one.' : 'Select a profit center first'}
          disableCreate={!selectedPCId}
          renderItem={(t) => (
            <div>
              <p className="font-medium">
                {t.terminalNumber != null && (
                  <span className="text-slate-500 mr-1">#{t.terminalNumber}</span>
                )}
                {t.name}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {t.deviceIdentifier && <span className="font-mono mr-1">{t.deviceIdentifier}</span>}
                {t.ipAddress && <span>{t.ipAddress}</span>}
                {!t.isActive && <span className="ml-1 text-red-400">(inactive)</span>}
              </p>
            </div>
          )}
        />
      </div>

      {/* Modals */}
      {(modal.type === 'createSite' || modal.type === 'editSite') && (
        <LocationFormModal
          locationType="site"
          existing={modal.type === 'editSite' ? modal.item : undefined}
          onClose={() => setModal({ type: 'none' })}
          onSave={async (data) => {
            if (modal.type === 'editSite') {
              await hierarchy.updateLocation(modal.item.id, data);
            } else {
              await hierarchy.createLocation({ ...data, locationType: 'site' });
            }
            setModal({ type: 'none' });
          }}
        />
      )}

      {(modal.type === 'createVenue' || modal.type === 'editVenue') && (
        <LocationFormModal
          locationType="venue"
          existing={modal.type === 'editVenue' ? modal.item : undefined}
          onClose={() => setModal({ type: 'none' })}
          onSave={async (data) => {
            if (modal.type === 'editVenue') {
              await hierarchy.updateLocation(modal.item.id, data);
            } else {
              await hierarchy.createLocation({
                ...data,
                locationType: 'venue',
                parentLocationId: modal.parentId,
              });
            }
            setModal({ type: 'none' });
          }}
        />
      )}

      {(modal.type === 'createPC' || modal.type === 'editPC') && (
        <ProfitCenterFormModal
          existing={modal.type === 'editPC' ? modal.item : undefined}
          onClose={() => setModal({ type: 'none' })}
          onSave={async (data) => {
            if (modal.type === 'editPC') {
              await hierarchy.updateProfitCenter(modal.item.id, data);
            } else {
              await hierarchy.createProfitCenter({ ...data, locationId: modal.locationId });
            }
            setModal({ type: 'none' });
          }}
        />
      )}

      {(modal.type === 'createTerminal' || modal.type === 'editTerminal') && (
        <TerminalFormModal
          existing={modal.type === 'editTerminal' ? modal.item : undefined}
          onClose={() => setModal({ type: 'none' })}
          onSave={async (data) => {
            if (modal.type === 'editTerminal') {
              await hierarchy.updateTerminal(modal.item.id, data);
            } else {
              await hierarchy.createTerminal({ ...data, profitCenterId: modal.profitCenterId });
            }
            setModal({ type: 'none' });
          }}
        />
      )}
    </>
  );
}
