'use client';

import { MapPin } from 'lucide-react';

interface LocationBannerProps {
  locationFellBack: boolean;
  locationDefaulted: boolean;
  locationName: string | undefined;
  className?: string;
}

/**
 * Shows an amber "Defaulting to <location>" or red "Location mismatch" banner
 * for KDS/expo screens. Renders nothing when neither condition is true.
 */
export function LocationBanner({ locationFellBack, locationDefaulted, locationName, className = 'px-4' }: LocationBannerProps) {
  if (locationFellBack) {
    return (
      <div className={`flex items-center gap-2 ${className} py-2 text-xs font-medium shrink-0`}
        style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', borderBottom: '1px solid rgba(239, 68, 68, 0.2)' }}>
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        <span>
          Location mismatch — URL location not found. Showing data for <strong>{locationName}</strong>.
        </span>
      </div>
    );
  }

  if (locationDefaulted) {
    return (
      <div className={`flex items-center gap-2 ${className} py-2 text-xs font-medium shrink-0`}
        style={{ backgroundColor: 'rgba(245, 158, 11, 0.10)', color: '#f59e0b', borderBottom: '1px solid rgba(245, 158, 11, 0.2)' }}>
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        <span>
          Defaulting to <strong>{locationName}</strong>. Use the location selector to switch.
        </span>
      </div>
    );
  }

  return null;
}
