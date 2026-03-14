/**
 * Centralized POS location resolution hook.
 *
 * Returns the location from the terminal session (user-selected at POS start)
 * with a last-resort fallback to locations[0] from the auth context.
 *
 * INVARIANT: Every POS-related component that needs a locationId MUST use this
 * hook instead of accessing locations[0] directly. The locations array from
 * /me is sorted by name, but for multi-location tenants locations[0] may still
 * not match the location the user logged into.
 */

import { useEffect, useRef } from 'react';
import { useAuthContext } from '@/components/auth-provider';
import { useTerminalSession } from '@/components/terminal-session-provider';

interface PosLocation {
  locationId: string;
  locationName: string;
  terminalId: string;
}

export function usePosLocation(): PosLocation {
  const { locations } = useAuthContext();
  const { session, clearSession } = useTerminalSession();
  const warnedRef = useRef(false);

  // Guard: if the terminal session references a location that no longer
  // exists in the tenant's active locations, the session is stale.
  // Clear it so we fall back to locations[0] instead of using a phantom ID.
  useEffect(() => {
    if (!session?.locationId || !locations.length) return;
    const sessionLocationExists = locations.some((l) => l.id === session.locationId);
    if (!sessionLocationExists && !warnedRef.current) {
      warnedRef.current = true;
      console.warn(
        `[usePosLocation] Terminal session references location "${session.locationName}" (${session.locationId}) ` +
        `which is not in the active locations list. Clearing stale session.`,
      );
      clearSession();
    }
  }, [session?.locationId, session?.locationName, locations, clearSession]);

  return {
    locationId: session?.locationId ?? locations[0]?.id ?? '',
    locationName: session?.locationName ?? locations[0]?.name ?? 'Store',
    terminalId: session?.terminalId ?? 'POS-01',
  };
}
