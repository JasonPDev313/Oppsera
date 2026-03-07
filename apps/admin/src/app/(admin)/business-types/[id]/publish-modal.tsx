'use client';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { adminFetch, AdminApiError } from '@/lib/api-fetch';

interface ValidationResult {
  isValid: boolean;
  errors: { domain: string; message: string }[];
  warnings: { domain: string; message: string }[];
}

export function PublishModal({
  versionId,
  versionNumber,
  onClose,
  onPublished,
}: {
  versionId: string;
  versionNumber: number;
  onClose: () => void;
  onPublished: () => void;
}) {
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(true);
  const [changeSummary, setChangeSummary] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    setIsValidating(true);
    adminFetch<{ data: ValidationResult }>(
      `/api/v1/admin/business-types/versions/${versionId}/validate`,
    )
      .then((res) => setValidation(res.data))
      .catch(() => setValidation({ isValid: false, errors: [{ domain: 'system', message: 'Failed to validate' }], warnings: [] }))
      .finally(() => setIsValidating(false));
  }, [versionId]);

  const handlePublish = useCallback(async () => {
    if (!changeSummary.trim()) return;
    setIsPublishing(true);
    setPublishError(null);

    try {
      await adminFetch(`/api/v1/admin/business-types/versions/${versionId}/publish`, {
        method: 'POST',
        body: JSON.stringify({ changeSummary: changeSummary.trim() }),
      });
      onPublished();
    } catch (err) {
      if (err instanceof AdminApiError && err.code === 'PUBLISH_VALIDATION_FAILED') {
        setPublishError('Validation errors must be resolved before publishing.');
      } else {
        setPublishError(err instanceof Error ? err.message : 'Failed to publish');
      }
    } finally {
      setIsPublishing(false);
    }
  }, [versionId, changeSummary, onPublished]);

  const canPublish = validation?.isValid && changeSummary.trim().length > 0 && !isPublishing;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Publish Business Type Template</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Version */}
          <div className="text-sm text-slate-300">
            Publishing as <span className="font-mono font-medium text-white">v{versionNumber}</span>
          </div>

          {/* Validation Results */}
          {isValidating ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 size={14} className="animate-spin" />
              Running validation checks...
            </div>
          ) : validation ? (
            <div className="space-y-2">
              {validation.errors.map((e, i) => (
                <div key={`err-${i}`} className="flex items-start gap-2 text-sm">
                  <X size={14} className="text-red-400 mt-0.5 shrink-0" />
                  <span className="text-red-400">
                    <span className="font-medium capitalize">{e.domain}</span>: {e.message}
                  </span>
                </div>
              ))}
              {validation.warnings.map((w, i) => (
                <div key={`warn-${i}`} className="flex items-start gap-2 text-sm">
                  <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                  <span className="text-amber-400">
                    <span className="font-medium capitalize">{w.domain}</span>: {w.message}
                  </span>
                </div>
              ))}
              {validation.isValid && validation.errors.length === 0 && (
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <Check size={14} />
                  All validation checks passed
                </div>
              )}
            </div>
          ) : null}

          {/* Change Summary */}
          <div>
            <label htmlFor="change-summary" className="block text-sm font-medium text-slate-300 mb-1.5">
              Change Summary <span className="text-red-400">*</span>
            </label>
            <textarea
              id="change-summary"
              value={changeSummary}
              onChange={(e) => setChangeSummary(e.target.value)}
              rows={3}
              placeholder="Describe what changed in this version..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* Impact Notice */}
          <div className="bg-slate-700/50 rounded-lg px-4 py-3 text-xs text-slate-400">
            Publishing will affect future provisioning only. Existing tenants will not be changed.
          </div>

          {/* Error */}
          {publishError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-sm text-red-400">
              {publishError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handlePublish}
            disabled={!canPublish}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            {isPublishing && <Loader2 size={16} className="animate-spin" />}
            Publish Version
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
