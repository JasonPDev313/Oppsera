'use client';

import { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Building2, MapPin, Plus, Pencil, Trash2 } from 'lucide-react';

interface LocationWithHierarchy {
  id: string;
  name: string;
  locationType?: 'site' | 'venue';
  parentLocationId?: string | null;
}

interface Props {
  locations: LocationWithHierarchy[];
  selectedSiteId: string | null;
  selectedVenueId: string | null;
  onSelectSite: (siteId: string) => void;
  onSelectVenue: (venueId: string) => void;
  onAddVenue?: (siteId: string) => void;
  onEditVenue?: (venueId: string) => void;
  onDeleteVenue?: (venueId: string) => void;
  error?: string | null;
}

export function LocationsPane({
  locations,
  selectedSiteId,
  selectedVenueId,
  onSelectSite,
  onSelectVenue,
  onAddVenue,
  onEditVenue,
  onDeleteVenue,
  error,
}: Props) {
  const sites = locations.filter(
    (l) => l.locationType === 'site' || !l.locationType,
  );
  const venuesBySite = new Map<string, LocationWithHierarchy[]>();
  for (const loc of locations) {
    if (loc.locationType === 'venue' && loc.parentLocationId) {
      const list = venuesBySite.get(loc.parentLocationId) ?? [];
      list.push(loc);
      venuesBySite.set(loc.parentLocationId, list);
    }
  }

  const [expandedSites, setExpandedSites] = useState<Set<string>>(new Set());

  // Auto-expand when there's only one site with venues
  useEffect(() => {
    if (sites.length === 1 && venuesBySite.has(sites[0]!.id)) {
      setExpandedSites(new Set([sites[0]!.id]));
    }
  }, [sites.length]);

  const toggleExpand = (siteId: string) => {
    setExpandedSites((prev) => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      return next;
    });
  };

  return (
    <div className="flex flex-col rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Locations &amp; Venues</h3>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sites.map((site) => {
          const children = venuesBySite.get(site.id) ?? [];
          const hasChildren = children.length > 0;
          const isExpanded = expandedSites.has(site.id);
          const isSiteSelected = selectedSiteId === site.id && !selectedVenueId;

          return (
            <div key={site.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  onSelectSite(site.id);
                  if (!isExpanded) {
                    setExpandedSites((prev) => new Set([...prev, site.id]));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectSite(site.id);
                    if (!isExpanded) {
                      setExpandedSites((prev) => new Set([...prev, site.id]));
                    }
                  }
                }}
                className={`group flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-accent ${
                  isSiteSelected ? 'bg-indigo-500/10' : ''
                }`}
              >
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(site.id);
                    }}
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                ) : (
                  <span className="w-4.5 shrink-0" />
                )}
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-foreground">{site.name}</span>

                {onAddVenue && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddVenue(site.id);
                    }}
                    className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
                    title="Add venue"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {isExpanded &&
                children.map((venue) => (
                  <div
                    key={venue.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectVenue(venue.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectVenue(venue.id);
                      }
                    }}
                    className={`group flex cursor-pointer items-center gap-2 py-2.5 pl-12 pr-4 text-sm transition-colors hover:bg-accent ${
                      selectedVenueId === venue.id ? 'bg-indigo-500/10' : ''
                    }`}
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate text-foreground">{venue.name}</span>

                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      {onEditVenue && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditVenue(venue.id);
                          }}
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="Edit venue"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                      {onDeleteVenue && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteVenue(venue.id);
                          }}
                          className="rounded p-1 text-muted-foreground hover:bg-red-500/20 hover:text-red-400"
                          title="Delete venue"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

              {isExpanded && children.length === 0 && onAddVenue && (
                <button
                  type="button"
                  onClick={() => onAddVenue(site.id)}
                  className="flex w-full items-center gap-2 py-2 pl-12 pr-4 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Plus className="h-3 w-3" />
                  Add venue
                </button>
              )}
            </div>
          );
        })}
        {sites.length === 0 && (
          <div className="px-4 py-6 text-center text-xs">
            {error ? (
              <p className="text-red-500">
                Failed to load locations: {error}
              </p>
            ) : (
              <p className="text-muted-foreground">No locations found</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
