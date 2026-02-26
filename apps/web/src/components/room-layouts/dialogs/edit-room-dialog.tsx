'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FormField } from '@/components/ui/form-field';
import { useToast } from '@/components/ui/toast';
import { updateRoomApi } from '@/hooks/use-room-layouts';
import type { RoomRow } from '@/types/room-layouts';

interface EditRoomDialogProps {
  room: RoomRow;
  onClose: () => void;
  onUpdated: () => void;
}

export function EditRoomDialog({ room, onClose, onUpdated }: EditRoomDialogProps) {
  const { toast } = useToast();

  const [name, setName] = useState(room.name);
  const [description, setDescription] = useState(room.description ?? '');
  const [widthFt, setWidthFt] = useState(String(Number(room.widthFt)));
  const [heightFt, setHeightFt] = useState(String(Number(room.heightFt)));
  const [unit, setUnit] = useState(room.unit);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Room name is required';
    const w = parseFloat(widthFt);
    if (!widthFt || Number.isNaN(w) || w <= 0) newErrors.widthFt = 'Width must be a positive number';
    const h = parseFloat(heightFt);
    if (!heightFt || Number.isNaN(h) || h <= 0) newErrors.heightFt = 'Height must be a positive number';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await updateRoomApi(room.id, {
        name: name.trim(),
        description: description.trim() || null,
        widthFt: parseFloat(widthFt),
        heightFt: parseFloat(heightFt),
        unit,
      });
      toast.success('Room updated');
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update room');
    } finally {
      setIsSubmitting(false);
    }
  }, [room.id, name, description, widthFt, heightFt, unit, toast, onUpdated]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-lg bg-surface p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">Edit Room Details</h3>
        <p className="mt-1 text-sm text-muted-foreground">Update the room name, dimensions, or description.</p>

        <div className="mt-4 space-y-4">
          <FormField label="Room Name" required error={errors.name}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          <FormField label="Description">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Width" required error={errors.widthFt}>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={widthFt}
                  onChange={(e) => setWidthFt(e.target.value)}
                  min="1"
                  step="any"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
                <span className="text-sm text-muted-foreground">{unit}</span>
              </div>
            </FormField>

            <FormField label="Height" required error={errors.heightFt}>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={heightFt}
                  onChange={(e) => setHeightFt(e.target.value)}
                  min="1"
                  step="any"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
                <span className="text-sm text-muted-foreground">{unit}</span>
              </div>
            </FormField>
          </div>

          <FormField label="Unit">
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="ft">Feet</option>
              <option value="m">Meters</option>
            </select>
          </FormField>
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
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
