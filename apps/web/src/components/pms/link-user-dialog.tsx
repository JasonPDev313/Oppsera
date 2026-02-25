'use client';

import { useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, UserPlus } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import type { AvailableUserForHousekeeping } from '@/hooks/use-pms';

interface LinkUserDialogProps {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  availableUsers: AvailableUserForHousekeeping[];
  isLoadingUsers: boolean;
  onLink: (userId: string) => Promise<void>;
}

export function LinkUserDialog({
  open,
  onClose,
  propertyId: _propertyId,
  availableUsers,
  isLoadingUsers,
  onLink,
}: LinkUserDialogProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setSearch('');
    setSelectedUserId(null);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const filtered = useMemo(() => {
    if (!search.trim()) return availableUsers;
    const q = search.toLowerCase();
    return availableUsers.filter(
      (u) =>
        (u.displayName ?? '').toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.firstName ?? '').toLowerCase().includes(q) ||
        (u.lastName ?? '').toLowerCase().includes(q),
    );
  }, [availableUsers, search]);

  const handleSubmit = async () => {
    if (!selectedUserId) return;
    setIsSubmitting(true);
    try {
      await onLink(selectedUserId);
      toast.success('User has been added as a housekeeper.');
      handleClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to link user';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative z-50 w-full max-w-lg rounded-lg bg-surface border border-gray-200/50 shadow-xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200/30">
          <h2 className="text-lg font-semibold">Link Existing User</h2>
          <button onClick={handleClose} className="p-1 rounded hover:bg-gray-200/50">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-200/30">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-md border border-gray-300/50 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              autoFocus
            />
          </div>
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto px-6 py-3 min-h-[200px]">
          {isLoadingUsers ? (
            <div className="flex items-center justify-center py-8 text-sm text-gray-500">Loading users...</div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-gray-500">
              {search ? 'No matching users found.' : 'No available users.'}
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((u) => {
                const display = u.displayName || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email;
                const isSelected = selectedUserId === u.id;
                return (
                  <button
                    key={u.id}
                    onClick={() => setSelectedUserId(isSelected ? null : u.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors ${
                      isSelected
                        ? 'bg-indigo-600 text-white'
                        : 'hover:bg-gray-200/50'
                    }`}
                  >
                    <div className="font-medium">{display}</div>
                    <div className={`text-xs ${isSelected ? 'text-indigo-200' : 'text-gray-500'}`}>
                      {u.email}
                      {u.roles.length > 0 && (
                        <span className="ml-2">
                          · {u.roles.map((r) => r.name).join(', ')}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200/30">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm rounded-md border border-gray-300/50 hover:bg-gray-200/50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedUserId || isSubmitting}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UserPlus className="w-4 h-4" />
            {isSubmitting ? 'Linking...' : 'Link as Housekeeper'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
