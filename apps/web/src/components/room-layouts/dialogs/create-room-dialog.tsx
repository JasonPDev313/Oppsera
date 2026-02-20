'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FormField } from '@/components/ui/form-field';
import { useToast } from '@/components/ui/toast';
import { useAuthContext } from '@/components/auth-provider';
import { createRoomApi, createRoomFromTemplateApi } from '@/hooks/use-room-layouts';
import { TemplateGallery } from '@/components/room-layouts/templates/template-gallery';
import type { TemplateRow } from '@/types/room-layouts';

interface CreateRoomDialogProps {
  onClose: () => void;
  onCreated: (roomId?: string) => void;
}

type Tab = 'blank' | 'template';

export function CreateRoomDialog({ onClose, onCreated }: CreateRoomDialogProps) {
  const { toast } = useToast();
  const { locations } = useAuthContext();

  const [tab, setTab] = useState<Tab>('blank');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
  const [widthFt, setWidthFt] = useState('40');
  const [heightFt, setHeightFt] = useState('30');
  const [gridSizeFt, setGridSizeFt] = useState('1');
  const [unit, setUnit] = useState('feet');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Template tab state
  const [showGallery, setShowGallery] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateRow | null>(null);
  const [templateName, setTemplateName] = useState('');

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (tab === 'blank') {
      if (!name.trim()) newErrors.name = 'Room name is required';
      if (!locationId) newErrors.locationId = 'Location is required';
      const w = parseFloat(widthFt);
      if (!widthFt || Number.isNaN(w) || w <= 0) newErrors.widthFt = 'Width must be a positive number';
      const h = parseFloat(heightFt);
      if (!heightFt || Number.isNaN(h) || h <= 0) newErrors.heightFt = 'Height must be a positive number';
      const g = parseFloat(gridSizeFt);
      if (gridSizeFt && (Number.isNaN(g) || g <= 0)) newErrors.gridSizeFt = 'Grid size must be positive';
    } else {
      if (!selectedTemplate) newErrors.template = 'Please select a template';
      if (!templateName.trim()) newErrors.templateName = 'Room name is required';
      if (!locationId) newErrors.locationId = 'Location is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmitBlank = useCallback(async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const res = await createRoomApi({
        name: name.trim(),
        locationId,
        description: description.trim() || undefined,
        widthFt: parseFloat(widthFt),
        heightFt: parseFloat(heightFt),
        gridSizeFt: gridSizeFt ? parseFloat(gridSizeFt) : undefined,
        unit,
      });
      toast.success('Room created');
      onCreated(res.data.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setIsSubmitting(false);
    }
  }, [name, locationId, description, widthFt, heightFt, gridSizeFt, unit, toast, onCreated]);

  const handleSubmitFromTemplate = useCallback(async () => {
    if (!validate()) return;
    if (!selectedTemplate) return;
    setIsSubmitting(true);
    try {
      const res = await createRoomFromTemplateApi({
        name: templateName.trim(),
        locationId,
        templateId: selectedTemplate.id,
        description: description.trim() || undefined,
        widthFt: Number(selectedTemplate.widthFt),
        heightFt: Number(selectedTemplate.heightFt),
      });
      toast.success('Room created from template');
      onCreated(res.data.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedTemplate, templateName, locationId, description, toast, onCreated]);

  const handleTemplateSelect = useCallback((template: TemplateRow) => {
    setSelectedTemplate(template);
    if (!templateName) setTemplateName(template.name);
    setShowGallery(false);
  }, [templateName]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-lg bg-surface p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">Create Room</h3>
        <p className="mt-1 text-sm text-gray-500">Set up a new room for floor plan design.</p>

        {/* Tabs */}
        <div className="mt-4 flex border-b border-gray-200">
          <button
            onClick={() => setTab('blank')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'blank'
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Blank Room
          </button>
          <button
            onClick={() => setTab('template')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'template'
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            From Template
          </button>
        </div>

        {/* Blank Room Tab */}
        {tab === 'blank' && (
          <div className="mt-4 space-y-4">
            <FormField label="Room Name" required error={errors.name}>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Main Dining"
                className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </FormField>

            <FormField label="Description" error={errors.description}>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </FormField>

            {locations.length > 1 && (
              <FormField label="Location" required error={errors.locationId}>
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </FormField>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Width" required error={errors.widthFt}>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={widthFt}
                    onChange={(e) => setWidthFt(e.target.value)}
                    min="1"
                    step="any"
                    className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                  <span className="text-sm text-gray-500">{unit}</span>
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
                    className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                  <span className="text-sm text-gray-500">{unit}</span>
                </div>
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Grid Size" error={errors.gridSizeFt} helpText="Snap-to-grid spacing">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={gridSizeFt}
                    onChange={(e) => setGridSizeFt(e.target.value)}
                    min="0.25"
                    step="0.25"
                    className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                  <span className="text-sm text-gray-500">{unit}</span>
                </div>
              </FormField>

              <FormField label="Unit">
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="feet">Feet</option>
                  <option value="meters">Meters</option>
                </select>
              </FormField>
            </div>
          </div>
        )}

        {/* From Template Tab */}
        {tab === 'template' && (
          <div className="mt-4 space-y-4">
            <FormField label="Template" required error={errors.template}>
              {selectedTemplate ? (
                <div className="flex items-center gap-3 rounded-lg border border-gray-300 p-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{selectedTemplate.name}</p>
                    <p className="text-xs text-gray-500">
                      {Number(selectedTemplate.widthFt)}×{Number(selectedTemplate.heightFt)} ft
                      {' · '}{selectedTemplate.objectCount} objects
                      {selectedTemplate.totalCapacity > 0 && ` · ${selectedTemplate.totalCapacity} seats`}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowGallery(true)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200/50"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowGallery(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600"
                >
                  Browse Templates
                </button>
              )}
            </FormField>

            <FormField label="Room Name" required error={errors.templateName}>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. Main Dining"
                className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </FormField>

            <FormField label="Description" error={errors.description}>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </FormField>

            {locations.length > 1 && (
              <FormField label="Location" required error={errors.locationId}>
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </FormField>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200/50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={tab === 'blank' ? handleSubmitBlank : handleSubmitFromTemplate}
            disabled={isSubmitting}
            className={`rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 ${
              isSubmitting ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            {isSubmitting ? 'Creating...' : 'Create Room'}
          </button>
        </div>
      </div>

      {showGallery && (
        <TemplateGallery
          onSelect={handleTemplateSelect}
          onClose={() => setShowGallery(false)}
        />
      )}
    </div>,
    document.body,
  );
}
