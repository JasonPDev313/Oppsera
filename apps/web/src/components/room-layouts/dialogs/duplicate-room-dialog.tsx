'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FormField } from '@/components/ui/form-field';
import { useToast } from '@/components/ui/toast';
import { useAuthContext } from '@/components/auth-provider';
import { duplicateRoomApi } from '@/hooks/use-room-layouts';
import type { RoomRow } from '@/types/room-layouts';

interface DuplicateRoomDialogProps {
  room: RoomRow;
  onClose: () => void;
  onDuplicated: (newRoomId: string) => void;
}

export function DuplicateRoomDialog({ room, onClose, onDuplicated }: DuplicateRoomDialogProps) {
  const { toast } = useToast();
  const { locations } = useAuthContext();

  const [name, setName] = useState(`${room.name} (Copy)`);
  const [locationId, setLocationId] = useState(room.locationId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Room name is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const res = await duplicateRoomApi(
        room.id,
        name.trim(),
        locationId !== room.locationId ? locationId : undefined,
      );
      toast.success('Room duplicated');
      onDuplicated(res.data.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to duplicate room');
    } finally {
      setIsSubmitting(false);
    }
  }, [room.id, room.locationId, name, locationId, toast, onDuplicated]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">Duplicate Room</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a copy of &ldquo;{room.name}&rdquo; with all its layout objects.
        </p>

        <div className="mt-4 space-y-4">
          <FormField label="New Room Name" required error={errors.name}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          {locations.length > 1 && (
            <FormField label="Location" helpText="Change location for the copy">
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </FormField>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent/50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 ${
              isSubmitting ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            {isSubmitting ? 'Duplicating...' : 'Duplicate'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
