'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Shield, ChevronDown, Check } from 'lucide-react';
import { useTerminalSession } from '@/components/terminal-session-provider';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';

interface RoleOption {
  assignmentId: string;
  roleId: string;
  roleName: string;
  scope: 'tenant' | 'location';
  locationId: string | null;
  locationName: string | null;
}

/**
 * Compact role switcher for the POS header bar.
 * Shows the current role with a dropdown to switch without logging out
 * or going through the full terminal selection flow.
 *
 * Only renders if the user has multiple roles assigned.
 */
export function RoleSwitcher() {
  const { session, setSession } = useTerminalSession();
  const { toast } = useToast();
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch available roles on mount
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ data: { roles: RoleOption[] } }>('/api/v1/terminal-session/my-roles')
      .then((res) => {
        if (!cancelled) {
          setRoles(res.data.roles);
          setIsLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  // Filter to roles compatible with the current terminal's location
  const compatibleRoles = useMemo(() => {
    if (!session) return roles;
    return roles.filter((r) =>
      r.scope === 'tenant' || r.locationId === session.locationId,
    );
  }, [roles, session]);

  const [_isSwitching, setIsSwitching] = useState(false);

  const handleSelectRole = useCallback(async (role: RoleOption) => {
    if (!session) return;
    if (role.roleId === session.roleId) {
      setIsOpen(false);
      return;
    }

    // Guard: location-scoped role must match the current terminal's location
    if (role.scope === 'location' && role.locationId !== session.locationId) {
      toast.error(`${role.roleName} is scoped to ${role.locationName ?? 'another location'} — switch registers first`);
      setIsOpen(false);
      return;
    }

    // Re-fetch roles to confirm assignment still exists server-side before switching
    setIsSwitching(true);
    try {
      const fresh = await apiFetch<{ data: { roles: RoleOption[] } }>('/api/v1/terminal-session/my-roles');
      const stillAssigned = fresh.data.roles.some((r) => r.roleId === role.roleId);
      if (!stillAssigned) {
        toast.error('Role is no longer assigned to you — permissions may have changed.');
        setRoles(fresh.data.roles);
        setIsSwitching(false);
        setIsOpen(false);
        return;
      }
      // Update local cache with fresh data
      setRoles(fresh.data.roles);
    } catch {
      toast.error('Unable to verify role — please try again.');
      setIsSwitching(false);
      setIsOpen(false);
      return;
    }

    // Server confirmed role is still assigned — update the session
    setSession({
      ...session,
      roleId: role.roleId,
      roleName: role.roleName,
    });
    setIsSwitching(false);
    setIsOpen(false);
    toast.success(`Switched to ${role.roleName}`);
  }, [session, setSession, toast]);

  // Don't render if not loaded, no session, or only 1 compatible role
  if (!isLoaded || !session || compatibleRoles.length <= 1) return null;

  const currentRoleName = session.roleName ?? 'No Role';

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold transition-colors"
        style={{
          backgroundColor: isOpen ? 'var(--pos-bg-elevated)' : 'transparent',
          color: 'var(--pos-accent)',
        }}
        title="Switch Role"
        aria-label="Switch Role"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <Shield className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="max-w-[120px] truncate">{currentRoleName}</span>
        <ChevronDown
          className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border shadow-lg"
          style={{
            backgroundColor: 'var(--pos-bg-surface)',
            borderColor: 'var(--pos-border)',
          }}
          role="listbox"
          aria-label="Available roles"
        >
          <div className="p-1">
            {compatibleRoles.map((role) => {
              const isActive = role.roleId === session.roleId;
              return (
                <button
                  key={role.assignmentId}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => handleSelectRole(role)}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors"
                  style={{
                    backgroundColor: isActive ? 'var(--pos-bg-elevated)' : 'transparent',
                    color: 'var(--pos-text-primary)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'var(--pos-bg-elevated)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div className="flex-1">
                    <div className="font-medium">{role.roleName}</div>
                    <div className="text-xs" style={{ color: 'var(--pos-text-muted)' }}>
                      {role.scope === 'tenant' ? 'All Locations' : role.locationName ?? 'Specific Location'}
                    </div>
                  </div>
                  {isActive && (
                    <Check className="h-4 w-4 shrink-0" style={{ color: 'var(--pos-accent)' }} aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
