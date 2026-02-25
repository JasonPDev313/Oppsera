'use client';

import { useState, useRef, useEffect } from 'react';
import { Users, ChevronDown, UserPlus, Link2, AlertTriangle } from 'lucide-react';
import {
  useProperties,
  useHousekeepers,
  useAvailableUsersForHousekeeping,
  useHousekeeperMutations,
} from '@/hooks/use-pms';
import type { PMSHousekeeper } from '@/hooks/use-pms';
import { LinkUserDialog } from '@/components/pms/link-user-dialog';
import { CreateHousekeeperUserDialog } from '@/components/pms/create-housekeeper-user-dialog';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';

export function HousekeepingStaffContent() {
  const { toast } = useToast();
  const { data: properties, isLoading: propsLoading } = useProperties();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Auto-select first property
  useEffect(() => {
    if (properties.length > 0 && !selectedPropertyId) {
      setSelectedPropertyId(properties[0]!.id);
    }
  }, [properties, selectedPropertyId]);

  const { data: housekeepers, isLoading: hkLoading, mutate: refreshHousekeepers } = useHousekeepers(selectedPropertyId);
  const { data: availableUsers, isLoading: usersLoading, mutate: refreshAvailableUsers } = useAvailableUsersForHousekeeping(selectedPropertyId);
  const { linkUserAsHousekeeper, createHousekeeperWithUser } = useHousekeeperMutations();

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const _selectedProperty = properties.find((p) => p.id === selectedPropertyId);

  const handleLink = async (userId: string) => {
    if (!selectedPropertyId) return;
    await linkUserAsHousekeeper.mutateAsync({ userId, propertyId: selectedPropertyId });
    refreshAvailableUsers();
  };

  const handleCreate = async (input: {
    propertyId: string;
    firstName: string;
    lastName: string;
    email: string;
    username: string;
    password?: string;
    phone?: string;
  }) => {
    await createHousekeeperWithUser.mutateAsync(input);
    refreshAvailableUsers();
  };

  const handleToggleActive = async (hk: PMSHousekeeper) => {
    try {
      await apiFetch(`/api/v1/pms/housekeepers/${hk.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !hk.isActive }),
      });
      refreshHousekeepers();
      toast.success(hk.isActive ? 'Housekeeper deactivated' : 'Housekeeper activated');
    } catch {
      toast.error('Failed to update status');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Housekeeping Staff</h1>
          <p className="text-sm text-gray-500 mt-1">Manage housekeepers assigned to your properties.</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Property selector */}
          {properties.length > 1 && (
            <select
              value={selectedPropertyId ?? ''}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="px-3 py-2 rounded-md border border-gray-300/50 bg-surface text-sm"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}

          {/* Add Housekeeper dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <UserPlus className="w-4 h-4" />
              Add Housekeeper
              <ChevronDown className="w-3 h-3" />
            </button>
            {showDropdown && (
              <div className="absolute right-0 mt-1 w-56 rounded-md bg-surface border border-gray-200/50 shadow-lg z-10">
                <button
                  onClick={() => { setShowDropdown(false); setShowLinkDialog(true); }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-left hover:bg-gray-200/50 rounded-t-md"
                >
                  <Link2 className="w-4 h-4 text-gray-500" />
                  <div>
                    <div className="font-medium">Link Existing User</div>
                    <div className="text-xs text-gray-500">Choose from current users</div>
                  </div>
                </button>
                <button
                  onClick={() => { setShowDropdown(false); setShowCreateDialog(true); }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-left hover:bg-gray-200/50 rounded-b-md"
                >
                  <UserPlus className="w-4 h-4 text-gray-500" />
                  <div>
                    <div className="font-medium">Create New User</div>
                    <div className="text-xs text-gray-500">Add a new user as housekeeper</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      {propsLoading || hkLoading ? (
        <div className="rounded-lg border border-gray-200/30 bg-surface p-8 text-center text-sm text-gray-500">
          Loading...
        </div>
      ) : housekeepers.length === 0 ? (
        <div className="rounded-lg border border-gray-200/30 bg-surface p-12 text-center">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-base font-medium mb-1">No housekeepers configured</h3>
          <p className="text-sm text-gray-500 mb-4">
            Add your first housekeeper to start assigning cleanings.
          </p>
          <button
            onClick={() => setShowLinkDialog(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <UserPlus className="w-4 h-4" />
            Add Housekeeper
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200/30 bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200/30 bg-gray-50/50">
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Phone</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">User Account</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {housekeepers.map((hk) => (
                <tr key={hk.id} className="border-b border-gray-200/20 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{hk.name}</div>
                    {hk.userDisplayName && hk.userDisplayName !== hk.name && (
                      <div className="text-xs text-gray-500">{hk.userDisplayName}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{hk.userEmail}</td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{hk.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    {hk.isActive ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/30">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/10 text-gray-500 border border-gray-500/30">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {hk.userStatus === 'active' ? (
                      <span className="text-xs text-green-600">Active</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                        <AlertTriangle className="w-3 h-3" />
                        {hk.userStatus}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleToggleActive(hk)}
                      className={`text-xs px-2.5 py-1 rounded-md border ${
                        hk.isActive
                          ? 'border-red-500/30 text-red-500 hover:bg-red-500/10'
                          : 'border-green-500/30 text-green-500 hover:bg-green-500/10'
                      }`}
                    >
                      {hk.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogs */}
      {selectedPropertyId && (
        <>
          <LinkUserDialog
            open={showLinkDialog}
            onClose={() => setShowLinkDialog(false)}
            propertyId={selectedPropertyId}
            availableUsers={availableUsers}
            isLoadingUsers={usersLoading}
            onLink={handleLink}
          />
          <CreateHousekeeperUserDialog
            open={showCreateDialog}
            onClose={() => setShowCreateDialog(false)}
            propertyId={selectedPropertyId}
            onCreate={handleCreate}
          />
        </>
      )}
    </div>
  );
}
